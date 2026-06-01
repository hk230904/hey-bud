export interface User {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface Prediction {
  id: string;
  userId: string;
  sessionId: string | null;
  gesture: string;
  gestureType: string; // "MediaPipe Gesture" | "ASL Letter"
  text: string; // friendly text for caption; derived from gesture
  confidence: number;
  source: "mediapipe" | "asl-rule";
  processingTimeMs: number;
  timestamp: string;
}

export interface RecognitionSession {
  id: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  totalPredictions: number;
  averageConfidence: number;
}

export interface Feedback {
  id: string;
  userId: string;
  message: string;
  rating: number;
  category: "general" | "issue" | "feature";
  timestamp: string;
}
