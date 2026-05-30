import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { Star } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { notify } from "@/lib/notify";
import { feedbackRepo } from "@/lib/storage";
import { submitFeedback } from "@/services/recognitionApi";

export const Route = createFileRoute("/_authenticated/feedback")({
  head: () => ({
    meta: [
      { title: "Feedback — SignSense" },
      { name: "description", content: "Send feedback or report issues." },
    ],
  }),
  component: FeedbackPage,
});

function FeedbackPage() {
  const { user } = useAuth();
  const [rating, setRating] = useState(5);
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<"general" | "issue" | "feature">("general");
  const [submitting, setSubmitting] = useState(false);
  const [mine, setMine] = useState(() => (user ? feedbackRepo.forUser(user.id) : []));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (message.trim().length < 5) {
      notify.error("Message too short", "Please share a bit more detail");
      return;
    }
    setSubmitting(true);
    try {
      await submitFeedback({ userId: user.id, message: message.trim(), rating, category });
      setMessage("");
      setRating(5);
      setCategory("general");
      setMine(feedbackRepo.forUser(user.id));
      notify.success("Thanks for the feedback!");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Feedback</h1>
        <p className="text-sm text-muted-foreground">
          Rate the recognition quality, report issues, or request features.
        </p>
      </div>

      <form onSubmit={onSubmit} className="rounded-2xl border bg-card p-6 space-y-4">
        <div className="space-y-2">
          <Label>Rating</Label>
          <div className="flex gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                className="rounded-md p-1 hover:bg-muted"
              >
                <Star
                  className={`h-6 w-6 ${n <= rating ? "fill-warning text-warning" : "text-muted-foreground"}`}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
            <SelectTrigger id="category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General feedback</SelectItem>
              <SelectItem value="issue">Report an issue</SelectItem>
              <SelectItem value="feature">Feature request</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="message">Message</Label>
          <Textarea
            id="message"
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us what you think…"
            maxLength={1000}
          />
        </div>

        <Button type="submit" disabled={submitting}>
          {submitting ? "Sending…" : "Submit feedback"}
        </Button>
      </form>

      {mine.length > 0 && (
        <div className="rounded-2xl border bg-card">
          <div className="border-b p-5">
            <h2 className="text-base font-semibold">Your feedback</h2>
          </div>
          <ul className="divide-y">
            {mine.map((f) => (
              <li key={f.id} className="space-y-1 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: f.rating }).map((_, i) => (
                      <Star key={i} className="h-3.5 w-3.5 fill-warning text-warning" />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(f.timestamp), "MMM d, p")}
                  </span>
                </div>
                <p className="text-sm">{f.message}</p>
                <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                  {f.category}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
