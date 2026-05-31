import { useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  GestureRecognizer,
  type GestureRecognizerResult,
} from "@mediapipe/tasks-vision";

import type { NormalizedLandmark } from "./asl-classifier";

const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

let recognizer: GestureRecognizer | null = null;
let initializing: Promise<GestureRecognizer> | null = null;

async function getRecognizer() {
  if (recognizer) return recognizer;
  if (initializing) return initializing;
  initializing = (async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
    const gr = await GestureRecognizer.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 2,
    });
    recognizer = gr;
    return gr;
  })();
  return initializing;
}

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

export interface HandTrackerResult {
  handDetected: boolean;
  landmarks: NormalizedLandmark[] | null;
  gesture: { name: string; score: number } | null;
}

interface UseHandTrackerOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  enabled: boolean;
  onResult?: (r: HandTrackerResult) => void;
}

export function useHandTracker({
  videoRef,
  canvasRef,
  enabled,
  onResult,
}: UseHandTrackerOptions) {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const loop = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const rec = recognizer;
      if (!video || !canvas || !rec) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      if (video.readyState >= 2 && video.videoWidth > 0) {
        if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
        if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (video.currentTime !== lastVideoTimeRef.current) {
            lastVideoTimeRef.current = video.currentTime;
            try {
              const result: GestureRecognizerResult = rec.recognizeForVideo(
                video,
                performance.now(),
              );
              drawResults(ctx, result.landmarks, canvas.width, canvas.height);
              const hand = result.landmarks.length > 0;
              const top = result.gestures?.[0]?.[0];
              onResult?.({
                handDetected: hand,
                landmarks: hand
                  ? (result.landmarks[0] as NormalizedLandmark[])
                  : null,
                gesture:
                  top && top.categoryName && top.categoryName !== "None"
                    ? { name: top.categoryName, score: top.score }
                    : null,
              });
            } catch {
              /* ignore single-frame failures */
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    (async () => {
      try {
        setStatus("loading");
        await getRecognizer();
        if (cancelled) return;
        setStatus("ready");
        loop();
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message);
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { status, error };
}

function drawResults(
  ctx: CanvasRenderingContext2D,
  landmarksList: { x: number; y: number; z: number }[][],
  w: number,
  h: number,
) {
  const primary =
    getComputedStyle(document.documentElement).getPropertyValue("--primary") ||
    "oklch(0.52 0.16 252)";
  const chart2 =
    getComputedStyle(document.documentElement).getPropertyValue("--chart-2") ||
    "oklch(0.65 0.15 180)";
  for (const landmarks of landmarksList) {
    ctx.strokeStyle = primary;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (const [a, b] of HAND_CONNECTIONS) {
      const pa = landmarks[a];
      const pb = landmarks[b];
      ctx.beginPath();
      ctx.moveTo(pa.x * w, pa.y * h);
      ctx.lineTo(pb.x * w, pb.y * h);
      ctx.stroke();
    }
    ctx.fillStyle = chart2;
    for (const p of landmarks) {
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
