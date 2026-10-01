"use server";

import {
  listHospitalStaff,
  listPendingStaff,
  approveStaff,
  rejectStaff,
  getHospitalAuditLog,
} from "@/lib/api";
import type { StaffMember, HospitalAuditLogItem } from "@/lib/types";

export async function fetchStaffManagementDataAction(): Promise<{
  activeStaff: StaffMember[];
  pendingStaff: StaffMember[];
  auditLogs: HospitalAuditLogItem[];
}> {
  const [activeStaff, pendingStaff, auditLogs] = await Promise.all([
    listHospitalStaff(),
    listPendingStaff(),
    getHospitalAuditLog(25),
  ]);
  return { activeStaff, pendingStaff, auditLogs };
}

export async function approveStaffAction(membershipId: string, role: string, notes?: string): Promise<StaffMember> {
  return await approveStaff(membershipId, role, notes);
}

export async function rejectStaffAction(membershipId: string, reason?: string): Promise<StaffMember> {
  return await rejectStaff(membershipId, reason);
}
