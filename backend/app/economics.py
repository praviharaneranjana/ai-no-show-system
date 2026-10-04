"""Economic constants shared by the models, the importer and the ROI/capacity services.

Every number here is an assumption, not a measurement. Where a source exists it is named; where none does the
comment says so. The evidence behind each one is written up in docs/ASSUMPTIONS_AND_EVIDENCE.md.
"""

# Blended average outpatient consultation fee. The first version used 4,500 (a specialist headline price); the
# working figure for a typical Sri Lankan outpatient visit is about 2,500. Treat as an assumption.
DEFAULT_CONSULTATION_FEE_LKR = 2500.0

# The generator CSV carries fees averaging LKR 4,745 (3,150-7,450). The importer multiplies them by this factor so the
# synthetic history averages the blended fee above while keeping the relative differences between departments.
CSV_MEAN_FEE_LKR = 4745.0
SYNTHETIC_FEE_SCALE = DEFAULT_CONSULTATION_FEE_LKR / CSV_MEAN_FEE_LKR


def scale_synthetic_fee(csv_fee: float) -> float:
    """CSV fee -> LKR fee used in the database, rounded to the nearest LKR 50."""
    return round(csv_fee * SYNTHETIC_FEE_SCALE / 50.0) * 50.0


# Outreach efficacy: share of contacted would-be no-shows who attend after being contacted.
# Only Sri Lankan source: Rajasuriya, de Silva & Hanwella, The Psychiatrist 2010;34:515-518. 16 of 61 patients who
# missed a second psychiatric appointment attended within 6 weeks of a phone call or letter (26.2%).
# Single clinic, no control group, contact after the miss. 95% Wilson interval for 16/61 is about 17-38%.
EFFICACY_CENTRAL = 0.26
EFFICACY_LOW = 0.17
EFFICACY_HIGH = 0.38
EFFICACY_SOURCE = (
    "Rajasuriya, de Silva & Hanwella (2010), The Psychiatrist 34:515-518: 16 of 61 missed second appointments "
    "attended within 6 weeks of a phone call or letter. One psychiatric clinic, no control group."
)

# Cost of one outreach contact, built from channels instead of a single flat number.
SMS_COST_LKR = 1.0  # bulk SMS is quoted well under LKR 1; confirm against your provider's tariff
CALL_MINUTES = 3.5  # assumption: no time-and-motion study
STAFF_HOURLY_COST_LKR = 850.0  # assumption: loaded cost of front-desk time
CALL_SHARE = 0.25  # assumption: share of contacts that need a phone call after the SMS


def cost_per_contact(sms_cost: float, call_share: float, call_minutes: float, staff_hourly_cost: float) -> float:
    """Expected cost of one contact: one SMS plus a phone call for the share that needs one."""
    return sms_cost + call_share * call_minutes * staff_hourly_cost / 60.0


DEFAULT_COST_PER_CONTACT_LKR = cost_per_contact(SMS_COST_LKR, CALL_SHARE, CALL_MINUTES, STAFF_HOURLY_COST_LKR)
