/**
 * Motion / temporal gesture classifier.
 *
 * Buffers the last ~30 frames of landmarks (≈1 second at 30 fps) and runs
 * lightweight motion-trajectory detectors for gestures that depend on
 * movement over time:
 *
 *   - Wave        — open palm oscillating horizontally
 *   - Please      — flat hand making a circle on the chest
 *   - Sorry       — closed fist making a circle on the chest
 *   - Yes (ASL)   — fist nodding up & down
 *   - No (ASL)    — index + middle snapping down to thumb
 *   - Thank You   — open hand moving outward from the chin
 *   - Beckon      — index finger curling repeatedly
 *   - Tap Wrist   — index taps the opposite wrist (one-hand approximation)
 *   - Letter J    — pinky tracing a J in the air
 *   - Letter Z    — index finger tracing a Z
 *
 * This is the temporal counterpart to the static classifier. Same 63-D
 * features → sequence buffer → motion-shape detectors → label + confidence.
 */

import {
  centroid,
  dist,
  fingersCurled,
  fingersExtended,
  palmSize,
  type NormalizedLandmark,
} from "./landmark-features";

export interface MotionFrame {
  t: number;
  lm: NormalizedLandmark[];
}

export interface MotionPrediction {
  labelId: string;
  confidence: number;
}

const BUFFER_MS = 2000; // keep ~2 s of frames
const MIN_FRAMES = 10;

export class MotionBuffer {
  private frames: MotionFrame[] = [];

  push(lm: NormalizedLandmark[] | null) {
    const t = performance.now();
    if (!lm) return;
    this.frames.push({ t, lm });
    const cutoff = t - BUFFER_MS;
    while (this.frames.length && this.frames[0].t < cutoff) this.frames.shift();
  }

  reset() {
    this.frames = [];
  }

  size() {
    return this.frames.length;
  }

  snapshot(): MotionFrame[] {
    return this.frames;
  }
}

// ---------- Trajectory helpers ----------

function trajectory(frames: MotionFrame[], pointIdx = -1) {
  // -1 → use centroid; otherwise individual landmark
  return frames.map((f) =>
    pointIdx < 0 ? centroid(f.lm) : { x: f.lm[pointIdx].x, y: f.lm[pointIdx].y },
  );
}

function bbox(points: { x: number; y: number }[]) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

/** Count axis-crossings around the trajectory's mean (signed). */
function zeroCrossings(values: number[]) {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  let crossings = 0;
  let prev = values[0] - mean;
  for (let i = 1; i < values.length; i++) {
    const cur = values[i] - mean;
    if (prev <= 0 && cur > 0) crossings++;
    if (prev >= 0 && cur < 0) crossings++;
    prev = cur;
  }
  return crossings;
}

/** Signed area / circularity score: how round is the loop? 0..1 (1 = circular). */
function circularity(points: { x: number; y: number }[]) {
  if (points.length < 8) return 0;
  // Shoelace area
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  area = Math.abs(area) / 2;
  // Perimeter
  let perim = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    perim += Math.hypot(b.x - a.x, b.y - a.y);
  }
  if (perim < 1e-4) return 0;
  // Isoperimetric quotient: 4πA / P²; circle = 1
  return Math.min(1, (4 * Math.PI * area) / (perim * perim));
}

/** Sliding total motion magnitude — used as a gate before running detectors. */
function totalMotion(points: { x: number; y: number }[]) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

// ---------- Detectors ----------

interface Detector {
  (frames: MotionFrame[]): MotionPrediction | null;
}

const detectors: Detector[] = [
  // WAVE: open palm (4 non-thumb fingers extended), horizontal oscillation
  (frames) => {
    const last = frames[frames.length - 1].lm;
    const ext = fingersExtended(last);
    // Ignore thumb — it often reads as not-extended on a front-facing open palm.
    if (!ext[1] || !ext[2] || !ext[3] || !ext[4]) return null;
    const traj = trajectory(frames);
    const xs = traj.map((p) => p.x);
    const ys = traj.map((p) => p.y);
    const box = bbox(traj);
    if (box.w < 0.05) return null;
    // Horizontal motion should dominate vertical, but be lenient.
    if (box.w < box.h * 0.8) return null;
    const crossings = zeroCrossings(xs);
    const yRange = Math.max(...ys) - Math.min(...ys);
    if (yRange > box.w) return null;
    if (crossings >= 2) {
      return { labelId: "wave", confidence: Math.min(0.95, 0.65 + crossings * 0.07) };
    }
    return null;
  },

  // PLEASE: flat hand circling on chest
  (frames) => {
    const last = frames[frames.length - 1].lm;
    const ext = fingersExtended(last);
    if (!ext[1] || !ext[2] || !ext[3] || !ext[4]) return null;
    const traj = trajectory(frames);
    const motion = totalMotion(traj);
    if (motion < 0.25) return null;
    const c = circularity(traj);
    return c > 0.4
      ? { labelId: "please", confidence: Math.min(0.95, 0.6 + c * 0.35) }
      : null;
  },

  // SORRY: closed fist circling
  (frames) => {
    const last = frames[frames.length - 1].lm;
    const ext = fingersExtended(last);
    if (ext.some((v, i) => i > 0 && v)) return null; // any non-thumb extended → not a fist
    const traj = trajectory(frames);
    const motion = totalMotion(traj);
    if (motion < 0.25) return null;
    const c = circularity(traj);
    return c > 0.35
      ? { labelId: "sorry", confidence: Math.min(0.92, 0.55 + c * 0.4) }
      : null;
  },

  // YES (ASL): fist nodding up/down
  (frames) => {
    const last = frames[frames.length - 1].lm;
    const ext = fingersExtended(last);
    if (ext.some((v, i) => i > 0 && v)) return null;
    const traj = trajectory(frames);
    const ys = traj.map((p) => p.y);
    const xs = traj.map((p) => p.x);
    const yRange = Math.max(...ys) - Math.min(...ys);
    const xRange = Math.max(...xs) - Math.min(...xs);
    if (yRange < 0.06) return null;
    if (yRange < xRange * 1.4) return null;
    const crossings = zeroCrossings(ys);
    return crossings >= 2
      ? { labelId: "yes_asl", confidence: Math.min(0.9, 0.65 + crossings * 0.05) }
      : null;
  },

  // NO (ASL): index + middle snapping down to thumb
  (frames) => {
    if (frames.length < MIN_FRAMES) return null;
    const palm0 = palmSize(frames[0].lm);
    const startGap = dist(frames[0].lm[4], frames[0].lm[8]) / palm0;
    const endGap = dist(frames[frames.length - 1].lm[4], frames[frames.length - 1].lm[8]) / palm0;
    if (startGap > 0.7 && endGap < 0.35) {
      return { labelId: "no_asl", confidence: 0.78 };
    }
    return null;
  },

  // THANK YOU (ASL): flat hand moves outward from chin region (downward+forward in 2D)
  (frames) => {
    const last = frames[frames.length - 1].lm;
    const ext = fingersExtended(last);
    if (!ext[1] || !ext[2] || !ext[3] || !ext[4]) return null;
    const traj = trajectory(frames);
    const dx = traj[traj.length - 1].x - traj[0].x;
    const dy = traj[traj.length - 1].y - traj[0].y;
    // moving away from face → mostly downward, some horizontal
    if (dy > 0.1 && Math.abs(dx) < 0.2 && totalMotion(traj) > 0.15) {
      return { labelId: "thank_you", confidence: 0.72 };
    }
    return null;
  },

  // BECKON: index finger repeatedly curling (gap index-tip ↔ palm oscillates)
  (frames) => {
    const last = frames[frames.length - 1].lm;
    const ext = fingersExtended(last);
    if (ext[2] || ext[3] || ext[4]) return null; // only index
    const palm0 = palmSize(frames[0].lm);
    const gaps = frames.map((f) => dist(f.lm[8], f.lm[5]) / palmSize(f.lm));
    const crossings = zeroCrossings(gaps);
    const range = Math.max(...gaps) - Math.min(...gaps);
    if (range < 0.3 || crossings < 2) return null;
    void palm0;
    return { labelId: "beckon", confidence: Math.min(0.88, 0.6 + crossings * 0.07) };
  },

  // TAP WRIST: index finger taps near wrist of same hand twice (approximation)
  (frames) => {
    const last = frames[frames.length - 1].lm;
    const ext = fingersExtended(last);
    if (!ext[1] || ext[2] || ext[3] || ext[4]) return null;
    const palm0 = palmSize(frames[0].lm);
    const dists = frames.map((f) => dist(f.lm[8], f.lm[0]) / palmSize(f.lm));
    const crossings = zeroCrossings(dists);
    void palm0;
    return crossings >= 2 && Math.min(...dists) < 1.1
      ? { labelId: "tap_wrist", confidence: 0.72 }
      : null;
  },

  // LETTER J: pinky extended only, traces a J (down then hook left)
  (frames) => {
    const last = frames[frames.length - 1].lm;
    const ext = fingersExtended(last);
    if (ext[0] || ext[1] || ext[2] || ext[3] || !ext[4]) return null;
    const traj = trajectory(frames, 20);
    if (totalMotion(traj) < 0.1) return null;
    const mid = Math.floor(traj.length / 2);
    const firstDy = traj[mid].y - traj[0].y;
    const lastDx = traj[traj.length - 1].x - traj[mid].x;
    if (firstDy > 0.06 && lastDx < -0.04) {
      return { labelId: "letter_J", confidence: 0.78 };
    }
    return null;
  },

  // LETTER Z: index extended only, traces a Z (→, ↙, →)
  (frames) => {
    const last = frames[frames.length - 1].lm;
    const ext = fingersExtended(last);
    if (ext[0] || !ext[1] || ext[2] || ext[3] || ext[4]) return null;
    const traj = trajectory(frames, 8);
    if (totalMotion(traj) < 0.15) return null;
    const a = Math.floor(traj.length / 3);
    const b = Math.floor((2 * traj.length) / 3);
    const seg1 = traj[a].x - traj[0].x;
    const seg2x = traj[b].x - traj[a].x;
    const seg2y = traj[b].y - traj[a].y;
    const seg3 = traj[traj.length - 1].x - traj[b].x;
    if (seg1 > 0.05 && seg2x < -0.04 && seg2y > 0.04 && seg3 > 0.05) {
      return { labelId: "letter_Z", confidence: 0.76 };
    }
    return null;
  },
];

/** Track repeat counts so we don't fire the same motion gesture every frame. */
export class MotionRecognizer {
  private buffer = new MotionBuffer();
  private lastFired = { labelId: "", t: 0 };

  push(lm: NormalizedLandmark[] | null) {
    this.buffer.push(lm);
  }

  reset() {
    this.buffer.reset();
    this.lastFired = { labelId: "", t: 0 };
  }

  /** Returns a fresh motion prediction or null. Dedupes a label within 1.2 s. */
  poll(): MotionPrediction | null {
    const frames = this.buffer.snapshot();
    if (frames.length < MIN_FRAMES) return null;
    void fingersCurled;

    let best: MotionPrediction | null = null;
    for (const d of detectors) {
      try {
        const r = d(frames);
        if (r && (!best || r.confidence > best.confidence)) best = r;
      } catch {
        /* skip */
      }
    }
    if (!best) return null;
    const now = performance.now();
    if (
      best.labelId === this.lastFired.labelId &&
      now - this.lastFired.t < 1200
    ) {
      return null;
    }
    this.lastFired = { labelId: best.labelId, t: now };
    // Clear buffer after firing so the next motion starts fresh.
    this.buffer.reset();
    return best;
  }
}
