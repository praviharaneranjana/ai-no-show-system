import type {
  HoldoutReport,
  RecallDraft,
  RecallQueue,
  RecallSummary,
  RescheduleConversation,
  ThreadSummary,
  ThreadDetail,
  AttentionSummary,
  HistoryStep,
  SlotOption,
  RescheduleResult,
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
  WaitlistAssignResult,
  ExpenseCategory,
  HospitalExpense,
  DepartmentItem,
  DoctorItem,
  AvailabilityResponse,
  LocationItem,
  PatientSearchResult,
  IntakeRequest,
  IntakeResponse,
  PredictPreviewRequest,
  PredictPreviewResponse,
  PredictionRunResponse,
  PredictionTodayResponse,
  HISStatusResponse,
  HISTestConnectionResponse,
  ModelInfo,
  DataSourceInfo,
  HospitalBasic,
  HospitalDetail,
  HospitalUpdateInput,
  HospitalAuditLogItem,
  StaffMember,
  DomainResolveResponse,
  RegisterStaffPayload,
} from "@/lib/types";
import { redirect } from "next/navigation";

import { getBackendConfig } from "@/lib/backend-config";
import { getSessionToken } from "@/lib/session";
import { ApiError, isRedirectError } from "@/lib/errors";

export { ApiError, isRedirectError };

export type AuthRole = "front_desk" | "analyst" | "manager" | "admin" | "platform_owner";

export type LoginRequest = {
  email: string;
  password: string;
};

export type LoginResponse = {
  role: AuthRole;
  name?: string;
  mustChangePassword?: boolean;
  access_token?: string;
  hospital_id?: string | null;
  hospital_name?: string | null;
  hospital_code?: string | null;
  status?: string;
  roles?: string[];
  permissions?: string[];
  is_platform_owner?: boolean;
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

export function updateAppointmentOutcome(
  appointmentId: string,
  noShow: boolean | null,
  reason?: string,
  cancelled?: boolean
) {
  return apiFetch<Appointment>(`/appointments/${appointmentId}/outcome`, {
    method: "PATCH",
    body: JSON.stringify({ no_show: noShow, reason, cancelled }),
  });
}

export function getRescheduleOptions(appointmentId: string, doctorId?: string) {
  return apiFetch<SlotOption[]>(`/appointments/${appointmentId}/reschedule-options${qs({ doctor_id: doctorId })}`);
}

export function rescheduleAppointment(
  appointmentId: string,
  body: { appointment_day: string; clinic_session_id: string; doctor_id?: string; notify?: boolean; language?: string }
) {
  return apiFetch<RescheduleResult>(`/appointments/${appointmentId}/reschedule`, {
    method: "POST",
    body: JSON.stringify(body),
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
  return apiFetch<WaitlistAssignResult>(`/capacity/waitlist/${waitlistId}/assign`, {
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

export function draftOutreach(appointmentId: string, language: InterventionLanguage, occasion = "reminder") {
  return apiFetch<OutreachDraft>("/outreach/draft", {
    method: "POST",
    body: JSON.stringify({ appointment_id: appointmentId, language, occasion }),
  });
}

export function evaluateSimulator(params: SimulatorParams) {
  return apiFetch<SimulatorResult>("/simulator/evaluate", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function listExpenseCategories() {
  return apiFetch<ExpenseCategory[]>("/expenses/categories");
}

export function listHospitalExpenses() {
  return apiFetch<HospitalExpense[]>("/expenses");
}

export function createHospitalExpense(payload: {
  category_id: string;
  hospital_name?: string;
  title: string;
  amount_lkr: number;
  recurrence: string;
  is_active?: boolean;
  notes?: string | null;
}) {
  return apiFetch<HospitalExpense>("/expenses", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateHospitalExpense(
  id: string,
  payload: Partial<{
    category_id: string;
    hospital_name: string;
    title: string;
    amount_lkr: number;
    recurrence: string;
    is_active: boolean;
    notes: string;
  }>
) {
  return apiFetch<HospitalExpense>(`/expenses/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteHospitalExpense(id: string) {
  return apiFetch<{ ok: boolean; id: string }>(`/expenses/${id}`, {
    method: "DELETE",
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

// ===================================
// Reference Data & Discovery
// ===================================

export function getDepartments() {
  return apiFetch<DepartmentItem[]>("/departments");
}

export function getDoctors(departmentId?: number, search?: string) {
  return apiFetch<DoctorItem[]>(`/doctors${qs({ department_id: departmentId, search })}`);
}

export function getDoctorAvailability(doctorId: string, days = 14) {
  return apiFetch<AvailabilityResponse>(`/doctors/${doctorId}/availability${qs({ days })}`);
}

export function searchLocations(q: string, limit = 8) {
  return apiFetch<LocationItem[]>(`/locations${qs({ q, limit })}`);
}

export function geocodeLocation(q: string) {
  return apiFetch<{ latitude: number; longitude: number; display_name: string; district?: string } | null>(
    `/locations/geocode${qs({ q })}`
  );
}

export function calculateDistance(latitude: number, longitude: number) {
  return apiFetch<{ distance_km: number; source: "road_osrm" | "estimated" | "manual" }>(
    "/distance",
    { method: "POST", body: JSON.stringify({ latitude, longitude }) }
  );
}

export function searchPatients(q: string, limit = 10) {
  return apiFetch<PatientSearchResult[]>(`/patients/search${qs({ q, limit })}`);
}

// ===================================
// Intake & Live Scoring
// ===================================

export function createAppointmentIntake(req: IntakeRequest) {
  return apiFetch<IntakeResponse>("/appointments/intake", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function previewPrediction(req: PredictPreviewRequest) {
  return apiFetch<PredictPreviewResponse>("/predict/preview", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// ===================================
// Prediction Hub & HIS Sync
// ===================================

export function getPredictionsToday(date?: string) {
  return apiFetch<PredictionTodayResponse>(`/predictions/today${qs({ date })}`);
}

export function triggerBatchRun(
  req: {
    run_date?: string;
    doctor_id?: string;
    department_id?: number;
    slot_label?: string;
    user_filter?: string;
    re_score?: boolean;
    department_wise?: boolean;
    with_sync?: boolean;
    heavy_rain?: boolean;
  },
  runSync = false
) {
  return apiFetch<PredictionRunResponse>(`/predictions/runs${qs({ run_sync: runSync ? "true" : undefined })}`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function getPredictionRun(runId: string) {
  return apiFetch<PredictionRunResponse>(`/predictions/runs/${runId}`);
}

export function getModelInfo() {
  return apiFetch<ModelInfo>("/model/info");
}

export function getDataSourceInfo() {
  return apiFetch<DataSourceInfo>("/meta/data-source");
}

export function getHisStatus() {
  return apiFetch<HISStatusResponse>("/his/status");
}

export function triggerHisSync(date?: string) {
  return apiFetch<{
    run_id: string;
    target_date: string;
    status: string;
    fetched: number;
    created: number;
    updated: number;
    unchanged: number;
    failed: number;
    error: string | null;
  }>(`/his/sync${qs({ date })}`, { method: "POST" });
}

export function simulateHisArrivals(count = 5) {
  return apiFetch<{ marked_arrived_count: number; external_refs: string[] }>(
    `/his/simulate/arrivals${qs({ count })}`,
    { method: "POST" }
  );
}

export function testHisConnection(simulateError = false) {
  return apiFetch<HISTestConnectionResponse>(
    `/his/test-connection${qs({ simulate_error: simulateError ? "true" : undefined })}`,
    { method: "POST" }
  );
}

// ===================================
// Multi-Hospital & Staff API
// ===================================

export function getHospitalProfile() {
  return apiFetch<HospitalDetail>("/hospital");
}

export function updateHospitalProfile(payload: HospitalUpdateInput) {
  return apiFetch<HospitalDetail>("/hospital", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function getHospitalAuditLog(limit = 50) {
  return apiFetch<HospitalAuditLogItem[]>(`/hospital/audit${qs({ limit })}`);
}

export function listHospitalStaff() {
  return apiFetch<StaffMember[]>("/admin/staff");
}

export function listPendingStaff() {
  return apiFetch<StaffMember[]>("/admin/staff/pending");
}

export function approveStaff(membershipId: string, role: string, notes?: string) {
  return apiFetch<StaffMember>(`/admin/staff/${membershipId}/approve`, {
    method: "POST",
    body: JSON.stringify({ role, notes }),
  });
}

export function rejectStaff(membershipId: string, reason?: string) {
  return apiFetch<StaffMember>(`/admin/staff/${membershipId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function resolveEmailDomain(email: string) {
  return apiFetch<DomainResolveResponse>(
    "/auth/resolve-email",
    {
      method: "POST",
      body: JSON.stringify({ email }),
    },
    { auth: false }
  );
}

export function listPublicHospitals() {
  return apiFetch<HospitalBasic[]>("/auth/hospitals", undefined, { auth: false });
}

export function registerStaff(payload: RegisterStaffPayload) {
  return apiFetch<{
    status: string;
    message: string;
    membership_id: string;
    hospital_name: string;
  }>(
    "/auth/register",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    { auth: false }
  );
}

export function switchHospital(hospitalId: string) {
  return apiFetch<LoginResponse>("/auth/switch-hospital", {
    method: "POST",
    body: JSON.stringify({ hospital_id: hospitalId }),
  });
}




// ===================================
// Outreach threads & reschedule conversations
// ===================================

const post = (path: string, body?: unknown) =>
  apiFetch<RescheduleConversation>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export function listThreads(q = "", status = "all") {
  return apiFetch<ThreadSummary[]>(`/outreach/threads${qs({ q: q || undefined, status })}`);
}
export function getThread(patientId: string) {
  return apiFetch<ThreadDetail>(`/outreach/threads/${patientId}`);
}
export function getAttention() {
  return apiFetch<AttentionSummary>("/outreach/attention");
}
export function getAppointmentConversation(appointmentId: string) {
  return apiFetch<RescheduleConversation | null>(`/appointments/${appointmentId}/conversation`);
}
export function getAppointmentHistory(appointmentId: string) {
  return apiFetch<HistoryStep[]>(`/appointments/${appointmentId}/history`);
}
export function startConversation(appointmentId: string, language?: string) {
  return post("/outreach/conversations", { appointment_id: appointmentId, language });
}
export function sendIncoming(id: string, text: string) {
  return post(`/outreach/conversations/${id}/incoming`, { text });
}
export function sendStaffMessage(id: string, text: string) {
  return post(`/outreach/conversations/${id}/staff-message`, { text });
}
export function approveConversation(id: string) {
  return apiFetch<{ booked: boolean; message: string; conversation: RescheduleConversation }>(
    `/outreach/conversations/${id}/approve`,
    { method: "POST" }
  );
}
export function rejectConversation(id: string, note?: string) {
  return post(`/outreach/conversations/${id}/reject`, { note });
}
export function takeOverConversation(id: string) {
  return post(`/outreach/conversations/${id}/take-over`);
}
export function resumeConversation(id: string) {
  return post(`/outreach/conversations/${id}/resume`);
}
export function bookConversation(
  id: string,
  body: { clinic_session_id: string; appointment_day: string; doctor_id?: string; notify?: boolean; language?: string }
) {
  return post(`/outreach/conversations/${id}/book`, body);
}


// ---- Post-miss recall and the outreach hold-out ----

export function getRecallQueue(days = 14) {
  return apiFetch<RecallQueue>(`/recall/queue${qs({ days })}`);
}

export function getRecallSummary(days = 90) {
  return apiFetch<RecallSummary>(`/recall/summary${qs({ days })}`);
}

export function draftRecall(appointmentId: string, language: string) {
  return apiFetch<RecallDraft>(`/recall/${appointmentId}/draft${qs({ language })}`, { method: "POST" });
}

export function logRecallContact(appointmentId: string, body: { channel: string; language?: string; message_text?: string; note?: string }) {
  return apiFetch<{ ok: boolean }>(`/recall/${appointmentId}/contact`, { method: "POST", body: JSON.stringify(body) });
}

export function rebookRecall(
  appointmentId: string,
  body: { clinic_session_id: string; appointment_day: string; doctor_id?: string; notify?: boolean; language?: string }
) {
  return apiFetch<{ appointment_id: string; appointment_day: string; message: string | null }>(`/recall/${appointmentId}/rebook`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getHoldoutReport(days = 90, tiers = "High") {
  return apiFetch<HoldoutReport>(`/outreach/holdout/report${qs({ days, tiers })}`);
}
