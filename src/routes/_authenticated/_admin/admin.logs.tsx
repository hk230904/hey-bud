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
import { logsRepo } from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/_admin/admin/logs")({
  head: () => ({ meta: [{ title: "System logs — Admin" }] }),
  component: AdminLogs,
});

function AdminLogs() {
  const logs = logsRepo.all();
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold tracking-tight">System logs</h1>
      <div className="rounded-2xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Timestamp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                  No logs yet.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="capitalize">{l.eventType}</TableCell>
                  <TableCell>{l.description}</TableCell>
                  <TableCell className="text-muted-foreground">{format(new Date(l.timestamp), "MMM d, p")}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
