/**
 * Centralized API service layer.
 *
 * Real in-browser gesture recognition:
 *  - MediaPipe GestureRecognizer (pretrained) for common gestures
 *  - Rule-based ASL letter classifier on hand landmarks
 *
 * Swap these implementations with `fetch()` calls later without changing call sites.
 */
import { classifyAsl, type NormalizedLandmark } from "@/lib/asl-classifier";
import {
  feedbackRepo,
  logsRepo,
  predictionsRepo,
  recSessionsRepo,
  uid,
} from "@/lib/storage";
import type { Feedback, Prediction, RecognitionSession } from "@/lib/types";

/** Friendly labels for the MediaPipe pretrained categories. */
const MEDIAPIPE_LABELS: Record<string, { gesture: string; text: string }> = {
  Closed_Fist: { gesture: "Fist", text: "Fist" },
  Open_Palm: { gesture: "Hello", text: "Hello" },
  Pointing_Up: { gesture: "Point", text: "Point" },
  Thumb_Down: { gesture: "Thumbs Down", text: "No" },
  Thumb_Up: { gesture: "Thumbs Up", text: "Yes" },
  Victory: { gesture: "Peace", text: "Peace" },
  ILoveYou: { gesture: "I love you", text: "I love you" },
};

/** Surfaced to the Dashboard "Supported gestures" card. */
export const SUPPORTED_GESTURES = [
  { gesture: "Hello", text: "Hello" },
  { gesture: "Thumbs Up", text: "Yes" },
  { gesture: "Thumbs Down", text: "No" },
  { gesture: "Peace", text: "Peace" },
  { gesture: "Fist", text: "Fist" },
  { gesture: "Point", text: "Point" },
  { gesture: "I love you", text: "I love you" },
  ...["A", "B", "C", "D", "E", "F", "I", "L", "O", "U", "V", "W", "Y"].map(
    (l) => ({ gesture: `ASL ${l}`, text: l }),
  ),
];

export interface PredictRequest {
  userId: string;
  sessionId: string | null;
  landmarks: NormalizedLandmark[] | null;
  gesture: { name: string; score: number } | null;
}

export interface PredictResponse {
  gesture: string;
  text: string;
  confidence: number;
  processingTimeMs: number;
  source: "mediapipe" | "asl-rule";
}

const MIN_CONFIDENCE = 0.6;

export async function predict(
  req: PredictRequest,
): Promise<PredictResponse | null> {
  if (!req.landmarks && !req.gesture) return null;
  const start = performance.now();

  // Layer 1: pretrained MediaPipe gesture
  let mp: { gesture: string; text: string; confidence: number } | null = null;
  if (req.gesture && req.gesture.score >= MIN_CONFIDENCE) {
    const mapped = MEDIAPIPE_LABELS[req.gesture.name];
    if (mapped) {
      mp = { ...mapped, confidence: +req.gesture.score.toFixed(3) };
    }
  }

  // Layer 2: rule-based ASL letter
  let asl: { gesture: string; text: string; confidence: number } | null = null;
  if (req.landmarks) {
    const r = classifyAsl(req.landmarks);
    if (r && r.confidence >= MIN_CONFIDENCE) {
      asl = {
        gesture: `ASL ${r.letter}`,
        text: r.letter,
        confidence: r.confidence,
      };
    }
  }

  // Pick best — small bias to MediaPipe on ties
  let chosen: typeof mp = null;
  let source: PredictResponse["source"] = "mediapipe";
  if (mp && asl) {
    if (mp.confidence + 0.02 >= asl.confidence) {
      chosen = mp;
      source = "mediapipe";
    } else {
      chosen = asl;
      source = "asl-rule";
    }
  } else if (mp) {
    chosen = mp;
    source = "mediapipe";
  } else if (asl) {
    chosen = asl;
    source = "asl-rule";
  }

  if (!chosen) return null;
  return {
    ...chosen,
    processingTimeMs: +(performance.now() - start).toFixed(1),
    source,
  };
}

export async function savePrediction(
  userId: string,
  sessionId: string | null,
  pred: PredictResponse,
): Promise<Prediction> {
  const record: Prediction = {
    id: uid(),
    userId,
    sessionId,
    gesture: pred.gesture,
    text: pred.text,
    confidence: pred.confidence,
    processingTimeMs: pred.processingTimeMs,
    timestamp: new Date().toISOString(),
  };
  predictionsRepo.add(record);
  logsRepo.add({
    eventType: "prediction",
    description: `Prediction "${pred.gesture}" (${(pred.confidence * 100).toFixed(0)}%)`,
    userId,
  });
  return record;
}

export async function getHistory(userId: string): Promise<Prediction[]> {
  return predictionsRepo.forUser(userId);
}

export async function getAllHistory(): Promise<Prediction[]> {
  return predictionsRepo.all();
}

export async function getAnalytics(userId: string) {
  const preds = predictionsRepo.forUser(userId);
  const sessions = recSessionsRepo.forUser(userId);
  return computeAnalytics(preds, sessions);
}

export async function getGlobalAnalytics() {
  return computeAnalytics(predictionsRepo.all(), recSessionsRepo.all());
}

function computeAnalytics(
  preds: Prediction[],
  sessions: RecognitionSession[],
) {
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = preds.filter((p) => p.timestamp.startsWith(today)).length;
  const avgConfidence =
    preds.length === 0
      ? 0
      : preds.reduce((s, p) => s + p.confidence, 0) / preds.length;
  const avgProcessing =
    preds.length === 0
      ? 0
      : preds.reduce((s, p) => s + p.processingTimeMs, 0) / preds.length;

  const days: { date: string; predictions: number; accuracy: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const dayPreds = preds.filter((p) => p.timestamp.startsWith(key));
    days.push({
      date: key.slice(5),
      predictions: dayPreds.length,
      accuracy:
        dayPreds.length === 0
          ? 0
          : +(
              (dayPreds.reduce((s, p) => s + p.confidence, 0) / dayPreds.length) *
              100
            ).toFixed(1),
    });
  }

  const gestureCounts = new Map<string, number>();
  for (const p of preds) {
    gestureCounts.set(p.gesture, (gestureCounts.get(p.gesture) ?? 0) + 1);
  }
  const topGestures = [...gestureCounts.entries()]
    .map(([gesture, count]) => ({ gesture, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const confidenceBuckets = [
    { range: "70-75%", count: 0 },
    { range: "75-80%", count: 0 },
    { range: "80-85%", count: 0 },
    { range: "85-90%", count: 0 },
    { range: "90-95%", count: 0 },
    { range: "95-100%", count: 0 },
  ];
  for (const p of preds) {
    const c = p.confidence * 100;
    const idx = Math.min(5, Math.max(0, Math.floor((c - 70) / 5)));
    confidenceBuckets[idx].count++;
  }

  return {
    totalPredictions: preds.length,
    todayPredictions: todayCount,
    averageConfidence: +avgConfidence.toFixed(3),
    averageProcessingMs: +avgProcessing.toFixed(1),
    totalSessions: sessions.length,
    days,
    topGestures,
    confidenceBuckets,
  };
}

export async function startSession(userId: string): Promise<RecognitionSession> {
  const s: RecognitionSession = {
    id: uid(),
    userId,
    startedAt: new Date().toISOString(),
    endedAt: null,
    totalPredictions: 0,
    averageConfidence: 0,
  };
  recSessionsRepo.upsert(s);
  logsRepo.add({ eventType: "session", description: "Session started", userId });
  return s;
}

export async function endSession(
  session: RecognitionSession,
  predictions: Prediction[],
): Promise<RecognitionSession> {
  const updated: RecognitionSession = {
    ...session,
    endedAt: new Date().toISOString(),
    totalPredictions: predictions.length,
    averageConfidence:
      predictions.length === 0
        ? 0
        : +(
            predictions.reduce((s, p) => s + p.confidence, 0) /
            predictions.length
          ).toFixed(3),
  };
  recSessionsRepo.upsert(updated);
  logsRepo.add({
    eventType: "session",
    description: `Session ended (${predictions.length} predictions)`,
    userId: session.userId,
  });
  return updated;
}

export async function submitFeedback(
  feedback: Omit<Feedback, "id" | "timestamp">,
): Promise<Feedback> {
  const f: Feedback = {
    ...feedback,
    id: uid(),
    timestamp: new Date().toISOString(),
  };
  feedbackRepo.add(f);
  logsRepo.add({
    eventType: "feedback",
    description: `Feedback submitted (${feedback.rating}★, ${feedback.category})`,
    userId: feedback.userId,
  });
  return f;
}
