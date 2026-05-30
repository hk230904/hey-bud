import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { notify } from "@/lib/notify";
import { AuthShell } from "./login";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s.token === "string" ? s.token : "",
  }),
  head: () => ({
    meta: [
      { title: "Set new password — SignSense" },
      { name: "description", content: "Set a new password for your account." },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const { token } = Route.useSearch();
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (pw.length < 8) {
      setErr("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(token, pw);
      notify.success("Password updated");
      navigate({ to: "/login" });
    } catch (e) {
      notify.error("Could not reset password", (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <AuthShell title="Invalid reset link">
        <p className="text-sm text-muted-foreground">
          This reset link is missing or invalid.
        </p>
        <Button asChild className="mt-4 w-full">
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password" subtitle="Choose a strong password you'll remember.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="pw">New password</Label>
          <Input
            id="pw"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="new-password"
            aria-invalid={!!err}
            aria-describedby={err ? "pw-error" : undefined}
          />
          {err && <p id="pw-error" className="text-xs text-destructive">{err}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Updating…" : "Update password"}
        </Button>
      </form>
    </AuthShell>
  );
}
