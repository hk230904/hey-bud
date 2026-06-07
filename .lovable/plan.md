## Goal

Replace the current marketing landing page (`/`) with an authentication page that uses the provided animated WebGL shader as its full-screen background. Remove the marketing copy ("Trusted by…", "Launch Your Workflow Into Orbit", "Get Started for Free / Explore Features"). The shader stays; the foreground becomes a sign-in / sign-up card.

## Files

**New**
- `src/components/ui/animated-shader-hero.tsx` — cleaned port of the supplied component. Keep the `useShaderBackground` hook + WebGL renderer + default shader source. Strip the marketing/CTA UI; expose a thin `<ShaderBackground className />` that renders only the `<canvas>` (fixed, full-viewport, behind content). Fix the bugs in the snippet:
  - Properly type refs (`HTMLCanvasElement | null`, `number | undefined`, etc.).
  - Move `WebGLRenderer` / `PointerHandler` classes to module scope so they aren't redeclared each render.
  - Inject the keyframes via a `<style>` tag at module load (or move to `styles.css`) — the original `<style jsx>` syntax isn't supported here.
  - Guard `webgl2` context (fallback message if unsupported).

**Modified**
- `src/routes/index.tsx` — replace entire body. Render `<ShaderBackground />` + a centered glass auth card with two tabs: **Sign in** and **Create account**. Reuse the existing auth logic from `src/routes/login.tsx` and `src/routes/register.tsx` (same zod schemas, same `useAuth().login` / `register` calls, same redirect-when-already-signed-in effect). Redirect target on success: `/dashboard`. Update `head()` to "Sign in — SignSense".
- `src/routes/login.tsx` / `src/routes/register.tsx` — leave routes in place (deep links keep working) but have them simply redirect to `/` so there's one canonical auth surface. Forgot/reset password routes untouched.
- `src/components/marketing-header.tsx`, `src/components/marketing-footer.tsx` — no longer referenced; delete.

## Visual

- Shader canvas: `fixed inset-0 -z-10`, pointer-events enabled so the existing pointer-interaction in the shader still responds.
- Foreground: centered card, `bg-card/70 backdrop-blur-xl border border-white/10`, brand mark + "SignSense" wordmark above, tabs for Sign in / Create account, inputs use existing shadcn `Input`/`Label`/`Button`. Subtle fade-in via the existing animation utility classes already added in styles.
- Mobile: card max-w `sm:max-w-md`, padding scales down; shader still covers viewport.

## Out of scope

- No OAuth providers added.
- No changes to dashboard / authenticated routes.
- No new dependencies (the shader is pure WebGL2 + React).
