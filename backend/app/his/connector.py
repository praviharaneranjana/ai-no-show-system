from __future__ import annotations

import logging
import os
import time as time_mod
from dataclasses import dataclass
from datetime import date, time
from typing import Optional, Protocol, runtime_checkable
from sqlalchemy.orm import Session

from app import models
from app.database import SessionLocal

logger = logging.getLogger("his_connector")


@dataclass
class HISAppointmentPayload:
    external_ref: str
    his_patient_ref: str
    patient_name: str
    date_of_birth: date
    gender: Optional[str]
    phone: Optional[str]
    nic: Optional[str]
    city: Optional[str]
    doctor_code: str
    doctor_name: str
    department: str
    appointment_date: date
    appointment_time: time
    booked_on: date
    booking_channel: Optional[str]
    payment_mode: Optional[str]
    token_no: Optional[int]
    his_status: str  # booked | arrived | completed | no_show | cancelled
    hypertension: Optional[bool] = None
    diabetes: Optional[bool] = None
    alcoholism: Optional[bool] = None
    handicap: Optional[int] = None
    scholarship: Optional[bool] = None
    sms_sent: Optional[bool] = None


@runtime_checkable
class HISConnector(Protocol):
    def fetch_appointments(self, for_date: date) -> list[HISAppointmentPayload]:
        """Fetch all hospital appointments scheduled for a specific date."""
        ...

    def fetch_appointment(self, external_ref: str) -> Optional[HISAppointmentPayload]:
        """Fetch a single appointment by hospital system external reference."""
        ...

    def post_outcome(self, external_ref: str, outcome: str, notes: Optional[str] = None) -> bool:
        """Push attendance outcome (e.g. attended, no_show, cancelled) back to HIS."""
        ...

    def health_check(self) -> bool:
        """Verify connectivity to hospital system."""
        ...


class SimulatedHISConnector:
    """Connector using the local `his_appointments` table as a mock hospital system."""

    def __init__(self, db: Optional[Session] = None):
        self._db = db

    def _get_session(self) -> tuple[Session, bool]:
        if self._db is not None:
            return self._db, False
        return SessionLocal(), True

    def _to_payload(self, row: models.HISAppointment) -> HISAppointmentPayload:
        return HISAppointmentPayload(
            external_ref=row.his_ref,
            his_patient_ref=row.his_patient_ref,
            patient_name=row.patient_name,
            date_of_birth=row.date_of_birth,
            gender=row.gender,
            phone=row.phone,
            nic=row.nic,
            city=row.city,
            doctor_code=row.doctor_code,
            doctor_name=row.doctor_name,
            department=row.department,
            appointment_date=row.appointment_date,
            appointment_time=row.appointment_time,
            booked_on=row.booked_on,
            booking_channel=row.booking_channel,
            payment_mode=row.payment_mode,
            token_no=row.token_no,
            his_status=row.his_status,
            hypertension=row.hypertension,
            diabetes=row.diabetes,
            alcoholism=row.alcoholism,
            handicap=row.handicap,
            scholarship=row.scholarship,
            sms_sent=row.sms_sent,
        )

    def fetch_appointments(self, for_date: date) -> list[HISAppointmentPayload]:
        session, should_close = self._get_session()
        try:
            rows = (
                session.query(models.HISAppointment)
                .filter(models.HISAppointment.appointment_date == for_date)
                .order_by(models.HISAppointment.appointment_time.asc())
                .all()
            )
            return [self._to_payload(r) for r in rows]
        finally:
            if should_close:
                session.close()

    def fetch_appointment(self, external_ref: str) -> Optional[HISAppointmentPayload]:
        session, should_close = self._get_session()
        try:
            row = (
                session.query(models.HISAppointment)
                .filter(models.HISAppointment.his_ref == external_ref)
                .first()
            )
            return self._to_payload(row) if row else None
        finally:
            if should_close:
                session.close()

    def post_outcome(self, external_ref: str, outcome: str, notes: Optional[str] = None) -> bool:
        session, should_close = self._get_session()
        try:
            row = (
                session.query(models.HISAppointment)
                .filter(models.HISAppointment.his_ref == external_ref)
                .first()
            )
            if not row:
                return False

            status_map = {
                "attended": "completed",
                "arrived": "arrived",
                "no_show": "no_show",
                "cancelled": "cancelled",
                "rescheduled": "cancelled",
            }
            row.his_status = status_map.get(outcome.lower(), outcome.lower())
            session.commit()
            return True
        except Exception as e:
            logger.error("Failed to post outcome to simulated HIS: %s", e)
            session.rollback()
            return False
        finally:
            if should_close:
                session.close()

    def health_check(self) -> bool:
        session, should_close = self._get_session()
        try:
            from sqlalchemy import text
            session.execute(text("SELECT 1"))
            return True
        except Exception as e:
            logger.warning("Simulated HIS health check failed: %s", e)
            return False
        finally:
            if should_close:
                session.close()


class HttpHISConnector:
    """HTTP connector for real hospital information systems (e.g. MedSys, Epic, HL7/FHIR wrapper).
    Features 5s timeout and 3 retries with exponential backoff.
    """

    def __init__(self, api_url: Optional[str] = None, api_key: Optional[str] = None):
        self.api_url = (api_url or os.getenv("HIS_API_URL", "http://localhost:8001/api")).rstrip("/")
        self.api_key = api_key or os.getenv("HIS_API_KEY", "")
        self.timeout = 5.0
        self.max_retries = 3

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _request_with_retry(self, method: str, path: str, **kwargs) -> Optional[dict]:
        import httpx
        url = f"{self.api_url}{path}"
        backoff = 0.5
        for attempt in range(1, self.max_retries + 1):
            try:
                with httpx.Client(timeout=self.timeout) as client:
                    resp = client.request(method, url, headers=self._headers(), **kwargs)
                    if resp.status_code == 404:
                        return None
                    resp.raise_for_status()
                    return resp.json()
            except (httpx.RequestError, httpx.HTTPStatusError) as exc:
                logger.warning("HIS request failed (attempt %d/%d): %s", attempt, self.max_retries, exc)
                if attempt == self.max_retries:
                    raise
                time_mod.sleep(backoff)
                backoff *= 2
        return None

    def fetch_appointments(self, for_date: date) -> list[HISAppointmentPayload]:
        data = self._request_with_retry("GET", f"/appointments?date={for_date.isoformat()}")
        if not data or not isinstance(data, list):
            return []

        results = []
        for item in data:
            results.append(
                HISAppointmentPayload(
                    external_ref=item["external_ref"],
                    his_patient_ref=item["his_patient_ref"],
                    patient_name=item["patient_name"],
                    date_of_birth=date.fromisoformat(item["date_of_birth"]),
                    gender=item.get("gender"),
                    phone=item.get("phone"),
                    nic=item.get("nic"),
                    city=item.get("city"),
                    doctor_code=item["doctor_code"],
                    doctor_name=item["doctor_name"],
                    department=item["department"],
                    appointment_date=date.fromisoformat(item["appointment_date"]),
                    appointment_time=time.fromisoformat(item["appointment_time"]),
                    booked_on=date.fromisoformat(item["booked_on"]),
                    booking_channel=item.get("booking_channel"),
                    payment_mode=item.get("payment_mode"),
                    token_no=item.get("token_no"),
                    his_status=item.get("his_status", "booked"),
                    hypertension=item.get("hypertension"),
                    diabetes=item.get("diabetes"),
                    alcoholism=item.get("alcoholism"),
                    handicap=item.get("handicap"),
                    scholarship=item.get("scholarship"),
                    sms_sent=item.get("sms_sent"),
                )
            )
        return results

    def fetch_appointment(self, external_ref: str) -> Optional[HISAppointmentPayload]:
        data = self._request_with_retry("GET", f"/appointments/{external_ref}")
        if not data:
            return None
        return HISAppointmentPayload(
            external_ref=data["external_ref"],
            his_patient_ref=data["his_patient_ref"],
            patient_name=data["patient_name"],
            date_of_birth=date.fromisoformat(data["date_of_birth"]),
            gender=data.get("gender"),
            phone=data.get("phone"),
            nic=data.get("nic"),
            city=data.get("city"),
            doctor_code=data["doctor_code"],
            doctor_name=data["doctor_name"],
            department=data["department"],
            appointment_date=date.fromisoformat(data["appointment_date"]),
            appointment_time=time.fromisoformat(data["appointment_time"]),
            booked_on=date.fromisoformat(data["booked_on"]),
            booking_channel=data.get("booking_channel"),
            payment_mode=data.get("payment_mode"),
            token_no=data.get("token_no"),
            his_status=data.get("his_status", "booked"),
            hypertension=data.get("hypertension"),
            diabetes=data.get("diabetes"),
            alcoholism=data.get("alcoholism"),
            handicap=data.get("handicap"),
            scholarship=data.get("scholarship"),
            sms_sent=data.get("sms_sent"),
        )

    def post_outcome(self, external_ref: str, outcome: str, notes: Optional[str] = None) -> bool:
        try:
            self._request_with_retry(
                "POST",
                f"/appointments/{external_ref}/outcome",
                json={"outcome": outcome, "notes": notes},
            )
            return True
        except Exception as e:
            logger.error("Failed to post outcome to HTTP HIS: %s", e)
            return False

    def health_check(self) -> bool:
        import httpx
        try:
            url = f"{self.api_url}/health"
            with httpx.Client(timeout=2.0) as client:
                res = client.get(url, headers=self._headers())
                return res.status_code == 200
        except Exception:
            return False


def get_his_connector(db: Optional[Session] = None) -> HISConnector:
    connector_type = os.getenv("HIS_CONNECTOR_TYPE", "simulated").strip().lower()
    if connector_type == "http":
        return HttpHISConnector()
    return SimulatedHISConnector(db=db)
