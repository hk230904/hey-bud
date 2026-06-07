import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { notify } from "@/lib/notify";
import { AuthShell } from "@/components/auth-shell";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset password — SignSense" },
      { name: "description", content: "Request a password reset email." },
    ],
  }),
  component: ForgotPage,
});

function ForgotPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const parsed = z.string().email().safeParse(email.trim());
    if (!parsed.success) {
      setErr("Enter a valid email");
      return;
    }
    setSubmitting(true);
    try {
      await requestPasswordReset(parsed.data);
      setSent(true);
      notify.success("Reset email sent", "Check your inbox for the link");
    } catch (e) {
      notify.error("Unable to send reset email", (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title="Forgot your password?" subtitle="We'll email you a reset link.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!err}
            aria-describedby={err ? "email-error" : undefined}
          />
          {err && <p id="email-error" className="text-xs text-destructive">{err}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Sending…" : "Send reset email"}
        </Button>
        {sent && (
          <div className="rounded-md border bg-muted/50 p-3 text-xs">
            If an account exists for <strong>{email}</strong>, a reset link is on its way.
          </div>
        )}
        <p className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
