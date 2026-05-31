/**
 * Rule-based static ASL letter classifier from MediaPipe 21-point hand landmarks.
 *
 * Limited to letters with visually distinct STATIC hand shapes.
 * Excluded: J, Z (motion), and M/N/S/T (too ambiguous in 2D single-frame).
 *
 * Landmark indices:
 *   0=wrist, 1-4=thumb, 5-8=index, 9-12=middle, 13-16=ring, 17-20=pinky
 *   Tips: 4,8,12,16,20  PIPs: 3,6,10,14,18
 */

export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
}

export interface AslResult {
  letter: string;
  confidence: number;
}

const TIPS = [4, 8, 12, 16, 20];
const PIPS = [3, 6, 10, 14, 18];
const MCPS = [2, 5, 9, 13, 17];

function dist(a: NormalizedLandmark, b: NormalizedLandmark) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Returns boolean[5] for [thumb, index, middle, ring, pinky] extended. */
function fingersExtended(lm: NormalizedLandmark[]): boolean[] {
  const wrist = lm[0];
  const palmSize = dist(wrist, lm[9]) || 0.0001;
  const out: boolean[] = [];
  // Thumb: tip distance from index MCP relative to palm size
  const thumbExt = dist(lm[4], lm[5]) > palmSize * 0.6;
  out.push(thumbExt);
  // Other 4 fingers: tip should be farther from wrist than PIP
  for (let i = 1; i < 5; i++) {
    const tip = lm[TIPS[i]];
    const pip = lm[PIPS[i]];
    const mcp = lm[MCPS[i]];
    const tipDist = dist(tip, wrist);
    const pipDist = dist(pip, wrist);
    // Extended if tip is meaningfully past the PIP joint away from wrist
    // AND tip is on the opposite side of MCP from a folded position
    const extended = tipDist > pipDist * 1.05 && dist(tip, mcp) > palmSize * 0.5;
    out.push(extended);
  }
  return out;
}

interface Template {
  letter: string;
  pattern: boolean[]; // [thumb, idx, mid, ring, pinky]
  /** Optional extra geometric checks; each returns 0..1 score. */
  extras?: ((lm: NormalizedLandmark[], palm: number) => number)[];
}

const TEMPLATES: Template[] = [
  // A: fist, thumb to the side (thumb up beside fingers)
  { letter: "A", pattern: [true, false, false, false, false] },
  // B: four fingers up, thumb tucked across palm
  { letter: "B", pattern: [false, true, true, true, true] },
  // C: curved hand — all "extended" but thumb and index curve toward each other
  {
    letter: "C",
    pattern: [true, true, true, true, true],
    extras: [
      (lm, palm) => {
        const gap = dist(lm[4], lm[8]);
        // gap roughly equals palm width for a C shape
        const r = gap / palm;
        return r > 0.5 && r < 1.4 ? 1 : 0;
      },
    ],
  },
  // D: index up, others folded, thumb touches middle finger
  {
    letter: "D",
    pattern: [false, true, false, false, false],
    extras: [(lm, palm) => (dist(lm[4], lm[12]) < palm * 0.5 ? 1 : 0)],
  },
  // E: all fingers curled, thumb across
  { letter: "E", pattern: [false, false, false, false, false] },
  // F: thumb + index form a circle, other three up
  {
    letter: "F",
    pattern: [false, false, true, true, true],
    extras: [(lm, palm) => (dist(lm[4], lm[8]) < palm * 0.4 ? 1 : 0)],
  },
  // I: pinky only
  { letter: "I", pattern: [false, false, false, false, true] },
  // L: thumb + index extended at right angle
  {
    letter: "L",
    pattern: [true, true, false, false, false],
    extras: [
      (lm) => {
        // angle between thumb (1->4) and index (5->8) close to 90°
        const tx = lm[4].x - lm[1].x;
        const ty = lm[4].y - lm[1].y;
        const ix = lm[8].x - lm[5].x;
        const iy = lm[8].y - lm[5].y;
        const tLen = Math.hypot(tx, ty) || 0.0001;
        const iLen = Math.hypot(ix, iy) || 0.0001;
        const cos = (tx * ix + ty * iy) / (tLen * iLen);
        // 90° → cos≈0. Accept |cos| < 0.4
        return Math.abs(cos) < 0.5 ? 1 : 0;
      },
    ],
  },
  // O: thumb meets index fingertips, all curled into a circle
  {
    letter: "O",
    pattern: [false, false, false, false, false],
    extras: [(lm, palm) => (dist(lm[4], lm[8]) < palm * 0.35 ? 1 : 0)],
  },
  // U: index + middle extended together (parallel, close)
  {
    letter: "U",
    pattern: [false, true, true, false, false],
    extras: [(lm, palm) => (dist(lm[8], lm[12]) < palm * 0.35 ? 1 : 0)],
  },
  // V (peace): index + middle extended, spread apart
  {
    letter: "V",
    pattern: [false, true, true, false, false],
    extras: [(lm, palm) => (dist(lm[8], lm[12]) > palm * 0.45 ? 1 : 0)],
  },
  // W: index + middle + ring extended
  { letter: "W", pattern: [false, true, true, true, false] },
  // Y: thumb + pinky extended (hang loose / "I love you" without index)
  { letter: "Y", pattern: [true, false, false, false, true] },
];

export function classifyAsl(lm: NormalizedLandmark[]): AslResult | null {
  if (!lm || lm.length < 21) return null;
  const ext = fingersExtended(lm);
  const palm = dist(lm[0], lm[9]) || 0.0001;

  let best: AslResult | null = null;
  for (const t of TEMPLATES) {
    // base score = fraction of finger pattern bits that match
    let matches = 0;
    for (let i = 0; i < 5; i++) if (ext[i] === t.pattern[i]) matches++;
    let score = matches / 5; // 0..1

    if (t.extras && t.extras.length > 0) {
      // Require pattern to fully match before considering extras
      if (matches < 5) continue;
      let extraSum = 0;
      for (const fn of t.extras) extraSum += fn(lm, palm);
      const extraAvg = extraSum / t.extras.length;
      if (extraAvg < 0.5) continue;
      score = 0.85 + 0.13 * extraAvg;
    } else {
      if (matches < 5) continue;
      score = 0.78; // pattern-only match
    }

    const confidence = Math.min(0.98, Math.max(0.6, score));
    if (!best || confidence > best.confidence) {
      best = { letter: t.letter, confidence: +confidence.toFixed(3) };
    }
  }
  return best;
}
