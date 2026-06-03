/**
 * Recognition orchestrator.
 *
 * Fuses three signal sources:
 *   1. MediaPipe pretrained gesture recognizer  (high-confidence common gestures)
 *   2. Static landmark classifier               (full A–Z + 0–9 + emoji gestures)
 *   3. Motion classifier                        (temporal gestures: J, Z, wave, please, …)
 *
 * Picks the highest-confidence label and tags the source so the UI can
 * display "Model" vs "Static rule" vs "Motion".
 */

import { LABELS_BY_ID, type GestureKind } from "./labels";
import type { NormalizedLandmark } from "./landmark-features";
import { MotionRecognizer, type MotionPrediction } from "./motion-classifier";
import { classifyStatic, type StaticPrediction } from "./static-classifier";

export type RecognitionSource = "mediapipe" | "static-rule" | "motion-rule";

export interface RecognitionResult {
  labelId: string;
  display: string;
  kind: GestureKind;
  confidence: number;
  source: RecognitionSource;
}

const MEDIAPIPE_TO_LABEL: Record<string, string> = {
  Closed_Fist: "fist",
  Open_Palm: "open_palm",
  Pointing_Up: "pointing",
  Thumb_Down: "thumbs_down",
  Thumb_Up: "thumbs_up",
  Victory: "victory",
  ILoveYou: "i_love_you",
};

const MIN_CONFIDENCE = 0.65;

function toResult(
  pred: StaticPrediction | MotionPrediction,
  source: RecognitionSource,
): RecognitionResult | null {
  const label = LABELS_BY_ID[pred.labelId];
  if (!label) return null;
  return {
    labelId: label.id,
    display: label.display,
    kind: label.kind,
    confidence: +pred.confidence.toFixed(3),
    source,
  };
}

export class Recognizer {
  private motion = new MotionRecognizer();

  resetMotion() {
    this.motion.reset();
  }

  /** Feed every frame's landmarks (or null when no hand). */
  ingest(lm: NormalizedLandmark[] | null) {
    this.motion.push(lm);
  }

  /** Static + MediaPipe fusion; call at your chosen prediction interval. */
  classifyFrame(
    lm: NormalizedLandmark[] | null,
    mp: { name: string; score: number } | null,
  ): RecognitionResult | null {
    let mpResult: RecognitionResult | null = null;
    if (mp && mp.score >= MIN_CONFIDENCE) {
      const id = MEDIAPIPE_TO_LABEL[mp.name];
      if (id && LABELS_BY_ID[id]) {
        mpResult = {
          labelId: id,
          display: LABELS_BY_ID[id].display,
          kind: LABELS_BY_ID[id].kind,
          confidence: +mp.score.toFixed(3),
          source: "mediapipe",
        };
      }
    }
    let staticResult: RecognitionResult | null = null;
    if (lm) {
      const s = classifyStatic(lm);
      if (s && s.confidence >= MIN_CONFIDENCE) {
        staticResult = toResult(s, "static-rule");
      }
    }

    if (mpResult && staticResult) {
      // Prefer the more specific/higher-confidence head with a tiny bias for
      // MediaPipe when scores are within noise.
      return mpResult.confidence + 0.03 >= staticResult.confidence
        ? mpResult
        : staticResult;
    }
    return mpResult ?? staticResult;
  }

  /** Poll for a motion gesture; returns null when no temporal pattern matched. */
  pollMotion(): RecognitionResult | null {
    const m = this.motion.poll();
    return m ? toResult(m, "motion-rule") : null;
  }
}
