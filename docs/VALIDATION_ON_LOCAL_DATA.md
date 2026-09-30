# Validating on real local hospital data

The only real data used so far is the public Kaggle set (Brazil, 2016) — see
`backend/reports/validation_report.md`. That validates the *method*, not accuracy at a
Sri Lankan hospital. The model's synthetic Sri Lankan dataset is generated from rules we
wrote, so scores on it are not evidence of real-world accuracy.

## What to ask the hospital for
A de-identified export of past appointments (6–12 months minimum, ideally 5,000+ rows):

| Column | Notes |
|---|---|
| appointment date, booking date | gives lead time |
| appointment hour, doctor/department | |
| patient age, sex | no names or phone numbers needed |
| booking channel, payment mode | counter / phone / online, prepaid or not |
| SMS/reminder sent | |
| prior no-show count (or a stable anonymised patient ID) | |
| **outcome: attended / no-show** | the label, the one column that matters |

Replace patient identifiers with an anonymous hash before it leaves the hospital, and get
written permission from the hospital and (for a thesis) ethics approval.

## How to evaluate
1. **Do not retrain first.** Score the hospital's history with the current model and report
   ROC-AUC, Brier score and Lift@top20% *as is*. That is the honest transfer result.
2. Then retrain on the earlier ~70% (by date) and test on the later 30%, exactly as
   `backend/validate_model.py` does for Kaggle. Point its loader at the new CSV.
3. Report both numbers side by side: "out-of-the-box" versus "fine-tuned on local data".
4. Run a prospective pilot if possible: flag the top 20% riskiest patients, call them,
   and compare their attendance with an untouched control group.

The outcome feedback loop already exists in the app (`PATCH /appointments/{id}/outcome`),
so a pilot accumulates labelled data automatically.
