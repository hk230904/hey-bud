import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { Star } from "lucide-react";

import { feedbackRepo, usersRepo } from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/_admin/admin/feedback")({
  head: () => ({ meta: [{ title: "Feedback — Admin" }] }),
  component: AdminFeedback,
});

function AdminFeedback() {
  const items = feedbackRepo.all();
  const userMap = new Map(usersRepo.all().map((u) => [u.id, u.fullName]));
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold tracking-tight">All feedback</h1>
      <div className="rounded-2xl border bg-card">
        {items.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">No feedback yet.</p>
        ) : (
          <ul className="divide-y">
            {items.map((f) => (
              <li key={f.id} className="p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{userMap.get(f.userId) ?? "User"}</span>
                    <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">{f.category}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: f.rating }).map((_, i) => (
                      <Star key={i} className="h-3.5 w-3.5 fill-warning text-warning" />
                    ))}
                  </div>
                </div>
                <p className="text-sm">{f.message}</p>
                <p className="text-xs text-muted-foreground">{format(new Date(f.timestamp), "MMM d, yyyy p")}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
