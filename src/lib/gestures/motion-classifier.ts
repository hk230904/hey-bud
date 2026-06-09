/**
 * Motion / temporal gesture classifier.
 *
 * Buffers the last ~2 s of landmarks and runs lightweight motion-trajectory
 * detectors for gestures that depend on movement over time.
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

const BUFFER_MS = 2000;
const MIN_FRAMES = 6;
const DEDUP_MS = 450;

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

  /** Keep only the last `n` frames (used after firing a gesture). */
  trim(n: number) {
    if (this.frames.length > n) this.frames = this.frames.slice(-n);
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

function circularity(points: { x: number; y: number }[]) {
  if (points.length < 8) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  area = Math.abs(area) / 2;
  let perim = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    perim += Math.hypot(b.x - a.x, b.y - a.y);
  }
  if (perim < 1e-4) return 0;
  return Math.min(1, (4 * Math.PI * area) / (perim * perim));
}

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
  // WAVE: open palm, horizontal oscillation
  (frames) => {
    const last = frames[frames.length - 1].lm;
    const ext = fingersExtended(last);
    if (!ext[1] || !ext[2] || !ext[3] || !ext[4]) return null;
    const traj = trajectory(frames);
    const xs = traj.map((p) => p.x);
    const ys = traj.map((p) => p.y);
    const box = bbox(traj);
    if (box.w < 0.035) return null;
    if (box.w < box.h * 0.7) return null;
    const crossings = zeroCrossings(xs);
    const yRange = Math.max(...ys) - Math.min(...ys);
    if (yRange > box.w * 1.2) return null;
    if (crossings >= 2) {
      return { labelId: "wave", confidence: Math.min(0.95, 0.78 + crossings * 0.05) };
    }
    if (crossings >= 1) {
      return { labelId: "wave", confidence: 0.7 };
    }
    return null;
  },

  // PLEASE: flat hand circling
  (frames) => {
    const last = frames[frames.length - 1].lm;
    const ext = fingersExtended(last);
    if (!ext[1] || !ext[2] || !ext[3] || !ext[4]) return null;
    const traj = trajectory(frames);
    const motion = totalMotion(traj);
    if (motion < 0.18) return null;
    const c = circularity(traj);
    return c > 0.3
      ? { labelId: "please", confidence: Math.min(0.95, 0.6 + c * 0.35) }
      : null;
  },

  // SORRY: closed fist circling
  (frames) => {
    const last = frames[frames.length - 1].lm;
    const ext = fingersExtended(last);
    if (ext.some((v, i) => i > 0 && v)) return null;
    const traj = trajectory(frames);
    const motion = totalMotion(traj);
    if (motion < 0.18) return null;
    const c = circularity(traj);
    return c > 0.28
      ? { labelId: "sorry", confidence: Math.min(0.92, 0.55 + c * 0.4) }
      : null;
  },

  // YES (ASL): hand nodding up/down (open OR fist)
  (frames) => {
    const traj = trajectory(frames);
    const ys = traj.map((p) => p.y);
    const xs = traj.map((p) => p.x);
    const yRange = Math.max(...ys) - Math.min(...ys);
    const xRange = Math.max(...xs) - Math.min(...xs);
    if (yRange < 0.04) return null;
    if (yRange < xRange * 1.1) return null;
    const crossings = zeroCrossings(ys);
    if (crossings >= 2) {
      return { labelId: "yes_asl", confidence: Math.min(0.9, 0.72 + crossings * 0.05) };
    }
    if (crossings >= 1 && yRange > 0.07) {
      return { labelId: "yes_asl", confidence: 0.72 };
    }
    return null;
  },

  // NO (ASL): index + middle extended, shaking side to side
  (frames) => {
    const last = frames[frames.length - 1].lm;
    const ext = fingersExtended(last);
    if (!ext[1] || !ext[2] || ext[3] || ext[4]) return null;
    const traj = trajectory(frames, 8); // index tip
    const xs = traj.map((p) => p.x);
    const ys = traj.map((p) => p.y);
    const xRange = Math.max(...xs) - Math.min(...xs);
    const yRange = Math.max(...ys) - Math.min(...ys);
    if (xRange < 0.04) return null;
    if (xRange < yRange * 1.1) return null;
    const crossings = zeroCrossings(xs);
    if (crossings >= 2) {
      return { labelId: "no_asl", confidence: Math.min(0.9, 0.7 + crossings * 0.05) };
    }
    return null;
  },

  // THANK YOU (ASL): flat hand moving outward/down
  (frames) => {
    const last = frames[frames.length - 1].lm;
    const ext = fingersExtended(last);
    if (!ext[1] || !ext[2] || !ext[3] || !ext[4]) return null;
    const traj = trajectory(frames);
    const dx = traj[traj.length - 1].x - traj[0].x;
    const dy = traj[traj.length - 1].y - traj[0].y;
    if (dy > 0.06 && Math.abs(dx) < 0.22 && totalMotion(traj) > 0.1) {
      return { labelId: "thank_you", confidence: 0.72 };
    }
    return null;
  },

  // BECKON: only index extended, gap oscillates
  (frames) => {
    const last = frames[frames.length - 1].lm;
    const ext = fingersExtended(last);
    if (ext[2] || ext[3] || ext[4]) return null;
    const gaps = frames.map((f) => dist(f.lm[8], f.lm[5]) / palmSize(f.lm));
    const crossings = zeroCrossings(gaps);
    const range = Math.max(...gaps) - Math.min(...gaps);
    if (range < 0.18 || crossings < 1) return null;
    return { labelId: "beckon", confidence: Math.min(0.88, 0.62 + crossings * 0.08) };
  },

  // TAP WRIST: index extended only, tip approaches wrist repeatedly
  (frames) => {
    const last = frames[frames.length - 1].lm;
    const ext = fingersExtended(last);
    if (!ext[1] || ext[2] || ext[3] || ext[4]) return null;
    const dists = frames.map((f) => dist(f.lm[8], f.lm[0]) / palmSize(f.lm));
    const crossings = zeroCrossings(dists);
    return crossings >= 2 && Math.min(...dists) < 1.1
      ? { labelId: "tap_wrist", confidence: 0.72 }
      : null;
  },

  // LETTER J: pinky only, down then hook left
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

  // LETTER Z: index only, traces Z
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
      now - this.lastFired.t < DEDUP_MS
    ) {
      return null;
    }
    this.lastFired = { labelId: best.labelId, t: now };
    // Trim instead of full reset so the next gesture can build immediately.
    this.buffer.trim(2);
    return best;
  }
}
