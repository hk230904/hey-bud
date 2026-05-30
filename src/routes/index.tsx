import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  Brain,
  CheckCircle2,
  Eye,
  Hand,
  MessageSquare,
  Sparkles,
  Type,
  Users,
  Zap,
} from "lucide-react";

import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SignSense — Real-Time AI Sign Language Recognition" },
      {
        name: "description",
        content:
          "Recognize sign language gestures in real time and turn them into readable text. Accessible, fast, and built for everyone.",
      },
      { property: "og:title", content: "SignSense — Real-Time AI Sign Language Recognition" },
      {
        property: "og:description",
        content: "Bridge communication barriers with real-time AI sign language recognition.",
      },
    ],
  }),
  component: Home,
});

const features = [
  {
    icon: Zap,
    title: "Real-Time Recognition",
    body: "Process webcam frames as they arrive. See predictions appear within milliseconds.",
  },
  {
    icon: Brain,
    title: "AI-Powered Detection",
    body: "Deep learning models trained on diverse signers to recognize a growing gesture vocabulary.",
  },
  {
    icon: Type,
    title: "Gesture-to-Text",
    body: "Predictions are turned into clean readable text you can copy, export, or share.",
  },
  {
    icon: CheckCircle2,
    title: "High Accuracy",
    body: "Confidence scoring on every prediction so you always know how sure the model is.",
  },
  {
    icon: Eye,
    title: "Accessibility First",
    body: "Designed with screen readers, keyboard navigation, and high contrast in mind.",
  },
  {
    icon: Activity,
    title: "Live Analytics",
    body: "Track sessions, accuracy trends, and most-used gestures over time.",
  },
];

const steps = [
  { n: 1, title: "Start your camera", body: "Grant webcam access in a single click." },
  { n: 2, title: "Detect hand gestures", body: "MediaPipe tracks 21 hand landmarks in real time." },
  { n: 3, title: "AI recognition", body: "Landmark data is classified into a gesture vocabulary." },
  { n: 4, title: "Text generation", body: "Predictions become live, readable, exportable text." },
];

const testimonials = [
  {
    quote:
      "SignSense gives me a way to communicate in meetings without an interpreter every time.",
    name: "Maya R.",
    role: "Product Designer",
  },
  {
    quote: "The accessibility focus is real — keyboard support and contrast are excellent.",
    name: "Daniel K.",
    role: "Accessibility Consultant",
  },
  {
    quote: "Setup was instant. Camera on, predictions flowing. The UX is genuinely thoughtful.",
    name: "Priya S.",
    role: "Teacher",
  },
];

function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <MarketingHeader />
      <main id="main-content" className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 -z-10 opacity-60"
            aria-hidden="true"
            style={{
              background:
                "radial-gradient(60% 50% at 50% 0%, color-mix(in oklab, var(--primary) 18%, transparent), transparent 70%)",
            }}
          />
          <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3 w-3 text-primary" aria-hidden="true" />
                Real-time gesture-to-text, powered by AI
              </div>
              <h1 className="text-balance text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
                Sign language, <span className="gradient-text">understood instantly</span>
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
                SignSense bridges communication barriers with on-device hand tracking and an
                AI-ready recognition pipeline. Built accessibility-first, for classrooms, meetings,
                and everyday conversations.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button asChild size="lg">
                  <Link to="/register">Get started free</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/recognition">Try the live demo</Link>
                </Button>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Demo accounts: <span className="font-medium">demo@demo.local / demo1234</span> ·{" "}
                <span className="font-medium">admin@demo.local / admin123</span>
              </p>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="border-y bg-card">
          <div className="mx-auto grid max-w-6xl gap-6 px-6 py-10 sm:grid-cols-3">
            {[
              { value: "97.4%", label: "Recognition accuracy" },
              { value: "15+", label: "Supported gestures" },
              { value: "1,200+", label: "Active users" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-3xl font-bold gradient-text sm:text-4xl">{s.value}</div>
                <div className="mt-1 text-sm text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need to recognize signs
            </h2>
            <p className="mt-3 text-muted-foreground">
              A modern, accessible toolkit for turning gestures into language.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border bg-card p-6 transition-shadow hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="border-t bg-muted/40">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">How it works</h2>
              <p className="mt-3 text-muted-foreground">
                Four steps from raw video to readable text.
              </p>
            </div>
            <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((s) => (
                <li
                  key={s.n}
                  className="relative rounded-2xl border bg-card p-6"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {s.n}
                  </div>
                  <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Testimonials */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Loved by accessibility advocates
            </h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((t) => (
              <figure
                key={t.name}
                className="rounded-2xl border bg-card p-6"
              >
                <blockquote className="text-sm leading-relaxed">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-4 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                    {t.name.split(" ").map((p) => p[0]).join("")}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.role}</div>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-4xl px-6 pb-20">
          <div className="rounded-3xl border bg-gradient-to-br from-primary/10 via-card to-card p-10 text-center">
            <Hand className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
            <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
              Ready to start recognizing?
            </h2>
            <p className="mt-3 text-muted-foreground">
              Create a free account and try the live recognition demo in seconds.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg">
                <Link to="/register">Create account</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/login">Sign in</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
