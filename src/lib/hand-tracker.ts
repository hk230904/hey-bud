import { useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";

const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

let landmarker: HandLandmarker | null = null;
let initializing: Promise<HandLandmarker> | null = null;

async function getLandmarker() {
  if (landmarker) return landmarker;
  if (initializing) return initializing;
  initializing = (async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
    const lm = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 2,
    });
    landmarker = lm;
    return lm;
  })();
  return initializing;
}

// MediaPipe hand connection pairs
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

interface UseHandTrackerOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  enabled: boolean;
  onResult?: (handDetected: boolean) => void;
}

export function useHandTracker({
  videoRef,
  canvasRef,
  enabled,
  onResult,
}: UseHandTrackerOptions) {
  const [status, setStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const loop = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const lm = landmarker;
      if (!video || !canvas || !lm) {
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
              const result: HandLandmarkerResult = lm.detectForVideo(
                video,
                performance.now(),
              );
              drawResults(ctx, result, canvas.width, canvas.height);
              onResult?.(result.landmarks.length > 0);
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
        await getLandmarker();
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
  result: HandLandmarkerResult,
  w: number,
  h: number,
) {
  const primary =
    getComputedStyle(document.documentElement).getPropertyValue("--primary") ||
    "oklch(0.52 0.16 252)";
  const chart2 =
    getComputedStyle(document.documentElement).getPropertyValue("--chart-2") ||
    "oklch(0.65 0.15 180)";
  for (const landmarks of result.landmarks) {
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
