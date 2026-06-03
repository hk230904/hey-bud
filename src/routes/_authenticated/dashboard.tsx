import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Sparkles,
  Target,
  Timer,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth-context";
import { formatGestureName } from "@/lib/utils";
import { getAnalytics, getHistory } from "@/services/recognitionApi";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — SignSense" },
      { name: "description", content: "Your recognition activity at a glance." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = useAuth();
  const { data: analytics } = useQuery({
    queryKey: ["analytics", user!.id],
    queryFn: () => getAnalytics(user!.id),
  });
  const { data: history } = useQuery({
    queryKey: ["history", user!.id],
    queryFn: () => getHistory(user!.id),
  });

  const stats = [
    {
      label: "Total predictions",
      value: analytics?.totalPredictions ?? 0,
      icon: Sparkles,
    },
    {
      label: "Today",
      value: analytics?.todayPredictions ?? 0,
      icon: Activity,
    },
    {
      label: "Avg confidence",
      value: `${((analytics?.averageConfidence ?? 0) * 100).toFixed(1)}%`,
      icon: Target,
    },
    {
      label: "Total sessions",
      value: analytics?.totalSessions ?? 0,
      icon: Timer,
    },
  ];

  const recent = (history ?? []).slice(0, 6);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      {/* Welcome */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome back, {user?.fullName.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">
            Here's what's happening with your recognition workspace.
          </p>
        </div>
        <Button asChild>
          <Link to="/recognition">
            Start recognition
            <ArrowUpRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border bg-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 text-2xl font-bold">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Chart + status */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border bg-card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Recognition usage</h2>
              <p className="text-xs text-muted-foreground">
                Last 14 days of predictions
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/analytics">View analytics</Link>
            </Button>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics?.days ?? []}>
                <defs>
                  <linearGradient id="usage" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="predictions"
                  stroke="var(--color-chart-1)"
                  fill="url(#usage)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <h2 className="text-base font-semibold">System status</h2>
          <div className="mt-4 space-y-4 text-sm">
            <StatusRow label="Recognition engine" value="Operational" tone="success" />
            <StatusRow label="Camera access" value="Ready" tone="success" />
            <StatusRow label="AI model" value="MediaPipe + ASL" tone="success" />
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                <span>Avg confidence</span>
                <span>{((analytics?.averageConfidence ?? 0) * 100).toFixed(0)}%</span>
              </div>
              <Progress value={(analytics?.averageConfidence ?? 0) * 100} />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                <span>Avg processing</span>
                <span>{(analytics?.averageProcessingMs ?? 0).toFixed(0)} ms</span>
              </div>
              <Progress value={Math.min(100, (analytics?.averageProcessingMs ?? 0))} />
            </div>
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="rounded-2xl border bg-card">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="text-base font-semibold">Recent activity</h2>
            <p className="text-xs text-muted-foreground">Latest predictions</p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/history">View all</Link>
          </Button>
        </div>
        {recent.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No predictions yet.{" "}
            <Link to="/recognition" className="text-primary hover:underline">
              Start a session
            </Link>{" "}
            to see activity here.
          </div>
        ) : (
          <ul className="divide-y">
            {recent.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{p.gesture}</div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(p.timestamp), "MMM d, p")}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">{(p.confidence * 100).toFixed(0)}%</div>
                  <div className="text-xs text-muted-foreground">{p.processingTimeMs.toFixed(0)} ms</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatusRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "info" | "warning";
}) {
  const toneClass = {
    success: "bg-success/15 text-success",
    info: "bg-info/15 text-info",
    warning: "bg-warning/15 text-warning",
  }[tone];
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${toneClass}`}>
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {value}
      </span>
    </div>
  );
}
