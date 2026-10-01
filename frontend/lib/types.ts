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
  session_id?: string;
  doctor_name: string;
  specialty: string;
  room_number: string;
  max_capacity?: number;
  capacity?: number;
  total_booked: number;
  predicted_no_shows: number;
  expected_no_shows_float?: number;
  interval_low?: number;
  interval_high?: number;
  expected_no_shows_range?: [number, number];
  high_risk_slots: number;
  recommended_overbook_count: number;
  expected_revenue_gain_lkr: number;
  expected_wait_time_mins: number;
  linear_fallback_wait_mins?: number;
  booked_utilisation_pct?: number;
  utilization_pct?: number;
  expected_attendance_pct?: number;
  consultation_fee_lkr?: number;
  delay_minutes?: number;
  effective_tolerance_mins?: number;
  effective_wait_tolerance_mins?: number;
  p_overcrowding?: number;
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
  date?: string;
  session_date?: string;
  total_capacity: number;
  total_booked: number;
  total_predicted_no_shows: number;
  expected_no_shows_total?: number;
  expected_no_shows_interval_low?: number;
  expected_no_shows_interval_high?: number;
  expected_no_shows_range?: [number, number];
  total_recommended_overbooks: number;
  estimated_revenue_recovery_lkr: number;
  booked_utilisation_pct?: number;
  overall_utilization_pct?: number;
  expected_attendance_pct?: number;
  sessions: SessionOptimizationDetail[];
  departments?: DepartmentCapacitySummary[];
  department_breakdown?: DepartmentCapacitySummary[];
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
  doctor_id: string;
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
  total_overbooks?: number;
  recommended_overbook?: number;
  expected_wait_mins: number;
  p_overcrowding?: number;
  risk_of_overcrowding_pct?: number;
  expected_filled_gaps?: number;
  expected_revenue_lkr: number;
};

export type WhatIfMetrics = WhatIfPolicyStats;

export type WhatIfRequest = {
  date?: string;
  department?: string;
  doctor_id?: string;
  wait_tolerance_mins?: number;
  safety_factor?: number;
  max_overbook_per_slot?: number;
  consultation_fee_lkr?: number;
  assumed_delay_mins?: number;
};

export type WhatIfResponse = {
  baseline?: WhatIfMetrics;
  scenario?: WhatIfMetrics;
  current_policy?: WhatIfPolicyStats;
  what_if_policy?: WhatIfPolicyStats;
  delta_overbook?: number;
  delta_wait_mins?: number;
  delta_revenue_lkr?: number;
  delta?: {
    extra_patients: number;
    expected_wait_mins_diff: number;
    expected_revenue_lkr_diff: number;
    risk_of_overcrowding_pct_diff: number;
  };
  wait_histogram?: number[];
  simulated_wait_distribution?: Array<{ wait_bin: string; frequency: number }>;
  trade_off_curve: Array<{
    overbook?: number;
    overbook_count?: number;
    mean_wait?: number;
    expected_wait_mins?: number;
    p_overcrowd?: number;
    overcrowding_risk_pct?: number;
    filled_gaps?: number;
    expected_revenue_lkr?: number;
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

export type AccuracyResponse = {
  days?: number;
  sample_size?: number;
  brier_score: number;
  roc_auc?: number;
  calibration_slope?: number;
  gap_absorption_rate?: number;
  overbook_regret_rate?: number;
  overbook_regret_rate_pct?: number;
  absorbed_by_no_shows_pct?: number;
  total_evaluated_appointments?: number;
  precision_high_risk?: number;
  recall_high_risk?: number;
  confusion_matrix: {
    true_negative_attended?: number;
    true_negative?: number;
    false_positive: number;
    false_negative_noshow?: number;
    false_negative?: number;
    true_positive_noshow?: number;
    true_positive?: number;
    precision_high_risk?: number;
    recall_high_risk?: number;
  };
  calibration_curve?: AccuracyDecile[];
  calibration_deciles?: AccuracyDecile[];
  overbook_outcome_mix?: {
    absorbed_by_noshow_pct: number;
    concurrent_ontime_consultation_pct: number;
    waited_over_tolerance_regret_pct: number;
    unused_buffer_pct: number;
  };
  daily_accuracy?: Array<{
    date: string;
    predicted_no_shows: number;
    actual_no_shows: number;
    absorbed_overbooks: number;
    regret_count: number;
  }>;
  daily_accuracy_trend?: Array<{ day: string; predicted: number; actual: number; brier: number }>;
  department_brier?: Array<{
    department: string;
    brier_score: number;
    sample_size: number;
  }>;
};

export type CapacitySetting = {
  id?: string;
  scope: string;
  department_id?: number | null;
  doctor_id?: string | null;
  safety_factor: number;
  max_overbook_per_slot: number;
  max_overbook_per_session: number;
  wait_tolerance_mins: number;
  consultation_fee_lkr: number;
  badge_safe_mins?: number;
  badge_safe_wait_mins?: number;
  badge_moderate_mins?: number;
  badge_moderate_wait_mins?: number;
  auto_assign_waitlist: boolean;
  auto_assign_time_window_mins?: number;
  sim_runs?: number;
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

export type SimulatorParams = {
  daily_clinics_count: number;
  avg_consultation_fee_lkr: number;
  baseline_no_show_rate: number;
  ai_intervention_coverage: number;
  patient_reachability_rate: number;
  reschedule_success_rate: number;
  overbooking_fill_rate: number;
};

export type SimulatorResult = {
  daily_slots_at_risk: number;
  annual_revenue_leakage_lkr: number;
  annual_revenue_recovered_lkr: number;
  recovered_doctor_hours_annual: number;
  nurse_phone_hours_saved_monthly: number;
  net_roi_multiple: number;
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
