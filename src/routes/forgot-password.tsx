import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { notify } from "@/lib/notify";
import { AuthShell } from "./login";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset password — SignSense" },
      { name: "description", content: "Request a password reset link." },
    ],
  }),
  component: ForgotPage,
});

function ForgotPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const parsed = z.string().email().safeParse(email.trim());
    if (!parsed.success) {
      setErr("Enter a valid email");
      return;
    }
    try {
      const token = await requestPasswordReset(parsed.data);
      const url = `${window.location.origin}/reset-password?token=${token}`;
      setLink(url);
      notify.success("Reset link generated");
    } catch (e) {
      notify.error("Unable to reset", (e as Error).message);
    }
  };

  return (
    <AuthShell title="Forgot your password?" subtitle="We'll generate a reset link for you.">
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
        <Button type="submit" className="w-full">Generate reset link</Button>
        {link && (
          <div className="rounded-md border bg-muted/50 p-3 text-xs">
            <p className="mb-2 font-medium text-foreground">Demo mode — your link:</p>
            <Link to="/reset-password" search={{ token: link.split("token=")[1] }} className="break-all text-primary underline">
              {link}
            </Link>
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
