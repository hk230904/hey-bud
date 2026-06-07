import { TrackerFrameData } from "@/lib/hand-tracker";

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface GestureScore {
  gesture: string;
  confidence: number;
}

// Helper to calculate 3D Euclidean distance
export function getDistance(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Normalizes landmarks: Wrist to (0,0,0) and scales so Wrist-to-MiddleMCP is 1.0
export function normalizeLandmarks(rawLandmarks: Landmark[]): Landmark[] {
  if (rawLandmarks.length < 21) return rawLandmarks;

  // 1. Translate Wrist (0) to origin
  const wrist = rawLandmarks[0];
  const translated = rawLandmarks.map((pt) => ({
    x: pt.x - wrist.x,
    y: pt.y - wrist.y,
    z: pt.z - wrist.z,
  }));

  // 2. Scale: reference is distance from Wrist (0) to Middle Finger MCP (9)
  const refDist = getDistance(translated[0], translated[9]);
  const scale = refDist > 0 ? 1.0 / refDist : 1.0;

  return translated.map((pt) => ({
    x: pt.x * scale,
    y: pt.y * scale,
    z: pt.z * scale,
  }));
}

// Soft membership helper (returns 1.0 if in range, decays smoothly to 0.0 outside)
function softRange(val: number, minVal: number, maxVal: number, slope = 0.2): number {
  if (val >= minVal && val <= maxVal) return 1.0;
  if (val < minVal) {
    const diff = minVal - val;
    return Math.max(0, 1.0 - diff / (minVal * slope || 0.1));
  } else {
    const diff = val - maxVal;
    return Math.max(0, 1.0 - diff / ((1.0 - maxVal) * slope || 0.2));
  }
}

export function classifyGesture(rawLandmarks: Landmark[], isLeftHand: boolean): GestureScore {
  if (!rawLandmarks || rawLandmarks.length < 21) {
    return { gesture: "Unknown", confidence: 0 };
  }

  // Stage 3: Landmark Normalization
  const pts = normalizeLandmarks(rawLandmarks);

  // Calculate finger lengths & segments for straightness
  const calcStraightness = (tip: number, mcp: number) => {
    const dDirect = getDistance(pts[tip], pts[mcp]);
    const dSegmented =
      getDistance(pts[tip], pts[tip - 1]) +      // Tip to DIP
      getDistance(pts[tip - 1], pts[tip - 2]) +  // DIP to PIP
      getDistance(pts[tip - 2], pts[mcp]);       // PIP to MCP
    return dSegmented > 0 ? dDirect / dSegmented : 0;
  };

  const thumbStraight = getDistance(pts[4], pts[2]) / (getDistance(pts[4], pts[3]) + getDistance(pts[3], pts[2]));
  const indexStraight = calcStraightness(8, 5);
  const middleStraight = calcStraightness(12, 9);
  const ringStraight = calcStraightness(16, 13);
  const pinkyStraight = calcStraightness(20, 17);

  // Tip to Wrist distances (relative to hand size)
  const thumbDist = getDistance(pts[4], pts[0]);
  const indexDist = getDistance(pts[8], pts[0]);
  const middleDist = getDistance(pts[12], pts[0]);
  const ringDist = getDistance(pts[16], pts[0]);
  const pinkyDist = getDistance(pts[20], pts[0]);

  // Inter-finger tip distances
  const idxMidDist = getDistance(pts[8], pts[12]);
  const midRingDist = getDistance(pts[12], pts[16]);
  const ringPkyDist = getDistance(pts[16], pts[20]);
  const thumbIdxDist = getDistance(pts[4], pts[8]);

  // Directions (MCP Y - Tip Y). positive = tip is higher (above) MCP. (Y is down in MediaPipe)
  const idxAbove = pts[5].y - pts[8].y;
  const midAbove = pts[9].y - pts[12].y;
  const rngAbove = pts[13].y - pts[16].y;
  const pkyAbove = pts[17].y - pts[20].y;
  const thumbAbove = pts[2].y - pts[4].y;

  // Let's compute individual gesture scores
  const scores: { [key: string]: number } = {};

  // Helper to average scores
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  // 1. Hello
  // Open hand, fingers extended, slightly spread
  scores["Hello"] = avg([
    softRange(indexStraight, 0.85, 1.0),
    softRange(middleStraight, 0.85, 1.0),
    softRange(ringStraight, 0.85, 1.0),
    softRange(pinkyStraight, 0.85, 1.0),
    softRange(thumbStraight, 0.75, 1.0),
    softRange(idxMidDist, 0.25, 0.8),
    softRange(midRingDist, 0.22, 0.8),
    softRange(ringPkyDist, 0.25, 0.8),
    softRange(idxAbove, 0.4, 2.5),
  ]);

  // 2. Stop
  // Open hand, palm facing camera, fingers straight and vertical
  scores["Stop"] = avg([
    softRange(indexStraight, 0.9, 1.0),
    softRange(middleStraight, 0.9, 1.0),
    softRange(ringStraight, 0.9, 1.0),
    softRange(pinkyStraight, 0.9, 1.0),
    softRange(thumbStraight, 0.8, 1.0),
    softRange(idxAbove, 0.8, 2.5),
    softRange(midAbove, 0.8, 2.5),
    softRange(rngAbove, 0.8, 2.5),
    softRange(pkyAbove, 0.8, 2.5),
  ]);

  // 3. Please
  // Open hand, but fingers pressed tightly together
  scores["Please"] = avg([
    softRange(indexStraight, 0.85, 1.0),
    softRange(middleStraight, 0.85, 1.0),
    softRange(ringStraight, 0.85, 1.0),
    softRange(pinkyStraight, 0.85, 1.0),
    softRange(idxMidDist, 0.0, 0.25),
    softRange(midRingDist, 0.0, 0.25),
    softRange(ringPkyDist, 0.0, 0.25),
    softRange(idxAbove, 0.6, 2.5),
  ]);

  // 4. B
  // Open hand with fingers together, but thumb folded across palm
  scores["B"] = avg([
    softRange(indexStraight, 0.85, 1.0),
    softRange(middleStraight, 0.85, 1.0),
    softRange(ringStraight, 0.85, 1.0),
    softRange(pinkyStraight, 0.85, 1.0),
    softRange(idxMidDist, 0.0, 0.25),
    softRange(midRingDist, 0.0, 0.25),
    softRange(ringPkyDist, 0.0, 0.25),
    softRange(thumbStraight, 0.0, 0.55), // Thumb is curled
    softRange(getDistance(pts[4], pts[17]), 0.0, 0.45), // Thumb tip near pinky MCP
  ]);

  // 5. A
  // Fist, thumb along the side of index finger
  scores["A"] = avg([
    softRange(indexStraight, 0.0, 0.5),
    softRange(middleStraight, 0.0, 0.5),
    softRange(ringStraight, 0.0, 0.5),
    softRange(pinkyStraight, 0.0, 0.5),
    softRange(thumbStraight, 0.7, 1.0), // Thumb is straight
    // Thumb tip should be next to index finger MCP / PIP
    softRange(getDistance(pts[4], pts[5]), 0.0, 0.45),
  ]);

  // 6. Yes
  // Fist, thumb tucked over index and middle fingers
  scores["Yes"] = avg([
    softRange(indexStraight, 0.0, 0.45),
    softRange(middleStraight, 0.0, 0.45),
    softRange(ringStraight, 0.0, 0.45),
    softRange(pinkyStraight, 0.0, 0.45),
    softRange(thumbStraight, 0.0, 0.55), // Thumb curled
    softRange(getDistance(pts[4], pts[10]), 0.0, 0.4), // Thumb tip close to middle finger joints
  ]);

  // 7. Sorry
  // Fist facing camera, thumb tucked in middle
  scores["Sorry"] = avg([
    softRange(indexStraight, 0.0, 0.45),
    softRange(middleStraight, 0.0, 0.45),
    softRange(ringStraight, 0.0, 0.45),
    softRange(pinkyStraight, 0.0, 0.45),
    softRange(thumbStraight, 0.0, 0.6),
    softRange(getDistance(pts[4], pts[14]), 0.0, 0.45), // Thumb tip close to ring finger joints
  ]);

  // 8. I love you
  // Thumb, Index, Pinky extended; Middle and Ring folded
  scores["I love you"] = avg([
    softRange(indexStraight, 0.85, 1.0),
    softRange(pinkyStraight, 0.8, 1.0),
    softRange(thumbStraight, 0.75, 1.0),
    softRange(middleStraight, 0.0, 0.5),
    softRange(ringStraight, 0.0, 0.5),
    softRange(idxAbove, 0.5, 2.5),
    softRange(pkyAbove, 0.4, 2.5),
    softRange(getDistance(pts[8], pts[12]), 0.4, 1.5), // Index and Middle are separated
  ]);

  // 9. D
  // Index extended; middle, ring, pinky folded and touching thumb
  scores["D"] = avg([
    softRange(indexStraight, 0.85, 1.0),
    softRange(middleStraight, 0.0, 0.5),
    softRange(ringStraight, 0.0, 0.5),
    softRange(pinkyStraight, 0.0, 0.5),
    softRange(idxAbove, 0.5, 2.5),
    softRange(getDistance(pts[4], pts[12]), 0.0, 0.35), // Thumb touching middle
    softRange(getDistance(pts[4], pts[16]), 0.0, 0.35), // Thumb touching ring
  ]);

  // 10. No
  // Index and Middle extended together; ring, pinky, thumb folded
  scores["No"] = avg([
    softRange(indexStraight, 0.8, 1.0),
    softRange(middleStraight, 0.8, 1.0),
    softRange(ringStraight, 0.0, 0.5),
    softRange(pinkyStraight, 0.0, 0.5),
    softRange(thumbStraight, 0.0, 0.6),
    softRange(idxMidDist, 0.0, 0.3), // Index and Middle close together
    softRange(idxAbove, 0.5, 2.5),
    softRange(midAbove, 0.5, 2.5),
  ]);

  // 11. Help / Good
  // Thumbs up (Thumb pointing up, other fingers folded)
  const thumbsUpScore = avg([
    softRange(thumbStraight, 0.8, 1.0),
    softRange(indexStraight, 0.0, 0.45),
    softRange(middleStraight, 0.0, 0.45),
    softRange(ringStraight, 0.0, 0.45),
    softRange(pinkyStraight, 0.0, 0.45),
    softRange(thumbAbove, 0.5, 2.5), // Thumb is pointing UP
    // Hand should be sideways or tilted
    softRange(Math.abs(pts[5].x - pts[17].x), 0.4, 2.0),
  ]);
  scores["Help"] = thumbsUpScore;
  scores["Good"] = thumbsUpScore;

  // 12. C
  // Curved hand. All fingers curved.
  scores["C"] = avg([
    softRange(indexStraight, 0.45, 0.75),
    softRange(middleStraight, 0.45, 0.75),
    softRange(ringStraight, 0.45, 0.75),
    softRange(pinkyStraight, 0.45, 0.75),
    softRange(thumbStraight, 0.45, 0.75),
    softRange(thumbIdxDist, 0.25, 0.65),
    softRange(idxAbove, 0.1, 0.6),
  ]);

  // 13. E
  // Claw/curled fist
  scores["E"] = avg([
    softRange(indexStraight, 0.25, 0.65),
    softRange(middleStraight, 0.25, 0.65),
    softRange(ringStraight, 0.25, 0.65),
    softRange(pinkyStraight, 0.25, 0.65),
    softRange(thumbStraight, 0.0, 0.55),
    softRange(indexDist, 0.35, 0.75), // Tips closer to wrist than in B, but further than in A
    softRange(middleDist, 0.35, 0.75),
  ]);

  // 14. Thank you
  // Flat open hand, but tilted (pointing somewhat forward/down)
  scores["Thank you"] = avg([
    softRange(indexStraight, 0.85, 1.0),
    softRange(middleStraight, 0.85, 1.0),
    softRange(ringStraight, 0.85, 1.0),
    softRange(pinkyStraight, 0.85, 1.0),
    softRange(thumbStraight, 0.7, 1.0),
    // Pointing slightly forward, so tip Y is not as high compared to MCP
    softRange(idxAbove, 0.2, 0.85),
    softRange(midAbove, 0.2, 0.85),
  ]);

  // Find highest scoring gesture
  let bestGesture = "Unknown";
  let bestScore = 0;

  for (const [gesture, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestGesture = gesture;
    }
  }

  // Adjust classification threshold: must score at least 0.7 to be considered matched
  if (bestScore < 0.7) {
    return { gesture: "Unknown", confidence: bestScore };
  }

  return {
    gesture: bestGesture,
    confidence: bestScore,
  };
}
