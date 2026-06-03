import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { Download, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth-context";
import { getHistory } from "@/services/recognitionApi";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "History — SignSense" },
      { name: "description", content: "Browse all your past predictions." },
    ],
  }),
  component: HistoryPage,
});

const PAGE_SIZE = 15;

function HistoryPage() {
  const { user } = useAuth();
  const { data: history = [] } = useQuery({
    queryKey: ["history", user!.id],
    queryFn: () => getHistory(user!.id),
  });

  const [search, setSearch] = useState("");
  const [gesture, setGesture] = useState<string>("all");
  const [minConf, setMinConf] = useState<string>("0");
  const [page, setPage] = useState(0);

  const gestures = useMemo(
    () => Array.from(new Set(history.map((h) => h.gesture))).sort(),
    [history],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const mc = parseFloat(minConf) / 100;
    return history.filter(
      (p) =>
        (!q ||
          p.gesture.toLowerCase().includes(q) ||
          p.text.toLowerCase().includes(q)) &&
        (gesture === "all" || p.gesture === gesture) &&
        p.confidence >= mc,
    );
  }, [history, search, gesture, minConf]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const exportCsv = () => {
    const rows = [
      ["Gesture", "Text", "Confidence", "Processing (ms)", "Timestamp"],
      ...filtered.map((p) => [
        p.gesture,
        p.text,
        (p.confidence * 100).toFixed(1),
        p.processingTimeMs.toFixed(1),
        p.timestamp,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `signsense-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Prediction history</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {history.length} predictions
          </p>
        </div>
        <Button onClick={exportCsv} variant="outline" disabled={filtered.length === 0}>
          <Download className="mr-1.5 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search gestures or text…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="pl-9"
              aria-label="Search"
            />
          </div>
          <Select value={gesture} onValueChange={(v) => { setGesture(v); setPage(0); }}>
            <SelectTrigger aria-label="Filter by gesture">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All gestures</SelectItem>
              {gestures.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={minConf} onValueChange={(v) => { setMinConf(v); setPage(0); }}>
            <SelectTrigger aria-label="Minimum confidence">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Any confidence</SelectItem>
              <SelectItem value="70">≥ 70%</SelectItem>
              <SelectItem value="80">≥ 80%</SelectItem>
              <SelectItem value="90">≥ 90%</SelectItem>
              <SelectItem value="95">≥ 95%</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-2xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Gesture</TableHead>
              <TableHead>Text</TableHead>
              <TableHead className="text-right">Confidence</TableHead>
              <TableHead>Timestamp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                  No predictions match your filters.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{formatGestureName(p.gesture)}</TableCell>
                  <TableCell>{p.text}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(p.confidence * 100).toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(p.timestamp), "MMM d, yyyy p")}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t p-3 text-sm">
            <span className="text-muted-foreground">
              Page {safePage + 1} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
