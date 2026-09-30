import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    uhid: Mapped[str | None] = mapped_column(String, nullable=True)
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    date_of_birth: Mapped[date] = mapped_column(Date, nullable=False)
    gender: Mapped[str | None] = mapped_column(String)
    phone: Mapped[str | None] = mapped_column(String)
    email: Mapped[str | None] = mapped_column(String)
    city: Mapped[str | None] = mapped_column(String, nullable=True)
    distance_km: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    scholarship: Mapped[bool] = mapped_column(Boolean, default=False)
    hypertension: Mapped[bool] = mapped_column(Boolean, default=False)
    diabetes: Mapped[bool] = mapped_column(Boolean, default=False)
    alcoholism: Mapped[bool] = mapped_column(Boolean, default=False)
    handicap: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    appointments: Mapped[list["Appointment"]] = relationship(back_populates="patient")


class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patients.id"), nullable=False)
    scheduled_day: Mapped[date] = mapped_column(Date, nullable=False)
    appointment_day: Mapped[date] = mapped_column(Date, nullable=False)
    department: Mapped[str | None] = mapped_column(String)
    # No column-level `default=` here on purpose: SQLAlchemy's Python-side
    # default fires even when a value is explicitly set to None, which would
    # silently coerce a genuine "unknown channel/payment" into a fake value
    # and feed a wrong signal into the contextual risk adjustment layer.
    # AppointmentCreate already supplies sensible defaults when a field is
    # omitted entirely — this column stays nullable=True (default) so an
    # explicit null is respected as "not on record".
    doctor_name: Mapped[str | None] = mapped_column(String)
    booking_channel: Mapped[str | None] = mapped_column(String)
    payment_mode: Mapped[str | None] = mapped_column(String)
    scheduled_time: Mapped[str | None] = mapped_column(String)
    queue_number: Mapped[int | None] = mapped_column(Integer)
    ai_action_status: Mapped[str | None] = mapped_column(String)
    sms_received: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String, default="scheduled")
    no_show: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    patient: Mapped["Patient"] = relationship(back_populates="appointments")
    prediction: Mapped["Prediction"] = relationship(back_populates="appointment", uselist=False)
    interventions: Mapped[list["Intervention"]] = relationship(back_populates="appointment")


class Prediction(Base):
    __tablename__ = "predictions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    appointment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("appointments.id"), unique=True, nullable=False)
    risk_score: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False)
    risk_category: Mapped[str] = mapped_column(String, nullable=False)
    explanation: Mapped[dict] = mapped_column(JSONB, nullable=False)
    recommendation: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    appointment: Mapped["Appointment"] = relationship(back_populates="prediction")


class DoctorSession(Base):
    __tablename__ = "doctor_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    doctor_name: Mapped[str] = mapped_column(String, nullable=False)
    specialty: Mapped[str] = mapped_column(String, nullable=False)
    room_number: Mapped[str] = mapped_column(String, default="Room 204")
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    scheduled_start_time: Mapped[str] = mapped_column(String, default="17:00")
    status: Mapped[str] = mapped_column(String, default="on_time")  # on_time, delayed, in_progress, completed
    delay_minutes: Mapped[int] = mapped_column(Integer, default=0)
    avg_consultation_mins: Mapped[int] = mapped_column(Integer, default=12)
    max_capacity: Mapped[int] = mapped_column(Integer, default=25)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Intervention(Base):
    __tablename__ = "interventions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    appointment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("appointments.id"), nullable=False)
    channel: Mapped[str] = mapped_column(String, default="WhatsApp")  # WhatsApp, SMS, IVR_Voice
    language: Mapped[str] = mapped_column(String, default="en")  # en, si, ta
    status: Mapped[str] = mapped_column(String, default="sent")  # sent, confirmed, rescheduled, telehealth_requested
    patient_reply: Mapped[str | None] = mapped_column(String, nullable=True)
    intent_detected: Mapped[str | None] = mapped_column(String, nullable=True)
    offered_slot: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    appointment: Mapped["Appointment"] = relationship(back_populates="interventions")


class WaitlistEntry(Base):
    __tablename__ = "waitlist"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_name: Mapped[str] = mapped_column(String, nullable=False)
    patient_phone: Mapped[str] = mapped_column(String, nullable=False)
    specialty: Mapped[str] = mapped_column(String, nullable=False)
    doctor_name: Mapped[str] = mapped_column(String, nullable=False)
    urgency_level: Mapped[str] = mapped_column(String, default="Normal")  # High, Normal, Routine
    preferred_days: Mapped[str] = mapped_column(String, default="Any weekday evening")
    status: Mapped[str] = mapped_column(String, default="waiting")  # waiting, offered, accepted, expired
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


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
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
