import re
import uuid
from datetime import date, datetime, time
from typing import Any
from pydantic import BaseModel, ConfigDict, Field, field_validator


# ===================================
# Canonical Value Helpers & Enums
# ===================================

CANONICAL_CHANNELS = {"Phone", "Counter", "Doc990", "eChannelling", "MyHealth"}
CANONICAL_PAYMENTS = {"Cash", "Card", "Prepaid_Online", "Corporate", "Insurance"}

CHANNEL_MAP = {
    "phone": "Phone",
    "counter": "Counter",
    "hospital counter": "Counter",
    "hospital counter walk-in": "Counter",
    "counter walk-in": "Counter",
    "walk-in": "Counter",
    "doc990": "Doc990",
    "doc 990": "Doc990",
    "echannelling": "eChannelling",
    "e-channelling": "eChannelling",
    "myhealth": "MyHealth",
    "asiri myhealth": "MyHealth",
}

PAYMENT_MAP = {
    "cash": "Cash",
    "cash at counter": "Cash",
    "card": "Card",
    "credit card": "Card",
    "debit card": "Card",
    "credit card (nsr protected)": "Card",
    "prepaid_online": "Prepaid_Online",
    "prepaid online": "Prepaid_Online",
    "online": "Prepaid_Online",
    "corporate": "Corporate",
    "corporate billing": "Corporate",
    "insurance": "Insurance",
    "insurance guarantee": "Insurance",
}


def normalise_channel(val: str | None) -> str | None:
    if not val:
        return None
    val_clean = val.strip().lower()
    return CHANNEL_MAP.get(val_clean, val.strip())


def normalise_payment(val: str | None) -> str | None:
    if not val:
        return None
    val_clean = val.strip().lower()
    return PAYMENT_MAP.get(val_clean, val.strip())


# ===================================
# Patient Schemas
# ===================================

class PatientCreate(BaseModel):
    full_name: str
    date_of_birth: date
    # UHID is strictly server-generated. Never accepted from client.
    gender: str | None = None
    phone: str | None = None
    email: str | None = None
    city: str | None = None
    district: str | None = None
    address_line: str | None = None
    location_id: int | None = None
    distance_km: float | None = None
    distance_source: str | None = None  # road_osrm, estimated, manual
    latitude: float | None = None
    longitude: float | None = None
    preferred_language: str = "en"  # en, si, ta
    nic: str | None = None
    scholarship: bool = False
    hypertension: bool = False
    diabetes: bool = False
    alcoholism: bool = False
    handicap: int = 0


class PatientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    uhid: str
    full_name: str
    date_of_birth: date
    gender: str | None = None
    phone: str | None = None
    email: str | None = None
    city: str | None = None
    district: str | None = None
    address_line: str | None = None
    location_id: int | None = None
    distance_km: float | None = None
    distance_source: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    preferred_language: str = "en"
    his_patient_ref: str | None = None
    nic: str | None = None
    scholarship: bool = False
    hypertension: bool = False
    diabetes: bool = False
    alcoholism: bool = False
    handicap: int = 0
    created_at: datetime


# ===================================
# Reference Data Schemas
# ===================================

class DepartmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    model_category: str | None = None
    icon: str = "stethoscope"
    telehealth_ok: bool = False
    active: bool = True
    doctor_count: int = 0


class ClinicSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    doctor_id: uuid.UUID
    weekday: int
    label: str
    start_time: time
    end_time: time
    room: str
    max_patients: int = 25
    slot_minutes: int = 12
    active: bool = True


class DoctorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str = "Dr."
    full_name: str
    display_name: str = ""
    department_id: int
    department: DepartmentOut | None = None
    default_room: str | None = None
    active: bool = True
    needs_review: bool = False
    sessions: list[ClinicSessionOut] = []
    next_clinic_date: date | None = None


class AvailabilitySession(BaseModel):
    session_id: uuid.UUID
    label: str
    start_time: str
    end_time: str
    room: str
    max_patients: int
    booked: int
    remaining: int
    next_token: int


class AvailabilityDay(BaseModel):
    date: date
    sessions: list[AvailabilitySession]


class AvailabilityResponse(BaseModel):
    days: list[AvailabilityDay]


class LocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    district: str | None = None
    province: str | None = None
    kind: str = "town"
    latitude: float
    longitude: float
    population: int | None = None
    label: str = ""


class DistanceRequest(BaseModel):
    latitude: float
    longitude: float


class DistanceResponse(BaseModel):
    distance_km: float
    source: str  # road_osrm | estimated | manual


# ===================================
# Appointment Schemas
# ===================================

class AppointmentCreate(BaseModel):
    patient_id: uuid.UUID
    scheduled_day: date
    appointment_day: date
    department: str | None = None
    doctor_id: uuid.UUID | None = None
    clinic_session_id: uuid.UUID | None = None
    doctor_name: str | None = None  # No default, filled from doctor row if present
    booking_channel: str | None = None  # No fake default
    payment_mode: str | None = None  # No fake default
    scheduled_time: str | None = None  # No fake default
    queue_number: int | None = None  # No fake default
    ai_action_status: str | None = "Pending"
    sms_reminder_opt_in: bool = False
    sms_received: bool = False
    booking_notes: str | None = None
    source: str = "manual"

    @field_validator("booking_channel", mode="before")
    @classmethod
    def validate_channel(cls, v: Any) -> Any:
        if isinstance(v, str):
            norm = normalise_channel(v)
            return norm
        return v

    @field_validator("payment_mode", mode="before")
    @classmethod
    def validate_payment(cls, v: Any) -> Any:
        if isinstance(v, str):
            norm = normalise_payment(v)
            return norm
        return v


class AppointmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    patient_id: uuid.UUID
    scheduled_day: date
    appointment_day: date
    department: str | None = None
    doctor_id: uuid.UUID | None = None
    clinic_session_id: uuid.UUID | None = None
    doctor_name: str | None = None
    source: str = "manual"
    external_ref: str | None = None
    his_synced_at: datetime | None = None
    booked_by: str | None = None
    booking_notes: str | None = None
    booking_channel: str | None = None
    payment_mode: str | None = None
    scheduled_time: str | None = None
    queue_number: int | None = None
    ai_action_status: str | None = None
    sms_reminder_opt_in: bool = False
    sms_received: bool = False
    reminder_sent_at: datetime | None = None
    status: str = "scheduled"
    cancelled_at: datetime | None = None
    cancel_reason: str | None = None
    late_cancel: bool = False
    rescheduled_from_id: uuid.UUID | None = None
    checked_in_at: datetime | None = None
    no_show: bool | None = None
    no_show_reason: str | None = None
    outcome_recorded_at: datetime | None = None
    outcome_recorded_by: str | None = None
    outcome_source: str | None = None
    created_at: datetime


class AppointmentOutcomeUpdate(BaseModel):
    no_show: bool | None = None  # None allows undo
    reason: str | None = None
    note: str | None = None
    cancelled: bool = False


# ===================================
# Intake & Preview Schemas
# ===================================

class IntakeRequest(BaseModel):
    patient_id: uuid.UUID | None = None
    patient: PatientCreate | None = None
    doctor_id: uuid.UUID
    clinic_session_id: uuid.UUID | None = None
    appointment_day: date
    booking_channel: str = "Phone"
    payment_mode: str = "Cash"
    sms_reminder_opt_in: bool = False
    notes: str | None = None

    @field_validator("booking_channel", mode="before")
    @classmethod
    def val_chan(cls, v: Any) -> Any:
        return normalise_channel(v) or "Phone"

    @field_validator("payment_mode", mode="before")
    @classmethod
    def val_pay(cls, v: Any) -> Any:
        return normalise_payment(v) or "Cash"


class IntakeSlotOut(BaseModel):
    doctor: str
    date: date
    start_time: str
    room: str
    token: int


class FeatureContribution(BaseModel):
    feature: str
    contribution: float
    value: float


class ContextualAdjustment(BaseModel):
    ml_risk_score: float
    distance_km: float | None = None
    distance_multiplier: float
    booking_channel: str | None = None
    channel_multiplier: float
    payment_mode: str | None = None
    payment_multiplier: float
    combined_multiplier: float
    final_risk_score: float
    method: str
    note: str


class PredictionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    appointment_id: uuid.UUID
    risk_score: float
    risk_category: str
    explanation: list[FeatureContribution]
    contextual_adjustment: ContextualAdjustment | None = None
    recommendation: str
    created_at: datetime


class IntakeResponse(BaseModel):
    patient: PatientOut
    appointment: AppointmentOut
    prediction: PredictionOut | None = None
    slot: IntakeSlotOut


class AppointmentOverviewRow(BaseModel):
    """An appointment joined with its patient and stored prediction (one round trip)."""
    appointment: AppointmentOut
    patient: PatientOut | None = None
    prediction: PredictionOut | None = None


# ===================================
# Detail, Timeline & Event Schemas
# ===================================

class AppointmentEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    appointment_id: uuid.UUID
    event_type: str
    from_status: str | None = None
    to_status: str | None = None
    actor: str | None = None
    note: str | None = None
    payload: dict = {}
    created_at: datetime


class AppointmentDetailOut(BaseModel):
    appointment: AppointmentOut
    patient: PatientOut
    doctor: DoctorOut | None = None
    prediction: PredictionOut | None = None
    events: list[AppointmentEventOut] = []
    history: dict = {}  # visit_count, prior_no_shows, last_visit


class AppointmentActionRequest(BaseModel):
    type: str  # call, sms, whatsapp, telehealth, waitlist, note
    outcome: str | None = None
    note: str | None = None


# ===================================
# HIS & Hub Schemas
# ===================================

class HISHealth(BaseModel):
    ok: bool
    mode: str  # simulated | http
    latency_ms: int
    detail: str = ""


class HISStatusOut(BaseModel):
    mode: str
    ok: bool
    latency_ms: int
    last_sync: dict | None = None


class HISSyncRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    target_date: date
    trigger: str
    status: str
    fetched: int
    created: int
    updated: int
    unchanged: int
    failed: int
    error: str | None = None
    triggered_by: str | None = None
    started_at: datetime
    finished_at: datetime | None = None


class PredictionRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    run_date: date
    doctor_id: uuid.UUID | None = None
    status: str
    stage: str
    with_sync: bool
    total: int
    scored: int
    failed: int
    high: int
    medium: int
    low: int
    expected_no_shows: float | None = None
    model_version: str | None = None
    error: str | None = None
    triggered_by: str | None = None
    started_at: datetime
    finished_at: datetime | None = None


class HubSummary(BaseModel):
    total: int
    scored: int
    high: int
    medium: int
    low: int
    expected_no_shows: float | None = None
    unscored: int


class HubDoctorSessionCapacity(BaseModel):
    booked: int
    max: int


class HubDoctorCard(BaseModel):
    doctor: DoctorOut
    session: ClinicSessionOut | None = None
    capacity: HubDoctorSessionCapacity
    distribution: dict  # high, medium, low, unscored
    appointments: list[dict]


class HubTodayResponse(BaseModel):
    date: date
    summary: HubSummary
    doctors: list[HubDoctorCard] = []
    table: list[dict] = []
    total_pages: int = 1
    page: int = 1


class NavCountsOut(BaseModel):
    waitlist_waiting: int
    high_risk_open: int
    unscored_today: int


# ===================================
# SHAI Enterprise Modules Schemas (Legacy Support)
# ===================================

class DoctorSessionCreate(BaseModel):
    doctor_name: str
    specialty: str
    room_number: str = "Room 204"
    session_date: date
    scheduled_start_time: str = "17:00"
    status: str = "on_time"
    delay_minutes: int = 0
    avg_consultation_mins: int = 12
    max_capacity: int = 25


class DoctorSessionOut(DoctorSessionCreate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime


class DoctorSessionDelayUpdate(BaseModel):
    delay_minutes: int
    status: str = "delayed"


class InterventionCreate(BaseModel):
    appointment_id: uuid.UUID
    channel: str = "WhatsApp"
    language: str = "en"
    status: str = "sent"
    patient_reply: str | None = None
    intent_detected: str | None = None
    offered_slot: str | None = None


class InterventionOut(InterventionCreate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime


class AgentSimulateRequest(BaseModel):
    appointment_id: uuid.UUID
    patient_message: str
    language: str = "en"


class AgentSimulateResponse(BaseModel):
    appointment_id: uuid.UUID
    intent: str
    agent_response: str
    language: str
    suggested_action: str
    action_executed: str | None = None
    status_updated: str


class OutreachDraftRequest(BaseModel):
    appointment_id: uuid.UUID
    language: str = "en"


class OutreachDraftResponse(BaseModel):
    appointment_id: uuid.UUID
    language: str
    message: str
    source: str
    reasons: list[str]
    model: str | None = None


class WaitlistCreate(BaseModel):
    patient_name: str
    patient_phone: str
    specialty: str
    doctor_name: str
    urgency_level: str = "Normal"
    preferred_days: str = "Any weekday evening"


class WaitlistOut(WaitlistCreate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: str
    created_at: datetime


class CapacityOptimizeRequest(BaseModel):
    session_date: date | None = None
    target_doctor: str | None = None
    max_wait_time_tolerance_mins: int = 15


class SessionOptimizationDetail(BaseModel):
    doctor_id: uuid.UUID | None = None
    doctor_name: str
    specialty: str
    room_number: str
    max_capacity: int = 25
    total_booked: int
    predicted_no_shows: int
    expected_no_shows_float: float = 0.0
    interval_low: float = 0.0
    interval_high: float = 0.0
    high_risk_slots: int
    recommended_overbook_count: int
    expected_revenue_gain_lkr: float
    expected_wait_time_mins: float
    linear_fallback_wait_mins: float = 0.0
    booked_utilisation_pct: float = 0.0
    expected_attendance_pct: float = 0.0
    consultation_fee_lkr: float = 4500.0
    delay_minutes: int = 0
    effective_tolerance_mins: int = 15
    p_overcrowding: float = 0.0
    risk_level: str
    status_advice: str


class DepartmentCapacitySummary(BaseModel):
    department: str
    total_capacity: int
    total_booked: int
    expected_no_shows: float
    recommended_overbook: int
    interval_low: float
    interval_high: float


class CapacityOptimizeResponse(BaseModel):
    session_date: date
    total_capacity: int
    total_booked: int
    total_predicted_no_shows: int
    expected_no_shows_total: float = 0.0
    expected_no_shows_interval_low: float = 0.0
    expected_no_shows_interval_high: float = 0.0
    total_recommended_overbooks: int
    estimated_revenue_recovery_lkr: float
    booked_utilisation_pct: float = 0.0
    expected_attendance_pct: float = 0.0
    sessions: list[SessionOptimizationDetail]
    departments: list[DepartmentCapacitySummary] = []


# ===================================
# Capacity v2 New Feature Schemas
# ===================================

class CapacitySettingOut(BaseModel):
    id: uuid.UUID
    scope: str
    department_id: int | None = None
    doctor_id: uuid.UUID | None = None
    safety_factor: float
    max_overbook_per_slot: int
    max_overbook_per_session: int
    wait_tolerance_mins: int
    consultation_fee_lkr: float
    badge_safe_mins: int
    badge_moderate_mins: int
    auto_assign_waitlist: bool
    sim_runs: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CapacitySettingUpdate(BaseModel):
    safety_factor: float | None = None
    max_overbook_per_slot: int | None = None
    max_overbook_per_session: int | None = None
    wait_tolerance_mins: int | None = None
    consultation_fee_lkr: float | None = None
    badge_safe_mins: int | None = None
    badge_moderate_mins: int | None = None
    auto_assign_waitlist: bool | None = None
    sim_runs: int | None = None


class SlotPatientOut(BaseModel):
    appointment_id: uuid.UUID
    patient_id: uuid.UUID
    uhid: str
    patient_name: str
    gender: str | None = None
    age: int | None = None
    phone: str | None = None
    city: str | None = None
    distance_km: float | None = None
    risk_score: float
    risk_category: str
    status: str
    sms_received: bool = False
    factors: list[str] = []


class SlotDetailOut(BaseModel):
    slot_time: str
    booked_count: int
    expected_no_shows: float
    recommended_overbook: int
    heat_color: str  # green, amber, red, grey
    simulated_wait_mins: float = 0.0
    patients: list[SlotPatientOut] = []


class DoctorSlotsOut(BaseModel):
    doctor_id: uuid.UUID
    doctor_name: str
    specialty: str
    room_number: str
    delay_minutes: int
    delay_status: str
    total_booked: int
    total_recommended_overbook: int
    slots: list[SlotDetailOut]


class CapacitySlotsResponse(BaseModel):
    date: date
    doctors: list[DoctorSlotsOut]


class WhatIfRequest(BaseModel):
    target_date: date | None = None
    doctor_id: uuid.UUID | None = None
    department_id: int | None = None
    max_wait_time_tolerance_mins: int = 15
    safety_factor: float = 0.75
    max_overbook_per_slot: int = 2
    consultation_fee_lkr: float = 4500.0
    assume_doctor_delay_mins: int = 0


class WhatIfPolicyStats(BaseModel):
    recommended_overbook: int
    expected_wait_mins: float
    p_overcrowding: float
    expected_filled_gaps: float
    expected_revenue_lkr: float


class WhatIfResponse(BaseModel):
    current_policy: WhatIfPolicyStats
    what_if_policy: WhatIfPolicyStats
    delta_overbook: int
    delta_wait_mins: float
    delta_revenue_lkr: float
    wait_histogram: list[int]
    trade_off_curve: list[dict]


class CapacityScenarioCreate(BaseModel):
    name: str
    params: dict
    results: dict


class CapacityScenarioOut(BaseModel):
    id: uuid.UUID
    name: str
    params: dict
    results: dict
    created_by: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CandidateScoreBreakdown(BaseModel):
    specialty_doctor_match: float
    attendance_reliability: float
    waiting_time_priority: float
    clinical_urgency: float
    travel_proximity: float
    days_waiting: float
    predicted_no_show_prob: float


class SlotOfferOut(BaseModel):
    id: uuid.UUID
    doctor_id: uuid.UUID
    doctor_name: str
    specialty: str
    room: str
    slot_time: str
    slot_date: date
    freed_reason: str
    waitlist_entry_id: uuid.UUID
    candidate_patient_name: str
    candidate_patient_phone: str
    candidate_uhid: str | None = None
    match_score: float
    score_breakdown: CandidateScoreBreakdown
    status: str
    acted_by: str | None = None
    acted_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SlotOfferActionRequest(BaseModel):
    action: str  # approve, decline, undo


class ForecastDayOut(BaseModel):
    date: date
    total_projected_booked: int
    expected_no_shows: float
    interval_low: float
    interval_high: float
    bufferable_overbooks: int
    revenue_at_risk_lkr: float
    recoverable_revenue_lkr: float


class ForecastResponse(BaseModel):
    horizon_days: int
    summary: dict
    days: list[ForecastDayOut]
    departments: list[dict]


class AccuracyDecile(BaseModel):
    decile: int
    mean_predicted_prob: float
    observed_no_show_rate: float
    count: int


class AccuracyResponse(BaseModel):
    brier_score: float
    roc_auc: float
    gap_absorption_rate: float
    overbook_regret_rate: float
    total_evaluated_appointments: int
    confusion_matrix: dict
    calibration_deciles: list[AccuracyDecile]
    overbook_outcome_mix: dict
    daily_accuracy_trend: list[dict]



class SimulatorEvaluateRequest(BaseModel):
    daily_clinics_count: int = Field(30, ge=1, le=150)
    avg_consultation_fee_lkr: float = Field(4500.0, ge=1000.0, le=30000.0)
    baseline_no_show_rate: float = Field(0.18, ge=0.01, le=0.60)
    ai_intervention_coverage: float = Field(0.25, ge=0.05, le=1.0)
    patient_reachability_rate: float = Field(0.85, ge=0.50, le=1.0)
    reschedule_success_rate: float = Field(0.65, ge=0.20, le=1.0)
    overbooking_fill_rate: float = Field(0.70, ge=0.20, le=1.0)


class SimulatorEvaluateResponse(BaseModel):
    daily_slots_at_risk: float
    annual_revenue_leakage_lkr: float
    annual_revenue_recovered_lkr: float
    recovered_doctor_hours_annual: float
    nurse_phone_hours_saved_monthly: float
    net_roi_multiple: float
