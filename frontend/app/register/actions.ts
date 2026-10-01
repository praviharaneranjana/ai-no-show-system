"use server";

import { resolveEmailDomain, listPublicHospitals, registerStaff } from "@/lib/api";
import type { HospitalBasic, DomainResolveResponse, RegisterStaffPayload } from "@/lib/types";

export async function resolveEmailDomainAction(email: string): Promise<DomainResolveResponse> {
  return await resolveEmailDomain(email);
}

export async function listPublicHospitalsAction(): Promise<HospitalBasic[]> {
  return await listPublicHospitals();
}

export async function registerStaffAction(payload: RegisterStaffPayload) {
  return await registerStaff(payload);
}
