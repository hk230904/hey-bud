import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { predictionsRepo, usersRepo } from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/_admin/admin/predictions")({
  head: () => ({ meta: [{ title: "Predictions — Admin" }] }),
  component: AdminPreds,
});

function AdminPreds() {
  const preds = predictionsRepo.all().slice(0, 200);
  const userMap = new Map(usersRepo.all().map((u) => [u.id, u.fullName]));

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold tracking-tight">All predictions</h1>
      <div className="rounded-2xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Gesture</TableHead>
              <TableHead className="text-right">Confidence</TableHead>
              <TableHead>Timestamp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preds.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                  No predictions yet.
                </TableCell>
              </TableRow>
            ) : (
              preds.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{userMap.get(p.userId) ?? "—"}</TableCell>
                  <TableCell className="font-medium">{p.gesture}</TableCell>
                  <TableCell className="text-right tabular-nums">{(p.confidence * 100).toFixed(1)}%</TableCell>
                  <TableCell className="text-muted-foreground">{format(new Date(p.timestamp), "MMM d, p")}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
