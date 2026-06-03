/**
 * Gesture label catalog.
 *
 * Single source of truth for every sign the recognizer can emit.
 * `id` is the stable internal identifier (also persisted to the DB).
 * `display` is what users see; `kind` controls which classifier head owns it.
 */

export type GestureKind = "letter" | "digit" | "static" | "motion";

export interface GestureLabel {
  id: string;
  display: string;
  emoji?: string;
  kind: GestureKind;
  hands: 1 | 2;
  /** Phase-2 (two-hand / pose-dependent) entries kept in catalog but disabled. */
  enabled: boolean;
  description?: string;
}

// ---------- ASL letters (A–Z) ----------
const LETTERS: GestureLabel[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(
  (l) => ({
    id: `letter_${l}`,
    display: `Letter ${l}`,
    kind: l === "J" || l === "Z" ? "motion" : "letter",
    hands: 1,
    enabled: true,
  }),
);

// ---------- Digits 0–9 ----------
const DIGITS: GestureLabel[] = "0123456789".split("").map((d) => ({
  id: `digit_${d}`,
  display: `Digit ${d}`,
  kind: "digit",
  hands: 1,
  enabled: true,
}));

// ---------- Static one-hand gestures ----------
const STATIC: GestureLabel[] = [
  { id: "thumbs_up", display: "Thumbs Up", emoji: "👍", kind: "static", hands: 1, enabled: true },
  { id: "thumbs_down", display: "Thumbs Down", emoji: "👎", kind: "static", hands: 1, enabled: true },
  { id: "victory", display: "Peace", emoji: "✌️", kind: "static", hands: 1, enabled: true },
  { id: "ok_sign", display: "OK Sign", emoji: "👌", kind: "static", hands: 1, enabled: true },
  { id: "fingers_crossed", display: "Fingers Crossed", emoji: "🤞", kind: "static", hands: 1, enabled: true },
  { id: "shaka", display: "Shaka", emoji: "🤙", kind: "static", hands: 1, enabled: true },
  { id: "rock_on", display: "Rock On", emoji: "🤘", kind: "static", hands: 1, enabled: true },
  { id: "stop", display: "Stop", emoji: "✋", kind: "static", hands: 1, enabled: true },
  { id: "pointing", display: "Pointing", emoji: "👆", kind: "static", hands: 1, enabled: true },
  { id: "pinched_fingers", display: "Pinched Fingers", emoji: "🤌", kind: "static", hands: 1, enabled: true },
  { id: "i_love_you", display: "I Love You", emoji: "🤟", kind: "static", hands: 1, enabled: true },
  { id: "fist", display: "Fist", emoji: "✊", kind: "static", hands: 1, enabled: true },
  { id: "open_palm", display: "Hello", emoji: "👋", kind: "static", hands: 1, enabled: true },
];

// ---------- Motion gestures ----------
const MOTION: GestureLabel[] = [
  { id: "wave", display: "Wave / Hello", emoji: "👋", kind: "motion", hands: 1, enabled: true, description: "Open palm moving side-to-side" },
  { id: "please", display: "Please (ASL)", emoji: "🙏", kind: "motion", hands: 1, enabled: true, description: "Flat hand circling on chest" },
  { id: "sorry", display: "Sorry (ASL)", emoji: "✊", kind: "motion", hands: 1, enabled: true, description: "Closed fist circling on chest" },
  { id: "yes_asl", display: "Yes (ASL)", emoji: "✊", kind: "motion", hands: 1, enabled: true, description: "Fist nodding up & down" },
  { id: "no_asl", display: "No (ASL)", emoji: "🤌", kind: "motion", hands: 1, enabled: true, description: "Index & middle snap down to thumb" },
  { id: "thank_you", display: "Thank You (ASL)", emoji: "🫱", kind: "motion", hands: 1, enabled: true, description: "Fingers from lips outward" },
  { id: "beckon", display: "Beckon", emoji: "☝️", kind: "motion", hands: 1, enabled: true, description: "Index finger curling repeatedly" },
  { id: "tap_wrist", display: "Tap Wrist", emoji: "⌚", kind: "motion", hands: 1, enabled: true, description: "Time-out gesture" },
];

export const LABELS: GestureLabel[] = [...LETTERS, ...DIGITS, ...STATIC, ...MOTION];

export const LABELS_BY_ID: Record<string, GestureLabel> = Object.fromEntries(
  LABELS.map((l) => [l.id, l]),
);

export function labelDisplay(id: string): string {
  return LABELS_BY_ID[id]?.display ?? id;
}
