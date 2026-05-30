import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { MessageSquare, ScrollText, Sparkles, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  feedbackRepo,
  logsRepo,
  predictionsRepo,
  usersRepo,
} from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/_admin/admin")({
  head: () => ({
    meta: [
      { title: "Admin — SignSense" },
      { name: "description", content: "System overview and management." },
    ],
  }),
  component: AdminOverview,
});

function AdminOverview() {
  const users = usersRepo.all();
  const preds = predictionsRepo.all();
  const feedback = feedbackRepo.all();
  const logs = logsRepo.all();

  const cards = [
    { label: "Users", value: users.length, icon: Users, to: "/admin/users" as const },
    { label: "Predictions", value: preds.length, icon: Sparkles, to: "/admin/predictions" as const },
    { label: "Feedback", value: feedback.length, icon: MessageSquare, to: "/admin/feedback" as const },
    { label: "System logs", value: logs.length, icon: ScrollText, to: "/admin/logs" as const },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin overview</h1>
        <p className="text-sm text-muted-foreground">System monitoring and management.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            to={c.to}
            className="rounded-2xl border bg-card p-5 transition-shadow hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{c.label}</span>
              <c.icon className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-3 text-2xl font-bold">{c.value}</div>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="border-b p-5">
          <h2 className="text-base font-semibold">Recent system events</h2>
        </div>
        <ul className="divide-y">
          {logs.slice(0, 8).map((l) => (
            <li key={l.id} className="flex items-center justify-between p-4 text-sm">
              <div>
                <div className="font-medium">{l.description}</div>
                <div className="text-xs text-muted-foreground capitalize">{l.eventType}</div>
              </div>
              <span className="text-xs text-muted-foreground">
                {format(new Date(l.timestamp), "MMM d, p")}
              </span>
            </li>
          ))}
          {logs.length === 0 && (
            <li className="p-10 text-center text-sm text-muted-foreground">No events yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
