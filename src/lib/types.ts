export type UserRole = "user" | "admin";

export interface User {
  id: string;
  fullName: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  lastLogin: string | null;
}

export interface Prediction {
  id: string;
  userId: string;
  gesture: string;
  text: string;
  confidence: number;
  timestamp: string;
  processingTimeMs: number;
  sessionId: string | null;
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

export interface SystemLog {
  id: string;
  eventType: "auth" | "prediction" | "session" | "feedback" | "admin" | "error";
  description: string;
  userId?: string | null;
  timestamp: string;
}
