export type Patient = {
  id: string;
  uhid: string | null;
  full_name: string;
  date_of_birth: string;
  gender: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  distance_km: number | null;
  latitude: number | null;
  longitude: number | null;
  scholarship: boolean;
  hypertension: boolean;
  diabetes: boolean;
  alcoholism: boolean;
  handicap: number;
  created_at: string;
};

export type PatientInput = Omit<Patient, "id" | "created_at" | "uhid" | "city" | "distance_km" | "latitude" | "longitude"> & {
  uhid?: string | null;
  city?: string | null;
  distance_km?: number | null;
};

export type Appointment = {
  fee_lkr?: number | null;
  data_source?: string | null;
  id: string;
  patient_id: string;
  scheduled_day: string;
  appointment_day: string;
  department: string | null;
  doctor_name: string | null;
  booking_channel: string | null;
  payment_mode: string | null;
  scheduled_time: string | null;
  queue_number: number | null;
  ai_action_status: string | null;
  sms_received: boolean;
  status: string;
  no_show: boolean | null;
  created_at: string;
};

export type AppointmentInput = Omit<
  Appointment,
  | "id"
  | "status"
  | "no_show"
  | "created_at"
  | "doctor_name"
  | "booking_channel"
  | "payment_mode"
  | "scheduled_time"
  | "queue_number"
  | "ai_action_status"
> & {
  doctor_name?: string | null;
  booking_channel?: string | null;
  payment_mode?: string | null;
  scheduled_time?: string | null;
  queue_number?: number | null;
  ai_action_status?: string | null;
};

export type RiskCategory = "Low" | "Medium" | "High";

export type FeatureContribution = {
  feature: string;
  contribution: number;
  value: number;
};

export type PredictFeatures = {
  Age: number;
  Scholarship: number;
  Hipertension: number;
  Diabetes: number;
  Alcoholism: number;
  Handcap: number;
  SMS_received: number;
  DaysAhead: number;
  DayOfWeek: number;
  IsWeekend: number;
  Month: number;
};

export type ContextualAdjustment = {
  ml_risk_score: number;
  distance_km: number | null;
  distance_multiplier: number;
  booking_channel: string | null;
  channel_multiplier: number;
  payment_mode: string | null;
  payment_multiplier: number;
  combined_multiplier: number;
  final_risk_score: number;
  method: string;
  note: string;
};

export type PredictionResult = {
  risk_score: number;
  risk_category: RiskCategory;
  explanation: FeatureContribution[];
  contextual_adjustment: ContextualAdjustment | null;
  recommendation: string;
};

export type StoredPrediction = PredictionResult & {
  id: string;
  appointment_id: string;
  created_at: string;
};

export type AppointmentOverviewRow = {
  appointment: Appointment;
  patient: Patient | null;
  prediction: StoredPrediction | null;
};

// ===================================
// SHAI Enterprise Modules
// ===================================

export type DoctorSessionStatus = "on_time" | "delayed" | "in_progress" | "completed";

export type DoctorSession = {
  id: string;
  doctor_id?: string;
  session_id?: string;
  doctor_name: string;
  specialty: string;
  room_number: string;
  session_date: string;
  scheduled_start_time: string;
  status: DoctorSessionStatus;
  delay_minutes: number;
  avg_consultation_mins: number;
  max_capacity: number;
  created_at: string;
};

export type InterventionLanguage = "en" | "si" | "ta";

export type Intervention = {
  id: string;
  appointment_id: string;
  channel: string;
  language: InterventionLanguage;
  status: string;
  patient_reply: string | null;
  intent_detected: string | null;
  offered_slot: string | null;
  created_at: string;
};

export type AgentSimulateResult = {
  appointment_id: string;
  intent: string;
  agent_response: string;
  language: InterventionLanguage;
  suggested_action: string;
  status_updated: string;
};

export type OutreachDraft = {
  appointment_id: string;
  language: InterventionLanguage;
  message: string;
  source: "gemini" | "template";
  reasons: string[];
  model: string | null;
};

export type WaitlistUrgency = "High" | "Normal" | "Routine";

export type WaitlistEntry = {
  id: string;
  patient_name: string;
  patient_phone: string;
  specialty: string;
  doctor_name: string;
  urgency_level: WaitlistUrgency;
  preferred_days: string;
  status: string;
  created_at: string;
};

export type SessionOptimizationDetail = {
  doctor_id?: string | null;
  clinic_session_id?: string | null;
  session_label?: string | null;
  session_start?: string | null;
  doctor_name: string;
  specialty: string;
  room_number: string;
  max_capacity: number | null;
  total_booked: number;
  free_seats: number;
  predicted_no_shows: number;
  expected_no_shows_float: number;
  interval_low: number;
  interval_high: number;
  high_risk_slots: number;
  unscored_bookings: number;
  recommended_extra_bookings: number;
  recommended_overbook_count: number;
  overbook_if_full: number;
  expected_revenue_gain_lkr: number;
  value_gain_lkr: number;
  expected_overflow: number;
  expected_wait_time_mins: number;
  p_overcrowding: number;
  booked_utilisation_pct: number;
  expected_attendance_pct: number;
  consultation_fee_lkr: number;
  wait_cost_lkr: number;
  delay_minutes: number;
  risk_level: "Safe" | "Moderate" | "Caution";
  status_advice: string;
};

export type CapacitySessionCard = SessionOptimizationDetail;

export type DepartmentCapacitySummary = {
  department: string;
  total_capacity?: number;
  capacity?: number;
  total_booked?: number;
  booked?: number;
  expected_no_shows: number;
  recommended_overbook?: number;
  recommended_overbooks?: number;
  interval_low?: number;
  interval_high?: number;
};

export type CapacityOptimizeResult = {
  session_date: string;
  total_capacity: number;
  total_booked: number;
  total_predicted_no_shows: number;
  expected_no_shows_total: number;
  expected_no_shows_interval_low: number;
  expected_no_shows_interval_high: number;
  total_recommended_overbooks: number;
  estimated_revenue_recovery_lkr: number;
  booked_utilisation_pct: number;
  expected_attendance_pct: number;
  sessions_running: number;
  idle_sessions: number;
  sessions: SessionOptimizationDetail[];
  departments: DepartmentCapacitySummary[];
};

export type SlotPatient = {
  appointment_id: string;
  patient_id: string;
  uhid?: string;
  patient_name: string;
  gender?: string | null;
  age?: number | null;
  phone?: string | null;
  city?: string | null;
  distance_km?: number | null;
  risk_score?: number;
  risk_probability?: number;
  risk_category: string;
  status?: string;
  sms_received?: boolean;
  factors?: string[];
};

export type SlotDetail = {
  time?: string;
  slot_time?: string;
  booked?: number;
  booked_count?: number;
  expected_no_shows: number;
  recommended_overbook: number;
  heat_color?: "green" | "amber" | "red" | "grey";
  heat_level?: "low" | "medium" | "high" | "empty";
  simulated_wait_mins?: number;
  patients: SlotPatient[];
};

export type DoctorSlots = {
  doctor_id?: string | null;
  clinic_session_id?: string | null;
  session_label?: string | null;
  doctor_name: string;
  specialty: string;
  room_number: string;
  session_time?: string;
  delay_minutes: number;
  delay_status: string;
  total_booked: number;
  total_recommended_overbook: number;
  slots: SlotDetail[] | Record<string, SlotDetail>;
};

export type SlotDoctorRow = DoctorSlots;

export type CapacitySlotsResponse = {
  date: string;
  time_slots?: string[];
  doctors: DoctorSlots[];
};

export type WhatIfPolicyStats = {
  recommended_overbook: number;
  expected_wait_mins: number;
  p_overcrowding: number;
  expected_filled_gaps: number;
  expected_revenue_lkr: number;
  expected_overflow: number;
  net_value_gain_lkr: number;
};

export type WhatIfRequest = {
  target_date?: string;
  doctor_id?: string;
  department_id?: number;
  consultation_fee_lkr?: number;
  wait_cost_lkr?: number;
  max_overbook_per_session?: number;
};

export type WhatIfResponse = {
  current_policy: WhatIfPolicyStats;
  what_if_policy: WhatIfPolicyStats;
  delta_overbook: number;
  delta_wait_mins: number;
  delta_revenue_lkr: number;
  trade_off_curve: Array<{
    extra_bookings: number;
    value_lkr: number;
    expected_overflow: number;
    p_overflow_max: number;
  }>;
};

export type CapacityScenario = {
  id: string;
  name: string;
  department?: string;
  notes?: string;
  params: Record<string, unknown>;
  results: Record<string, unknown>;
  created_by?: string | null;
  created_at: string;
};

export type CandidateScoreBreakdown = {
  specialty_doctor_match?: number;
  specialty_match?: number;
  attendance_reliability?: number;
  reliability?: number;
  waiting_time_priority?: number;
  wait_time?: number;
  clinical_urgency?: number;
  urgency?: number;
  travel_proximity?: number;
  distance?: number;
  days_waiting?: number;
  predicted_no_show_prob?: number;
};

export type SlotOfferCandidate = {
  waitlist_id: string;
  patient_id: string;
  patient_name: string;
  phone: string;
  total_score: number;
  score_breakdown: CandidateScoreBreakdown;
  predicted_no_show_prob: number;
  wait_days: number;
  distance_km?: number;
  urgency: string;
  preferred_time?: string;
};

export type SlotOffer = {
  id: string;
  doctor_id: string;
  doctor_name: string;
  department?: string;
  specialty: string;
  room?: string;
  room_number?: string;
  slot_time: string;
  slot_date?: string;
  reason?: string;
  freed_reason?: string;
  waitlist_entry_id?: string;
  candidate_patient_name?: string;
  candidate_patient_phone?: string;
  candidate_uhid?: string | null;
  match_score?: number;
  score_breakdown?: CandidateScoreBreakdown;
  candidates?: SlotOfferCandidate[];
  status: "proposed" | "approved" | "declined" | "expired" | "undone";
  acted_by?: string | null;
  acted_at?: string | null;
  created_at: string;
};

export type ForecastDay = {
  date: string;
  weekday?: string;
  total_projected_booked?: number;
  booked_appointments?: number;
  expected_no_shows: number;
  interval_low: number;
  interval_high: number;
  bufferable_overbooks?: number;
  recommended_overbooks?: number;
  revenue_at_risk_lkr: number;
  recoverable_revenue_lkr?: number;
  heat_intensity?: number;
};

export type DailyForecastPoint = ForecastDay;

export type DepartmentForecastItem = {
  department: string;
  share_pct?: number;
  appointments?: number;
  expected_no_shows: number;
  recommended_overbooks?: number;
  revenue_at_risk_lkr?: number;
};

export type ForecastResponse = {
  days?: number | ForecastDay[];
  horizon_days?: number;
  department?: string;
  total_forecasted_appointments?: number;
  total_expected_no_shows?: number;
  expected_no_shows_range?: [number, number];
  total_recommended_overbooks?: number;
  total_revenue_at_risk_lkr?: number;
  daily_forecast?: DailyForecastPoint[];
  department_breakdown?: DepartmentForecastItem[];
  summary?: {
    horizon_days: number;
    total_projected_appointments: number;
    total_expected_no_shows: number;
    total_bufferable_overbooks: number;
    total_revenue_at_risk_lkr: number;
    total_recoverable_revenue_lkr: number;
  };
  departments?: Array<{ department: string; share_pct: number; expected_no_shows: number }>;
};

export type AccuracyDecile = {
  decile: number;
  mean_predicted_prob?: number;
  predicted_prob?: number;
  observed_no_show_rate?: number;
  actual_rate?: number;
  count: number;
};

export type AccuracyTier = {
  n: number;
  share: number;
  mean_predicted: number | null;
  observed_no_show_rate: number | null;
  no_shows: number;
};

export type AccuracyResponse = {
  empty: boolean;
  n_evaluated: number;
  days: number;
  department?: string | null;
  synthetic_share?: number;
  observed_no_show_rate?: number;
  mean_predicted?: number;
  roc_auc?: number | null;
  pr_auc?: number | null;
  brier?: number;
  recall_top20?: number | null;
  precision_top20?: number | null;
  lift_top20?: number | null;
  tiers?: Record<"High" | "Medium" | "Low", AccuracyTier>;
  confusion_matrix?: {
    rule: string;
    tp: number;
    fp: number;
    fn: number;
    tn: number;
    precision: number | null;
    recall: number | null;
    specificity: number | null;
    flagged_share: number;
  };
  calibration_deciles?: AccuracyDecile[];
  daily_accuracy?: Array<{ date: string; n: number; predicted_no_shows: number; actual_no_shows: number; brier: number }>;
  department_brier?: Array<{ department: string; n: number; brier_score: number; roc_auc: number | null }>;
};

export type CapacitySetting = {
  id?: string;
  scope: string;
  department_id?: number | null;
  doctor_id?: string | null;
  max_overbook_per_session: number;
  wait_cost_lkr: number;
  consultation_fee_lkr: number;
  badge_safe_mins?: number;
  badge_moderate_mins?: number;
  auto_assign_waitlist: boolean;
  created_at?: string;
  updated_at?: string;
};

export type NavCounts = {
  waitlist_waiting: number;
  open_slot_offers?: number;
  today_sessions_count?: number;
  high_risk_open?: number;
  unscored_today?: number;
};

export type CapacityNavCounts = NavCounts;

export type ExpenseRecurrence = "annual" | "monthly" | "one_off" | "per_patient";

export type ExpenseCategory = {
  id: string;
  key: string;
  name: string;
  icon: string;
  description?: string | null;
  display_order: number;
};

export type HospitalExpense = {
  id: string;
  hospital_name: string;
  category_id: string;
  category?: ExpenseCategory | null;
  category_key?: string;
  title: string;
  amount_lkr: number;
  recurrence: ExpenseRecurrence;
  is_active: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

/** Assumptions sent to POST /simulator/evaluate. Volume, fee and no-show rate are read from the database. */
export type SimulatorParams = {
  contact_fraction: number;
  intervention_efficacy: number;
  value_multiplier: number;
  cost_per_contact_lkr: number;
  window_days: number;
};

export type RoiScenario = {
  k: number;
  efficacy: number;
  contacts: number;
  recovered_lkr_model: number;
  recovered_lkr_random: number;
  contact_cost_lkr: number;
  net_lkr_model: number;
  net_lkr_random: number;
  uplift_vs_random_lkr: number;
  recall_model: number | null;
  recall_random: number | null;
};

export type SimulatorResult =
  | { empty: true; assumptions: SimulatorParams }
  | {
      empty: false;
      assumptions: SimulatorParams;
      baseline: {
        source: "database";
        n_appointments: number;
        days_with_appointments: number;
        window_calendar_days: number;
        daily_appointments: number;
        avg_fee_lkr: number;
        no_show_rate: number;
        synthetic: boolean;
      };
      replay: RoiScenario & { no_shows: number; appointments: number; days: number; caught_model: number; caught_random: number };
      annual: {
        scale: number;
        recovered_lkr: number;
        recovered_lkr_random_contact: number;
        contact_cost_lkr: number;
        fixed_expenses_lkr: number;
        net_benefit_lkr: number;
        net_benefit_low_lkr: number;
        net_benefit_high_lkr: number;
        roi_multiple: number | null;
        payback_days: number | null;
        expense_category_breakdown: Record<string, number>;
        expenses_recorded: number;
      };
      sensitivity: {
        efficacies: number[];
        ks: number[];
        cells: Array<RoiScenario & { annual_net_lkr: number; annual_recovered_lkr: number }>;
      };
    };

// ===================================
// Dashboard drill-down screens (backend app/insights.py)
// ===================================

export type TrendGranularity = "day" | "week" | "month" | "year";

export type TrendPoint = { period: string; label: string; total: number; no_shows: number; rate: number; partial: boolean };
export type TrendResponse = {
  granularity: TrendGranularity;
  points: TrendPoint[];
  baseline_rate: number | null;
  sample_size: number;
  latest_rate: number | null;
  previous_rate: number | null;
  departments: string[];
  doctors: string[];
};

export type RevenueBucket = { key: string; appointments: number; expected_no_shows: number; revenue_at_risk_lkr: number };
export type RevenueAtRisk = {
  days: number;
  total_appointments: number;
  expected_no_shows: number;
  revenue_at_risk_lkr: number;
  by_department: RevenueBucket[];
  by_doctor: RevenueBucket[];
  by_day: RevenueBucket[];
  consultation_fee_lkr: number;
  ancillary_multiplier: number;
};

export type RegisterView = "all" | "today" | "high_risk" | "pending_outcome" | "upcoming";
export type RegisterSort = "risk" | "date_desc" | "date_asc" | "name";
export type RegisterQuery = {
  page?: number;
  page_size?: number;
  view?: RegisterView;
  risk?: RiskCategory;
  window_days?: number;
  q?: string;
  department?: string;
  doctor?: string;
  sort?: RegisterSort;
};
export type RegisterResponse = {
  items: AppointmentOverviewRow[];
  total: number;
  page: number;
  page_size: number;
  counts: { all: number; high_risk: number; today: number; pending_outcome: number };
  departments: string[];
};

export type ActivityItem = {
  id: string;
  appointment_id: string;
  patient_name: string;
  channel: string;
  language: string;
  status: string;
  intent_detected: string | null;
  patient_reply: string | null;
  created_at: string;
};
export type ActivityResponse = { items: ActivityItem[]; total: number; resolution_rate: number | null };

export type NotificationItem = {
  id: string;
  type: "high_risk" | "delay" | "reply" | "waitlist";
  title: string;
  detail: string;
  href: string;
  at: string;
};

export type SearchHit = { kind: "patient" | "appointment"; title: string; subtitle: string; href: string };

export type GeoPoint = {
  appointment_id: string;
  patient_name: string;
  city: string | null;
  latitude: number;
  longitude: number;
  distance_km: number;
  department: string | null;
  appointment_day: string;
  risk_category: RiskCategory | null;
  risk_score: number | null;
  no_show: boolean | null;
};
export type GeoResponse = {
  hospital_name: string;
  hospital_lat: number;
  hospital_lng: number;
  points: GeoPoint[];
  bins: { label: string; patients: number; no_show_rate: number | null }[];
  avg_km_no_show: number | null;
  avg_km_attended: number | null;
  truncated: boolean;
  departments: string[];
};

export type SessionDetail = {
  session: DoctorSession;
  booked: number;
  predicted_no_shows: number;
  high_risk: number;
  queue: {
    appointment_id: string;
    patient_name: string;
    queue_number: number | null;
    scheduled_time: string | null;
    risk_category: RiskCategory | null;
    risk_score: number | null;
    status: string;
  }[];
};

// ===================================
// Reference Data & Discovery Types
// ===================================

export type DepartmentItem = {
  id: number;
  name: string;
  model_category: string | null;
  icon: string;
  telehealth_ok: boolean;
  active: boolean;
  default_consultation_fee_lkr: number;
  doctor_count: number;
};

export type DoctorClinicSessionSummary = {
  session_id: string;
  weekday: number;
  label: string;
  start_time: string;
  end_time: string;
  room: string;
  max_patients: number;
  slot_minutes: number;
};

export type DoctorItem = {
  id: string;
  title: string;
  full_name: string;
  department_id: number;
  department_name: string;
  his_doctor_code: string | null;
  default_room: string | null;
  active: boolean;
  sessions: DoctorClinicSessionSummary[];
};

export type AvailabilitySessionItem = {
  session_id: string;
  label: string;
  start_time: string;
  end_time: string;
  room: string;
  max_patients: number;
  booked: number;
  remaining: number;
  next_token: number;
};

export type AvailabilityDayItem = {
  date: string;
  sessions: AvailabilitySessionItem[];
};

export type AvailabilityResponse = {
  days: AvailabilityDayItem[];
};

export type LocationItem = {
  id: number;
  name: string;
  district: string | null;
  province: string | null;
  kind: string;
  latitude: number;
  longitude: number;
  distance_km: number;
  distance_source: "road_osrm" | "estimated" | "manual";
};

export type PatientSearchResult = {
  id: string;
  uhid: string;
  full_name: string;
  phone: string | null;
  nic: string | null;
  date_of_birth: string;
  gender: string | null;
  city: string | null;
  district: string | null;
  distance_km: number | null;
  total_visits: number;
  prior_no_shows: number;
  last_visit_date: string | null;
};

// ===================================
// Intake & Prediction Types
// ===================================

export type IntakePatientPayload = {
  full_name: string;
  date_of_birth: string;
  gender?: string;
  phone?: string;
  nic?: string;
  email?: string;
  city?: string;
  district?: string;
  address_line?: string;
  location_id?: number;
  distance_km?: number;
  distance_source?: "road_osrm" | "estimated" | "manual";
  latitude?: number;
  longitude?: number;
  preferred_language?: string;
  scholarship?: boolean;
  hypertension?: boolean;
  diabetes?: boolean;
  alcoholism?: boolean;
  handicap?: number;
};

export type IntakeRequest = {
  patient_id?: string;
  patient?: IntakePatientPayload;
  doctor_id: string;
  clinic_session_id: string;
  appointment_day: string;
  booking_channel?: string;
  payment_mode?: string;
  sms_reminder_opt_in?: boolean;
  notes?: string;
  heavy_rain?: boolean;
};

export type IntakeSlotOut = {
  doctor: string;
  date: string;
  start_time: string;
  room: string;
  token: number;
};

export type IntakeResponse = {
  patient: Patient;
  appointment: Appointment;
  prediction: StoredPrediction | null;
  slot: IntakeSlotOut;
};

export type PredictPreviewRequest = {
  patient_id?: string;
  patient?: IntakePatientPayload;
  doctor_id: string;
  clinic_session_id?: string;
  appointment_day: string;
  booking_channel?: string;
  payment_mode?: string;
  heavy_rain?: boolean;
};

export type PredictPreviewResponse = {
  risk_score: number;
  risk_category: string;
  explanation: { feature: string; feature_label?: string; contribution: number; value: unknown }[];
  contextual_adjustment?: unknown;
  recommendation: string;
};

// ===================================
// Prediction Hub & Batch Run Types
// ===================================

export type PredictionRunResponse = {
  id: string;
  run_date: string;
  doctor_id: string | null;
  department_id?: number | null;
  status: "queued" | "running" | "done" | "failed";
  stage: string;
  with_sync: boolean;
  total: number;
  scored: number;
  failed: number;
  high: number;
  medium: number;
  low: number;
  expected_no_shows: number | null;
  percent_complete: number;
  error: string | null;
  triggered_by: string | null;
  started_at: string;
  finished_at: string | null;
  department_breakdown?: Record<string, number> | null;
};

export type HubKPIs = {
  total_appointments: number;
  scored_count: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  estimated_lost_revenue_lkr: number;
  average_no_show_risk: number;
};

export type HubAppointmentItem = {
  appointment_id: string;
  patient_id: string;
  patient_name: string;
  uhid: string;
  phone: string | null;
  token_number: number | null;
  scheduled_time: string;
  risk_score: number | null;
  risk_category: string | null;
  top_reasons: string[];
  actions_available: string[];
  status: string;
  source: string;
  booking_channel?: string | null;
  booked_by?: string | null;
};

export type HubDoctorGroup = {
  doctor_id: string;
  doctor_name: string;
  department: string;
  room: string | null;
  session_time: string | null;
  total: number;
  scored: number;
  high: number;
  medium: number;
  low: number;
  appointments: HubAppointmentItem[];
};

export type HubSyncStatus = {
  last_sync_timestamp: string | null;
  source: string;
  is_stale: boolean;
};

export type PredictionTodayResponse = {
  target_date: string;
  kpis: HubKPIs;
  by_doctor: HubDoctorGroup[];
  sync_status: HubSyncStatus;
  last_run: PredictionRunResponse | null;
};

export type HISStatusResponse = {
  connector_type: string;
  connector_healthy: boolean;
  last_sync_run: {
    id: string;
    target_date: string;
    status: string;
    trigger: string;
    fetched: number;
    created: number;
    updated: number;
    unchanged: number;
    failed: number;
    started_at: string;
    finished_at: string | null;
  } | null;
  total_his_records: number;
  synced_appointments_today: number;
};

// ===================================
// Hospital & Multi-Tenancy Types
// ===================================

export type HospitalBasic = {
  id: string;
  name: string;
  code: string;
  city: string;
  district?: string;
  is_active: boolean;
};

export type HospitalFinancialSummary = {
  total_appointments: number;
  no_shows_recorded: number;
  observed_no_show_rate_pct: number | null;
  revenue_recovered_lkr: number;
  revenue_at_risk_lkr: number;
  avoided_loss_lkr: number;
  active_doctors_count: number;
  departments_count: number;
  registered_staff_count: number;
};

export type HospitalContact = {
  id: string;
  kind: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
};

export type HospitalPartner = {
  id: string;
  name: string;
  kind: string;
  website: string | null;
  since_date: string | null;
  description: string | null;
  is_official: boolean;
};

export type HospitalManagementMember = {
  id: string;
  full_name: string;
  position: string;
  bio: string | null;
  email: string | null;
  phone: string | null;
  display_order: number;
  is_public: boolean;
};

export type HospitalAuditLogItem = {
  id: string;
  actor_email: string | null;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
};

export type HospitalDetail = {
  id: string;
  slug: string;
  name: string;
  short_name: string;
  legal_name: string | null;
  logo_url: string | null;
  brand_color: string;
  established_date: string | null;
  hospital_type: string;
  registration_number: string | null;
  bed_count: number;
  address_line1: string | null;
  address_line2: string | null;
  city: string;
  district: string;
  province: string;
  postal_code: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
  currency: string;
  website: string | null;
  main_phone: string | null;
  main_email: string | null;
  emergency_phone: string | null;
  about: string | null;
  accreditations: string[];
  go_live_date: string | null;
  is_active: boolean;
  financial_summary: HospitalFinancialSummary;
  contacts: HospitalContact[];
  partners: HospitalPartner[];
  management_members: HospitalManagementMember[];
};

export type HospitalUpdateInput = {
  name?: string;
  short_name?: string;
  legal_name?: string | null;
  brand_color?: string;
  established_date?: string | null;
  hospital_type?: string;
  registration_number?: string | null;
  bed_count?: number;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string;
  district?: string;
  province?: string;
  postal_code?: string;
  website?: string | null;
  main_phone?: string | null;
  main_email?: string | null;
  emergency_phone?: string | null;
  about?: string | null;
  accreditations?: string[];
};

export type StaffMember = {
  membership_id: string;
  user_id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: string;
  status: "active" | "pending" | "suspended" | "rejected";
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
};

export type DomainResolveResponse = {
  domain: string;
  registered: boolean;
  hospital_id: string | null;
  hospital_name: string | null;
  hospital_code: string | null;
};

export type RegisterStaffPayload = {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  requested_role?: string;
  hospital_id?: string;
};




export type ModelComparisonRow = {
  model: string;
  ROC_AUC?: number;
  PR_AUC?: number;
  Brier?: number;
  Recall_top20?: number;
  Precision_top20?: number;
  Lift_top20?: number;
};

export type ModelInfo = {
  version: string;
  thresholds: { high: number; medium: number; rule: string | null };
  metrics: {
    roc_auc: number | null;
    pr_auc: number | null;
    brier: number | null;
    lift_top20: number | null;
    recall_top20: number | null;
    precision_top20: number | null;
  };
  recommendations: Record<"High" | "Medium" | "Low", string>;
  confidence_intervals: Record<string, unknown>;
  comparison_table: ModelComparisonRow[];
  oracle_auc: number | null;
  base_rate: number | null;
  split: { train: number; val: number; test: number } | null;
  top_shap: Record<string, number>;
  optuna_best: Record<string, number> | null;
  features: { numeric: string[]; categorical: Record<string, string[]> };
  data_source: string | null;
  n_rows: number | null;
  date_range: { start?: string; end?: string };
  created_at: string | null;
  limitation: string;
  data_sources?: Record<string, number>;
};

export type DataSourceInfo = {
  counts: Record<string, number>;
  total: number;
  synthetic: number;
  is_synthetic: boolean;
  synthetic_share: number;
};

export type WaitlistAssignResult = WaitlistEntry & {
  appointment_id: string;
  appointment_day: string;
  booked_doctor: string;
  start_time: string;
  token: number | null;
};
