import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  Camera,
  CameraOff,
  CircleAlert,
  Copy,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { useAuth } from "@/lib/auth-context";
import { LABELS } from "@/lib/gestures/labels";
import type { NormalizedLandmark } from "@/lib/gestures/landmark-features";
import { useHandTracker } from "@/lib/hand-tracker";
import { notify } from "@/lib/notify";
import {
  endSession,
  predict,
  predictMotion,
  resetMotion,
  savePrediction,
  startSession,
  type PredictResponse,
} from "@/services/recognitionApi";
import type { Prediction, RecognitionSession } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/live-tracking")({
  head: () => ({
    meta: [
      { title: "Live Tracking — SignSense" },
      {
        name: "description",
        content:
          "Real-time sign language recognition with translation, history persistence and speech output.",
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

  // Session + dedupe refs (avoid React state in the hot polling loop).
  const sessionRef = useRef<RecognitionSession | null>(null);
  const savedRef = useRef<Prediction[]>([]);
  const lastInstantKeyRef = useRef<{ key: string; at: number } | null>(null);
  const thresholdRef = useRef(0.55);

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [events, setEvents] = useState<MotionEvent[]>([]);
  const [current, setCurrent] = useState<MotionEvent | null>(null);
  const [instant, setInstant] = useState<MotionEvent | null>(null);
  const [sentence, setSentence] = useState<string[]>([]);
  const [speakOn, setSpeakOn] = useState(false);
  const [threshold, setThreshold] = useState(0.55);

  useEffect(() => {
    thresholdRef.current = threshold;
  }, [threshold]);

  const supportedLabels = useMemo(
    () =>
      LABELS.filter(
        (l) =>
          l.enabled &&
          (l.kind === "motion" ||
            [
              "open_palm",
              "thumbs_up",
              "thumbs_down",
              "victory",
              "ok_sign",
              "fist",
              "i_love_you",
              "pointing",
              "stop",
            ].includes(l.id)),
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

  const speak = useCallback(
    (text: string) => {
      if (!speakOn || typeof window === "undefined" || !window.speechSynthesis)
        return;
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1;
        u.pitch = 1;
        window.speechSynthesis.speak(u);
      } catch {
        /* ignore */
      }
    },
    [speakOn],
  );

  const appendToSentence = useCallback(
    (token: string) => {
      setSentence((prev) => {
        // Avoid back-to-back duplicates.
        if (prev[prev.length - 1] === token) return prev;
        return [...prev, token].slice(-40);
      });
      speak(token);
    },
    [speak],
  );

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
          sessionId: sessionRef.current?.id ?? null,
          landmarks: frame.landmarks,
          gesture: frame.gesture,
        });
        if (i && i.confidence >= thresholdRef.current) {
          setInstant({
            id: "instant",
            gesture: i.gesture,
            text: i.text,
            confidence: i.confidence,
            source: i.source,
            at: Date.now(),
          });
          // Dedupe instant detections in the sentence: same label within 1.2s = one token.
          const now = Date.now();
          const last = lastInstantKeyRef.current;
          if (!last || last.key !== i.gesture || now - last.at > 1200) {
            lastInstantKeyRef.current = { key: i.gesture, at: now };
            appendToSentence(i.text);
            // Persist (fire-and-forget).
            void savePrediction(user.id, sessionRef.current?.id ?? null, i)
              .then((p) => savedRef.current.push(p))
              .catch(() => {});
          }
        } else if (i) {
          // Below threshold — keep updating the timestamp on existing instant.
        } else {
          // Decay after 700 ms with no detection.
          setInstant((prev) =>
            prev && Date.now() - prev.at > 700 ? null : prev,
          );
        }
        const m = predictMotion();
        if (m && m.confidence >= thresholdRef.current) {
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
          appendToSentence(m.text);
          void savePrediction(user.id, sessionRef.current?.id ?? null, m)
            .then((p) => savedRef.current.push(p))
            .catch(() => {});
        }
      }
    };
    loop();
    return () => {
      cancelled = true;
    };
  }, [cameraOn, user, appendToSentence]);

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
      setInstant(null);
      lastInstantKeyRef.current = null;
      savedRef.current = [];
      setCameraOn(true);
      // Open a recognition session (best-effort).
      if (user) {
        try {
          sessionRef.current = await startSession(user.id);
        } catch {
          sessionRef.current = null;
        }
      }
      notify.success("Live tracking started", "Try waving or signing 'please'");
    } catch (e) {
      const msg = (e as Error).message;
      setCameraError(msg);
      notify.error("Camera failed", msg);
    }
  }, [user]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
    resetMotion();
    // Close session.
    const s = sessionRef.current;
    if (s) {
      void endSession(s, savedRef.current).catch(() => {});
      sessionRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Keyboard shortcut: Space toggles camera (ignore when typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;
      e.preventDefault();
      if (cameraOn) stopCamera();
      else void startCamera();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cameraOn, startCamera, stopCamera]);

  const copySentence = useCallback(async () => {
    const text = sentence.join(" ");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      notify.success("Copied", "Translation copied to clipboard");
    } catch {
      notify.error("Copy failed", "Clipboard unavailable");
    }
  }, [sentence]);

  const trackerPill = useMemo(() => {
    if (!cameraOn) return null;
    if (trackerStatus === "loading")
      return { dot: "bg-warning", text: "Loading model…" };
    if (trackerStatus === "error")
      return { dot: "bg-destructive", text: "Tracker error" };
    if (trackerStatus === "ready")
      return { dot: "bg-success", text: "Tracking" };
    return { dot: "bg-muted-foreground", text: "Idle" };
  }, [cameraOn, trackerStatus]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Live tracking</h1>
        <p className="text-sm text-muted-foreground">
          Real-time sign recognition with translation, history persistence and
          optional speech output. Press <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs">Space</kbd> to start or stop the camera.
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
                    Click "Start tracking" or press Space to begin
                  </div>
                </div>
              </div>
            )}
            {trackerPill && (
              <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1 text-xs backdrop-blur">
                <span
                  className={`h-1.5 w-1.5 animate-pulse rounded-full ${trackerPill.dot}`}
                />
                {trackerPill.text}
              </div>
            )}
            {displayed && Date.now() - displayed.at < 1800 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow-lg">
                {displayed.gesture}
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
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
            <Button
              variant="outline"
              onClick={() => setSpeakOn((v) => !v)}
              aria-pressed={speakOn}
              title={speakOn ? "Mute speech" : "Speak detections"}
            >
              {speakOn ? (
                <Volume2 className="mr-1.5 h-4 w-4" />
              ) : (
                <VolumeX className="mr-1.5 h-4 w-4" />
              )}
              {speakOn ? "Speech on" : "Speech off"}
            </Button>
          </div>

          {/* Confidence threshold */}
          <div className="mt-4 rounded-md border bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium">Confidence threshold</span>
              <span className="text-muted-foreground">
                {Math.round(threshold * 100)}%
              </span>
            </div>
            <Slider
              value={[threshold]}
              min={0.4}
              max={0.95}
              step={0.05}
              onValueChange={(v) => setThreshold(v[0])}
              aria-label="Confidence threshold"
            />
            <div className="mt-1 text-xs text-muted-foreground">
              Detections below this are ignored.
            </div>
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
                  {displayed
                    ? `${(displayed.confidence * 100).toFixed(0)}%`
                    : "—"}
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

      {/* Translation strip */}
      <div className="rounded-2xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-5">
          <div>
            <h2 className="text-base font-semibold">Translation</h2>
            <p className="text-xs text-muted-foreground">
              Detected signs are appended live. Copy, speak, or clear.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={copySentence}
              disabled={sentence.length === 0}
            >
              <Copy className="mr-1.5 h-4 w-4" />
              Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const text = sentence.join(" ");
                if (text && typeof window !== "undefined" && window.speechSynthesis) {
                  window.speechSynthesis.cancel();
                  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
                }
              }}
              disabled={sentence.length === 0}
            >
              <Volume2 className="mr-1.5 h-4 w-4" />
              Speak
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSentence([])}
              disabled={sentence.length === 0}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Clear
            </Button>
          </div>
        </div>
        <div
          className="min-h-[80px] p-5 text-lg leading-relaxed"
          aria-live="polite"
        >
          {sentence.length === 0 ? (
            <span className="text-sm text-muted-foreground">
              Your translation will appear here…
            </span>
          ) : (
            sentence.join(" ")
          )}
        </div>
      </div>

      {/* Motion feed */}
      <div className="rounded-2xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-5">
          <div>
            <h2 className="text-base font-semibold">Motion feed</h2>
            <p className="text-xs text-muted-foreground">
              Most recent temporal detections first
            </p>
          </div>
          {events.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEvents([])}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Clear feed
            </Button>
          )}
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
