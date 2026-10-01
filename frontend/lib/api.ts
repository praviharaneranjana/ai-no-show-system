import type {
  ActivityResponse,
  GeoResponse,
  NotificationItem,
  RegisterQuery,
  RegisterResponse,
  RevenueAtRisk,
  SearchHit,
  SessionDetail,
  TrendGranularity,
  TrendResponse,
  AgentSimulateResult,
  AppointmentOverviewRow,
  OutreachDraft,
  Appointment,
  AppointmentInput,
  CapacityOptimizeResult,
  CapacitySlotsResponse,
  WhatIfResponse,
  CapacityScenario,
  SlotOffer,
  ForecastResponse,
  AccuracyResponse,
  CapacitySetting,
  NavCounts,
  DoctorSession,
  Intervention,
  InterventionLanguage,
  Patient,
  PatientInput,
  PredictFeatures,
  PredictionResult,
  SimulatorParams,
  SimulatorResult,
  StoredPrediction,
  WaitlistEntry,
} from "@/lib/types";
import { redirect } from "next/navigation";

import { getBackendConfig } from "@/lib/backend-config";
import { getSessionToken } from "@/lib/session";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type AuthRole = "front_desk" | "manager" | "admin";

export type LoginRequest = {
  email: string;
  password: string;
};

export type LoginResponse = {
  role: AuthRole;
  name?: string;
  mustChangePassword?: boolean;
  access_token?: string;
};

// `auth: false` is for the few public endpoints (login) that must not carry a session
// and must not redirect to the login page on a 401.
async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  opts: { auth?: boolean } = {}
): Promise<T> {
  const { baseUrl, apiKey } = await getBackendConfig();
  if (!baseUrl) {
    throw new ApiError(0, "Backend server is not configured.");
  }

  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (apiKey) headers.set("X-API-Key", apiKey);
  if (opts.auth !== false) {
    const token = await getSessionToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? JSON.stringify(body);
    } catch {
      // response wasn't JSON — fall back to statusText
    }
    if (opts.auth !== false) {
      // Session missing, expired, revoked or rejected: send the user to sign in again.
      if (res.status === 401) redirect("/login?reason=session_expired");
      if (res.status === 403 && /password change required/i.test(detail)) redirect("/change-password");
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function login(data: LoginRequest) {
  return apiFetch<LoginResponse>(
    "/auth/login",
    { method: "POST", body: JSON.stringify(data) },
    { auth: false }
  );
}

export function changePassword(currentPassword: string, newPassword: string) {
  return apiFetch<void>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

export function listPatients() {
  return apiFetch<Patient[]>("/patients");
}

export function getPatient(id: string) {
  return apiFetch<Patient>(`/patients/${id}`);
}

export function createPatient(data: PatientInput) {
  return apiFetch<Patient>("/patients", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function listAppointments(patientId?: string) {
  const qs = patientId ? `?patient_id=${encodeURIComponent(patientId)}` : "";
  return apiFetch<Appointment[]>(`/appointments${qs}`);
}

export function listAppointmentsOverview(daysBack: number) {
  return apiFetch<AppointmentOverviewRow[]>(`/appointments/overview?days_back=${daysBack}`);
}

export function getAppointment(id: string) {
  return apiFetch<Appointment>(`/appointments/${id}`);
}

export function createAppointment(data: AppointmentInput) {
  return apiFetch<Appointment>("/appointments", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateAppointmentOutcome(appointmentId: string, noShow: boolean) {
  return apiFetch<Appointment>(`/appointments/${appointmentId}/outcome`, {
    method: "PATCH",
    body: JSON.stringify({ no_show: noShow }),
  });
}

export function getPrediction(appointmentId: string) {
  return apiFetch<StoredPrediction>(`/appointments/${appointmentId}/prediction`);
}

export function predict(appointmentId: string, features: PredictFeatures) {
  return apiFetch<PredictionResult>("/predict", {
    method: "POST",
    body: JSON.stringify({ appointment_id: appointmentId, ...features }),
  });
}

// ===================================
// SHAI Enterprise Modules
// ===================================

export function listDoctorSessions() {
  return apiFetch<DoctorSession[]>("/doctors/sessions");
}

export function updateDoctorDelay(sessionId: string, delayMinutes: number, status: string) {
  return apiFetch<DoctorSession>(`/doctors/sessions/${sessionId}/delay`, {
    method: "PATCH",
    body: JSON.stringify({ delay_minutes: delayMinutes, status }),
  });
}

export function optimizeCapacity(maxWaitTimeToleranceMins = 15) {
  return apiFetch<CapacityOptimizeResult>("/capacity/optimize", {
    method: "POST",
    body: JSON.stringify({ max_wait_time_tolerance_mins: maxWaitTimeToleranceMins }),
  });
}

export function getCapacityOverview(date?: string, doctorId?: string, maxWaitTolerance?: number) {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (doctorId) params.set("doctor_id", doctorId);
  if (maxWaitTolerance) params.set("max_wait_tolerance", String(maxWaitTolerance));
  const q = params.toString();
  return apiFetch<CapacityOptimizeResult>(`/capacity/overview${q ? `?${q}` : ""}`);
}

export function getCapacitySlots(date?: string, doctorId?: string) {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (doctorId && doctorId !== "all") params.set("doctor_id", doctorId);
  const q = params.toString();
  return apiFetch<CapacitySlotsResponse>(`/capacity/slots${q ? `?${q}` : ""}`);
}

export function evaluateWhatIf(params: {
  target_date?: string;
  doctor_id?: string;
  department_id?: number;
  max_wait_time_tolerance_mins?: number;
  safety_factor?: number;
  max_overbook_per_slot?: number;
  consultation_fee_lkr?: number;
  assume_doctor_delay_mins?: number;
}) {
  return apiFetch<WhatIfResponse>("/capacity/what-if", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function listCapacityScenarios() {
  return apiFetch<CapacityScenario[]>("/capacity/scenarios");
}
export const getCapacityScenarios = listCapacityScenarios;

export function createCapacityScenario(
  scenarioOrName: { name: string; notes?: string; department?: string; params: Record<string, unknown>; results: Record<string, unknown> } | string,
  params?: Record<string, unknown>,
  results?: Record<string, unknown>
) {
  const body =
    typeof scenarioOrName === "string"
      ? { name: scenarioOrName, params, results }
      : scenarioOrName;
  return apiFetch<CapacityScenario>("/capacity/scenarios", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
export const saveCapacityScenario = createCapacityScenario;

export function deleteCapacityScenario(scenarioId: string) {
  return apiFetch<{ message: string }>(`/capacity/scenarios/${scenarioId}`, {
    method: "DELETE",
  });
}

export function getCapacitySettings(scopeOrDept?: string | number, doctorId?: string) {
  const params = new URLSearchParams();
  if (typeof scopeOrDept === "string" && scopeOrDept) {
    params.set("scope", scopeOrDept);
  } else if (typeof scopeOrDept === "number") {
    params.set("department_id", String(scopeOrDept));
  }
  if (doctorId) params.set("doctor_id", doctorId);
  const q = params.toString();
  return apiFetch<CapacitySetting>(`/capacity/settings${q ? `?${q}` : ""}`);
}

export function updateCapacitySettings(
  scopeOrData: string | Partial<CapacitySetting>,
  dataOrDept?: Partial<CapacitySetting> | number,
  doctorId?: string
) {
  let scope = "global";
  let payload: Partial<CapacitySetting> = {};
  if (typeof scopeOrData === "string") {
    scope = scopeOrData;
    payload = (dataOrDept as Partial<CapacitySetting>) ?? {};
  } else {
    payload = scopeOrData ?? {};
  }

  const params = new URLSearchParams();
  params.set("scope", scope);
  if (doctorId) params.set("doctor_id", doctorId);
  const q = params.toString();

  return apiFetch<CapacitySetting>(`/capacity/settings${q ? `?${q}` : ""}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function getCapacityForecast(days = 14, department?: string) {
  const params = new URLSearchParams();
  params.set("days", String(days));
  if (department && department !== "all") params.set("department", department);
  return apiFetch<ForecastResponse>(`/capacity/forecast?${params.toString()}`);
}

export function getCapacityAccuracy(days = 30, department?: string, doctorId?: string) {
  const params = new URLSearchParams();
  params.set("days", String(days));
  if (department && department !== "all") params.set("department", department);
  if (doctorId && doctorId !== "all") params.set("doctor_id", doctorId);
  return apiFetch<AccuracyResponse>(`/capacity/accuracy?${params.toString()}`);
}

export function getSlotOffers(status?: string) {
  const q = status ? `?status=${status}` : "";
  return apiFetch<SlotOffer[]>(`/capacity/slot-offers${q}`);
}

export function actOnSlotOffer(offerId: string, action: "approve" | "decline" | "undo") {
  return apiFetch<SlotOffer>(`/capacity/slot-offers/${offerId}/act`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export function getCapacityNavCounts() {
  return apiFetch<NavCounts>("/capacity/nav-counts");
}

export function getWaitlist() {
  return apiFetch<WaitlistEntry[]>("/capacity/waitlist");
}

export function assignWaitlistSlot(waitlistId: string) {
  return apiFetch<WaitlistEntry>(`/capacity/waitlist/${waitlistId}/assign`, {
    method: "POST",
  });
}

export function listAppointmentInterventions(appointmentId: string) {
  return apiFetch<Intervention[]>(`/appointments/${appointmentId}/interventions`);
}

export function listConversations() {
  return apiFetch<Intervention[]>("/outreach/conversations");
}

export function simulateAgent(
  appointmentId: string,
  patientMessage: string,
  language: InterventionLanguage
) {
  return apiFetch<AgentSimulateResult>("/outreach/simulate-agent", {
    method: "POST",
    body: JSON.stringify({
      appointment_id: appointmentId,
      patient_message: patientMessage,
      language,
    }),
  });
}

export function draftOutreach(appointmentId: string, language: InterventionLanguage) {
  return apiFetch<OutreachDraft>("/outreach/draft", {
    method: "POST",
    body: JSON.stringify({ appointment_id: appointmentId, language }),
  });
}

export function evaluateSimulator(params: SimulatorParams) {
  return apiFetch<SimulatorResult>("/simulator/evaluate", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// ===================================
// Dashboard drill-down screens
// ===================================

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function getNoShowTrend(granularity: TrendGranularity, department?: string, doctor?: string) {
  return apiFetch<TrendResponse>(`/analytics/trend${qs({ granularity, department, doctor })}`);
}

export function getRevenueAtRisk(days = 7) {
  return apiFetch<RevenueAtRisk>(`/analytics/revenue-at-risk${qs({ days })}`);
}

export function getAppointmentRegister(query: RegisterQuery) {
  return apiFetch<RegisterResponse>(`/appointments/register${qs({ ...query })}`);
}

export function getOutreachActivity(limit = 10) {
  return apiFetch<ActivityResponse>(`/outreach/activity${qs({ limit })}`);
}

export function getNotifications(limit = 50) {
  return apiFetch<{ items: NotificationItem[] }>(`/notifications${qs({ limit })}`);
}

export function searchAll(q: string) {
  return apiFetch<SearchHit[]>(`/search${qs({ q })}`);
}

export function getGeoPatients(params: { risk?: string; department?: string; days_back?: number; limit?: number } = {}) {
  return apiFetch<GeoResponse>(`/geo/patients${qs(params)}`);
}

export function getSessionDetail(id: string) {
  return apiFetch<SessionDetail>(`/doctors/sessions/${id}/detail`);
}
