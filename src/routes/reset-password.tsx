import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { notify } from "@/lib/notify";
import { AuthShell } from "@/components/auth-shell";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set new password — SignSense" },
      { name: "description", content: "Set a new password for your account." },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const { updatePassword } = useAuth();
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
      await updatePassword(pw);
      notify.success("Password updated");
      navigate({ to: "/dashboard" });
    } catch (e) {
      notify.error("Could not reset password", (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

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
        <p className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
