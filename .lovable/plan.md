## Goal

Wire the SignSense frontend to the new Supabase backend (auth + 4 tables), then map every change against your 7 project modules so you can see what's done and what's left.

---

## Part A — Backend wiring (the 4 things you approved)

### 1. Real Supabase auth (replace localStorage mock)

- Rewrite `src/lib/auth-context.tsx` to use `supabase.auth` (signUp, signInWithPassword, signOut, resetPasswordForEmail, updateUser, onAuthStateChange).
- `user` object now sourced from `auth.users` + `profiles` row (full_name, avatar_url).
- Update `src/routes/login.tsx`, `register.tsx`, `forgot-password.tsx`, `reset-password.tsx` to call the new methods. Signup uses `emailRedirectTo: window.location.origin`; password reset uses `redirectTo: .../reset-password`.
- Profile page: edit name/avatar → updates `profiles` row.
- Remove demo-seed admin/demo users. Roles dropped for now (no user_roles table per your recommendation — admin pages will be gated by a TODO note).

### 2. Recognition page → sessions + predictions

- On camera start: `INSERT into recognition_sessions` → keep `session_id` in a ref.
- On each confirmed prediction (debounced as today): `INSERT into predictions` with `{ user_id, session_id, gesture, gesture_type, confidence, source, processing_time }`.
  - `gesture_type` = `"MediaPipe Gesture"` or `"ASL Letter"`
  - `source` = `"mediapipe"` or `"asl-rule"`
  - `processing_time` = ms measured around `predict()`
- On camera stop: compute totals → `UPDATE recognition_sessions SET session_end, total_predictions, average_confidence`.

### 3. History / Analytics / Dashboard read from Supabase

- `history.tsx` → `SELECT * FROM predictions WHERE user_id = me ORDER BY created_at DESC` (paginated 50/page). CSV export still works on fetched rows.
- `analytics.tsx` → aggregate queries:
  - Total predictions: `count`
  - Avg confidence: `avg(confidence)`
  - Most common gesture: `GROUP BY gesture ORDER BY count DESC LIMIT 1`
  - Daily/weekly: group by `date_trunc('day', created_at)` for last 7/30 days
- `dashboard.tsx` → quick stats card pulling the same aggregates + last 5 predictions.

### 4. Feedback → `feedback` table

- `feedback.tsx`: form posts `{ rating, category, message }` to Supabase. List view shows the current user's past feedback.

### Cleanup

- `src/lib/storage.ts` shrunk to just `themeRepo` (theme stays in localStorage). All other repos deleted.
- `src/routes/_authenticated/_admin/*` pages: keep UI but show "Admin features require user_roles table — coming later" placeholder, since we deliberately didn't ship roles in this round.
- System logs UI: hidden for now (no `system_logs` table in your recommended scope).

### Technical notes

- All queries use the browser Supabase client (`@/integrations/supabase/client`) with the user session — RLS does the access control.
- No TanStack server functions needed for this round; direct client queries are fine because RLS is enforced.
- Loading/error states via `useQuery` from `@tanstack/react-query` (already in template).
- Root route gets an `onAuthStateChange` listener that invalidates queries on login/logout.

---

## Part B — Project module status map

| # | Module | Status | What's done | What's left |
|---|--------|--------|-------------|-------------|
| 1 | Requirement Analysis & System Design | ✅ Done | Pages, routes, data model, RLS design all defined in `.lovable/plan.md` + migrations | Optional: export a 1-page architecture doc |
| 2 | Dataset Collection & Image Preprocessing | ✅ Done (by proxy) | MediaPipe ships a pretrained HandLandmarker + GestureRecognizer — dataset + preprocessing baked into the model | Nothing required unless you want to train custom letters |
| 3 | Hand Gesture Detection (CV) | ✅ Done | `src/lib/hand-tracker.ts` runs MediaPipe `GestureRecognizer` on every frame, draws 21 landmarks on canvas | — |
| 4 | Deep Learning Model (CNN/LSTM) | ✅ Done (pretrained) + ✅ Rule layer | MediaPipe's gesture CNN handles 7 signs; `src/lib/asl-classifier.ts` adds 13 ASL letters | Optional: train a custom TFJS model for more letters (out of scope this round) |
| 5 | Real-Time Recognition Integration | ✅ Done | Live webcam → MediaPipe → hybrid predict → UI badge + history | — |
| 6 | Web App & Backend Development | 🟡 In progress | Full frontend (auth, dashboard, recognition, history, analytics, feedback, profile, admin shell), Supabase tables + RLS + GRANTs + signup trigger | **This plan** — wire frontend to Supabase (Part A) |
| 7 | Testing, Deployment & Performance Optimization | 🔲 Not started | — | After Part A: smoke-test signup→predict→history flow, then Publish from Lovable. Optional: add basic vitest for `asl-classifier.ts` |

---

## Out of scope this round (call out explicitly so we're aligned)

- `system_logs` table — you said implement only the 4 recommended tables.
- `model_performance` table — same reason. Can add later as a "demo flair" feature.
- Admin role system (`user_roles` table) — admin pages stay as placeholders.
- Storing raw frames / landmarks (correctly avoided per your design note).

---

## After Part A ships, the only remaining academic module is #7

You'll click through the app once (signup → start camera → make a few signs → stop → check history/analytics → submit feedback) and then publish. That closes out the project.