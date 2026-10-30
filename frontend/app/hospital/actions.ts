"use server";

import { getHospitalProfile, updateHospitalProfile } from "@/lib/api";
import type { HospitalDetail, HospitalUpdateInput } from "@/lib/types";

export async function fetchHospitalProfileAction(): Promise<HospitalDetail> {
  return await getHospitalProfile();
}

export async function updateHospitalProfileAction(payload: HospitalUpdateInput): Promise<HospitalDetail> {
  return await updateHospitalProfile(payload);
}
