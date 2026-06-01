/**
 * Recognition service layer (Supabase-backed).
 *
 * Real in-browser gesture recognition (unchanged):
 *  - MediaPipe GestureRecognizer (pretrained) for common gestures
 *  - Rule-based ASL letter classifier on hand landmarks
 *
 * Persistence is via Supabase tables: predictions, recognition_sessions, feedback.
 */
import { classifyAsl, type NormalizedLandmark } from "@/lib/asl-classifier";
import { supabase } from "@/integrations/supabase/client";
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
  gestureType: string;
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
    if (mapped) mp = { ...mapped, confidence: +req.gesture.score.toFixed(3) };
  }

  // Layer 2: rule-based ASL letter
  let asl: { gesture: string; text: string; confidence: number } | null = null;
  if (req.landmarks) {
    const r = classifyAsl(req.landmarks);
    if (r && r.confidence >= MIN_CONFIDENCE) {
      asl = { gesture: `ASL ${r.letter}`, text: r.letter, confidence: r.confidence };
    }
  }

  let chosen: typeof mp = null;
  let source: PredictResponse["source"] = "mediapipe";
  if (mp && asl) {
    if (mp.confidence + 0.02 >= asl.confidence) { chosen = mp; source = "mediapipe"; }
    else { chosen = asl; source = "asl-rule"; }
  } else if (mp) { chosen = mp; source = "mediapipe"; }
  else if (asl) { chosen = asl; source = "asl-rule"; }

  if (!chosen) return null;
  return {
    ...chosen,
    gestureType: source === "mediapipe" ? "MediaPipe Gesture" : "ASL Letter",
    processingTimeMs: +(performance.now() - start).toFixed(1),
    source,
  };
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
    text: r.gesture.startsWith("ASL ") ? r.gesture.slice(4) : r.gesture,
    confidence: Number(r.confidence),
    source: r.source as "mediapipe" | "asl-rule",
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
