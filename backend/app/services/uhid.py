from datetime import datetime
import zoneinfo
from sqlalchemy import text
from sqlalchemy.orm import Session

LK_TZ = zoneinfo.ZoneInfo("Asia/Colombo")


def generate_uhid(db: Session) -> str:
    """Generate canonical Sri Lankan hospital UHID.
    Format: SHAI-{YY}-{seq:06d} (Asia/Colombo timezone)
    """
    now_lk = datetime.now(LK_TZ)
    yy = now_lk.strftime("%y")
    try:
        seq = db.execute(text("SELECT nextval('patient_uhid_seq')")).scalar()
    except Exception:
        # If sequence was somehow not initialized (e.g. fresh test schema), create and retry
        db.execute(text("CREATE SEQUENCE IF NOT EXISTS patient_uhid_seq START 1;"))
        seq = db.execute(text("SELECT nextval('patient_uhid_seq')")).scalar()
    return f"SHAI-{yy}-{int(seq):06d}"
