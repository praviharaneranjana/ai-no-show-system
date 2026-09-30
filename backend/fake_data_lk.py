"""Synthetic Sri Lankan hospital data generator.

Shared by generate_dataset.py (Kaggle-shaped CSV for retraining) and
seed_bulk.py (full patient/appointment/prediction rows for the live DB).
Fully vectorized with numpy so generating tens of thousands of rows is fast.

No-show labels aren't random: they're drawn from a logistic model over the
same features preprocess.py engineers (lead time, SMS, age, weekend, etc.)
plus a couple of Sri Lanka-specific effects (prepaid booking channel,
scholarship/subsidized care), so a model trained on the output CSV actually
has signal to learn rather than pure noise.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

SINHALA_MALE_FIRST = [
    "Nimal", "Sunil", "Kamal", "Ranjith", "Anura", "Chaminda", "Rohan",
    "Saman", "Wasantha", "Chandana", "Sampath", "Priyantha", "Lasantha",
    "Dilshan", "Nuwan", "Thilina", "Upul", "Mahinda", "Gamini", "Ajith",
]
SINHALA_FEMALE_FIRST = [
    "Kusumawathi", "Priyani", "Malini", "Nirosha", "Chamari", "Sanduni",
    "Ishara", "Dilrukshi", "Anoma", "Chathurika", "Nilmini", "Sachini",
    "Vindya", "Hasini", "Thilaka", "Ramani", "Kanchana", "Sujeewa",
]
SINHALA_LAST = [
    "Perera", "Gunaratne", "Silva", "Fernando", "Jayasinghe", "Wickramasinghe",
    "Weerasinghe", "Dissanayake", "Rathnayake", "Bandara", "Karunaratne",
    "Senanayake", "Amarasinghe", "Wijesekara", "Gunawardena", "Mendis",
]

TAMIL_MALE_FIRST = [
    "Kumaran", "Suresh", "Rajkumar", "Prabakaran", "Sivakumar", "Ganesh",
    "Mohanraj", "Vijayakumar", "Selvam", "Ravichandran", "Thavan", "Ariyaratnam",
]
TAMIL_FEMALE_FIRST = [
    "Priya", "Kavitha", "Malathi", "Vasuki", "Nirmala", "Thilaga", "Sangeetha",
    "Yalini", "Divya", "Kokila", "Shanthi", "Uma",
]
TAMIL_LAST = [
    "Sivakumar", "Rajaratnam", "Kandiah", "Thevarajah", "Ganeshan",
    "Sinnathurai", "Muthulingam", "Balasubramaniam", "Rajendran", "Nadarajah",
]

MUSLIM_MALE_FIRST = [
    "Mohamed", "Rizwan", "Faizal", "Nawaz", "Aslam", "Rasheed", "Hameed",
    "Nazeer", "Ilyas", "Fazal",
]
MUSLIM_FEMALE_FIRST = [
    "Fathima", "Nusrath", "Rizana", "Shifana", "Zeenath", "Rukshana",
    "Farzana", "Nadhiya", "Shameena", "Ayesha",
]
MUSLIM_LAST = [
    "Hameed", "Rizwan", "Careem", "Marikar", "Lebbe", "Thassim",
    "Jayah", "Sourjah",
]

CITIES = [
    "Colombo 03", "Colombo 04", "Colombo 05", "Colombo 06", "Colombo 07",
    "Colombo 08", "Colombo 10", "Colombo 15", "Nugegoda", "Dehiwala",
    "Mount Lavinia", "Wattala", "Kelaniya", "Negombo", "Gampaha", "Kadawatha",
    "Kandy", "Kurunegala", "Galle", "Matara", "Jaffna", "Batticaloa",
    "Anuradhapura", "Ratnapura", "Badulla", "Trincomalee", "Kalutara",
    "Panadura", "Homagama", "Maharagama", "Kotte", "Malabe", "Kottawa",
]

UHID_PREFIXES = ["ASIRI", "HEMAS", "NAWALOKA", "DURDANS", "LANKA", "NATIONAL"]

DEPARTMENTS = [
    "Cardiology", "Neurology", "Orthopedics", "General Medicine",
    "Pediatrics", "ENT", "Dermatology", "Gynecology", "Urology",
    "Gastroenterology", "Psychiatry", "Endocrinology",
]

DOCTORS_BY_DEPT = {
    "Cardiology": ["Dr. Rohan Perera", "Dr. Sanjeewa Kodithuwakku"],
    "Neurology": ["Dr. Neluka Fernando", "Dr. Harsha Atapattu"],
    "Orthopedics": ["Dr. Anura Jayasinghe", "Dr. Kasun Ranatunga"],
    "General Medicine": ["Dr. Priyanka de Silva", "Dr. Manjula Wickrama"],
    "Pediatrics": ["Dr. Ruwani Abeysekara", "Dr. Chathura Liyanage"],
    "ENT": ["Dr. Ajith Wanigasekara"],
    "Dermatology": ["Dr. Yasodha Ranasinghe"],
    "Gynecology": ["Dr. Malika Gunasekara"],
    "Urology": ["Dr. Nishantha Bandaranayake"],
    "Gastroenterology": ["Dr. Iresha Wijekoon"],
    "Psychiatry": ["Dr. Sameera Herath"],
    "Endocrinology": ["Dr. Dinusha Amaraweera"],
}

BOOKING_CHANNELS = ["Doc990", "eChannelling", "Asiri MyHealth", "Hospital Counter"]
_PREPAID_CHANNELS = {"Doc990", "eChannelling", "Asiri MyHealth"}

PAYMENT_MODES_STANDARD = [
    "Credit Card (NSR Protected)", "Credit Card", "Corporate Insurance", "Cash",
]
PAYMENT_MODE_SCHOLARSHIP = "Government Scholarship"

AI_ACTION_STATUSES = [
    "Confirmed via WhatsApp", "Pending", "Rescheduled via AI",
    "Telehealth Converted", "Cancelled by Patient",
]


def _weighted_names(rng: np.random.Generator, n: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Returns (gender, first_name, last_name) arrays reflecting a rough
    Sinhala/Tamil/Moor population mix (75/16/9)."""
    ethnicity = rng.choice(["sinhala", "tamil", "muslim"], size=n, p=[0.75, 0.16, 0.09])
    gender = rng.choice(["M", "F"], size=n, p=[0.49, 0.51])

    first = np.empty(n, dtype=object)
    last = np.empty(n, dtype=object)

    pools = {
        "sinhala": (SINHALA_MALE_FIRST, SINHALA_FEMALE_FIRST, SINHALA_LAST),
        "tamil": (TAMIL_MALE_FIRST, TAMIL_FEMALE_FIRST, TAMIL_LAST),
        "muslim": (MUSLIM_MALE_FIRST, MUSLIM_FEMALE_FIRST, MUSLIM_LAST),
    }
    for eth, (male_pool, female_pool, last_pool) in pools.items():
        eth_mask = ethnicity == eth
        male_mask = eth_mask & (gender == "M")
        female_mask = eth_mask & (gender == "F")
        first[male_mask] = rng.choice(male_pool, size=male_mask.sum())
        first[female_mask] = rng.choice(female_pool, size=female_mask.sum())
        last[eth_mask] = rng.choice(last_pool, size=eth_mask.sum())

    return gender, first, last


def generate_core_dataframe(n: int, seed: int = 42) -> pd.DataFrame:
    """Core clinical/demographic fields plus the No-show label, vectorized."""
    rng = np.random.default_rng(seed)

    gender, first_name, last_name = _weighted_names(rng, n)
    full_name = np.array([f"{f} {l}" for f, l in zip(first_name, last_name)])

    age = np.clip(rng.gamma(shape=2.2, scale=17.0, size=n), 0, 100).astype(int)
    scholarship = rng.choice([0, 1], size=n, p=[0.90, 0.10])
    hypertension = ((age > 45) & (rng.random(n) < 0.45)) | (rng.random(n) < 0.08)
    diabetes = ((age > 40) & (rng.random(n) < 0.30)) | (rng.random(n) < 0.05)
    alcoholism = (gender == "M") & (rng.random(n) < 0.10)
    handicap = rng.choice([0, 1, 2, 3, 4], size=n, p=[0.90, 0.05, 0.03, 0.015, 0.005])
    sms_received = rng.choice([0, 1], size=n, p=[0.30, 0.70])

    today = pd.Timestamp.now().normalize()
    scheduled_offset_days = rng.integers(0, 400, size=n)
    scheduled_day = today - pd.to_timedelta(scheduled_offset_days, unit="D")
    days_ahead = np.clip(rng.exponential(scale=8.0, size=n), 0, 180).astype(int)
    appointment_day = scheduled_day + pd.to_timedelta(days_ahead, unit="D")

    day_of_week = appointment_day.dayofweek.to_numpy()
    is_weekend = day_of_week >= 5
    month = appointment_day.month.to_numpy()

    booking_channel = rng.choice(BOOKING_CHANNELS, size=n, p=[0.35, 0.30, 0.15, 0.20])
    prepaid = np.isin(booking_channel, list(_PREPAID_CHANNELS))

    logit = (
        -1.55
        + 0.35 * (days_ahead > 15)
        - 0.55 * (sms_received == 1)
        + 0.25 * (age < 30)
        - 0.20 * (age > 60)
        + 0.15 * is_weekend
        + 0.10 * handicap
        + 0.20 * scholarship
        - 0.30 * prepaid
        + rng.normal(0, 0.35, size=n)
    )
    prob_no_show = 1.0 / (1.0 + np.exp(-logit))
    no_show = (rng.random(n) < prob_no_show).astype(int)

    df = pd.DataFrame({
        "full_name": full_name,
        "gender": gender,
        "age": age,
        "date_of_birth": (today - pd.to_timedelta(age * 365, unit="D")).date,
        "scholarship": scholarship,
        "hypertension": hypertension.astype(int),
        "diabetes": diabetes.astype(int),
        "alcoholism": alcoholism.astype(int),
        "handicap": handicap,
        "sms_received": sms_received,
        "scheduled_day": scheduled_day.date,
        "appointment_day": appointment_day.date,
        "days_ahead": days_ahead,
        "day_of_week": day_of_week,
        "is_weekend": is_weekend.astype(int),
        "month": month,
        "booking_channel": booking_channel,
        "no_show": no_show,
    })
    return df


def add_hospital_fields(df: pd.DataFrame, seed: int = 43) -> pd.DataFrame:
    """Adds Sri Lanka hospital-operations fields (city, doctor, payment,
    contact info, etc.) needed by the live DB schema, on top of the core
    clinical dataframe."""
    n = len(df)
    rng = np.random.default_rng(seed)

    df = df.copy()
    df["city"] = rng.choice(CITIES, size=n)
    df["distance_km"] = np.round(np.clip(rng.lognormal(mean=2.3, sigma=0.7, size=n), 0.5, 90.0), 1)
    df["uhid"] = [
        f"UHID-{prefix}-{num}"
        for prefix, num in zip(rng.choice(UHID_PREFIXES, size=n), rng.integers(1000, 9999, size=n))
    ]
    df["phone"] = [f"+9477{num:07d}" for num in rng.integers(0, 9_999_999, size=n)]
    df["email"] = [
        f"{name.lower().replace(' ', '.')}{i}@example.com" for i, name in enumerate(df["full_name"])
    ]

    df["department"] = rng.choice(DEPARTMENTS, size=n)
    df["doctor_name"] = [
        rng.choice(DOCTORS_BY_DEPT[dept]) for dept in df["department"]
    ]
    df["payment_mode"] = [
        PAYMENT_MODE_SCHOLARSHIP if sch else rng.choice(PAYMENT_MODES_STANDARD, p=[0.35, 0.30, 0.20, 0.15])
        for sch in df["scholarship"]
    ]
    hour = rng.integers(16, 20, size=n)
    minute = rng.choice([0, 15, 30, 45], size=n)
    df["scheduled_time"] = [f"{h}:{m:02d}" for h, m in zip(hour, minute)]
    df["queue_number"] = rng.integers(1, 40, size=n)
    df["ai_action_status"] = rng.choice(AI_ACTION_STATUSES, size=n, p=[0.40, 0.30, 0.12, 0.08, 0.10])

    return df
