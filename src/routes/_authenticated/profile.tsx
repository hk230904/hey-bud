import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { notify } from "@/lib/notify";
import { getAnalytics } from "@/services/recognitionApi";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile — SignSense" },
      { name: "description", content: "Manage your profile and account." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, updateProfile, updatePassword } = useAuth();
  const { data: analytics } = useQuery({
    queryKey: ["analytics", user!.id],
    queryFn: () => getAnalytics(user!.id),
  });

  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [newPw, setNewPw] = useState("");

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile({ fullName });
      notify.success("Profile updated");
    } catch (err) {
      notify.error("Update failed", (err as Error).message);
    }
  };

  const savePw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw.length < 8) {
      notify.error("Password too short", "Use at least 8 characters");
      return;
    }
    try {
      await updatePassword(newPw);
      setNewPw("");
      notify.success("Password changed");
    } catch (err) {
      notify.error("Could not change password", (err as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">Manage your account and view your stats.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground">Account</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Email</dt><dd className="font-medium truncate ml-2">{user?.email}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Joined</dt><dd>{user && format(new Date(user.createdAt), "MMM d, yyyy")}</dd></div>
          </dl>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground">Predictions</h2>
          <div className="mt-3 text-3xl font-bold">{analytics?.totalPredictions ?? 0}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Avg {((analytics?.averageConfidence ?? 0) * 100).toFixed(0)}% confidence
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground">Sessions</h2>
          <div className="mt-3 text-3xl font-bold">{analytics?.totalSessions ?? 0}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {analytics?.todayPredictions ?? 0} predictions today
          </div>
        </div>
      </div>

      <form onSubmit={saveProfile} className="rounded-2xl border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold">Profile information</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={user?.email ?? ""} disabled />
            <p className="text-xs text-muted-foreground">Email cannot be changed.</p>
          </div>
        </div>
        <Button type="submit">Save changes</Button>
      </form>

      <form onSubmit={savePw} className="rounded-2xl border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold">Change password</h2>
        <div className="space-y-2 sm:max-w-sm">
          <Label htmlFor="newPw">New password</Label>
          <Input
            id="newPw"
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <Button type="submit">Update password</Button>
      </form>
    </div>
  );
}
