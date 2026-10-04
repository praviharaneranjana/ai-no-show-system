from docx.shared import Inches, Pt
# References and Appendices

def write_back_matter(doc, add_h1, add_h2, add_h3, add_p, add_caption_table, format_custom_table):
    add_h1("REFERENCES")

    references = [
        "[1] E. Cayirli and E. Veral, \"Outpatient scheduling in health care: a review of literature,\" *Production and Operations Management*, vol. 12, no. 4, pp. 519–549, 2003.",
        "[2] S. Srinivas and A. R. Ravindran, \"Optimizing outpatient appointment systems using machine learning and predictive analytics,\" *Expert Systems with Applications*, vol. 111, pp. 116–130, 2018.",
        "[3] R. P. Rannan-Eliya and L. Sikurajapathy, \"Sri Lanka: 'Good practice' in expanding health care coverage,\" Institute for Health Policy, Research Report, Colombo, Sri Lanka, 2008.",
        "[4] Ministry of Health Sri Lanka, \"Annual Health Bulletin 2022,\" Medical Statistics Unit, Ministry of Health, Colombo, Sri Lanka, 2023.",
        "[5] C. Guo, G. Pleiss, Y. Sun, and K. Q. Weinberger, \"On calibration of modern neural networks,\" in *Proc. 34th Int. Conf. Mach. Learn. (ICML)*, Sydney, Australia, 2017, pp. 1321–1330.",
        "[6] S. M. Lundberg and S.-I. Lee, \"A unified approach to interpreting model predictions,\" in *Advances in Neural Information Processing Systems (NeurIPS 30)*, Long Beach, CA, USA, 2017, pp. 4765–4774.",
        "[7] M. Rajasuriya, V. de Silva, and R. Hanwella, \"Effectiveness of reminders in reducing non-attendance among out-patients,\" *The Psychiatrist*, vol. 34, no. 12, pp. 515–518, Dec. 2010.",
        "[8] World Health Organization, \"Noncommunicable diseases country profiles 2018: Sri Lanka,\" World Health Organization, Geneva, Switzerland, Tech. Rep., 2018.",
        "[9] Central Bank of Sri Lanka, \"Annual Economic Review 2023: Household health expenditure and private sector medical services pricing,\" Central Bank of Sri Lanka, Colombo, Tech. Rep., 2024.",
        "[10] J. Hoff, \"Medical Appointment No Shows: 110k medical appointments and its 14 associated variables,\" Kaggle Dataset, 2016. [Online]. Available: https://www.kaggle.com/datasets/jonihoff/medical-appointment-no-shows.",
        "[11] L. Breiman, \"Random forests,\" *Machine Learning*, vol. 45, no. 1, pp. 5–32, Oct. 2001.",
        "[12] T. Chen and C. Guestrin, \"XGBoost: a scalable tree boosting system,\" in *Proc. 22nd ACM SIGKDD Int. Conf. Knowl. Discovery Data Mining (KDD)*, San Francisco, CA, USA, 2016, pp. 785–794.",
        "[13] B. Zadrozny and C. Elkan, \"Transforming classifier scores into accurate multiclass probability estimates,\" in *Proc. 8th ACM SIGKDD Int. Conf. Knowl. Discovery Data Mining (KDD)*, Edmonton, Canada, 2002, pp. 694–699.",
        "[14] A. Niculescu-Mizil and R. Caruana, \"Predicting good probabilities with supervised learning,\" in *Proc. 22nd Int. Conf. Mach. Learn. (ICML)*, Bonn, Germany, 2005, pp. 625–632.",
        "[15] J. C. Platt, \"Probabilistic outputs for support vector machines and comparisons to regularized likelihood methods,\" *Advances in Large Margin Classifiers*, vol. 10, no. 3, pp. 61–74, 1999.",
        "[16] M. Ayer, H. D. Brunk, G. M. Ewing, W. T. Reid, and E. Silverman, \"An empirical distribution function for inversely related random variables,\" *Annals of Mathematical Statistics*, vol. 26, no. 4, pp. 641–647, 1955.",
        "[17] G. W. Brier, \"Verification of forecasts expressed in terms of probability,\" *Monthly Weather Review*, vol. 78, no. 1, pp. 1–3, Jan. 1950.",
        "[18] L. S. Shapley, \"A value for n-person games,\" in *Contributions to the Theory of Games II*, H. W. Kuhn and A. W. Tucker, Eds. Princeton, NJ, USA: Princeton University Press, 1953, pp. 307–317.",
        "[19] S. M. Lundberg et al., \"From local explanations to global understanding with explainable AI for trees,\" *Nature Machine Intelligence*, vol. 2, no. 1, pp. 56–67, Jan. 2020.",
        "[20] C. Molnar, *Interpretable Machine Learning: A Guide for Making Black Box Models Explainable*, 2nd ed. Munich, Germany: Christoph Molnar, 2022.",
        "[21] I. Gurol-Urganci, T. de Jongh, V. Vodopivec-Jamsek, R. Atun, and J. Car, \"Mobile phone messaging reminders for attendance at healthcare appointments,\" *Cochrane Database of Systematic Reviews*, no. 12, p. CD007458, Dec. 2013.",
        "[22] W. Hoeffding, \"On the distribution of the number of successes in independent trials,\" *Annals of Mathematical Statistics*, vol. 27, no. 3, pp. 713–721, Sep. 1956.",
        "[23] Y. Hong, \"On computing the distribution function for the Poisson binomial distribution,\" *Computational Statistics & Data Analysis*, vol. 59, pp. 41–51, Mar. 2013.",
    ]

    for ref in references:
        p = add_p(ref, space_before=2, space_after=6)
        p.paragraph_format.left_indent = Inches(0.4)
        p.paragraph_format.first_line_indent = Inches(-0.4)

    doc.add_page_break()

    # APPENDICES
    add_h1("APPENDICES")

    add_h2("Appendix A: Core Database Schema and Entity-Relationship Definitions")
    add_p(
        "This appendix documents the structural DDL schema definitions for the core operational tables within the PostgreSQL 16 relational database (Alembic migration head c9d0e1f2a3b4)."
    )
    add_p(
        "1. Appointments Table (appointments):\n"
        "Columns: id (UUID, PK), hospital_id (UUID, FK -> hospitals), patient_id (UUID, FK -> patients), "
        "doctor_id (UUID, FK -> doctors), clinic_session_id (UUID, FK -> doctor_clinic_sessions), "
        "scheduled_time (VARCHAR), status (VARCHAR: scheduled, completed, no_show, cancelled), "
        "no_show (BOOLEAN, nullable), lead_days (FLOAT), fee_lkr (FLOAT), queue_token (INTEGER), "
        "booking_channel (VARCHAR), payment_mode (VARCHAR), sms_received (BOOLEAN), "
        "rescheduled_from_id (UUID, FK -> appointments), created_at (TIMESTAMP)."
    )
    add_p(
        "2. Predictions Table (predictions):\n"
        "Columns: id (UUID, PK), appointment_id (UUID, UNIQUE, FK -> appointments), "
        "hospital_id (UUID, FK -> hospitals), risk_score (FLOAT [0.0, 1.0]), "
        "risk_category (VARCHAR: High, Medium, Low), model_version (VARCHAR), "
        "top_features (JSONB), recommended_action (VARCHAR), calculated_at (TIMESTAMP)."
    )
    add_p(
        "3. Reschedule Conversations Table (reschedule_conversations):\n"
        "Columns: id (UUID, PK), appointment_id (UUID, FK -> appointments), "
        "patient_id (UUID, FK -> patients), hospital_id (UUID, FK -> hospitals), "
        "status (VARCHAR: awaiting_reply, offering, choosing_doctor, pending_approval, booked, kept, needs_staff, no_reply), "
        "current_slot_offer (JSONB), language (VARCHAR: en, si, ta), "
        "expires_at (TIMESTAMP, 24h deadline), approved_by (VARCHAR), created_at (TIMESTAMP)."
    )

    add_h2("Appendix B: Machine Learning Feature Dictionary and Variable Specifications")
    add_p(
        "This appendix details the 42 model input dimensions generated by the preprocessing pipeline (shai_model.py) for the calibrated XGBoost classifier:"
    )
    add_p(
        "• Numeric Continuous Features: lead_days (booking lead time), distance_km (transit distance in km), prior_no_show_rate (Bayesian smoothed historical rate), prior_appts (lifetime visit count), chronic_count (comorbidity index 0-4), appt_hour (hour of clinic 8-21), appt_dow (day of week 0-6), appt_month (calendar month 1-12)."
    )
    add_p(
        "• Binary Indicators: distance_missing (imputation indicator), is_first_visit (new patient flag), heavy_rain (monsoon warning), is_poya (Poya holiday), is_weekend (Saturday/Sunday), sms_sent (prior SMS dispatched)."
    )
    add_p(
        "• One-Hot Encoded Categorical Attributes:\n"
        "  - booking_channel: Counter, Doc990, MyHealth, Phone, eChannelling\n"
        "  - payment_mode: Card, Cash, Corporate, Insurance, Prepaid_Online\n"
        "  - department: Cardiology, Dermatology, ENT, Endocrinology, Gastroenterology, General Medicine, Gynecology, Neurology, Orthopedics, Pediatrics, Psychiatry, Urology."
    )

    add_h2("Appendix C: Conversational State Machine Dialogue Templates (EN, SI, TA)")
    add_p(
        "This appendix reproduces the trilingual conversational dialogue templates utilized by the automated rescheduling state machine (backend/app/services/reschedule_flow.py):"
    )
    add_p(
        "1. English (EN) Templates:\n"
        "• Initial Query: 'Hello {name}, this is {hospital}. Can you still attend your appointment with {doctor} on {when}? Reply 1 to confirm, or 2 if you need to change the time.'\n"
        "• Preserved Booking: 'Thank you {name}, your appointment on {when} stays as booked (token #{token}). See you then.'\n"
        "• Slot Proposal: 'Dr {doctor} is free on {when} (Room {room}). Reply 1 to take this time, or 2 to see other options.'\n"
        "• Pending Approval: 'Thank you {name}. We are confirming {doctor} on {when} with our desk and will message you shortly.'"
    )
    add_p(
        "2. Sinhala (SI) Templates:\n"
        "• Initial Query: 'ආයුබෝවන් {name}, මෙය {hospital}. {when} දින {doctor} සමඟ ඔබගේ වේලාවට පැමිණිය හැකිද? තහවුරු කිරීමට 1 ද, වේලාව වෙනස් කිරීමට 2 ද ලෙස පිළිතුරු දෙන්න.'\n"
        "• Preserved Booking: 'ස්තූතියි {name}, {when} ඔබගේ වේලාව එලෙසම පවතී (ටෝකන් #{token}).'\n"
        "• Slot Proposal: '{doctor} {when} (කාමරය {room}) නිදහස්ය. මෙම වේලාව ගැනීමට 1 ද, වෙනත් විකල්ප සඳහා 2 ද ලෙස පිළිතුරු දෙන්න.'\n"
        "• Pending Approval: 'ස්තූතියි {name}. {when} {doctor} සමඟ වේලාව අපගේ කාර්යාලය සමඟ තහවුරු කරමින් සිටිමු; ඉක්මනින් පණිවිඩයක් එවමු.'"
    )
    add_p(
        "3. Tamil (TA) Templates:\n"
        "• Initial Query: 'வணக்கம் {name}, இது {hospital}. {when} அன்று {doctor} உடனான உங்கள் சந்திப்புக்கு வர முடியுமா? உறுதிப்படுத்த 1, நேரத்தை மாற்ற 2 என பதிலளிக்கவும்.'\n"
        "• Preserved Booking: 'நன்றி {name}, {when} உங்கள் சந்திப்பு அப்படியே உள்ளது (டோக்கன் #{token}).'\n"
        "• Slot Proposal: '{doctor} {when} (அறை {room}) அன்று இலவசம். இந்த நேரத்தை எடுக்க 1, வேறு விருப்பங்களுக்கு 2 என பதிலளிக்கவும்.'\n"
        "• Pending Approval: 'நன்றி {name}. {when} {doctor} உடன் நேரத்தை எங்கள் மேசையுடன் உறுதிப்படுத்துகிறோம்; விரைவில் செய்தி அனுப்புவோம்.'"
    )

    add_h2("Appendix D: Hospital Administration and Role-Based Access Audit Log Samples")
    add_p(
        "This appendix documents administrative audit event structures recorded in hospital_audit_logs for security governance and compliance:\n"
        "• Event: USER_APPROVAL | User: shanika.silva@asiri.lk | Role Assigned: analyst | Authorized By: admin@asiri.lk | Timestamp: 2026-09-29T14:22:10Z\n"
        "• Event: RESCHEDULE_APPROVED | Patient UHID: DEMO-CV-000 | From Appointment: #73941 | To Slot: 2026-10-14 17:30 | Approved By: tharindu.e@asiri.lk | Token: #14\n"
        "• Event: OVERBOOKING_OVERRIDE | Clinic Session: Dr. Asoka Jayawardena (2026-10-04) | Extra Bookings Applied: +2 | Authorizer: clinic_manager@asiri.lk"
    )
