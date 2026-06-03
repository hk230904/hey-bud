import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Render the human-readable name of a recognized hand sign.
 * Stored gestures like "ASL L" become "Letter L"; MediaPipe gestures
 * (e.g. "Thumbs Up", "Fist", "Peace") are returned as-is.
 */
export function formatGestureName(gesture: string): string {
  if (gesture.startsWith("ASL ")) return `Letter ${gesture.slice(4)}`;
  return gesture;
}
