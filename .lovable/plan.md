## 1. Sign-out should land on `/` (the new auth page)

The header still navigates to `/login` on sign-out. Update `src/components/app-header.tsx` `handleLogout` to `navigate({ to: "/" })`. Also align `src/routes/_authenticated.tsx` so an unauthenticated visit redirects to `/` instead of `/login`, and have `/login` and `/register` simply redirect to `/` (the consolidated auth page) so any lingering links land in the right place.

## 2. Refresh on Netlify/Vercel jumps back to the lovable domain

I need to confirm the cause before changing anything — there are no hardcoded lovable URLs in the repo, so the redirect is coming from outside the code.

Most likely cause: **Supabase Auth → URL Configuration → Site URL / Redirect URLs** is still set to your `*.lovable.app` preview. After auth events (email confirmation, password reset, OAuth, or even an `INITIAL_SESSION` rehydration on refresh), Supabase will redirect to that Site URL regardless of where the page actually lives.

Second possibility: this is a TanStack **Start** project (SSR Worker), not a plain Vite SPA. Netlify/Vercel can host it, but only with the correct adapter; otherwise direct URL refreshes 404 and a fallback (often the lovable URL set as a redirect rule) takes over.

Action in plan mode is to ask you which of these matches your setup before editing. I will not add a `_redirects` / `vercel.json` until I know which platform and which deploy mode you're using.

## 3. Live tracking motion panel never updates

Tracing the pipeline: `useHandTracker` → `latestFrameRef` → `useEffect` polling loop calls `predict(...)` and `predictMotion()` → `Recognizer.pollMotion()` → `MotionRecognizer.poll()` which reads `MotionBuffer.snapshot()`.

The bug is in `src/services/recognitionApi.ts` `predict()`:

```ts
recognizer.ingest(req.landmarks);
if (!req.landmarks && !req.gesture) return null;   // early-return BEFORE motion buffer push? no — ingest already ran
```

`ingest` runs every tick, so the buffer should fill. But the polling loop only runs `predict` when both landmarks and gesture exist; that's fine. The real problem is the WAVE detector's gate:

```ts
const ext = fingersExtended(last);
if (!ext.every(Boolean)) return null;
```

`fingersExtended` returns 5 booleans including the **thumb**. With an open palm facing the camera the thumb often reads as not-extended, so `ext.every(Boolean)` is false and wave is rejected on virtually every frame. The other detectors have similar issues:

- PLEASE / SORRY / THANK_YOU require very precise finger states + circle shape; the buffer is only 1.4 s which is barely one revolution.
- The buffer is `reset()` on every fire and `MIN_FRAMES = 12` while we ingest at ~30 fps — usually fine, but combined with the strict gates almost nothing fires.

Fix plan (`src/lib/gestures/motion-classifier.ts`):

1. **Wave**: require only fingers 1–4 extended (ignore thumb), drop the `box.w < box.h * 1.2` ratio gate (loosen to `box.w > box.h * 0.8`), and lower the crossings threshold from 3 to 2. This is the gesture the user actually tested.
2. **Yes / No / Beckon / Tap wrist**: loosen the thumb-state requirement the same way.
3. **Please / Sorry**: lower `circularity` thresholds slightly (0.55 → 0.4, 0.5 → 0.35) and the motion gate (0.4 → 0.25) so a partial loop registers.
4. Bump `BUFFER_MS` from 1400 → 2000 so slower waves still accumulate enough oscillation.
5. In `src/services/recognitionApi.ts`, also feed the buffer when only landmarks (no gesture) exist — the current early-return is fine because `ingest` already ran, but add a brief comment so this isn't re-broken.
6. In `LiveTrackingPage` UI, surface the buffer fill state (e.g. show "Hold the wave for ~1 s…") so the user knows the detector is active even before the first fire.

I will retest in the live preview after the change by opening `/live-tracking`, starting the camera, waving, and confirming "Wave" appears in the Current motion panel within ~1 s.

---

### Clarification needed before I can ship #2

1. Where exactly are you deploying — Netlify, Vercel, or both?
2. Is it a static export, or are you using their Node/Edge function runtime?
3. What URL is in **Supabase → Authentication → URL Configuration → Site URL** right now?

If you'd like, I can proceed with #1 and #3 immediately and we tackle #2 once you answer the above.  
  
1. im just deploying on vercel   
2. both , im justing static export and Node/Edge function runtime  
3. yes