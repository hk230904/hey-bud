import { createFileRoute } from "@tanstack/react-router";
import { Activity, Camera, CameraOff, CircleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth-context";
import { LABELS } from "@/lib/gestures/labels";
import type { NormalizedLandmark } from "@/lib/gestures/landmark-features";
import { useHandTracker } from "@/lib/hand-tracker";
import { notify } from "@/lib/notify";
import {
  predict,
  predictMotion,
  resetMotion,
  type PredictResponse,
} from "@/services/recognitionApi";

export const Route = createFileRoute("/_authenticated/live-tracking")({
  head: () => ({
    meta: [
      { title: "Live Tracking — SignSense" },
      {
        name: "description",
        content:
          "Temporal motion gesture recognition: wave, please, sorry, J, Z and more.",
      },
    ],
  }),
  component: LiveTrackingPage,
});

interface MotionEvent {
  id: string;
  gesture: string;
  text: string;
  confidence: number;
  source: PredictResponse["source"];
  at: number;
}

function LiveTrackingPage() {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const latestFrameRef = useRef<{
    landmarks: NormalizedLandmark[] | null;
    gesture: { name: string; score: number } | null;
  }>({ landmarks: null, gesture: null });

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [events, setEvents] = useState<MotionEvent[]>([]);
  const [current, setCurrent] = useState<MotionEvent | null>(null);
  const [instant, setInstant] = useState<MotionEvent | null>(null);

  const supportedLabels = useMemo(
    () =>
      LABELS.filter(
        (l) =>
          l.enabled &&
          (l.kind === "motion" ||
            ["open_palm", "thumbs_up", "thumbs_down", "victory", "ok_sign", "fist", "i_love_you", "pointing", "stop"].includes(
              l.id,
            )),
      ),
    [],
  );

  const { status: trackerStatus } = useHandTracker({
    videoRef,
    canvasRef,
    enabled: cameraOn,
    onResult: (r) => {
      latestFrameRef.current = { landmarks: r.landmarks, gesture: r.gesture };
    },
  });

  // Polling loop — surfaces both instant (static/MediaPipe) and motion gestures.
  useEffect(() => {
    if (!cameraOn || !user) return;
    let cancelled = false;
    const loop = async () => {
      while (!cancelled) {
        await new Promise((r) => setTimeout(r, 60));
        if (cancelled) break;
        const frame = latestFrameRef.current;
        const i = predict({
          userId: user.id,
          sessionId: null,
          landmarks: frame.landmarks,
          gesture: frame.gesture,
        });
        if (i) {
          setInstant({
            id: "instant",
            gesture: i.gesture,
            text: i.text,
            confidence: i.confidence,
            source: i.source,
            at: Date.now(),
          });
        } else {
          // Decay after 700 ms with no detection.
          setInstant((prev) =>
            prev && Date.now() - prev.at > 700 ? null : prev,
          );
        }
        const m = predictMotion();
        if (m) {
          const evt: MotionEvent = {
            id: crypto.randomUUID(),
            gesture: m.gesture,
            text: m.text,
            confidence: m.confidence,
            source: m.source,
            at: Date.now(),
          };
          setCurrent(evt);
          setEvents((prev) => [evt, ...prev].slice(0, 30));
        }
      }
    };
    loop();
    return () => {
      cancelled = true;
    };
  }, [cameraOn, user]);

  // Display: motion takes over for ~1.5 s when it fires; otherwise show instant.
  const displayed: MotionEvent | null =
    current && Date.now() - current.at < 1500 ? current : instant;

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      resetMotion();
      setEvents([]);
      setCurrent(null);
      setCameraOn(true);
      notify.success("Live tracking started", "Try waving or signing 'please'");
    } catch (e) {
      const msg = (e as Error).message;
      setCameraError(msg);
      notify.error("Camera failed", msg);
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
    resetMotion();
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Live tracking</h1>
        <p className="text-sm text-muted-foreground">
          Temporal motion recognition — the model watches a rolling buffer of
          hand landmarks (~1.4 s) and emits gestures that depend on movement
          over time, such as <strong>Please</strong> (flat hand circling on the
          chest), <strong>Wave</strong>, <strong>Sorry</strong>, and the moving
          ASL letters <strong>J</strong> and <strong>Z</strong>.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Camera */}
        <div className="rounded-2xl border bg-card p-4 lg:col-span-2">
          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
            <video
              ref={videoRef}
              playsInline
              muted
              className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full -scale-x-100"
              aria-hidden="true"
            />
            {!cameraOn && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted text-center">
                <Camera className="h-10 w-10 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">Camera is off</div>
                  <div className="text-xs text-muted-foreground">
                    Click "Start tracking" to begin motion recognition
                  </div>
                </div>
              </div>
            )}
            {cameraOn && trackerStatus === "ready" && (
              <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1 text-xs backdrop-blur">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                Buffering landmarks
              </div>
            )}
            {displayed && Date.now() - displayed.at < 1800 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow-lg">
                {displayed.gesture}
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {!cameraOn ? (
              <Button onClick={startCamera}>
                <Camera className="mr-1.5 h-4 w-4" />
                Start tracking
              </Button>
            ) : (
              <Button onClick={stopCamera} variant="destructive">
                <CameraOff className="mr-1.5 h-4 w-4" />
                Stop tracking
              </Button>
            )}
          </div>

          {cameraError && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <CircleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <div className="font-medium">Camera unavailable</div>
                <div className="text-xs">{cameraError}</div>
              </div>
            </div>
          )}
        </div>

        {/* Current sign */}
        <div className="space-y-4">
          <div className="rounded-2xl border bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Current sign
              </h2>
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <div
              aria-live="polite"
              aria-atomic="true"
              className="mt-3 text-3xl font-bold tracking-tight"
            >
              {displayed ? displayed.gesture : "—"}
            </div>
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                <span>Confidence</span>
                <span>
                  {displayed ? `${(displayed.confidence * 100).toFixed(0)}%` : "—"}
                </span>
              </div>
              <Progress value={displayed ? displayed.confidence * 100 : 0} />
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              {displayed
                ? `${displayed.source === "motion-rule" ? "Motion" : displayed.source === "mediapipe" ? "Model" : "Static"} · just now`
                : "Show a sign…"}
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-5">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Supported gestures
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {supportedLabels.map((l) => (
                <li key={l.id} className="flex items-start gap-2">
                  <span className="text-base leading-none">
                    {l.emoji ?? "•"}
                  </span>
                  <div>
                    <div className="font-medium">{l.display}</div>
                    {l.description && (
                      <div className="text-xs text-muted-foreground">
                        {l.description}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Motion feed */}
      <div className="rounded-2xl border bg-card">
        <div className="border-b p-5">
          <h2 className="text-base font-semibold">Motion feed</h2>
          <p className="text-xs text-muted-foreground">
            Most recent temporal detections first (in-memory, not saved to history)
          </p>
        </div>
        {events.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No motion gestures detected yet. Try waving or circling your flat
            hand on your chest.
          </div>
        ) : (
          <ul className="divide-y">
            {events.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 p-4"
              >
                <div>
                  <div className="text-sm font-medium">{e.gesture}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(e.at).toLocaleTimeString()}
                  </div>
                </div>
                <div className="text-sm font-semibold">
                  {(e.confidence * 100).toFixed(0)}%
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
