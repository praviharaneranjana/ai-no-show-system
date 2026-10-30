import Link from "next/link";
import { ChevronRight, Phone, User } from "lucide-react";

import type { AppointmentRecord } from "@/lib/appointments-with-predictions";
import { RiskBadge } from "@/components/risk-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function getRelativeDateLabel(dateStr: string): { label: string; variant: "today" | "tomorrow" | "future" | "past" } {
  const todayStr = new Date().toLocaleDateString("en-CA"); // local calendar day (YYYY-MM-DD)
  if (dateStr === todayStr) return { label: "Today", variant: "today" };

  const today = new Date(todayStr);
  const target = new Date(dateStr);
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 1) return { label: "Tomorrow", variant: "tomorrow" };
  if (diffDays === -1) return { label: "Yesterday", variant: "past" };
  if (diffDays < -1) return { label: `${Math.abs(diffDays)}d ago`, variant: "past" };
  return { label: `In ${diffDays}d`, variant: "future" };
}

/** Presentational appointment rows, shared by the dashboard preview and the full register. */
export function AppointmentRows({ records }: { records: AppointmentRecord[] }) {
  return (
  <Table>
    <TableHeader>
      <TableRow className="bg-muted/40">
        <TableHead className="w-[28%]">Patient</TableHead>
        <TableHead className="w-[22%]">Appointment Date</TableHead>
        <TableHead className="w-[18%]">AI Risk Assessment</TableHead>
        <TableHead className="w-[22%]">Recommended Action</TableHead>
        <TableHead className="w-[10%] text-right">Details</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {records.map(({ appointment, patient, prediction }) => {
        const relative = getRelativeDateLabel(appointment.appointment_day);
        const isHighRisk = prediction?.risk_category === "High";

        return (
          <TableRow
            key={appointment.id}
            className={`group transition-colors ${
              isHighRisk
                ? "bg-red-500/[0.03] hover:bg-red-500/[0.07] dark:bg-red-950/[0.15] dark:hover:bg-red-950/[0.25]"
                : "hover:bg-muted/50"
            }`}
          >
            {/* Patient Column */}
            <TableCell className="align-middle">
              <Link
                href={`/appointments/${appointment.id}`}
                className="flex items-center gap-3 group-hover:opacity-90"
              >
                <div
                  className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isHighRisk
                      ? "bg-red-500/15 text-red-700 dark:text-red-300 ring-1 ring-red-500/30"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {patient?.full_name
                    ? patient.full_name
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()
                    : <User className="size-4" />}
                </div>
                <div className="flex flex-col truncate">
                  <span className="font-semibold text-foreground group-hover:text-primary transition-colors text-sm truncate">
                    {patient?.full_name ?? "Unknown Patient"}
                  </span>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    {patient?.phone ? (
                      <span className="flex items-center gap-1">
                        <Phone className="size-3" />
                        {patient.phone}
                      </span>
                    ) : (
                      <span>DOB: {patient?.date_of_birth ?? "—"}</span>
                    )}
                  </div>
                </div>
              </Link>
            </TableCell>

            {/* Appointment Date & Department */}
            <TableCell className="align-middle">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-foreground text-xs tabular-nums">
                    {appointment.appointment_day}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.2 text-[10px] font-semibold tabular-nums ${
                      relative.variant === "today"
                        ? "bg-primary text-primary-foreground"
                        : relative.variant === "tomorrow"
                        ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                        : relative.variant === "past"
                        ? "bg-muted text-muted-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {relative.label}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground truncate">
                  {appointment.department ?? "General Medicine"}
                  {appointment.sms_received && " • SMS sent"}
                </span>
              </div>
            </TableCell>

            {/* Risk Badge & Score */}
            <TableCell className="align-middle">
              {prediction ? (
                <div className="flex flex-col gap-1">
                  <RiskBadge
                    category={prediction.risk_category}
                    score={prediction.risk_score}
                    size="sm"
                  />
                </div>
              ) : (
                <Badge variant="outline" className="text-muted-foreground text-[11px]">
                  Unpredicted
                </Badge>
              )}
            </TableCell>

            {/* Action Recommendation */}
            <TableCell className="align-middle">
              {prediction ? (
                <div className="flex items-center gap-1.5 text-xs">
                  <span
                    className={`line-clamp-2 ${
                      isHighRisk
                        ? "font-medium text-red-700 dark:text-red-300"
                        : "text-muted-foreground"
                    }`}
                  >
                    {prediction.recommendation}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>

            {/* Details Action */}
            <TableCell className="text-right align-middle">
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground group-hover:text-primary transition-colors"
                nativeButton={false}
                render={
                  <Link href={`/appointments/${appointment.id}`}>
                    <ChevronRight className="size-4" />
                    <span className="sr-only">View appointment</span>
                  </Link>
                }
              />
            </TableCell>
          </TableRow>
        );
      })}
    </TableBody>
  </Table>
  );
}
