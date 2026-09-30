import uuid
from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, Field


class PatientCreate(BaseModel):
    full_name: str
    date_of_birth: date
    uhid: str | None = None
    gender: str | None = None
    phone: str | None = None
    email: str | None = None
    city: str | None = None
    distance_km: float | None = None
    scholarship: bool = False
    hypertension: bool = False
    diabetes: bool = False
    alcoholism: bool = False
    handicap: int = 0


class PatientOut(PatientCreate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime


class AppointmentCreate(BaseModel):
    patient_id: uuid.UUID
    scheduled_day: date
    appointment_day: date
    department: str | None = None
    doctor_name: str | None = "Dr. Rohan Perera"
    booking_channel: str | None = "Doc990"
    payment_mode: str | None = "Credit Card (NSR Protected)"
    scheduled_time: str | None = "17:30"
    queue_number: int | None = 1
    ai_action_status: str | None = "Pending"
    sms_received: bool = False


class AppointmentOut(AppointmentCreate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: str
    no_show: bool | None
    created_at: datetime


class AppointmentOutcomeUpdate(BaseModel):
    no_show: bool


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


# ===================================
# SHAI Enterprise Modules Schemas
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
    language: str = "en"  # "en", "si", "ta"


class AgentSimulateResponse(BaseModel):
    appointment_id: uuid.UUID
    intent: str  # "confirm", "reschedule", "telehealth", "cancel", "prep_inquiry"
    agent_response: str
    language: str
    suggested_action: str
    status_updated: str


class OutreachDraftRequest(BaseModel):
    appointment_id: uuid.UUID
    language: str = "en"  # "en", "si", "ta"


class OutreachDraftResponse(BaseModel):
    appointment_id: uuid.UUID
    language: str
    message: str
    source: str  # "gemini" | "template"
    reasons: list[str]  # coarse reason categories behind the tailoring
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
    doctor_name: str
    specialty: str
    room_number: str
    total_booked: int
    predicted_no_shows: int
    high_risk_slots: int
    recommended_overbook_count: int
    expected_revenue_gain_lkr: float
    expected_wait_time_mins: float
    risk_level: str  # "Safe", "Moderate", "Caution"
    status_advice: str


class CapacityOptimizeResponse(BaseModel):
    session_date: date
    total_capacity: int
    total_booked: int
    total_predicted_no_shows: int
    total_recommended_overbooks: int
    estimated_revenue_recovery_lkr: float
    sessions: list[SessionOptimizationDetail]


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

