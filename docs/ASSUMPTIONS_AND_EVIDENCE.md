# SHAI — Assumptions and Evidence

Written 2026-10-04. Numbers marked **live** were read from the development database on that date (Asiri Central, 90-day replay window, all data synthetic). This document supersedes the ROI figures in `docs/THESIS_FACTS.md` §15.6; see the addendum at the end of that file.

## 1. Why this document exists

The ROI page and the outreach features rest on numbers that are not in the database. A peer-reviewed Sri Lankan study was used to check them. Some assumptions survived, some were weakened, and one (cost per contact) was replaced. The ROI result changed sign as a consequence, which is reported here rather than hidden.

## 2. The evidence base

**Rajasuriya M, de Silva V, Hanwella R. Effectiveness of reminders in reducing non-attendance among out-patients. *The Psychiatrist* 2010;34:515–518.** (Consultant psychiatrist and two university lecturers; ethics approval from the Sri Lanka Medical Association.)

| | |
|---|---|
| Setting | One psychiatric out-patient clinic, National Hospital of Sri Lanka (public, tertiary), Colombo |
| Sample | Phase 1: 176 new patients (Nov 2006). Phase 2: 195 new patients (Nov 2007) |
| Outcome | Non-attendance at the **second** appointment |
| Non-attendance before intervention | 35.8% overall (133/371); 31.3% in phase 2 (61/195) |
| Intervention | Patients who had not attended 2 weeks after the due date were phoned or sent a letter; attendance re-checked 6 weeks later |
| Reach | 41 of the 61 had a phone; 20 of those were reached; the rest got a letter |
| Result | Non-attendance 31.3% → 23.1% (45/195). 16 of the 61 contacted patients came back |
| Reported effect | "Relative risk reduction 26.2%" |
| Risk factors | Male (OR 1.65, p = 0.02); no medicine prescribed (OR 5.6); substance use (OR 7.2); organic disorders (OR 11.5). Lower for bipolar (0.19), schizophrenia (0.41), depression (0.55). Age: no difference (p = 0.71) |
| Authors' limits | No control group; only some risk factors studied (not distance, cost, education); patients may have gone to another clinic ("doctor shopping"); small groups |

### What the 26.2% actually is

It is 16 / 61: the share of patients **who had already missed** a visit and then attended after being contacted. It is a recall rate, measured without a control group, in one psychiatric clinic, on 2006–2008 data. The 95% Wilson interval is **17%–38%**. It is not the probability that a reminder sent *before* the visit prevents a no-show, and it includes patients who would have returned anyway. The paper reports no costs, so its statement that the intervention is "cost-effective" is not supported by data in the paper. The paper also gives no pooled effect sizes from the international literature, only qualitative statements.

## 3. Assumption register

| Assumption | Value now | Was | Evidence | Strength | Code |
|---|---|---|---|---|---|
| Outreach efficacy | **0.26**, range 0.17–0.38 | 0.30 | The study above | Weak–moderate: one clinic, no control, post-miss | `economics.EFFICACY_*` |
| Reach rate | 1.0 | not modelled | The 26.2% is per targeted patient and already includes unreachable ones, so applying a reach rate on top would double-count. Lower it only if your phone numbers are worse than the study's | — | `roi.evaluate(reach_rate)` |
| Consultation fee | **LKR 2,500** average | 4,500 (CSV mean 4,745) | Chosen as a blended average over all outpatient visits. **No primary source found, and what was found points higher for private specialists (§3a)** | Weak, and the ROI is very sensitive to it | `economics.DEFAULT_CONSULTATION_FEE_LKR` |
| SMS cost | LKR 1.00 | 50 per contact | Provider price lists: LKR 0.56–1.10 (§3a). LKR 1 is the upper end | **Sourced** | `economics.SMS_COST_LKR` |
| Share of contacts needing a phone call | 25% | implicit 100% | None found | Unsourced | `economics.CALL_SHARE` |
| Call length | 3.5 min | 3.5 min | 3 min 29 s per reminder call, UK mental-health clinic (§3a) | Sourced, but not Sri Lankan | `economics.CALL_MINUTES` |
| Staff cost | **LKR 300 an hour** | 850 | Front-desk pay plus EPF/ETF over 176 paid hours = LKR 280–380 (§3a) | Moderate | `economics.STAFF_HOURLY_COST_LKR` |
| **Blended cost per contact** | **LKR 5.38** = 1 + 0.25 × 3.5 × 300 / 60 | 50 | Derived | Moderate (the call share is still a guess) | `economics.cost_per_contact` |
| Platform costs | LKR 2.18 M a year (2 rows) | same | Typed in; no source. For scale only: a Sri Lankan clinic-software plan (DocPP, SMS included) is LKR 65,000 a year; hospital-scale pricing is not published | Unsourced | `hospital_expenses` table |
| Contact top share K | 20% | 20% | Policy choice | n/a | `roi.DEFAULT_CONTACT_FRACTION` |
| Overbooking wait cost | LKR 10,000 per overflow patient | unchanged | None. Note it is now 4× the fee, which makes the overbooking rule cautious | Unsourced | `capacity_settings.wait_cost_lkr` |

The original LKR 50 was not an SMS price. The code comment shows it was a phone call: 3.5 min × LKR 850 per hour ≈ 49.6. It is now split into its parts so each can be argued separately, and the hourly cost was corrected from 850 to 300 once pay data were found.

### 3a. What the sourcing found (checked 2026-10-04)

| Item | Finding | Confidence |
|---|---|---|
| SMS tariff | [QuickSend.lk](https://quicksend.lk/): "Any SMS: 0.56 LKR (All Taxes Included)", setup fee LKR 2,440 (read on the page). [Text.lk](https://text.lk/) LKR 0.64–0.84 and [Sri Lanka Hosting](https://www.srilankahosting.lk/sms-solutions) LKR 0.90–1.10 (from search results, pages not read) | Good: 0.56–1.10 per SMS |
| Reminder call length | Richards & Okopi, *BJPsych Open* 2026, South-West Leeds community mental health unit, 95 patients: "average telephone call duration was 3 minutes 29 seconds" ([PMC13329279](https://pmc.ncbi.nlm.nih.gov/articles/PMC13329279/)) | Good, but UK |
| Staff pay | Labour Force Survey 2024 (Department of Census and Statistics, Table 4.6): mean monthly gross pay LKR 58,292, median 48,000 (quoted by [app-dev.lk](https://www.app-dev.lk/blog/average-salary-sri-lanka), original table not read). Receptionist average about LKR 43,241 a month on salary aggregators ([worldsalaries.com](https://worldsalaries.com/average-receptionist-salary-in-sri-lanka/)) | Moderate. 176 h a month and 15% on-costs (employer EPF 12% + ETF 3%) are my assumptions |
| Consultation fees | One vendor guide ([nestfainder.ai](https://www.nestfainder.ai/country/sri-lanka/guides/healthcare), "as of early 2026", **no source cited**) gives specialists "from 4,500 up to 8,000 LKR or more" and a short Colombo GP visit at 6,185. A 2024 four-district survey of chronic patients ([BMC Health Services Research](https://bmchealthservres.biomedcentral.com/articles/10.1186/s12913-024-11553-4)) reports about LKR 3,000 per clinic visit in total out-of-pocket cost (search snippet; includes more than the fee). Hospital and channelling sites ([doc.lk](https://www.doc.lk/), [eChannelling](https://www.echannelling.com/)) load fees dynamically and could not be read | **Weak and conflicting. Nothing here supports 2,500 for a private-hospital specialist visit; nothing reliable contradicts it as an all-visit blend** |
| Platform cost | [DocPP](https://healthcare.lk/) Standard: LKR 10,000 a month or 65,000 a year, SMS included; custom hospital tier is "talk to an expert". No public price for hospital-scale systems | Floor only |

## 3b. The fee is the assumption that matters most

Holding everything else, the annual net benefit is a straight line in the average fee (live replay, efficacy 0.26, cost per contact LKR 5.38, platform costs LKR 2.18 M):

| Average fee | Net benefit | ROI multiple |
|---|---|---|
| 2,500 (now) | −LKR 819,425 | 0.63× |
| 3,500 | −258,733 | 0.88× |
| **3,961 (break-even)** | 0 | 1.00× |
| 4,500 | +301,959 | 1.14× |
| 6,000 | +1,142,998 | 1.51× |

So the sign of the ROI depends on whether the real average is below or above about LKR 4,000, and the only fee evidence found for private specialist visits is above it. The ROI page now shows the break-even fee and the largest platform cost the benefit could cover. **The real hospital's fee schedule or its billing data settles this and is the single most valuable thing to obtain.**

## 4. What changed in the result

Replay of the last 90 days of recorded outcomes (**live**): 9,266 appointments, observed no-show rate 15.5%, 1,888 contacts at K = 20%, **542 of 1,435 no-shows reached (recall 37.8%) against 20.4% for random contact**. Ranking by risk still beats random contact by the same margin; that part does not depend on the assumptions.

| Annual, LKR | Before (fee 4,760; efficacy 0.30; LKR 50) | Now (fee 2,507; efficacy 0.26; LKR 5.38) |
|---|---|---|
| Recovered revenue | 3,038,990 | 1,405,891 |
| Contact cost | 378,789 | 41,156 |
| Platform costs | 2,180,000 | 2,180,000 |
| **Net benefit** | **+480,201** | **−815,265** |
| **ROI multiple** | **1.19×** | **0.63×** |
| Break-even efficacy | not computed | **41%** |
| Largest platform cost the benefit covers | not computed | LKR 1,364,735 |
| Break-even average fee | not computed | LKR 3,961 |

Other efficacies at the same fee and costs: 0.17 → ROI 0.41×; 0.30 → 0.73×; 0.38 (top of the evidence) → 0.93×. With no platform cost the net benefit is **+LKR 1,364,735**.

**Reading.** The break-even efficacy (41%) is above the top of the evidence (38%), so on these inputs outreach does not pay for the recorded platform costs from consultation fees alone. That conclusion rests on two inputs with no primary source: the LKR 1.8 M platform cost and the LKR 2,500 fee (§3b). Remove the platform cost, or raise the fee above about LKR 4,000, and the case turns positive. The honest statement for the thesis is therefore conditional: outreach is cheap, risk-ranking finds nearly twice as many no-shows as random contact, and whether it covers a platform cost depends on that cost and on an efficacy that nobody has yet measured in a general hospital. The ROI page now shows the break-even efficacy and says when it is above the evidence. The data are synthetic, so none of this is evidence of benefit in practice.

## 5. How the paper's findings compare with the system

| Topic | Paper | System (synthetic data) | Consequence |
|---|---|---|---|
| Base rate | 31–36% at the second psychiatric appointment; intro cites 17–39% for psychiatry and 9% for all NHS specialties | 16.1% overall; Psychiatry 20.6%, the highest department | Direction plausible; not comparable (public, follow-up, 2006–08). Do not claim validation |
| Gender | Men higher risk (OR 1.65, p = 0.02), univariate, n = 371 | No effect (adjusted OR 1.005, 95% CI 0.95–1.06) | **Gap in the generator, not in the model.** Reported as a limitation (§6) |
| Age | No difference (p = 0.71) | Younger higher in the data (18–29: 21.3% vs 70+: 13.0%) | The intro of the paper cites younger age as a risk factor; the paper's own data do not show it |
| Distance | Not studied; intro cites living outside the referral area | Higher with distance (OR 1.08 per 10 km) | Consistent with the cited literature only |
| Treatment type / diagnosis | Strongest predictors (no medicine OR 5.6; substance use 7.2) | Not in the model | Psychiatry-specific; recorded as future work |
| Chronic illness | Patients with major illness attend more | Hypertension/diabetes lower no-show (OR 0.81 per condition) | Loosely consistent in direction; different conditions, do not equate |
| Reminders | Recall by call or letter helps; SMS helps in primary care (cited) | SMS has almost no effect (OR 0.91) | Internal inconsistency with the ROI efficacy: targeted human outreach is assumed to do more than a generic SMS. State it |
| Label noise | "Doctor shopping": some no-shows attend elsewhere | Not modelled | A no-show is "did not attend here" |
| Setting | Public tertiary hospital, free care | Private hospital | Prepaid payments (the strongest SHAP driver) cannot be tested against this paper |

## 6. The model was not retrained, and why

Retraining is triggered by new **real** outcome data, not by this paper.

* Fee, efficacy, reach and cost are not model inputs. The 40 features do not include any of them, so changing them needs no retraining, recalibration or re-scoring. Stored risk scores and the tier thresholds are unchanged.
* Adding a gender effect to the generator and retraining would only make the model recover what was put in. It would not make the data real, and it would change every reported model number (AUC 0.6725, confidence intervals, thresholds, SHAP ranks, tier shares). The generator is also not in the repository (§6 of `THESIS_FACTS.md`).
* **Gender stays a feature of the model.** The synthetic data contain no gender effect, while one small Sri Lankan study and the literature it cites report higher risk in men. Whether that holds in a general private hospital must be tested on real data; this is listed as a limitation and as the first check to make when real outcomes are available (`docs/VALIDATION_ON_LOCAL_DATA.md`).
* If a robustness check is wanted: build a separate bundle (`train_shai.py --version`) from a generator variant with a gender effect and show the pipeline recovers it. That would be a method check, not a realism claim.

## 7. What was added because of the paper

| Gap | Change | Where |
|---|---|---|
| The study tested **post-miss recall**, which the system did not support | A recall queue (misses in the last 14 days, most urgent first), contact log, trilingual message, rebooking through the normal capacity and duplicate rules, and a measured return rate with its interval next to the study's | `app/recall.py`, `/recall`, `rescheduling.reschedule_booking(recall=True)` |
| The study had **no control group**, so efficacy is unknown | An optional randomised hold-out: a fixed share of flagged appointments is a no-contact control (set `OUTREACH_HOLDOUT_PCT`, off by default). The arm is a hash of the appointment id, so staff cannot choose it. A report compares no-show rates and gives the implied efficacy, its interval, the sample size needed, and warns when control patients were contacted | `app/holdout.py`, `GET /outreach/holdout/report`, ROI page |
| The study's letters named **only the hospital** (psychiatric stigma) | For psychiatry, psychology, mental health and counselling the department is replaced by "clinic" in every drafted message, is withheld from the Gemini prompt, and a Gemini reply that names it is discarded for the template | `outreach_drafter.py`, `/recall/{id}/draft` |
| Contact cost was a single unsourced number | Split into SMS, share needing a call, call length and staff cost; the page shows the blended figure | `app/economics.py`, ROI page |
| Efficacy was a bare slider | Central value and range from the study, the source on the page, and the break-even efficacy | ROI page |
| Fee was 4,500 in several places | One constant (`DEFAULT_CONSULTATION_FEE_LKR = 2,500`); the imported synthetic fees are scaled to average 2,500 with the department differences kept; migration `c9d0e1f2a3b4` rescaled the existing database (guarded so it cannot run twice) | `app/economics.py`, `synthetic_import.py`, `seed.py` |

The recall summary compares contacted and non-contacted patients but is **not randomised**; use the hold-out report for a fair efficacy estimate.

## 8. What the thesis may and may not claim

May claim: that a Sri Lankan study found 26.2% (16 of 61, interval 17–38%) of patients who missed a psychiatric follow-up attended after a call or letter, without a control group; that the efficacy used here is taken from it and varied across its interval; that ranking by risk reached 37.8% of no-shows against 20.4% for random contact on synthetic history; that the system can now measure its own recall and, with a hold-out, its own efficacy.

May not claim: that 30% (or 26%) efficacy is established for a private general hospital; that the LKR 2,500 fee or the platform cost are sourced (they are not, and the evidence found for the fee points higher); that the ROI is positive (on the current inputs it is below 1 with the recorded platform costs); that the model or its gender behaviour were validated against the paper; that messages are sent to patients (they are not).

## 9. Still open

Resolved by sourcing (§3a): SMS tariff, call length, staff cost.

1. **The average fee** (§3b): the hospital's own fee schedule or billing export. Most valuable.
2. **The platform cost**: LKR 1.8 M and LKR 380,000 have no source. A vendor quote or the hospital's actual contract is needed; the ROI page shows the ceiling it must stay under.
3. The share of outreach that needs a phone call (25% is a guess); a pilot log would settle it.
4. A Sri Lankan measurement of call time, and the original Labour Force Survey table (the figures here were read second-hand).
5. Real outcome data for validation and for a first gender check.
6. A real pilot with the hold-out switched on, to replace the assumed efficacy with a measured one.

## 10. Reproducing the figures

```bash
cd backend && source venv/bin/activate
alembic upgrade head                      # includes c9d0e1f2a3b4, the fee rescale (guarded)
python -m pytest tests/test_roi.py tests/test_recall.py tests/test_holdout.py tests/test_outreach_draft.py
# ROI figures: sign in as a manager and open /simulator, or call POST /simulator/evaluate with the defaults
# Hold-out: OUTREACH_HOLDOUT_PCT=10 uvicorn app.main:app   (report at GET /outreach/holdout/report)
```

A database dump taken before the fee rescale was saved outside the repository at the time of the change.
