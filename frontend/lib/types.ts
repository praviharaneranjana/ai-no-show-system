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
  scholarship: boolean;
  hypertension: boolean;
  diabetes: boolean;
  alcoholism: boolean;
  handicap: number;
  created_at: string;
};

export type PatientInput = Omit<Patient, "id" | "created_at" | "uhid" | "city" | "distance_km"> & {
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
