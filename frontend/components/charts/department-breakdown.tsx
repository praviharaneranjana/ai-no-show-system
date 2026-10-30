import Link from "next/link";
import { CheckCircle2, ExternalLink } from "lucide-react";
import type { AppointmentRecord } from "@/lib/appointments-with-predictions";
import type { Intervention } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DepartmentBreakdownProps {
  records: AppointmentRecord[];
  conversations?: Intervention[];
}

export function DepartmentBreakdown({ records, conversations = [] }: DepartmentBreakdownProps) {
  // Map appointment ID to conversation
  const convMap = new Map<string, Intervention>();
  for (const c of conversations) {
    if (!convMap.has(c.appointment_id)) {
      convMap.set(c.appointment_id, c);
    }
  }

  // Group by department
  const deptMap = new Map<
    string,
    {
      total: number;
      highRisk: number;
      mediumRisk: number;
      lowRisk: number;
      outcomes: number;
      noShows: number;
      outreachSent: number;
      outreachResolved: number;
    }
  >();

  for (const r of records) {
    const dept = r.appointment.department || "General Medicine";
    if (!deptMap.has(dept)) {
      deptMap.set(dept, {
        total: 0,
        highRisk: 0,
        mediumRisk: 0,
        lowRisk: 0,
        outcomes: 0,
        noShows: 0,
        outreachSent: 0,
        outreachResolved: 0,
      });
    }

    const stat = deptMap.get(dept)!;
    stat.total += 1;

    if (r.prediction?.risk_category === "High") stat.highRisk += 1;
    else if (r.prediction?.risk_category === "Medium") stat.mediumRisk += 1;
    else if (r.prediction?.risk_category === "Low") stat.lowRisk += 1;

    if (r.appointment.no_show !== null) {
      stat.outcomes += 1;
      if (r.appointment.no_show === true) stat.noShows += 1;
    }

    const conv = convMap.get(r.appointment.id);
    if (conv) {
      stat.outreachSent += 1;
      if (
        conv.status === "confirmed" ||
        conv.status === "rescheduled" ||
        conv.status === "telehealth_requested"
      ) {
        stat.outreachResolved += 1;
      }
    }
  }

  const deptList = Array.from(deptMap.entries())
    .map(([department, data]) => ({
      department,
      ...data,
      highRiskPct: data.total > 0 ? (data.highRisk / data.total) * 100 : 0,
      noShowRate: data.outcomes > 0 ? (data.noShows / data.outcomes) * 100 : null,
    }))
    .sort((a, b) => b.total - a.total);

  if (deptList.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-muted-foreground">
        No department data available.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs">
      <div className="max-h-[460px] overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur-xs z-10">
            <TableRow className="bg-muted/40">
              <TableHead className="w-[26%]">Department</TableHead>
              <TableHead className="w-[14%]">Total Volume</TableHead>
              <TableHead className="w-[28%]">Risk Distribution</TableHead>
              <TableHead className="w-[18%]">Outreach Status</TableHead>
              <TableHead className="w-[14%] text-right">No-Show Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deptList.map((dept) => {
              const highPct = (dept.highRisk / dept.total) * 100;
              const medPct = (dept.mediumRisk / dept.total) * 100;
              const lowPct = (dept.lowRisk / dept.total) * 100;

              return (
                <TableRow key={dept.department} className="hover:bg-muted/40">
                  {/* Department Name */}
                  <TableCell className="font-semibold text-foreground text-xs">
                    <Link
                      href={`/appointments?department=${encodeURIComponent(dept.department)}`}
                      className="hover:text-primary hover:underline transition-colors inline-flex items-center gap-1.5"
                      title={`View all ${dept.department} appointments`}
                    >
                      <span>{dept.department}</span>
                      <ExternalLink className="size-3 text-muted-foreground opacity-60" />
                    </Link>
                  </TableCell>

                  {/* Total */}
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {dept.total} visit{dept.total === 1 ? "" : "s"}
                  </TableCell>

                  {/* Risk Bar */}
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                        {highPct > 0 && (
                          <div
                            className="h-full bg-red-500"
                            style={{ width: `${highPct}%` }}
                            title={`High Risk: ${dept.highRisk}`}
                          />
                        )}
                        {medPct > 0 && (
                          <div
                            className="h-full bg-amber-500"
                            style={{ width: `${medPct}%` }}
                            title={`Medium Risk: ${dept.mediumRisk}`}
                          />
                        )}
                        {lowPct > 0 && (
                          <div
                            className="h-full bg-emerald-500"
                            style={{ width: `${lowPct}%` }}
                            title={`Low Risk: ${dept.lowRisk}`}
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground tabular-nums">
                        <span className="text-red-600 dark:text-red-400 font-medium">
                          {dept.highRisk} High
                        </span>
                        <span>•</span>
                        <span className="text-amber-600 dark:text-amber-400">
                          {dept.mediumRisk} Med
                        </span>
                        <span>•</span>
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {dept.lowRisk} Low
                        </span>
                      </div>
                    </div>
                  </TableCell>

                  {/* Outreach Status */}
                  <TableCell>
                    {dept.outreachSent > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                          <CheckCircle2 className="size-2.5 text-emerald-500" />
                          <span>
                            {dept.outreachSent} sent · {dept.outreachResolved} resolved
                          </span>
                        </span>
                        <Link
                          href={`/appointments?department=${encodeURIComponent(dept.department)}`}
                          className="text-muted-foreground hover:text-foreground inline-flex items-center transition-colors"
                          title="View department appointments"
                        >
                          <ExternalLink className="size-3" />
                        </Link>
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground italic">
                        {dept.highRisk > 0 ? (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            {dept.highRisk} pending
                          </span>
                        ) : (
                          "No outreach"
                        )}
                      </span>
                    )}
                  </TableCell>

                  {/* No-Show Rate */}
                  <TableCell className="text-right text-xs tabular-nums">
                    {dept.noShowRate !== null ? (
                      <span
                        className={`font-semibold ${
                          dept.noShowRate > 25
                            ? "text-red-600 dark:text-red-400"
                            : "text-foreground"
                        }`}
                      >
                        {dept.noShowRate.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {dept.outcomes > 0 && (
                      <div className="text-[10px] text-muted-foreground">
                        ({dept.noShows}/{dept.outcomes})
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
