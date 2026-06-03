/**
 * Legacy entry point — superseded by `src/lib/gestures/*`.
 *
 * Keeps `NormalizedLandmark` and a thin classifyAsl wrapper for any
 * external importer that still references this module.
 */

export type { NormalizedLandmark } from "./gestures/landmark-features";
import { classifyStatic } from "./gestures/static-classifier";
import { LABELS_BY_ID } from "./gestures/labels";
import type { NormalizedLandmark } from "./gestures/landmark-features";

export interface AslResult {
  letter: string;
  confidence: number;
}

export function classifyAsl(lm: NormalizedLandmark[]): AslResult | null {
  const s = classifyStatic(lm);
  if (!s) return null;
  const lbl = LABELS_BY_ID[s.labelId];
  if (!lbl || lbl.kind !== "letter") return null;
  // "Letter A" → "A"
  const letter = lbl.display.replace("Letter ", "");
  return { letter, confidence: s.confidence };
}
