## Goal
Make the live-tracking right-side panel respond **instantly and accurately** to hand gestures (wave, hi/hello, thumbs up, peace, OK, please, sorry, yes, no, beckon, A–Z, 0–9, etc.) — not just slow waves.

## Root causes (from current code)

1. `src/routes/_authenticated/live-tracking.tsx` only consumes `predictMotion()`. The static + MediaPipe classifier (`predict()` returns it but its result is ignored), which handles all instant gestures — open palm = Hello, Thumbs Up, Peace, OK, Fist, Pointing, I Love You, every letter and digit — never reaches the UI.
2. `src/lib/gestures/motion-classifier.ts`:
   - `MIN_FRAMES = 10` and `setTimeout(120ms)` polling → ~1.2 s before any motion detector can run.
   - `MotionRecognizer.poll()` calls `this.buffer.reset()` after every fire, so the next detection has to refill from zero.
   - 1.2 s dedup window blocks rapid repeats.
   - WAVE wins because its gates are loose; PLEASE/SORRY need perfect circularity, NO needs an exact start-gap/end-gap snap, YES needs strict y-dominance over x. All are hard to satisfy in casual webcam motion.

## Fix plan (frontend / presentation only)

### 1. `src/routes/_authenticated/live-tracking.tsx`
- In the polling loop, capture **both** outputs each tick:
  - `const instant = predict({...})` → drives the "Current sign" panel immediately on every frame that classifies.
  - `const motion = predictMotion()` → continues to feed the motion feed list and the on-video badge.
- Add a separate `instant` state (last static/MediaPipe result, decayed after ~700 ms). Render it in the right-side panel as "Current sign" with its confidence; motion gestures (Wave, Please, etc.) override it for ~1.5 s when they fire.
- Tighten the polling interval from 120 ms → 60 ms so detection feels real-time.
- Update the placeholder copy ("Waiting for motion…") to "Show a sign…" and the supported-gestures list to include the top static gestures (Hello, Thumbs Up, OK, Peace, Fist, I Love You) alongside motion entries.

### 2. `src/lib/gestures/motion-classifier.ts` — responsiveness & accuracy
- `MIN_FRAMES`: 10 → **6** (≈360 ms minimum window).
- `MotionRecognizer.poll()`: after a fire, **keep the last 2 frames** instead of full reset, so the next motion can start building immediately.
- Dedup window: 1200 ms → **450 ms**.
- WAVE detector: lower `box.w` minimum from 0.05 → 0.035; allow `crossings >= 1` to fire at lower confidence (0.7) and `>= 2` at higher (0.88).
- PLEASE: lower circularity threshold 0.4 → 0.3, motion gate 0.25 → 0.18.
- SORRY: circularity 0.35 → 0.28, motion 0.25 → 0.18.
- YES (nod): allow open hand OR fist; lower yRange floor 0.06 → 0.04; ratio `yRange > xRange * 1.4` → `* 1.1`; `crossings >= 2` → `>= 1` (single nod fires at 0.72).
- NO: replace the brittle start-gap/end-gap rule with a horizontal-shake detector on the index/middle tips when only those two fingers are extended (x-zero-crossings ≥ 2).
- BECKON: range gate 0.3 → 0.18, crossings ≥ 1.
- THANK_YOU: dy threshold 0.1 → 0.06, motion 0.15 → 0.1.

### 3. `src/lib/gestures/recognizer.ts`
- Lower `MIN_CONFIDENCE` 0.65 → **0.55** so the static panel updates even on borderline frames (the UI shows the confidence number anyway).

## Out of scope (won't touch)
- DB schema, persistence, or auth.
- MediaPipe model URL / WASM source.
- Motion-classifier file structure or any new ML model.

## Verification
- Open `/live-tracking`, start camera, and confirm:
  - Showing an open palm immediately fills "Current sign" with "Hello".
  - Thumbs Up / Peace / OK / Fist / I Love You / Pointing all fire within ~1 frame.
  - Side-to-side wave fires "Wave / Hello" within ~600 ms.
  - Up-down nodding hand fires "Yes (ASL)" within ~600 ms.
  - Side-to-side index+middle fires "No (ASL)".
- No console errors; tracker still renders the skeleton overlay.

## Technical notes
- All changes stay within three frontend files: `live-tracking.tsx`, `motion-classifier.ts`, `recognizer.ts`. No new dependencies, no migrations, no server functions.
- The static classifier is already pure geometry and runs on every frame's landmarks — calling it has no perf cost beyond what we're already doing.