## Goal

Replace the current rule-based ASL classifier (13 letters) with a proper landmark-based ML pipeline running entirely in the browser. Add temporal sequence support for motion gestures, and a recording tool so you can collect your own samples on top of seeded public data.

## Architecture (in-browser, TensorFlow.js)

```text
Webcam frame
   └─► MediaPipe Hands Landmarker  → 21 × (x,y,z) = 63 floats per hand
            ├─► Static DNN classifier (63 → 128 → N classes)   → letters, digits, static emoji
            └─► Rolling buffer (30 frames, 63 floats each)
                    └─► Sequence model (1D-CNN or small LSTM)  → motion gestures (J, Z, Wave, Please, Sorry, …)
   └─► Fusion layer: pick the higher-confidence head, with hysteresis to avoid flicker
```

Everything runs client-side with `@tensorflow/tfjs` + the existing MediaPipe pipeline. No Python backend, no extra hosting.

## Module breakdown

### 1. Landmark feature pipeline (`src/lib/landmark-features.ts`)

- Normalize: translate so wrist (landmark 0) is origin, scale by bounding-box diagonal, mirror left-hand to right-hand convention.
- Output a deterministic 63-float vector.
- Exposed helper `extractFeatures(landmarks)` reused by both training capture and inference.

### 2. Label set (`src/lib/gestures/labels.ts`)

Three groups, single flat label index:

- **Letters** A–Z (J, Z marked `motion: true`)
- **Digits** 0–9
- **Static emoji** Thumbs Up/Down, Victory, OK, Fingers Crossed, Shaka, Pinched, Rock On, Stop, Pointing, Beckoning, Salute, Heart Hands (two-hand → skipped or two-hand variant), Flexed Bicep (skipped, needs arm), Praying (two-hand), Hand on Heart, Steepling, Palm Up, Palm Down, Rubbing Fingers, Tapping Temple, Chin Stroke, Yawning Hand, Fist Bump, High Five, Handshake (two-hand)
- Each label carries `{ id, display, emoji, motion, hands: 1|2 }`. Two-hand gestures are listed but parked behind a feature flag for phase 2 (one-hand model first).

### 3. Static classifier (`src/lib/gestures/static-model.ts`)

- Small dense net: `63 → 128 → 64 → N_static`, softmax.
- Trained offline; weights shipped as `public/models/static/model.json` (+ shards) and loaded via `tf.loadLayersModel`.
- Inference returns top-k with confidence; we threshold at 0.75 with a 5-frame majority vote (replaces current ad-hoc smoothing).

### 4. Sequence classifier (`src/lib/gestures/sequence-model.ts`)

- Input: 30 × 63 tensor (≈1 s buffer at 30 fps).
- Architecture: 1D-CNN (`Conv1D(64)→Conv1D(64)→GlobalAvgPool→Dense(N_motion)`); lightweight and fast in tfjs-webgl.
- Triggered when static head is uncertain OR when motion energy in the buffer exceeds a threshold.
- Hysteresis: emit a motion label only after 3 consecutive matching predictions.

### 5. Fusion + recognition service

- Refactor `src/lib/asl-classifier.ts` → `src/lib/gestures/recognizer.ts` exposing `recognize(landmarks, buffer) → { label, confidence, kind }`.
- Update `src/services/recognitionApi.ts` to call the new recognizer and persist `gesture` as the display name (e.g. "Letter A", "Please", "Thumbs Up") so the history UI is already clean.
- Keep MediaPipe's built-in gesture recognizer disabled to avoid duplicate predictions; our static model covers its labels.

### 6. Training-data capture tool (`/training` route)

- New page `src/routes/_authenticated/training.tsx`:
  - Pick a label from a searchable list.
  - Live camera + landmark overlay.
  - "Record 30 samples" button captures static frames; "Record 30-frame sequence" for motion labels.
  - Saves to new Supabase table `gesture_samples` (RLS: user owns rows). Schema: `id, user_id, label_id, kind ('static'|'sequence'), features jsonb, created_at`.
- Export script `scripts/export-samples.ts` (run locally with `bun`) pulls samples + a public seed dataset and trains both models offline, writing weights into `public/models/`.

### 7. Seed dataset

- One-time offline step (documented in `scripts/README.md`):
  - Letters/digits: Kaggle ASL Alphabet → run MediaPipe Hands over each image → save 63-D vectors as `data/seed/static.jsonl`.
  - Emoji gestures: HaGRID subset for overlapping classes; record the rest ourselves.
  - Motion: Jester subset (Wave, Thumb Up/Down dynamic) + self-recorded for ASL J/Z/Please/Sorry.
- Seed JSONL is committed under `scripts/seed/` (small, gzipped). Training script merges seed + user samples.

### 8. Training script (`scripts/train.ts`)

- Node script using `@tensorflow/tfjs-node`.
- Loads JSONL, trains static + sequence models, exports to `public/models/{static,sequence}/`.
- Outputs label maps to `src/lib/gestures/labels.generated.ts` so the app stays in sync.

### 9. UI updates

- `recognition.tsx`: show prediction kind chip (Letter / Digit / Gesture / Motion) and confidence bar; add an "Enable motion gestures" toggle.
- `history.tsx` / `analytics.tsx`: already use `formatGestureName`; extend it for new label format.
- Sidebar: add "Train" link gated to logged-in users.

### 10. Performance & deployment

- Lazy-load models on first camera start; cache via `tf.io` IndexedDB so reloads are instant.
- Warn if WebGL backend unavailable; fall back to WASM (`@tensorflow/tfjs-backend-wasm`).
- Confidence + smoothing thresholds exposed in a small `gestures/config.ts`.

## Database change

Single migration adding `gesture_samples` (user-owned, RLS, `GRANT` for `authenticated` + `service_role`). No other schema changes.

## Out of scope this round (parked for phase 2)

- Two-hand gestures (Heart Hands, Praying, Handshake, High Five, Fist Bump, Crossed Arms, Help-signal sequence, X-Sign arms): require dual-hand tracking + body pose; we will track hands.length === 2 and only ship a placeholder.
- Body/pose-dependent gestures (Flexed Bicep, Salute uses head landmark, Hand on Heart): need MediaPipe Holistic. Documented as phase 2.
- Air Quotes / Throat Slash / Wave-Arms-Overhead: sequence + pose; listed in labels but disabled until phase 2.

## Deliverables checklist

1. New files: `landmark-features.ts`, `gestures/{labels.ts,static-model.ts,sequence-model.ts,recognizer.ts,config.ts}`, `routes/_authenticated/training.tsx`, `scripts/{train.ts,export-samples.ts,seed/*}`, `public/models/{static,sequence}/`.
2. Updated files: `recognitionApi.ts`, `recognition.tsx`, `history.tsx`, `analytics.tsx`, `app-sidebar.tsx`, `utils.ts` (`formatGestureName`).
3. Migration: `gesture_samples` table + policies + grants.
4. Deps to add: `@tensorflow/tfjs`, `@tensorflow/tfjs-backend-wasm`; dev: `@tensorflow/tfjs-node` (for the training script only).
5. README in `scripts/` explaining how to retrain.

## Module coverage map (your 7 project modules)

1. Requirement Analysis & System Design — covered by this plan doc.
2. Dataset Collection & Preprocessing — seed datasets + in-app capture + `landmark-features.ts`.
3. Hand Gesture Detection (CV) — MediaPipe Hands Landmarker.
4. Deep Learning Model (CNN/LSTM) — static DNN + 1D-CNN sequence model.
5. Real-Time Integration — recognizer + buffer + fusion in `recognitionApi.ts`.
6. Web App & Backend — TanStack routes + Supabase `gesture_samples`/`predictions`.
7. Testing, Deployment & Optimization — IndexedDB cache, WASM fallback, thresholds in `config.ts`, plus a test page to measure FPS / confusion.  
  
  
  
convert these visual inputs into numeric data arrays using one of these two industry-standard approaches:
  The Landmark Tracking Approach (Highly Recommended) Use Google's Open-Source MediaPipe Hand Landmarker. It extracts 21 3D coordinates (X, Y, Z) for each hand joint. Your AI model input shape will be a simple flattened array of (21 \times 3 = 63) numerical values per frame, which you can train using a lightweight RandomForestClassifier or a dense neural network. Tech Stack RecommendationFrontend: React.js or HTML5/JS (using @tensorflow-models/handpose or mediapipe npm packages for low-latency web tracking).Backend & ML API: Python with Flask or FastAPI (FastAPI is ideal for real-time WebSocket communication).Computer Vision & Deep Learning: OpenCV, MediaPipe, TensorFlow/Keras or PyTorch.
  here is the Gestures
  Thumbs Up 👍: Approving, agreeing, or confirming.
  Thumbs Down 👎: Disapproving, rejecting, or failing.
  Victory / Peace ✌️: Celebrating triumph or wishing peace.
  OK Sign 👌: Confirming everything is correct.
  Fingers Crossed 🤞: Wishing for good luck.
  Shaka / Hang Loose 🤙: Staying relaxed or greeting someone.
  Pinched Fingers 🤌: Questioning or expressing frustration (Italy).
  The "Rock On" Horns 🤘: Enjoying rock music or energy.
  Stop / Talk to the Hand ✋: Requesting a halt or rejecting talk.
  Wave 👋: Saying hello or goodbye.
  Clapping 👏: Applauding or showing appreciation.
  Praying / Thank You 🙏: Expressing gratitude, hope, or respect.
  Pointing 👆: Directing attention to an object.
  Beckoning Finger ☝️: Asking someone to come closer.
  Salute 🫡: Showing formal military-style respect.
  Heart Hands 🫶: Displaying deep affection or love.
  Flexed Biceps 💪: Demonstrating strength or encouragement.
  Crossed Arms 🙅: Creating a defensive barrier or refusing.
  Hand on Heart ❤️‍🔥: Pledging honesty or showing deep sincerity.
  Air Quotes ✌️(moving): Indicating sarcasm or irony.
  🚨 Emergency & Safety Gestures
  Signal for Help ✋✊: Tucking the thumb and closing fingers over it to signal domestic abuse or danger quietly.
  Wave Arms Overhead 🙆: Flagging down emergency vehicles or rescuers from a distance.
  X-Sign Arms 🙅‍♂️: Signaling immediate danger or indicating a path is blocked ahead.
  Tapping Wrist ⌚: Indicating that time has run out or urgency is required.
  Throat Slash 🫱: Indicating an immediate command to "stop" or "cut" video/audio broadcast.
  🤟 Essential American Sign Language (ASL) Signs
  I Love You 🤟: Combining letters I, L, and Y.
  Hello / Hi 👋: Waving standardly or doing a slight salute from the forehead.
  Thank You 🫱: Touching fingers to your lips, then moving your hand flat toward the person.
  Please 🙏: Rubbing a flat hand in a circle over your chest.
  Sorry ✊: Making a fist and rubbing it in a circle over your chest.
  Yes ✊: Nodding your fist up and down like a head.
  No 🤌: Snapping your index and middle finger down onto your thumb.
  Help 🫱✊: Placing a closed fist with thumb up on top of a flat, open palm.
  More 🤌🤌: Flattening both hands into "O" shapes and tapping your fingertips together.
  Finished / Done 👐: Turning your flat hands outward quickly, palms facing away.
  Eat / Food 🤌: Bringing your pinched fingers to your mouth repeatedly.
  Drink ✊: Moving a cupped hand to your mouth like holding a glass.
  Friend ☝️☝️: Hooking your right index finger over your left index finger, then reversing it.
  Family 👌👌: Touching both "OK" hands together and moving them in a circle.
  Home 🤌: Touching your pinched fingers to your chin, then up to your cheek near your ear.
  💼 Business & Everyday Communication
  Handshake 🤝: Sealing a deal or greeting professionally.
  Fist Bump 👊: Greeting casually or celebrating teamwork.
  High Five ✋: Marking a shared success or excitement.
  Steepling Fingers 🤲: Showing high confidence, authority, or deep thought.
  Palm Up Open Hand 🫴: Inviting input or offering a turn to speak.
  Palm Down Flat Hand 🫳: Demanding calm, quiet, or lower energy.
  Rubbing Thumbs and Fingers 🫰: Requesting money or indicating high cost.
  Tapping Temple 🧠: Suggesting someone use logic or think carefully.
  Yawning Hand Cover 🥱: Showing extreme boredom or exhaustion.
  Chin Stroke 🤔: Displaying deep skepticism or intense evaluation.
  AI Sign Language Input Matrix (Static Gestures)
  Target LabelVisual Gesture Description (AI Input Feature)Common Dataset RepresentationAClosed fist, thumb resting straight up against the side of the index finger.Class 0 / Subfolder A/BFlat open palm, fingers together, thumb folded across the front palm.Class 1 / Subfolder B/CHand curved into a half-circle shape, resembling the letter "C".Class 2 / Subfolder C/DIndex finger pointing straight up; thumb and remaining fingers touch in a loop.Class 3 / Subfolder D/EAll fingers curled down tightly, resting flat on top of the tucked thumb.Class 4 / Subfolder E/FThumb and index finger touch to form a circle; middle, ring, and pinky point up.Class 5 / Subfolder F/GIndex finger and thumb point forward horizontally, parallel to each other like a pinch.Class 6 / Subfolder G/HIndex and middle fingers extended straight out horizontally together; others closed.Class 7 / Subfolder H/IPinky finger pointing straight up; all other fingers closed into a fist with thumb over.Class 8 / Subfolder I/JPinky finger extended, tracing a "J" hook curve in the air (Requires video input).Class 9 / Subfolder J/KIndex and middle fingers up in a "V", thumb touching the middle joint of the index finger.Class 10 / Subfolder K/LIndex finger pointing up and thumb pointing out sideways, forming an "L" shape.Class 11 / Subfolder L/MFist with the thumb tucked deeply underneath the index, middle, and ring fingers.Class 12 / Subfolder M/NFist with the thumb tucked underneath the index and middle fingers only.Class 13 / Subfolder N/OAll fingertips curved down to touch the tip of the thumb, forming an "O" shape.Class 14 / Subfolder O/PDownward-pointing version of the "K" sign; index points down, middle out, thumb rests.Class 15 / Subfolder P/QDownward-pointing version of the "G" sign; index and thumb pinch downward.Class 16 / Subfolder Q/RIndex and middle fingers crossed tightly over each other; other fingers closed.Class 17 / Subfolder R/STightly closed fist with the thumb folded across the front of all fingers.Class 18 / Subfolder S/TFist with the thumb tucked securely between the index and middle fingers.Class 19 / Subfolder T/UIndex and middle fingers extended straight up, pressed tightly together.Class 20 / Subfolder U/VIndex and middle fingers extended straight up, separated widely into a "V".Class 21 / Subfolder V/WIndex, middle, and ring fingers extended straight up, separated; pinky and thumb touch.Class 22 / Subfolder W/XFist with the index finger raised but curved sharply into a hook or claw shape.Class 23 / Subfolder X/YPinky and thumb extended widely apart; index, middle, and ring fingers closed down.Class 24 / Subfolder Y/ZIndex finger extended, tracing a "Z" path in the air (Requires video input).Class 25 / Subfolder Z/0All fingers curved tightly into a circle touching the thumb.Class 26 / Subfolder 0/1Index finger pointing straight up, palm facing inward toward the body.Class 27 / Subfolder 1/2Index and middle fingers pointing straight up, palm facing inward.Class 28 / Subfolder 2/3Thumb, index, and middle fingers extended out; ring and pinky closed down.Class 29 / Subfolder 3/4Four fingers (index, middle, ring, pinky) extended straight up; thumb tucked in.Class 30 / Subfolder 4/5Five fingers widely separated and extended straight up, palm facing inward.Class 31 / Subfolder 5/6Three fingers up; pinky tip touches the thumb tip, palm facing outward.Class 32 / Subfolder 6/7Three fingers up; ring finger tip touches the thumb tip, palm facing outward.Class 33 / Subfolder 7/8Three fingers up; middle finger tip touches the thumb tip, palm facing outward.Class 34 / Subfolder 8/9Three fingers up; index finger tip touches the thumb tip, palm facing outward.Class 35 / Subfolder 9/  
    
  implement the temporal/motion model, so things like "flat hand rubbing in a circle on the chest" (ASL "please"), waving, or any sign that depends on movement over time can be detected for that add an new page at the bottom of recognition page and name it as live tracking and on that live tracking page the motion traking like flat hand rubbing in a circle on the chest" (ASL "please"),  should be displayed 