import uuid
from datetime import date, datetime, time

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, Numeric, SmallInteger, String, Text, Time, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


# ===================================
# Multi-Hospital Tenancy & Storage Models
# ===================================

class Hospital(Base):
    __tablename__ = "hospitals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    short_name: Mapped[str] = mapped_column(String, nullable=False)
    legal_name: Mapped[str | None] = mapped_column(String, nullable=True)
    logo_file_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String, nullable=True)
    brand_color: Mapped[str] = mapped_column(String, nullable=False, default="#8B7CF6")
    established_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    hospital_type: Mapped[str] = mapped_column(String, nullable=False, default="private")
    registration_number: Mapped[str | None] = mapped_column(String, nullable=True)
    bed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    address_line1: Mapped[str | None] = mapped_column(String, nullable=True)
    address_line2: Mapped[str | None] = mapped_column(String, nullable=True)
    city: Mapped[str] = mapped_column(String, nullable=False, default="Colombo")
    district: Mapped[str] = mapped_column(String, nullable=False, default="Colombo")
    province: Mapped[str] = mapped_column(String, nullable=False, default="Western")
    postal_code: Mapped[str] = mapped_column(String, nullable=False, default="01000")
    country: Mapped[str] = mapped_column(String, nullable=False, default="Sri Lanka")
    latitude: Mapped[float] = mapped_column(Float, nullable=False, default=6.9271)
    longitude: Mapped[float] = mapped_column(Float, nullable=False, default=79.8612)
    timezone: Mapped[str] = mapped_column(String, nullable=False, default="Asia/Colombo")
    currency: Mapped[str] = mapped_column(String, nullable=False, default="LKR")
    website: Mapped[str | None] = mapped_column(String, nullable=True)
    main_phone: Mapped[str | None] = mapped_column(String, nullable=True)
    main_email: Mapped[str | None] = mapped_column(String, nullable=True)
    emergency_phone: Mapped[str | None] = mapped_column(String, nullable=True)
    about: Mapped[str | None] = mapped_column(Text, nullable=True)
    accreditations: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    go_live_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    domains: Mapped[list["HospitalEmailDomain"]] = relationship(back_populates="hospital", cascade="all, delete-orphan")
    memberships: Mapped[list["HospitalMembership"]] = relationship(back_populates="hospital", cascade="all, delete-orphan")
    management_members: Mapped[list["HospitalManagementMember"]] = relationship(back_populates="hospital", cascade="all, delete-orphan")
    contacts: Mapped[list["HospitalContact"]] = relationship(back_populates="hospital", cascade="all, delete-orphan")
    partners: Mapped[list["HospitalPartner"]] = relationship(back_populates="hospital", cascade="all, delete-orphan")


class StoredFile(Base):
    __tablename__ = "stored_files"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=True)
    kind: Mapped[str] = mapped_column(String, nullable=False, default="image")
    content_type: Mapped[str] = mapped_column(String, nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String, nullable=False)
    storage_path: Mapped[str] = mapped_column(String, nullable=False)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class HospitalEmailDomain(Base):
    __tablename__ = "hospital_email_domains"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=False, index=True)
    domain: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    hospital: Mapped["Hospital"] = relationship(back_populates="domains")


class HospitalMembership(Base):
    __tablename__ = "hospital_memberships"
    __table_args__ = (
        UniqueConstraint("user_id", "hospital_id", name="uq_user_hospital_membership"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    hospital_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String, nullable=False, default="front_desk")
    status: Mapped[str] = mapped_column(String, nullable=False, default="active", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    job_title: Mapped[str | None] = mapped_column(String, nullable=True)
    department_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    employee_code: Mapped[str | None] = mapped_column(String, nullable=True)
    invited_or_requested_role: Mapped[str | None] = mapped_column(String, nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    hospital: Mapped["Hospital"] = relationship(back_populates="memberships")
    user: Mapped["User"] = relationship(back_populates="memberships", foreign_keys=[user_id])


class StaffInvitation(Base):
    __tablename__ = "staff_invitations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String, index=True, nullable=False)
    hospital_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String, nullable=False)
    invited_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    token_hash: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    hospital: Mapped["Hospital"] = relationship()


class HospitalManagementMember(Base):
    __tablename__ = "hospital_management_members"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    position: Mapped[str] = mapped_column(String, nullable=False)
    photo_file_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    hospital: Mapped["Hospital"] = relationship(back_populates="management_members")


class HospitalContact(Base):
    __tablename__ = "hospital_contacts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    hospital: Mapped["Hospital"] = relationship(back_populates="contacts")


class HospitalPartner(Base):
    __tablename__ = "hospital_partners"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    kind: Mapped[str] = mapped_column(String, nullable=False)
    logo_file_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    website: Mapped[str | None] = mapped_column(String, nullable=True)
    since_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_official: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    hospital: Mapped["Hospital"] = relationship(back_populates="partners")


class HospitalAuditLog(Base):
    __tablename__ = "hospital_audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String, nullable=False)
    entity_type: Mapped[str] = mapped_column(String, nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String, nullable=True)
    details: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    ip_address: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())



# ===================================
# Reference Data Models
# ===================================

class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    hospital_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    model_category: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon: Mapped[str] = mapped_column(Text, nullable=False, default="stethoscope")
    telehealth_ok: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    default_consultation_fee_lkr: Mapped[float] = mapped_column(Float, nullable=False, default=4500.0)
    doctors: Mapped[list["Doctor"]] = relationship(back_populates="department")


class Doctor(Base):
    __tablename__ = "doctors"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(Text, nullable=False, default="Dr.")
    full_name: Mapped[str] = mapped_column(Text, nullable=False)
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"), nullable=False)
    his_doctor_code: Mapped[str | None] = mapped_column(Text, unique=True, nullable=True)
    default_room: Mapped[str | None] = mapped_column(Text, nullable=True)
    consultation_fee_lkr: Mapped[float] = mapped_column(Float, nullable=False, default=4500.0)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    needs_review: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    department: Mapped["Department"] = relationship(back_populates="doctors")
    sessions: Mapped[list["DoctorClinicSession"]] = relationship(back_populates="doctor", cascade="all, delete-orphan")
    appointments: Mapped[list["Appointment"]] = relationship(back_populates="doctor")


class DoctorClinicSession(Base):
    __tablename__ = "doctor_clinic_sessions"
    __table_args__ = (
        UniqueConstraint("doctor_id", "weekday", "label", name="uq_doctor_weekday_label"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=True, index=True)
    doctor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("doctors.id", ondelete="CASCADE"), nullable=False)
    weekday: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 0 = Monday
    label: Mapped[str] = mapped_column(Text, nullable=False)  # Morning, Afternoon, Evening
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    room: Mapped[str] = mapped_column(Text, nullable=False)
    max_patients: Mapped[int] = mapped_column(Integer, nullable=False, default=25)
    slot_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=12)
    delay_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    delay_status: Mapped[str] = mapped_column(Text, nullable=False, default="on_time")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    doctor: Mapped["Doctor"] = relationship(back_populates="sessions")
    appointments: Mapped[list["Appointment"]] = relationship(back_populates="clinic_session")


class Location(Base):
    __tablename__ = "locations"
    __table_args__ = (
        UniqueConstraint("name_norm", "district", name="uq_locations_norm_district"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    name_norm: Mapped[str] = mapped_column(Text, nullable=False)
    district: Mapped[str | None] = mapped_column(Text, nullable=True)
    province: Mapped[str | None] = mapped_column(Text, nullable=True)
    kind: Mapped[str] = mapped_column(Text, nullable=False, default="town")
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    population: Mapped[int | None] = mapped_column(Integer, nullable=True)
    aliases: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list)
    source: Mapped[str] = mapped_column(Text, nullable=False, default="geonames")

    patients: Mapped[list["Patient"]] = relationship(back_populates="location")


# ===================================
# Core Patient & Appointment Models
# ===================================

class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=True, index=True)
    uhid: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    date_of_birth: Mapped[date] = mapped_column(Date, nullable=False)
    gender: Mapped[str | None] = mapped_column(String)
    phone: Mapped[str | None] = mapped_column(String)
    email: Mapped[str | None] = mapped_column(String)
    city: Mapped[str | None] = mapped_column(String, nullable=True)
    district: Mapped[str | None] = mapped_column(Text, nullable=True)
    address_line: Mapped[str | None] = mapped_column(Text, nullable=True)
    location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"), nullable=True)
    distance_km: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    distance_source: Mapped[str | None] = mapped_column(Text, nullable=True)  # road_osrm, estimated, manual
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    preferred_language: Mapped[str] = mapped_column(Text, nullable=False, default="en")  # en, si, ta
    his_patient_ref: Mapped[str | None] = mapped_column(Text, unique=True, nullable=True)
    nic: Mapped[str | None] = mapped_column(Text, nullable=True)
    scholarship: Mapped[bool] = mapped_column(Boolean, default=False)
    hypertension: Mapped[bool] = mapped_column(Boolean, default=False)
    diabetes: Mapped[bool] = mapped_column(Boolean, default=False)
    alcoholism: Mapped[bool] = mapped_column(Boolean, default=False)
    handicap: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    appointments: Mapped[list["Appointment"]] = relationship(back_populates="patient")
    location: Mapped["Location | None"] = relationship(back_populates="patients")


class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=True, index=True)
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patients.id"), nullable=False)
    scheduled_day: Mapped[date] = mapped_column(Date, nullable=False)
    appointment_day: Mapped[date] = mapped_column(Date, nullable=False)
    department: Mapped[str | None] = mapped_column(String)
    doctor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("doctors.id"), nullable=True)
    clinic_session_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("doctor_clinic_sessions.id"), nullable=True)
    doctor_name: Mapped[str | None] = mapped_column(String)  # denormalized display copy
    source: Mapped[str] = mapped_column(Text, nullable=False, default="manual")  # manual, his_sync
    external_ref: Mapped[str | None] = mapped_column(Text, nullable=True)  # his_ref
    his_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    booked_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    booking_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    booking_channel: Mapped[str | None] = mapped_column(String)
    payment_mode: Mapped[str | None] = mapped_column(String)
    scheduled_time: Mapped[str | None] = mapped_column(String)
    slot_start: Mapped[time | None] = mapped_column(Time, nullable=True)
    queue_number: Mapped[int | None] = mapped_column(Integer)
    ai_action_status: Mapped[str | None] = mapped_column(String)
    sms_reminder_opt_in: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sms_received: Mapped[bool] = mapped_column(Boolean, default=False)
    reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String, default="scheduled")  # scheduled, completed, no_show, cancelled
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    late_cancel: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    rescheduled_from_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("appointments.id"), nullable=True)
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    no_show: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    no_show_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    outcome_recorded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    outcome_recorded_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    outcome_source: Mapped[str | None] = mapped_column(Text, nullable=True)  # staff, system, his_sync
    data_source: Mapped[str | None] = mapped_column(Text, nullable=True, index=True)  # synthetic, real
    heavy_rain: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    fee_lkr: Mapped[float | None] = mapped_column(Float, nullable=True)  # fee charged for this visit
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    patient: Mapped["Patient"] = relationship(back_populates="appointments")
    doctor: Mapped["Doctor | None"] = relationship(back_populates="appointments")
    clinic_session: Mapped["DoctorClinicSession | None"] = relationship(back_populates="appointments")
    prediction: Mapped["Prediction"] = relationship(back_populates="appointment", uselist=False)
    interventions: Mapped[list["Intervention"]] = relationship(back_populates="appointment")
    events: Mapped[list["AppointmentEvent"]] = relationship(back_populates="appointment", cascade="all, delete-orphan")
    prediction_logs: Mapped[list["PredictionLog"]] = relationship(back_populates="appointment", cascade="all, delete-orphan")


class Prediction(Base):
    __tablename__ = "predictions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=True, index=True)
    appointment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("appointments.id"), unique=True, nullable=False)
    risk_score: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False)
    risk_category: Mapped[str] = mapped_column(String, nullable=False)
    explanation: Mapped[dict] = mapped_column(JSONB, nullable=False)
    recommendation: Mapped[str] = mapped_column(String, nullable=False)
    model_version: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    appointment: Mapped["Appointment"] = relationship(back_populates="prediction")


# Legacy DoctorSession kept for backward compatibility with existing tests
class DoctorSession(Base):
    __tablename__ = "doctor_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=True, index=True)
    doctor_name: Mapped[str] = mapped_column(String, nullable=False)
    specialty: Mapped[str] = mapped_column(String, nullable=False)
    room_number: Mapped[str] = mapped_column(String, default="Room 204")
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    scheduled_start_time: Mapped[str] = mapped_column(String, default="17:00")
    status: Mapped[str] = mapped_column(String, default="on_time")  # on_time, delayed, in_progress, completed
    delay_minutes: Mapped[int] = mapped_column(Integer, default=0)
    avg_consultation_mins: Mapped[int] = mapped_column(Integer, default=12)
    max_capacity: Mapped[int] = mapped_column(Integer, default=25)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Intervention(Base):
    __tablename__ = "interventions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=True, index=True)
    appointment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("appointments.id"), nullable=False)
    channel: Mapped[str] = mapped_column(String, default="WhatsApp")  # WhatsApp, SMS, IVR_Voice
    language: Mapped[str] = mapped_column(String, default="en")  # en, si, ta
    status: Mapped[str] = mapped_column(String, default="sent")  # sent, confirmed, rescheduled, telehealth_requested
    patient_reply: Mapped[str | None] = mapped_column(String, nullable=True)
    intent_detected: Mapped[str | None] = mapped_column(String, nullable=True)
    offered_slot: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    appointment: Mapped["Appointment"] = relationship(back_populates="interventions")


class WaitlistEntry(Base):
    __tablename__ = "waitlist"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=True, index=True)
    patient_name: Mapped[str] = mapped_column(String, nullable=False)
    patient_phone: Mapped[str] = mapped_column(String, nullable=False)
    specialty: Mapped[str] = mapped_column(String, nullable=False)
    doctor_name: Mapped[str] = mapped_column(String, nullable=False)
    urgency_level: Mapped[str] = mapped_column(String, default="Normal")  # High, Normal, Routine
    preferred_days: Mapped[str] = mapped_column(String, default="Any weekday evening")
    status: Mapped[str] = mapped_column(String, default="waiting")  # waiting, offered, accepted, expired
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    """A staff account. Passwords are stored as scrypt hashes (see app/security.py)."""
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False, default="front_desk")  # front_desk | manager | admin
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    failed_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    avatar_file_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    memberships: Mapped[list["HospitalMembership"]] = relationship(
        back_populates="user",
        foreign_keys="HospitalMembership.user_id",
        cascade="all, delete-orphan",
    )


# ===================================
# Audit & Prediction Log Models
# ===================================

class AppointmentEvent(Base):
    __tablename__ = "appointment_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    appointment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("appointments.id", ondelete="CASCADE"), nullable=False)
    event_type: Mapped[str] = mapped_column(Text, nullable=False)  # booked, synced, sms_queued, sms_sent, outcome, etc.
    from_status: Mapped[str | None] = mapped_column(Text, nullable=True)
    to_status: Mapped[str | None] = mapped_column(Text, nullable=True)
    actor: Mapped[str | None] = mapped_column(Text, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    appointment: Mapped["Appointment"] = relationship(back_populates="events")


class PredictionLog(Base):
    __tablename__ = "prediction_log"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    appointment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("appointments.id", ondelete="CASCADE"), nullable=False)
    stage: Mapped[str] = mapped_column(Text, nullable=False)  # booking, import, rescore
    features: Mapped[dict] = mapped_column(JSONB, nullable=False)
    risk_score: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False)
    risk_category: Mapped[str] = mapped_column(Text, nullable=False)
    model_version: Mapped[str] = mapped_column(Text, nullable=False)
    prediction_run_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    appointment: Mapped["Appointment"] = relationship(back_populates="prediction_logs")


# ===================================
# Simulated Hospital Information System (HIS)
# ===================================

class HISAppointment(Base):
    __tablename__ = "his_appointments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    his_ref: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    his_patient_ref: Mapped[str] = mapped_column(Text, nullable=False)
    patient_name: Mapped[str] = mapped_column(Text, nullable=False)
    date_of_birth: Mapped[date] = mapped_column(Date, nullable=False)
    gender: Mapped[str | None] = mapped_column(Text, nullable=True)
    phone: Mapped[str | None] = mapped_column(Text, nullable=True)
    nic: Mapped[str | None] = mapped_column(Text, nullable=True)
    city: Mapped[str | None] = mapped_column(Text, nullable=True)
    doctor_code: Mapped[str] = mapped_column(Text, nullable=False)
    doctor_name: Mapped[str] = mapped_column(Text, nullable=False)
    department: Mapped[str] = mapped_column(Text, nullable=False)
    appointment_date: Mapped[date] = mapped_column(Date, nullable=False)
    appointment_time: Mapped[time] = mapped_column(Time, nullable=False)
    booked_on: Mapped[date] = mapped_column(Date, nullable=False)
    booking_channel: Mapped[str | None] = mapped_column(Text, nullable=True)
    payment_mode: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    his_status: Mapped[str] = mapped_column(Text, nullable=False, default="booked")  # booked, arrived, completed, no_show, cancelled
    hypertension: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    diabetes: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    alcoholism: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    handicap: Mapped[int | None] = mapped_column(Integer, nullable=True)
    scholarship: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    sms_sent: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class HISSyncRun(Base):
    __tablename__ = "his_sync_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    target_date: Mapped[date] = mapped_column(Date, nullable=False)
    trigger: Mapped[str] = mapped_column(Text, nullable=False)  # manual, auto, combined_run
    status: Mapped[str] = mapped_column(Text, nullable=False)  # running, done, failed
    fetched: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unchanged: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    triggered_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PredictionRun(Base):
    __tablename__ = "prediction_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=True, index=True)
    run_date: Mapped[date] = mapped_column(Date, nullable=False)
    doctor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("doctors.id"), nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False)  # queued, running, done, failed
    stage: Mapped[str] = mapped_column(Text, nullable=False, default="queued")
    with_sync: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    scored: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    high: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    medium: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    low: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    expected_no_shows: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    model_version: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    triggered_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# ===================================
# Capacity & Smart Overbooking v2
# ===================================

class CapacitySetting(Base):
    __tablename__ = "capacity_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=True, index=True)
    scope: Mapped[str] = mapped_column(Text, nullable=False, default="global")  # global, department, doctor
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id", ondelete="CASCADE"), nullable=True)
    doctor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("doctors.id", ondelete="CASCADE"), nullable=True)
    safety_factor: Mapped[float] = mapped_column(Float, nullable=False, default=0.75)
    max_overbook_per_slot: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    max_overbook_per_session: Mapped[int] = mapped_column(Integer, nullable=False, default=4)
    wait_tolerance_mins: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    consultation_fee_lkr: Mapped[float] = mapped_column(Float, nullable=False, default=4500.0)
    badge_safe_mins: Mapped[int] = mapped_column(Integer, nullable=False, default=8)
    badge_moderate_mins: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    auto_assign_waitlist: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sim_runs: Mapped[int] = mapped_column(Integer, nullable=False, default=2000)  # legacy, unused by the exact method
    wait_cost_lkr: Mapped[float] = mapped_column(Float, nullable=False, default=10000.0, server_default="10000")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    department: Mapped["Department | None"] = relationship()
    doctor: Mapped["Doctor | None"] = relationship()


class CapacityRecommendation(Base):
    __tablename__ = "capacity_recommendations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=True, index=True)
    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, default=uuid.uuid4)
    doctor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("doctors.id", ondelete="CASCADE"), nullable=False)
    clinic_session_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("doctor_clinic_sessions.id", ondelete="SET NULL"), nullable=True)
    slot_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    target_date: Mapped[date] = mapped_column(Date, nullable=False)
    booked_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    expected_no_shows: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    interval_low: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    interval_high: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    recommended_overbook: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    expected_wait_mins: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    expected_revenue_lkr: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    p_overcrowding: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    effective_tolerance_mins: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    settings_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    model_version: Mapped[str] = mapped_column(Text, nullable=False, default="shai-lk-synth-v1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    doctor: Mapped["Doctor"] = relationship()
    clinic_session: Mapped["DoctorClinicSession | None"] = relationship()


class CapacityScenario(Base):
    __tablename__ = "capacity_scenarios"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    params: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    results: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SlotOffer(Base):
    __tablename__ = "slot_offers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=True, index=True)
    doctor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("doctors.id", ondelete="CASCADE"), nullable=False)
    clinic_session_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("doctor_clinic_sessions.id", ondelete="SET NULL"), nullable=True)
    slot_time: Mapped[time] = mapped_column(Time, nullable=False)
    slot_date: Mapped[date] = mapped_column(Date, nullable=False)
    freed_reason: Mapped[str] = mapped_column(Text, nullable=False)  # cancellation, unconfirmed_high_risk, reschedule
    waitlist_entry_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("waitlist.id", ondelete="CASCADE"), nullable=False)
    match_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    score_breakdown: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="proposed")  # proposed, approved, declined, expired, undone
    acted_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    acted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    doctor: Mapped["Doctor"] = relationship()
    clinic_session: Mapped["DoctorClinicSession | None"] = relationship()
    waitlist_entry: Mapped["WaitlistEntry"] = relationship()


# ===================================
# Hospital Expenses & CapEx/OpEx Models
# ===================================

class ExpenseCategory(Base):
    __tablename__ = "expense_categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    icon: Mapped[str] = mapped_column(String, default="receipt")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0)

    expenses: Mapped[list["HospitalExpense"]] = relationship(back_populates="category", cascade="all, delete-orphan")


class HospitalExpense(Base):
    __tablename__ = "hospital_expenses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=True, index=True)
    hospital_name: Mapped[str] = mapped_column(String, default="Default Hospital", nullable=False)
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("expense_categories.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    amount_lkr: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    recurrence: Mapped[str] = mapped_column(String, nullable=False, default="annual")  # annual, monthly, one_off, per_patient
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    category: Mapped["ExpenseCategory"] = relationship(back_populates="expenses")


