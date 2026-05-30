/**
 * Centralized API service layer.
 *
 * Today every call hits a local mock backed by localStorage.
 * To go live, replace the implementations in this file with `fetch()`
 * against your real endpoints — call sites do not need to change.
 */
import {
  feedbackRepo,
  logsRepo,
  predictionsRepo,
  recSessionsRepo,
  uid,
} from "@/lib/storage";
import type {
  Feedback,
  Prediction,
  RecognitionSession,
} from "@/lib/types";

export const SUPPORTED_GESTURES = [
  { gesture: "Hello", text: "Hello" },
  { gesture: "Thank you", text: "Thank you" },
  { gesture: "Yes", text: "Yes" },
  { gesture: "No", text: "No" },
  { gesture: "Please", text: "Please" },
  { gesture: "Sorry", text: "Sorry" },
  { gesture: "I love you", text: "I love you" },
  { gesture: "Help", text: "Help" },
  { gesture: "Good", text: "Good" },
  { gesture: "Stop", text: "Stop" },
  { gesture: "A", text: "A" },
  { gesture: "B", text: "B" },
  { gesture: "C", text: "C" },
  { gesture: "D", text: "D" },
  { gesture: "E", text: "E" },
];

export interface PredictRequest {
  userId: string;
  sessionId: string | null;
  // Future: landmarks payload from MediaPipe
  landmarks?: number[][];
  handDetected: boolean;
}

export interface PredictResponse {
  gesture: string;
  text: string;
  confidence: number;
  processingTimeMs: number;
}

/** Future: replace with `fetch('/predict', ...)` */
export async function predict(req: PredictRequest): Promise<PredictResponse | null> {
  if (!req.handDetected) return null;
  const start = performance.now();
  // Tiny synthetic latency for realism
  await new Promise((r) => setTimeout(r, 40 + Math.random() * 80));
  const choice =
    SUPPORTED_GESTURES[Math.floor(Math.random() * SUPPORTED_GESTURES.length)];
  const confidence = +(0.7 + Math.random() * 0.29).toFixed(3);
  return {
    gesture: choice.gesture,
    text: choice.text,
    confidence,
    processingTimeMs: +(performance.now() - start).toFixed(1),
  };
}

/** Future: replace with `fetch('/save-prediction', POST)` */
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

/** Future: replace with `fetch('/history', GET)` */
export async function getHistory(userId: string): Promise<Prediction[]> {
  return predictionsRepo.forUser(userId);
}

export async function getAllHistory(): Promise<Prediction[]> {
  return predictionsRepo.all();
}

/** Future: replace with `fetch('/analytics', GET)` */
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

  // last 14 days
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
