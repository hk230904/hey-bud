## Goal

Replace the random `predict()` mock on the Recognition page with **real** gesture recognition. Two layers, both running fully in the browser:

1. **MediaPipe GestureRecognizer** — pretrained model recognizing 7 common gestures with real confidence: `Closed_Fist`, `Open_Palm`, `Pointing_Up`, `Thumb_Down`, `Thumb_Up`, `Victory`, `ILoveYou` (mapped to friendlier labels like "Fist", "Hello / Open Palm", "Point", "Thumbs Down", "Thumbs Up", "Peace", "I love you").
2. **Rule-based ASL letter classifier** — computes finger up/down states, fingertip distances, and thumb position from the 21 landmarks to detect ASL letter shapes: **A, B, C, D, E, F, I, L, O, U, V, W, Y**. Returns a confidence derived from how cleanly the pose matches the rule template.

Both layers run on every frame. The page picks the highest-confidence label between them (with a small bias toward the pretrained model when scores tie). If neither layer is confident enough (< 0.6), no prediction is emitted that tick.

## Changes

### 1. `src/lib/hand-tracker.ts` — switch to GestureRecognizer
- Replace `HandLandmarker` with `GestureRecognizer` from `@mediapipe/tasks-vision` (already installed; uses a different `.task` model URL).
- Keep the same canvas overlay drawing (landmarks + connections look identical).
- `onResult` callback signature changes from `(handDetected: boolean)` to `(result: { handDetected: boolean; landmarks: NormalizedLandmark[][]; gesture: { name: string; score: number } | null })` so the Recognition page can read both the raw landmarks (for the rule classifier) and the pretrained gesture (for the model classifier).

### 2. New file `src/lib/asl-classifier.ts`
- Pure function `classifyAsl(landmarks: NormalizedLandmark[]): { letter: string; confidence: number } | null`.
- Helpers: `fingersUp(landmarks)` → boolean[5], plus distance/angle utilities.
- Rule templates per letter (e.g. **A** = fist with thumb to the side; **B** = four fingers up, thumb across palm; **C** = curved hand, thumb–index gap ~ palm width; **L** = thumb + index up at right angle; **Y** = thumb + pinky out, others folded; etc.).
- Confidence = fraction of template conditions satisfied, mapped to 0.60–0.98.

### 3. `src/services/recognitionApi.ts` — real predict()
- Change `PredictRequest` to accept `gesture` (from GestureRecognizer) and `landmarks` (for the ASL classifier) instead of just `handDetected`.
- New `predict()` body: run `classifyAsl(landmarks)`, compare with the pretrained `gesture`, return whichever has higher confidence (≥ 0.6 threshold) — else return `null`.
- Remove the synthetic latency and random `SUPPORTED_GESTURES` pick. `processingTimeMs` becomes real wall-clock time of the classifier work.
- Update the exported `SUPPORTED_GESTURES` list to reflect what the system can actually recognize now (used by the Dashboard "Supported gestures" card).

### 4. `src/routes/_authenticated/recognition.tsx` — wire it up
- Store the latest `landmarks` + `gesture` from `useHandTracker` in a ref.
- The recognition tick reads from that ref and calls the new `predict()` with real inputs instead of just `handDetected`.
- Add small "Recognized: ASL letter / MediaPipe gesture" badge so the user can see which layer fired.

### 5. No changes to History / Analytics / Admin
- They consume `Prediction` records which keep the same shape; only the `gesture` field's values change (now real labels, not random).

## Technical notes

- The GestureRecognizer model is ~8 MB and loads once, cached by the browser. Same hosting pattern as the current HandLandmarker model.
- Rule-based ASL is intentionally limited to letters with **visually distinct, static** hand shapes. Letters that require motion (J, Z) or are ambiguous in 2D (M, N, S, T) are excluded — attempting them would hurt accuracy.
- Everything stays frontend-only and offline-capable after first load. No backend, no API keys.
- Expected accuracy on a clear, well-lit hand facing the camera: ~85–95% for the 7 pretrained gestures, ~70–85% for the ASL letters above. Worse in low light or with the hand at an angle — this is a fundamental limit of single-frame landmark classification, not a bug.

## Out of scope

- Word-level / sentence-level sign language (would require LSTM on landmark sequences and a labeled dataset).
- Letters needing motion (J, Z).
- Two-handed signs beyond what the pretrained model already covers.
