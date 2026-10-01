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
  doctor_name: string;
  specialty: string;
  room_number: string;
  total_booked: number;
  predicted_no_shows: number;
  high_risk_slots: number;
  recommended_overbook_count: number;
  expected_revenue_gain_lkr: number;
  expected_wait_time_mins: number;
  risk_level: "Safe" | "Moderate" | "Caution";
  status_advice: string;
};

export type CapacityOptimizeResult = {
  session_date: string;
  total_capacity: number;
  total_booked: number;
  total_predicted_no_shows: number;
  total_recommended_overbooks: number;
  estimated_revenue_recovery_lkr: number;
  sessions: SessionOptimizationDetail[];
};

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
