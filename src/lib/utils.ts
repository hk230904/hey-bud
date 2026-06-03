import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Display name for a recognized gesture. Stored gestures already use the
 * new "Letter A" / "Digit 5" / "Thumbs Up" / "Please (ASL)" format, so this
 * mostly handles legacy rows where older predictions were saved as "ASL A".
 */
export function formatGestureName(gesture: string): string {
  if (gesture.startsWith("ASL ")) return `Letter ${gesture.slice(4)}`;
  return gesture;
}
