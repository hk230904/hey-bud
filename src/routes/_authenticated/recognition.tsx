import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  Camera,
  CameraOff,
  Download,
  RotateCcw,
  Sparkles,
  CircleAlert,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { NormalizedLandmark } from "@/lib/gestures/landmark-features";
import type { RecognitionSource } from "@/lib/gestures/recognizer";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useHandTracker } from "@/lib/hand-tracker";
import { useAuth } from "@/lib/auth-context";
import { notify } from "@/lib/notify";
import type { Prediction, RecognitionSession } from "@/lib/types";
import { formatGestureName } from "@/lib/utils";
import {
  endSession,
  predict,
  savePrediction,
  startSession,
} from "@/services/recognitionApi";

export const Route = createFileRoute("/_authenticated/recognition")({
  head: () => ({
    meta: [
      { title: "Recognition — SignSense" },
      { name: "description", content: "Live AI-powered sign language recognition." },
    ],
  }),
  component: RecognitionPage,
});

function RecognitionPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const latestFrameRef = useRef<{
    landmarks: NormalizedLandmark[] | null;
    gesture: { name: string; score: number } | null;
  }>({ landmarks: null, gesture: null });

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [session, setSession] = useState<RecognitionSession | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [current, setCurrent] = useState<Prediction | null>(null);
  const [currentSource, setCurrentSource] = useState<RecognitionSource | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const { status: trackerStatus } = useHandTracker({
    videoRef,
    canvasRef,
    enabled: cameraOn,
    onResult: (r) => {
      latestFrameRef.current = {
        landmarks: r.landmarks,
        gesture: r.gesture,
      };
    },
  });

  // Session timer
  useEffect(() => {
    if (!session) return;
    const start = new Date(session.startedAt).getTime();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [session]);

  // Prediction loop
  useEffect(() => {
    if (!cameraOn || !session || !user) return;
    let cancelled = false;
    const loop = async () => {
      let lastLabel = "";
      while (!cancelled) {
        await new Promise((r) => setTimeout(r, 800));
        if (cancelled) break;
        const frame = latestFrameRef.current;
        const pred = await predict({
          userId: user.id,
          sessionId: session.id,
          landmarks: frame.landmarks,
          gesture: frame.gesture,
        });
        if (cancelled) break;
        if (pred) {
          // Avoid spamming identical consecutive predictions
          if (pred.gesture === lastLabel) continue;
          lastLabel = pred.gesture;
          const saved = await savePrediction(user.id, session.id, pred);
          setCurrent(saved);
          setCurrentSource(pred.source);
          setPredictions((prev) => [saved, ...prev]);
          qc.invalidateQueries({ queryKey: ["history", user.id] });
          qc.invalidateQueries({ queryKey: ["analytics", user.id] });
        }
      }
    };
    loop();
    return () => {
      cancelled = true;
    };
  }, [cameraOn, session, user, qc]);

  const startCamera = useCallback(async () => {
    if (!user) return;
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
      const newSession = await startSession(user.id);
      setSession(newSession);
      setPredictions([]);
      setCurrent(null);
      setElapsed(0);
      setCameraOn(true);
      notify.success("Camera started", "Recognition is now live");
    } catch (e) {
      const msg = (e as Error).message;
      setCameraError(msg);
      notify.error("Camera failed", msg);
    }
  }, [user]);

  const stopCamera = useCallback(async () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
    if (session) {
      const ended = await endSession(session, predictions);
      setSession(ended);
      notify.info("Session ended", `${predictions.length} predictions captured`);
    }
  }, [session, predictions]);

  const resetSession = useCallback(() => {
    setPredictions([]);
    setCurrent(null);
    setElapsed(0);
    notify.info("Session reset");
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const exportCsv = () => {
    const rows = [
      ["Gesture", "Text", "Confidence", "Processing (ms)", "Timestamp"],
      ...predictions.map((p) => [
        p.gesture,
        p.text,
        (p.confidence * 100).toFixed(1),
        p.processingTimeMs.toFixed(1),
        p.timestamp,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `signsense-session-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const assembledText = predictions
    .slice()
    .reverse()
    .map((p) => p.text)
    .join(" ");

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Live recognition</h1>
        <p className="text-sm text-muted-foreground">
          Start your camera, sign in front of the lens, and watch text appear in real time.
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
                    Click "Start camera" to begin recognition
                  </div>
                </div>
              </div>
            )}
            {cameraOn && trackerStatus === "loading" && (
              <div className="absolute left-3 top-3 rounded-full bg-background/80 px-3 py-1 text-xs backdrop-blur">
                Loading hand tracker…
              </div>
            )}
            {cameraOn && trackerStatus === "ready" && (
              <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1 text-xs backdrop-blur">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                Tracking active
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {!cameraOn ? (
              <Button onClick={startCamera}>
                <Camera className="mr-1.5 h-4 w-4" />
                Start camera
              </Button>
            ) : (
              <Button onClick={stopCamera} variant="destructive">
                <CameraOff className="mr-1.5 h-4 w-4" />
                Stop camera
              </Button>
            )}
            <Button onClick={resetSession} variant="outline" disabled={!cameraOn}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Reset session
            </Button>
            <Button onClick={exportCsv} variant="outline" disabled={predictions.length === 0}>
              <Download className="mr-1.5 h-4 w-4" />
              Export CSV
            </Button>
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

        {/* Current prediction */}
        <div className="space-y-4">
          <div className="rounded-2xl border bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">Current prediction</h2>
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div
              aria-live="polite"
              aria-atomic="true"
              className="mt-3 text-3xl font-bold tracking-tight"
            >
              {current ? formatGestureName(current.gesture) : "—"}
            </div>
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                <span>Confidence</span>
                <span>{current ? `${(current.confidence * 100).toFixed(0)}%` : "—"}</span>
              </div>
              <Progress value={current ? current.confidence * 100 : 0} />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {current
                  ? `Processed in ${current.processingTimeMs.toFixed(0)} ms`
                  : "Awaiting hand detection…"}
              </span>
              {currentSource && (
                <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                  {currentSource === "mediapipe" ? "Model" : "ASL rule"}
                </span>
              )}
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-5">
            <h2 className="text-sm font-semibold text-muted-foreground">Session summary</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Predictions</dt>
                <dd className="text-lg font-semibold">{predictions.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Duration</dt>
                <dd className="text-lg font-semibold">
                  {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Avg confidence</dt>
                <dd className="text-lg font-semibold">
                  {predictions.length === 0
                    ? "—"
                    : `${((predictions.reduce((s, p) => s + p.confidence, 0) / predictions.length) * 100).toFixed(1)}%`}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Live caption */}
      <div className="rounded-2xl border bg-card p-5">
        <h2 className="text-sm font-semibold text-muted-foreground">Live caption</h2>
        <p className="mt-2 min-h-[2rem] text-lg leading-relaxed">
          {assembledText || (
            <span className="text-muted-foreground">Predictions appear here as you sign…</span>
          )}
        </p>
      </div>

      {/* Recognition feed */}
      <div className="rounded-2xl border bg-card">
        <div className="border-b p-5">
          <h2 className="text-base font-semibold">Recognition feed</h2>
          <p className="text-xs text-muted-foreground">Most recent predictions first</p>
        </div>
        {predictions.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No predictions yet in this session.
          </div>
        ) : (
          <ul className="divide-y">
            {predictions.slice(0, 20).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <div className="text-sm font-medium">{formatGestureName(p.gesture)}</div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(p.timestamp), "p")} · {p.processingTimeMs.toFixed(0)} ms
                  </div>
                </div>
                <div className="text-sm font-semibold">{(p.confidence * 100).toFixed(0)}%</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
