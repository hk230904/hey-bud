/**
 * Recognition service layer (Supabase-backed).
 *
 * Pipeline:
 *   MediaPipe HandLandmarker frame → landmark feature extractor
 *      → static classifier (A–Z, 0–9, emoji gestures)
 *      → motion classifier (J, Z, Wave, Please, Sorry, …)
 *      → fusion → persisted to `predictions`.
 */
import { supabase } from "@/integrations/supabase/client";
import { LABELS, LABELS_BY_ID, type GestureLabel } from "@/lib/gestures/labels";
import type { NormalizedLandmark } from "@/lib/gestures/landmark-features";
import {
  Recognizer,
  type RecognitionResult,
  type RecognitionSource,
} from "@/lib/gestures/recognizer";
import type { Feedback, Prediction, RecognitionSession } from "@/lib/types";

// Singleton recognizer per page session; consumers may also create their own.
export const recognizer = new Recognizer();

export const SUPPORTED_GESTURES: { gesture: string; text: string }[] = LABELS
  .filter((l) => l.enabled)
  .map((l) => ({ gesture: l.display, text: l.emoji ?? l.display }));

export interface PredictRequest {
  userId: string;
  sessionId: string | null;
  landmarks: NormalizedLandmark[] | null;
  gesture: { name: string; score: number } | null;
}

export interface PredictResponse {
  gesture: string;        // human-readable display label
  gestureType: string;    // "Letter" | "Digit" | "Gesture" | "Motion"
  text: string;           // short caption text
  confidence: number;
  processingTimeMs: number;
  source: RecognitionSource;
}

function kindToType(label: GestureLabel) {
  switch (label.kind) {
    case "letter": return "Letter";
    case "digit": return "Digit";
    case "motion": return "Motion";
    default: return "Gesture";
  }
}

function shortText(label: GestureLabel) {
  if (label.kind === "letter") return label.display.replace("Letter ", "");
  if (label.kind === "digit") return label.display.replace("Digit ", "");
  return label.display;
}

function resultToResponse(
  r: RecognitionResult,
  startedAt: number,
): PredictResponse {
  const label = LABELS_BY_ID[r.labelId];
  return {
    gesture: r.display,
    gestureType: label ? kindToType(label) : "Gesture",
    text: label ? shortText(label) : r.display,
    confidence: r.confidence,
    processingTimeMs: +(performance.now() - startedAt).toFixed(1),
    source: r.source,
  };
}

/**
 * Static + MediaPipe fusion. Also feeds the rolling motion buffer.
 * Use `predictMotion` separately to drain temporal gestures.
 */
export function predict(req: PredictRequest): PredictResponse | null {
  const start = performance.now();
  recognizer.ingest(req.landmarks);
  if (!req.landmarks && !req.gesture) return null;
  const r = recognizer.classifyFrame(req.landmarks, req.gesture);
  if (!r) return null;
  return resultToResponse(r, start);
}

/** Drain a motion gesture if one just completed. */
export function predictMotion(): PredictResponse | null {
  const start = performance.now();
  const r = recognizer.pollMotion();
  if (!r) return null;
  return resultToResponse(r, start);
}

export function resetMotion() {
  recognizer.resetMotion();
}

// ---------- Mappers ----------
type PredictionRow = {
  id: string;
  user_id: string;
  session_id: string | null;
  gesture: string;
  gesture_type: string;
  confidence: number;
  source: string;
  processing_time: number;
  created_at: string;
};

function rowToPrediction(r: PredictionRow): Prediction {
  return {
    id: r.id,
    userId: r.user_id,
    sessionId: r.session_id,
    gesture: r.gesture,
    gestureType: r.gesture_type,
    text: r.gesture.startsWith("Letter ")
      ? r.gesture.slice(7)
      : r.gesture.startsWith("Digit ")
        ? r.gesture.slice(6)
        : r.gesture,
    confidence: Number(r.confidence),
    source: r.source as Prediction["source"],
    processingTimeMs: Number(r.processing_time),
    timestamp: r.created_at,
  };
}

// ---------- Predictions ----------
export async function savePrediction(
  userId: string,
  sessionId: string | null,
  pred: PredictResponse,
): Promise<Prediction> {
  const { data, error } = await supabase
    .from("predictions")
    .insert({
      user_id: userId,
      session_id: sessionId,
      gesture: pred.gesture,
      gesture_type: pred.gestureType,
      confidence: pred.confidence,
      source: pred.source,
      processing_time: pred.processingTimeMs,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToPrediction(data as PredictionRow);
}

export async function getHistory(userId: string): Promise<Prediction[]> {
  const { data, error } = await supabase
    .from("predictions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return (data as PredictionRow[]).map(rowToPrediction);
}

// ---------- Sessions ----------
export async function startSession(userId: string): Promise<RecognitionSession> {
  const { data, error } = await supabase
    .from("recognition_sessions")
    .insert({ user_id: userId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id,
    userId: data.user_id,
    startedAt: data.session_start,
    endedAt: data.session_end,
    totalPredictions: data.total_predictions,
    averageConfidence: Number(data.average_confidence),
  };
}

export async function endSession(
  session: RecognitionSession,
  predictions: Prediction[],
): Promise<RecognitionSession> {
  const avg =
    predictions.length === 0
      ? 0
      : +(
          predictions.reduce((s, p) => s + p.confidence, 0) / predictions.length
        ).toFixed(4);
  const endedAt = new Date().toISOString();
  const { error } = await supabase
    .from("recognition_sessions")
    .update({
      session_end: endedAt,
      total_predictions: predictions.length,
      average_confidence: avg,
    })
    .eq("id", session.id);
  if (error) throw new Error(error.message);
  return {
    ...session,
    endedAt,
    totalPredictions: predictions.length,
    averageConfidence: avg,
  };
}

// ---------- Analytics ----------
export async function getAnalytics(userId: string) {
  const [predRes, sessRes] = await Promise.all([
    supabase
      .from("predictions")
      .select("gesture, confidence, processing_time, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("recognition_sessions")
      .select("id")
      .eq("user_id", userId),
  ]);
  if (predRes.error) throw new Error(predRes.error.message);
  if (sessRes.error) throw new Error(sessRes.error.message);

  const preds = (predRes.data ?? []).map((p) => ({
    gesture: p.gesture as string,
    confidence: Number(p.confidence),
    processingTimeMs: Number(p.processing_time),
    timestamp: p.created_at as string,
  }));

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
    if (c < 70) continue;
    const idx = Math.min(5, Math.max(0, Math.floor((c - 70) / 5)));
    confidenceBuckets[idx].count++;
  }

  return {
    totalPredictions: preds.length,
    todayPredictions: todayCount,
    averageConfidence: +avgConfidence.toFixed(3),
    averageProcessingMs: +avgProcessing.toFixed(1),
    totalSessions: sessRes.data?.length ?? 0,
    days,
    topGestures,
    confidenceBuckets,
  };
}

// ---------- Feedback ----------
export async function submitFeedback(
  feedback: Omit<Feedback, "id" | "timestamp">,
): Promise<Feedback> {
  const { data, error } = await supabase
    .from("feedback")
    .insert({
      user_id: feedback.userId,
      message: feedback.message,
      rating: feedback.rating,
      category: feedback.category,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id,
    userId: data.user_id,
    message: data.message,
    rating: data.rating,
    category: data.category as Feedback["category"],
    timestamp: data.created_at,
  };
}

export async function getMyFeedback(userId: string): Promise<Feedback[]> {
  const { data, error } = await supabase
    .from("feedback")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    message: r.message,
    rating: r.rating,
    category: r.category as Feedback["category"],
    timestamp: r.created_at,
  }));
}
