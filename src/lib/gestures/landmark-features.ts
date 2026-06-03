/**
 * Landmark feature extraction.
 *
 * Converts MediaPipe Hand Landmarker output (21 × {x,y,z}) into deterministic
 * numeric features used by every downstream classifier head.
 *
 * - `extractFeatures` returns the 63-D vector specified in the project design
 *   (wrist-centered, palm-scale-normalized) — ready to feed a future
 *   TFJS RandomForest / DNN.
 * - The helper booleans (finger extended, finger curled, orientation) are what
 *   the current geometry-based classifier uses; they're built from the same
 *   normalized landmarks so the two paths stay consistent.
 */

export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
}

export const TIPS = [4, 8, 12, 16, 20];
export const PIPS = [3, 6, 10, 14, 18];
export const MCPS = [2, 5, 9, 13, 17];
export const DIPS = [3, 7, 11, 15, 19];

export function dist(a: NormalizedLandmark, b: NormalizedLandmark) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function dist3(a: NormalizedLandmark, b: NormalizedLandmark) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Palm-size proxy used everywhere for scale-invariant ratios. */
export function palmSize(lm: NormalizedLandmark[]) {
  return dist(lm[0], lm[9]) || 0.0001;
}

/** 63-float feature vector: wrist-origin, palm-scale-normalized. */
export function extractFeatures(lm: NormalizedLandmark[]): Float32Array {
  const out = new Float32Array(63);
  if (!lm || lm.length < 21) return out;
  const wrist = lm[0];
  const scale = palmSize(lm);
  for (let i = 0; i < 21; i++) {
    out[i * 3 + 0] = (lm[i].x - wrist.x) / scale;
    out[i * 3 + 1] = (lm[i].y - wrist.y) / scale;
    out[i * 3 + 2] = (lm[i].z - wrist.z) / scale;
  }
  return out;
}

/** Boolean[5] for [thumb, index, middle, ring, pinky] extended. */
export function fingersExtended(lm: NormalizedLandmark[]): boolean[] {
  const palm = palmSize(lm);
  const out: boolean[] = [];

  // Thumb: tip distance from index MCP relative to palm size
  const thumbExt = dist(lm[4], lm[5]) > palm * 0.55;
  out.push(thumbExt);

  const wrist = lm[0];
  for (let i = 1; i < 5; i++) {
    const tip = lm[TIPS[i]];
    const pip = lm[PIPS[i]];
    const mcp = lm[MCPS[i]];
    const tipDist = dist(tip, wrist);
    const pipDist = dist(pip, wrist);
    const extended = tipDist > pipDist * 1.05 && dist(tip, mcp) > palm * 0.55;
    out.push(extended);
  }
  return out;
}

/** Boolean[5] for fingers tightly curled (tip close to MCP). */
export function fingersCurled(lm: NormalizedLandmark[]): boolean[] {
  const palm = palmSize(lm);
  const out: boolean[] = [];
  out.push(dist(lm[4], lm[2]) < palm * 0.55); // thumb folded
  for (let i = 1; i < 5; i++) {
    out.push(dist(lm[TIPS[i]], lm[MCPS[i]]) < palm * 0.55);
  }
  return out;
}

export interface HandOrientation {
  /** dx, dy of the wrist→middle-finger-MCP vector (pointing direction). */
  ux: number;
  uy: number;
  /** Approximate roll angle of the palm in radians. */
  roll: number;
  /** True if palm is roughly facing the camera (avg fingertip z close to wrist z). */
  palmTowardCamera: boolean;
  /** Hand pointing direction in screen space: up/down/left/right. */
  pointing: "up" | "down" | "left" | "right";
}

export function handOrientation(lm: NormalizedLandmark[]): HandOrientation {
  const wrist = lm[0];
  const midMcp = lm[9];
  const ux = midMcp.x - wrist.x;
  const uy = midMcp.y - wrist.y;
  const roll = Math.atan2(uy, ux);

  const avgTipZ =
    (lm[8].z + lm[12].z + lm[16].z + lm[20].z) / 4 - wrist.z;
  const palmTowardCamera = Math.abs(avgTipZ) < 0.12;

  // Pointing direction from wrist→middleMCP
  const ax = Math.abs(ux);
  const ay = Math.abs(uy);
  let pointing: HandOrientation["pointing"];
  if (ay >= ax) pointing = uy < 0 ? "up" : "down";
  else pointing = ux < 0 ? "left" : "right";

  return { ux, uy, roll, palmTowardCamera, pointing };
}

/** Centroid of all 21 landmarks (used by motion detectors). */
export function centroid(lm: NormalizedLandmark[]): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  for (const p of lm) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / lm.length, y: sy / lm.length };
}
