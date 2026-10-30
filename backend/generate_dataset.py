"""Generate a synthetic Sri Lankan no-show dataset shaped like the Kaggle
source data (backend/data/KaggleV2-May-2016.csv), for retraining the model
on locally-flavoured demographics/geography instead of the Brazilian source.

Usage (from backend/, with the venv active):
    python generate_dataset.py --rows 50000 --out data/sri_lanka_noshow.csv

Then point preprocess.py at it:
    python preprocess.py --input data/sri_lanka_noshow.csv
"""
import argparse

import numpy as np
import pandas as pd

from fake_data_lk import generate_core_dataframe


def build_kaggle_shaped_csv(rows: int, seed: int) -> pd.DataFrame:
    core = generate_core_dataframe(rows, seed=seed)
    rng = np.random.default_rng(seed + 1)

    from fake_data_lk import CITIES

    df = pd.DataFrame({
        "PatientId": rng.integers(10**9, 10**10, size=rows),
        "AppointmentID": np.arange(5_000_000, 5_000_000 + rows),
        "Gender": core["gender"],
        "ScheduledDay": pd.to_datetime(core["scheduled_day"]),
        "AppointmentDay": pd.to_datetime(core["appointment_day"]),
        "Age": core["age"],
        "Neighbourhood": rng.choice(CITIES, size=rows),
        "Scholarship": core["scholarship"],
        "Hipertension": core["hypertension"],
        "Diabetes": core["diabetes"],
        "Alcoholism": core["alcoholism"],
        "Handcap": core["handicap"],
        "SMS_received": core["sms_received"],
        "No-show": core["no_show"].map({0: "No", 1: "Yes"}),
    })
    return df


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rows", type=int, default=50_000, help="Number of appointment rows to generate")
    parser.add_argument("--out", default="data/sri_lanka_noshow.csv", help="Output CSV path")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    df = build_kaggle_shaped_csv(args.rows, args.seed)
    df.to_csv(args.out, index=False)

    no_show_rate = (df["No-show"] == "Yes").mean()
    print(f"Wrote {len(df):,} rows to {args.out}")
    print(f"No-show rate: {no_show_rate:.2%}")


if __name__ == "__main__":
    main()
