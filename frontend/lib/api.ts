import type {
  AgentSimulateResult,
  AppointmentOverviewRow,
  OutreachDraft,
  Appointment,
  AppointmentInput,
  CapacityOptimizeResult,
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
