"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  UserCheck,
  UserX,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Search,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  fetchStaffManagementDataAction,
  approveStaffAction,
  rejectStaffAction,
} from "@/app/admin/staff/actions";
import type { StaffMember, HospitalAuditLogItem } from "@/lib/types";

export default function StaffManagementPage() {
  const [activeStaff, setActiveStaff] = useState<StaffMember[]>([]);
  const [pendingStaff, setPendingStaff] = useState<StaffMember[]>([]);
  const [auditLogs, setAuditLogs] = useState<HospitalAuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search filter
  const [searchQuery, setSearchQuery] = useState("");

  // Role selections for pending staff approval
  const [selectedRoles, setSelectedRoles] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStaffManagementDataAction();
      setActiveStaff(data.activeStaff);
      setPendingStaff(data.pendingStaff);
      setAuditLogs(data.auditLogs);

      // Pre-populate default roles for pending users
      const initialRoles: Record<string, string> = {};
      data.pendingStaff.forEach((m) => {
        initialRoles[m.membership_id] = m.role || "front_desk";
      });
      setSelectedRoles(initialRoles);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load staff management data.");
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(membershipId: string) {
    const role = selectedRoles[membershipId] || "front_desk";
    setProcessingId(membershipId);
    setFeedback(null);
    try {
      await approveStaffAction(membershipId, role, `Approved with role: ${role}`);
      setFeedback({ type: "success", message: `Account approved and granted ${role.replace("_", " ")} access.` });
      await loadData();
    } catch (err: unknown) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Approval failed." });
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(membershipId: string) {
    if (!confirm("Are you sure you want to reject this staff registration?")) return;
    setProcessingId(membershipId);
    setFeedback(null);
    try {
      await rejectStaffAction(membershipId, "Rejected by hospital administrator.");
      setFeedback({ type: "success", message: "Registration request rejected." });
      await loadData();
    } catch (err: unknown) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Rejection failed." });
    } finally {
      setProcessingId(null);
    }
  }

  const filteredStaff = activeStaff.filter(
    (s) =>
      s.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const roleBadgeStyle = (role: string) => {
    switch (role) {
      case "platform_owner":
        return "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30";
      case "admin":
        return "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30";
      case "manager":
        return "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30";
      case "analyst":
        return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
      default:
        return "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30";
    }
  };

  return (
    <div className="flex w-full flex-col gap-8 p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            <span>Dashboard</span>
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Staff &amp; Access Governance
            </h1>
            <Badge className="bg-[#8B7CF6]/15 text-[#8B7CF6] border-0 font-bold">
              Admin Console
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Manage hospital staff accounts, verify identities, assign roles, and audit authorization events.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={loadData}
          disabled={loading}
          className="rounded-xl border-border bg-card shadow-sm gap-2"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </Button>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-xl p-3 text-xs font-semibold ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
              : "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-200 dark:border-rose-800"
          }`}
        >
          {feedback.type === "success" ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertCircle className="size-4 shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* PENDING APPROVAL QUEUE (P1-3) */}
      <Card className="bg-card border-border shadow-sm overflow-hidden">
        <CardHeader className="bg-amber-500/5 border-b border-border/80 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold">
                <Clock className="size-4" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-foreground">
                  Pending Account Approvals ({pendingStaff.length})
                </CardTitle>
                <CardDescription className="text-xs">
                  Hospital staff awaiting verification and role assignment by institution administrator
                </CardDescription>
              </div>
            </div>
            {pendingStaff.length > 0 && (
              <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold border-0 animate-pulse">
                Action Required
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {pendingStaff.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <CheckCircle2 className="size-8 mx-auto mb-2 text-emerald-500/60" />
              <span>No pending staff registrations. All registered accounts have been reviewed.</span>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {pendingStaff.map((req) => (
                <div
                  key={req.membership_id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-card hover:bg-secondary/20 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">{req.full_name}</span>
                      <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-400/40">
                        Requested: {req.role.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-x-2">
                      <span>{req.email}</span>
                      {req.phone && <span>· {req.phone}</span>}
                      <span>· Registered {new Date(req.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="w-36">
                      <Select
                        value={selectedRoles[req.membership_id] || "front_desk"}
                        onValueChange={(val) =>
                          setSelectedRoles({ ...selectedRoles, [req.membership_id]: val || "front_desk" })
                        }
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Assign Role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="front_desk">Front Desk</SelectItem>
                          <SelectItem value="manager">Clinical Ops Manager</SelectItem>
                          <SelectItem value="analyst">Data Analyst</SelectItem>
                          <SelectItem value="admin">Administrator</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => handleApprove(req.membership_id)}
                      disabled={processingId === req.membership_id}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 px-3 gap-1.5 text-xs font-semibold"
                    >
                      {processingId === req.membership_id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <UserCheck className="size-3.5" />
                      )}
                      <span>Approve</span>
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReject(req.membership_id)}
                      disabled={processingId === req.membership_id}
                      className="border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/30 h-9 px-3 gap-1.5 text-xs font-semibold"
                    >
                      <UserX className="size-3.5" />
                      <span>Reject</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ACTIVE STAFF DIRECTORY (P1-4) */}
      <Card className="bg-card border-border shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Users className="size-4 text-[#8B7CF6]" />
                Institutional Staff Directory ({activeStaff.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Active clinical faculty, administrative staff, and data analysts
              </CardDescription>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search staff..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-secondary/60 text-muted-foreground uppercase text-[10px] tracking-wider border-y border-border">
                <tr>
                  <th className="py-3 px-4 font-semibold">Staff Member</th>
                  <th className="py-3 px-4 font-semibold">Role &amp; Permissions</th>
                  <th className="py-3 px-4 font-semibold">Contact</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">Approved Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredStaff.map((staff) => (
                  <tr key={staff.membership_id} className="hover:bg-secondary/30 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-foreground">
                      <div className="flex items-center gap-2">
                        <div className="flex size-7 items-center justify-center rounded-full bg-[#8B7CF6]/15 text-[#8B7CF6] font-bold text-xs">
                          {staff.full_name.slice(0, 2).toUpperCase()}
                        </div>
                        <span>{staff.full_name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge variant="outline" className={`font-semibold capitalize text-[10px] ${roleBadgeStyle(staff.role)}`}>
                        {staff.role.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-muted-foreground font-mono">
                      <div>{staff.email}</div>
                      {staff.phone && <div className="text-[10px] opacity-80">{staff.phone}</div>}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-muted-foreground">
                      {staff.approved_at ? new Date(staff.approved_at).toLocaleDateString() : "Founding Member"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* GOVERNANCE & AUDIT TRAIL */}
      <Card className="bg-card border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <FileText className="size-4 text-[#8B7CF6]" />
            Hospital Access &amp; Compliance Audit Trail
          </CardTitle>
          <CardDescription className="text-xs">
            Cryptographically logged administrator approval actions and access changes
          </CardDescription>
        </CardHeader>
        <CardContent>
          {auditLogs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No recent audit log entries.</p>
          ) : (
            <div className="space-y-2">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/20 p-2.5 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-3.5 text-[#8B7CF6]" />
                    <span className="font-semibold text-foreground uppercase tracking-wide text-[10px]">
                      {log.action.replace(/_/g, " ")}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground font-mono text-[11px]">
                      {log.actor_email || "System"}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
