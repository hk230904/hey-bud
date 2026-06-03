/**
 * Static one-frame gesture classifier.
 *
 * Operates on a single MediaPipe 21-landmark hand. Geometry rules cover:
 *   - ASL alphabet A–Z (J, Z are flagged for the motion classifier)
 *   - Digits 0–9
 *   - Common emoji-style gestures (Thumbs Up, OK, Stop, Shaka, …)
 *
 * Each rule returns a 0..1 confidence; the recognizer picks the top match.
 * Same 63-D feature vector (from `landmark-features`) will feed a trained
 * TFJS model in phase 2; rules are the reliable baseline that works today.
 */

import {
  dist,
  fingersCurled,
  fingersExtended,
  handOrientation,
  MCPS,
  palmSize,
  TIPS,
  type NormalizedLandmark,
} from "./landmark-features";

export interface StaticPrediction {
  labelId: string;
  confidence: number;
}

type Rule = (
  lm: NormalizedLandmark[],
  ext: boolean[],
  palm: number,
) => StaticPrediction | null;

// ---------- Helpers ----------
const patternMatch = (a: boolean[], b: boolean[]) => {
  let m = 0;
  for (let i = 0; i < 5; i++) if (a[i] === b[i]) m++;
  return m;
};

const matchScore = (
  labelId: string,
  ext: boolean[],
  expected: boolean[],
  bonus = 0,
  base = 0.78,
): StaticPrediction | null => {
  if (patternMatch(ext, expected) < 5) return null;
  return { labelId, confidence: Math.min(0.98, base + bonus) };
};

// ---------- Rules ----------
const rules: Rule[] = [
  // ====== ASL LETTERS ======
  // A: fist, thumb up at side
  (lm, ext, palm) => {
    if (!ext[0] || ext[1] || ext[2] || ext[3] || ext[4]) return null;
    // thumb tip beside index MCP (not in front of palm)
    const ok = lm[4].y < lm[2].y && dist(lm[4], lm[6]) > palm * 0.4;
    return ok ? { labelId: "letter_A", confidence: 0.9 } : null;
  },
  // B: 4 fingers up, thumb across palm
  (lm, ext, palm) => {
    if (ext[0] || !ext[1] || !ext[2] || !ext[3] || !ext[4]) return null;
    // thumb tucked across palm (close to middle PIP)
    const tucked = dist(lm[4], lm[10]) < palm * 0.7;
    const aligned = Math.abs(lm[8].x - lm[20].x) < palm * 1.3;
    return tucked && aligned
      ? { labelId: "letter_B", confidence: 0.93 }
      : null;
  },
  // C: curved hand, thumb+index form C
  (lm, _ext, palm) => {
    const gap = dist(lm[4], lm[8]);
    const r = gap / palm;
    // all tips moderately curled, not folded
    const tipsCurved =
      dist(lm[8], lm[5]) > palm * 0.6 &&
      dist(lm[8], lm[0]) < palm * 1.8 &&
      dist(lm[12], lm[0]) < palm * 1.8;
    return r > 0.55 && r < 1.4 && tipsCurved
      ? { labelId: "letter_C", confidence: 0.88 }
      : null;
  },
  // D: index up, others folded, thumb meets middle
  (lm, ext, palm) => {
    if (ext[0] || !ext[1] || ext[2] || ext[3] || ext[4]) return null;
    return dist(lm[4], lm[10]) < palm * 0.5
      ? { labelId: "letter_D", confidence: 0.92 }
      : null;
  },
  // E: all curled, thumb across front
  (lm, ext, palm) => {
    if (ext.some(Boolean)) return null;
    const curl = fingersCurled(lm);
    const allCurled = curl[1] && curl[2] && curl[3] && curl[4];
    const thumbInFront = lm[4].x > lm[6].x - palm * 0.4 && lm[4].x < lm[18].x + palm * 0.4;
    return allCurled && thumbInFront
      ? { labelId: "letter_E", confidence: 0.82 }
      : null;
  },
  // F: thumb+index circle, other 3 up
  (lm, ext, palm) => {
    if (ext[0] || ext[1] || !ext[2] || !ext[3] || !ext[4]) return null;
    return dist(lm[4], lm[8]) < palm * 0.45
      ? { labelId: "letter_F", confidence: 0.92 }
      : null;
  },
  // G: index + thumb pointing sideways (horizontal pinch open)
  (lm, ext) => {
    if (!ext[0] || !ext[1] || ext[2] || ext[3] || ext[4]) return null;
    const o = handOrientation(lm);
    return o.pointing === "left" || o.pointing === "right"
      ? { labelId: "letter_G", confidence: 0.84 }
      : null;
  },
  // H: index + middle horizontal together
  (lm, ext, palm) => {
    if (ext[0] || !ext[1] || !ext[2] || ext[3] || ext[4]) return null;
    const o = handOrientation(lm);
    const close = dist(lm[8], lm[12]) < palm * 0.4;
    return close && (o.pointing === "left" || o.pointing === "right")
      ? { labelId: "letter_H", confidence: 0.86 }
      : null;
  },
  // I: pinky only
  (_lm, ext) => matchScore("letter_I", ext, [false, false, false, false, true], 0.08, 0.85),
  // K: index+middle up in V, thumb between them
  (lm, ext, palm) => {
    if (!ext[0] || !ext[1] || !ext[2] || ext[3] || ext[4]) return null;
    const thumbBetween = dist(lm[4], lm[10]) < palm * 0.6;
    const spread = dist(lm[8], lm[12]) > palm * 0.35;
    return thumbBetween && spread
      ? { labelId: "letter_K", confidence: 0.85 }
      : null;
  },
  // L: thumb + index extended at ~90°
  (lm, ext) => {
    if (!ext[0] || !ext[1] || ext[2] || ext[3] || ext[4]) return null;
    const tx = lm[4].x - lm[1].x;
    const ty = lm[4].y - lm[1].y;
    const ix = lm[8].x - lm[5].x;
    const iy = lm[8].y - lm[5].y;
    const tLen = Math.hypot(tx, ty) || 0.0001;
    const iLen = Math.hypot(ix, iy) || 0.0001;
    const cos = (tx * ix + ty * iy) / (tLen * iLen);
    return Math.abs(cos) < 0.5
      ? { labelId: "letter_L", confidence: 0.93 }
      : null;
  },
  // M: fist, thumb tucked under index/middle/ring (three knuckles cover)
  (lm, ext, palm) => {
    if (ext.some(Boolean)) return null;
    const thumbUnder =
      lm[4].y > lm[10].y && lm[4].y > lm[14].y &&
      dist(lm[4], lm[14]) < palm * 0.7;
    return thumbUnder ? { labelId: "letter_M", confidence: 0.7 } : null;
  },
  // N: fist, thumb under index/middle only (two knuckles)
  (lm, ext, palm) => {
    if (ext.some(Boolean)) return null;
    const thumbUnder =
      lm[4].y > lm[10].y && lm[4].y < lm[14].y + palm * 0.2 &&
      dist(lm[4], lm[10]) < palm * 0.6;
    return thumbUnder ? { labelId: "letter_N", confidence: 0.68 } : null;
  },
  // O: all fingertips touch thumb in a circle
  (lm, _ext, palm) => {
    const close =
      dist(lm[4], lm[8]) < palm * 0.4 &&
      dist(lm[4], lm[12]) < palm * 0.7 &&
      dist(lm[8], lm[12]) < palm * 0.5;
    return close ? { labelId: "letter_O", confidence: 0.86 } : null;
  },
  // R: index + middle crossed
  (lm, ext, palm) => {
    if (ext[0] || !ext[1] || !ext[2] || ext[3] || ext[4]) return null;
    const crossed = Math.abs(lm[8].x - lm[12].x) < palm * 0.15 && Math.abs(lm[8].z - lm[12].z) > 0.02;
    return crossed ? { labelId: "letter_R", confidence: 0.8 } : null;
  },
  // S: tight fist, thumb across front of fingers
  (lm, ext, palm) => {
    if (ext.some(Boolean)) return null;
    const thumbFront = lm[4].x < lm[6].x + palm * 0.2 && lm[4].x > lm[18].x - palm * 0.2;
    return thumbFront ? { labelId: "letter_S", confidence: 0.74 } : null;
  },
  // T: fist, thumb between index and middle (tip pokes out)
  (lm, ext, palm) => {
    if (ext.some(Boolean)) return null;
    const between =
      lm[4].x > Math.min(lm[6].x, lm[10].x) - palm * 0.1 &&
      lm[4].x < Math.max(lm[6].x, lm[10].x) + palm * 0.1 &&
      lm[4].y < lm[6].y;
    return between ? { labelId: "letter_T", confidence: 0.72 } : null;
  },
  // U: index + middle up, together
  (lm, ext, palm) => {
    if (ext[0] || !ext[1] || !ext[2] || ext[3] || ext[4]) return null;
    return dist(lm[8], lm[12]) < palm * 0.35
      ? { labelId: "letter_U", confidence: 0.9 }
      : null;
  },
  // V: index + middle up, spread
  (lm, ext, palm) => {
    if (ext[0] || !ext[1] || !ext[2] || ext[3] || ext[4]) return null;
    return dist(lm[8], lm[12]) > palm * 0.45
      ? { labelId: "letter_V", confidence: 0.92 }
      : null;
  },
  // W: index + middle + ring up
  (_lm, ext) => matchScore("letter_W", ext, [false, true, true, true, false], 0.08),
  // X: index hooked (only index extended but curled into a claw)
  (lm, ext, palm) => {
    if (ext[0] || ext[2] || ext[3] || ext[4]) return null;
    const hooked = dist(lm[8], lm[5]) < palm * 0.95 && dist(lm[8], lm[7]) < palm * 0.4;
    return hooked && !ext[1]
      ? { labelId: "letter_X", confidence: 0.72 }
      : null;
  },
  // Y: thumb + pinky (no index)
  (_lm, ext) => matchScore("letter_Y", ext, [true, false, false, false, true], 0.1, 0.85),

  // ====== DIGITS ======
  // 0: same as O (fingers touch thumb in circle) — separate label
  (lm, _ext, palm) => {
    const close =
      dist(lm[4], lm[8]) < palm * 0.4 &&
      dist(lm[4], lm[12]) < palm * 0.55 &&
      dist(lm[4], lm[16]) < palm * 0.7;
    return close ? { labelId: "digit_0", confidence: 0.84 } : null;
  },
  // 1: index up only
  (_lm, ext) => matchScore("digit_1", ext, [false, true, false, false, false], 0.1, 0.82),
  // 2: index + middle (same as V) → distinguish from letter V by palm facing in
  (lm, ext, palm) => {
    if (ext[0] || !ext[1] || !ext[2] || ext[3] || ext[4]) return null;
    const spread = dist(lm[8], lm[12]) > palm * 0.45;
    const palmIn = handOrientation(lm).palmTowardCamera === false;
    return spread && palmIn
      ? { labelId: "digit_2", confidence: 0.78 }
      : null;
  },
  // 3: thumb + index + middle up
  (_lm, ext) => matchScore("digit_3", ext, [true, true, true, false, false], 0.08),
  // 4: 4 fingers up, thumb tucked
  (_lm, ext) => matchScore("digit_4", ext, [false, true, true, true, true], 0.08),
  // 5: all 5 spread
  (lm, ext, palm) => {
    if (!ext.every(Boolean)) return null;
    const spread = dist(lm[8], lm[20]) > palm * 1.6;
    return spread ? { labelId: "digit_5", confidence: 0.9 } : null;
  },
  // 6: pinky tip touches thumb tip, others up
  (lm, ext, palm) => {
    if (!ext[1] || !ext[2] || !ext[3]) return null;
    return dist(lm[4], lm[20]) < palm * 0.4
      ? { labelId: "digit_6", confidence: 0.86 }
      : null;
  },
  // 7: ring tip touches thumb tip
  (lm, ext, palm) => {
    if (!ext[1] || !ext[2] || !ext[4]) return null;
    return dist(lm[4], lm[16]) < palm * 0.4
      ? { labelId: "digit_7", confidence: 0.84 }
      : null;
  },
  // 8: middle tip touches thumb tip
  (lm, ext, palm) => {
    if (!ext[1] || !ext[3] || !ext[4]) return null;
    return dist(lm[4], lm[12]) < palm * 0.4
      ? { labelId: "digit_8", confidence: 0.84 }
      : null;
  },
  // 9: index tip touches thumb tip (with other 3 up)
  (lm, ext, palm) => {
    if (!ext[2] || !ext[3] || !ext[4]) return null;
    return dist(lm[4], lm[8]) < palm * 0.4
      ? { labelId: "digit_9", confidence: 0.84 }
      : null;
  },

  // ====== EMOJI / COMMON GESTURES ======
  // Thumbs Up: thumb up, fist
  (lm, ext) => {
    if (!ext[0] || ext[1] || ext[2] || ext[3] || ext[4]) return null;
    // thumb tip well above wrist (smaller y)
    return lm[4].y < lm[0].y - 0.05
      ? { labelId: "thumbs_up", confidence: 0.95 }
      : null;
  },
  // Thumbs Down: thumb down, fist
  (lm, ext) => {
    if (!ext[0] || ext[1] || ext[2] || ext[3] || ext[4]) return null;
    return lm[4].y > lm[0].y + 0.05
      ? { labelId: "thumbs_down", confidence: 0.93 }
      : null;
  },
  // Peace / Victory (same as V but pointing up)
  (lm, ext, palm) => {
    if (ext[0] || !ext[1] || !ext[2] || ext[3] || ext[4]) return null;
    const o = handOrientation(lm);
    return o.pointing === "up" && dist(lm[8], lm[12]) > palm * 0.5
      ? { labelId: "victory", confidence: 0.9 }
      : null;
  },
  // OK Sign: thumb + index circle, 3 fingers up + palm forward
  (lm, ext, palm) => {
    if (ext[0] || ext[1] || !ext[2] || !ext[3] || !ext[4]) return null;
    const o = handOrientation(lm);
    return dist(lm[4], lm[8]) < palm * 0.4 && o.pointing === "up"
      ? { labelId: "ok_sign", confidence: 0.9 }
      : null;
  },
  // Fingers Crossed
  (lm, ext, palm) => {
    if (ext[0] || !ext[1] || !ext[2] || ext[3] || ext[4]) return null;
    // index and middle tips overlap on x
    const crossed = Math.abs(lm[8].x - lm[12].x) < palm * 0.1;
    const closeY = Math.abs(lm[8].y - lm[12].y) < palm * 0.3;
    return crossed && closeY
      ? { labelId: "fingers_crossed", confidence: 0.78 }
      : null;
  },
  // Shaka: thumb + pinky (Y) — distinguish by horizontal orientation
  (lm, ext) => {
    if (!ext[0] || ext[1] || ext[2] || ext[3] || !ext[4]) return null;
    const o = handOrientation(lm);
    return o.pointing === "left" || o.pointing === "right"
      ? { labelId: "shaka", confidence: 0.84 }
      : null;
  },
  // Rock On: index + pinky up, thumb across, middle/ring down
  (_lm, ext) =>
    matchScore("rock_on", ext, [false, true, false, false, true], 0.1, 0.85),
  // Stop / Open Palm facing forward
  (lm, ext, palm) => {
    if (!ext.every(Boolean)) return null;
    const o = handOrientation(lm);
    const spread = dist(lm[8], lm[20]) < palm * 1.4; // fingers together-ish
    return o.pointing === "up" && spread && o.palmTowardCamera
      ? { labelId: "stop", confidence: 0.86 }
      : null;
  },
  // Pointing (index up — same as 1 but flagged as gesture; rules below pick lower-conf gesture)
  // Pinched Fingers: thumb+index+middle pinched together pointing up
  (lm, ext, palm) => {
    if (ext[3] || ext[4]) return null;
    const pinched =
      dist(lm[4], lm[8]) < palm * 0.4 &&
      dist(lm[4], lm[12]) < palm * 0.5 &&
      dist(lm[8], lm[12]) < palm * 0.35;
    const o = handOrientation(lm);
    return pinched && o.pointing === "up"
      ? { labelId: "pinched_fingers", confidence: 0.82 }
      : null;
  },
  // I Love You: thumb + index + pinky
  (_lm, ext) =>
    matchScore("i_love_you", ext, [true, true, false, false, true], 0.1, 0.88),
  // Fist (catch-all)
  (_lm, ext) => {
    if (ext.some(Boolean)) return null;
    return { labelId: "fist", confidence: 0.72 };
  },
  // Open palm waving (static frame → "Hello"); motion classifier turns it into Wave
  (lm, ext, palm) => {
    if (!ext.every(Boolean)) return null;
    const spread = dist(lm[8], lm[20]) > palm * 1.4;
    const o = handOrientation(lm);
    return spread && o.pointing === "up"
      ? { labelId: "open_palm", confidence: 0.7 }
      : null;
  },
];

export function classifyStatic(lm: NormalizedLandmark[]): StaticPrediction | null {
  if (!lm || lm.length < 21) return null;
  const ext = fingersExtended(lm);
  const palm = palmSize(lm);

  let best: StaticPrediction | null = null;
  for (const rule of rules) {
    try {
      const r = rule(lm, ext, palm);
      if (r && (!best || r.confidence > best.confidence)) {
        best = r;
      }
    } catch {
      /* a failing rule never breaks classification */
    }
  }
  return best;
}

// Re-export for legacy importers (services/recognitionApi.ts originally
// pulled NormalizedLandmark from asl-classifier).
export type { NormalizedLandmark };
// suppress unused warning for helper still useful externally
void TIPS;
void MCPS;
