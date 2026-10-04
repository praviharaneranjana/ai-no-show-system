# Chapter 4: METHODOLOGY

def write_chapter4(doc, add_h1, add_h2, add_h3, add_h4, add_p, add_caption_figure, add_caption_table, add_figure_image, format_custom_table):
    add_h1("4 METHODOLOGY")

    add_h2("4.1 Research Design and System Architecture")
    add_p(
        "This research adopts a rigorous Design Science Research (DSR) methodology coupled with experimental quantitative evaluation to architect, implement, and validate the SHAI (Smart Hospital AI Operations Platform) system. "
        "The software architecture follows an enterprise-grade, multi-tier decoupled architecture designed for high throughput, sub-second inference latency, strict transactional data consistency, and robust clinical governance."
    )
    add_p(
        "Figure 4.1 illustrates the high-level architecture of the SHAI healthcare operations platform, delineating the client interaction layers, backend API gateways, machine learning inference pipelines, and persistent relational data tiers."
    )

    add_figure_image("docs/thesis_assets/fig4_1_architecture.png", width_inches=6.0)
    add_caption_figure("4.1", "High-Level Architecture of the SHAI Healthcare Operations Platform")

    add_p(
        "The complete system comprises four principal tiers:"
    )
    add_p(
        "1. Presentation and Client Tier: Built on Next.js 16 (React 19, TypeScript, and Tailwind CSS v4), utilizing the modern Next.js App Router with Server Components and Server Actions. "
        "The interface incorporates accessible UI primitives (shadcn/ui, Base UI), dynamic analytical data visualizations (Recharts), and interactive vector geospatial cartography (MapLibre GL with CARTO basemaps). "
        "For native hospital desktop deployment, the application is packaged via an Electron 33 standalone wrapper, providing local port isolation and secure hardware execution."
    )
    add_p(
        "2. API Gateway and Application Tier: Powered by Python 3.12 and FastAPI (running under Uvicorn ASGI). "
        "The backend serves high-performance RESTful API endpoints, enforcing strict Pydantic v2 data validation schemas, role-based security middleware, and asynchronous task execution. "
        "All database operations are mediated via SQLAlchemy 2.0 ORM with connection pooling and explicit transaction management."
    )
    add_p(
        "3. Machine Learning and Intelligence Tier: Operates in-process within the FastAPI container to eliminate network latency. "
        "The core model bundle (stored in native JSON without unsafe Python pickles) encapsulates the trained XGBoost classifier, isotonic calibration regression tables, feature engineering mappings, and TreeSHAP explainability explainer. "
        "Natural language message drafting integrates with Google Gemini API (gemini-3.1-flash-lite) with deterministic heuristic fallbacks."
    )
    add_p(
        "4. Relational Data and Persistence Tier: Hosted on PostgreSQL 16, structured across 32 relational tables managed under Alembic database migrations (migration head c9d0e1f2a3b4). "
        "The schema supports multi-tenant hospital isolation, patient master indexing, immutable audit logging, and transactional slot reservation."
    )

    add_h2("4.2 Synthetic Data Engineering and Healthcare Data Modeling")
    add_h3("4.2.1 Data Generation Assumptions and Sri Lankan Environmental Features")
    add_p(
        "Due to clinical ethics constraints and the confidentiality of private hospital electronic health records, an empirical synthetic data generator was engineered to produce realistic, multi-attribute outpatient appointment records. "
        "The data generation methodology translates published epidemiological literature, local clinical observations, and Sri Lankan infrastructural conditions into a probabilistic generative process."
    )
    add_p(
        "The synthetic generator models a primary private tertiary hospital—Asiri Central Hospital, Colombo—spanning 16 clinical departments (including General Medicine, Cardiology, Dermatology, Pediatrics, Psychiatry, Endocrinology, and Orthopedics) and 65 attending consultant physicians over a multi-year timeline (2024 to 2026). "
        "The dataset incorporates specific Sri Lankan operational parameters:"
    )
    add_p(
        "• Booking Channels: Reflects the multi-channel channelling ecosystem in Sri Lanka: Mobile telecom booking portals (Doc990, eChannelling), hospital mobile application (MyHealth), inbound clinic telephone calls, and physical walk-in hospital registration counters."
    )
    add_p(
        "• Payment Modes: Models cash counter settlement, credit/debit card, employer corporate credit billing, private insurance cashless guarantee, and digital prepayment (Prepaid Online)."
    )
    add_p(
        "• Geospatial Transit Distances: Integrates a localized geospatial dataset comprising 16,450 Sri Lankan towns and postal divisions. Patient residence coordinates are mapped against the hospital location, computing straight-line and road network transit distances via Open Source Routing Machine (OSRM) and Photon geocoding."
    )
    add_p(
        "• Local Environmental Shocks: Models monsoonal precipitation shocks (heavy rain warnings) and Buddhist Full Moon Poya holidays (statutory public holidays in Sri Lanka occurring every 28 days), capturing real-world societal disruptions."
    )

    add_h3("4.2.2 Relational Database Schema and Multi-Tenancy Architecture")
    add_p(
        "The underlying PostgreSQL relational schema was designed to support enterprise hospital management while providing strict multi-tenant isolation. "
        "Table 4.1 summarizes the core relational tables and their functional roles within the SHAI platform."
    )

    add_caption_table("4.1", "Relational Database Schema Table Catalog and Functional Specifications")
    t41 = doc.add_table(rows=10, cols=2)
    t41_data = [
        ("Table Name", "Functional Description and Key Attributes"),
        ("hospitals", "Tenant master entity storing hospital profile, location, bed capacity, and accreditation"),
        ("departments", "Clinical specialty departments with telehealth eligibility settings (telehealth_ok)"),
        ("doctors", "Attending medical consultants linked to departments, specialty fees, and hospital tenants"),
        ("doctor_clinic_sessions", "Scheduled clinic sessions with start/end time, room number, max capacity, and token count"),
        ("patients", "Master patient index (MPI) with demographics, NIC, mobile phone, comorbidity flags, and transit distance"),
        ("appointments", "Outpatient booking records linking patient, doctor, session, status, lead time, and fee"),
        ("predictions", "Unique real-time prediction record per appointment storing calibrated probability, risk tier, and drivers"),
        ("reschedule_conversations", "State machine tracking active patient dialogue, current state, expiration deadline, and staff approval"),
        ("interventions", "Audit log of all outbound messages, inbound replies, slot offers, and clinical action dispatches"),
    ]
    for r_idx, (k, v) in enumerate(t41_data):
        row = t41.rows[r_idx]
        row.cells[0].paragraphs[0].text = k
        row.cells[1].paragraphs[0].text = v
    format_custom_table(t41, [2.2, 4.0])

    add_p(
        "Figure 4.2 illustrates the entity-relationship model connecting these core operational tables."
    )
    add_figure_image("docs/thesis_assets/fig4_2_er_diagram.png", width_inches=6.0)
    add_caption_figure("4.2", "Entity-Relationship Data Model of the Hospital Scheduling Schema")

    add_h2("4.3 Feature Engineering and Chronological Data Partitioning")
    add_p(
        "To ensure maximal predictive utility, raw appointment records undergo comprehensive feature transformation. "
        "The engineered feature space encompasses 24 base attributes spanning continuous numeric, binary clinical, and one-hot encoded categorical variables, expanding to 42 model input dimensions."
    )
    add_p(
        "Table 4.2 delineates the complete feature dictionary, detailing the operational rationale and statistical handling for each variable."
    )

    add_caption_table("4.2", "Engineered Predictive Feature Schema and Variable Descriptions")
    t42 = doc.add_table(rows=11, cols=3)
    t42_data = [
        ("Feature Name", "Data Type", "Operational Description and Derivation"),
        ("lead_days", "Float (Continuous)", "Elapsed calendar days between booking transaction and appointment date"),
        ("prior_no_show_rate", "Float [0.0, 1.0]", "Bayesian smoothed historical absenteeism rate: (prior_miss + 2*0.16) / (prior_appts + 2)"),
        ("prior_appts", "Integer", "Total historical appointment count for the patient in the hospital system"),
        ("prior_no_shows", "Integer", "Total count of documented historical appointment non-attendances"),
        ("is_first_visit", "Binary (0/1)", "Indicator flagging patients with zero previous hospital appointment records"),
        ("distance_km", "Float (Continuous)", "Geospatial road/straight-line distance (km) from patient town to hospital"),
        ("distance_missing", "Binary (0/1)", "Imputation indicator flagging appointments where transit distance was unrecorded"),
        ("chronic_count", "Integer [0, 4]", "Sum of documented comorbidities: hypertension, diabetes, alcoholism, handicap"),
        ("appt_hour", "Integer [8, 21]", "Scheduled appointment hour extracted from clinic session start time"),
        ("heavy_rain", "Binary (0/1)", "Meteorological indicator for extreme monsoonal precipitation on appointment date"),
    ]
    for r_idx, (c0, c1, c2) in enumerate(t42_data):
        row = t42.rows[r_idx]
        row.cells[0].paragraphs[0].text = c0
        row.cells[1].paragraphs[0].text = c1
        row.cells[2].paragraphs[0].text = c2
    format_custom_table(t42, [1.8, 1.5, 2.9])

    add_p(
        "To prevent temporal data leakage, the generated dataset (Total N = 64,444 appointments) is partitioned strictly by chronological timestamp:"
    )
    add_p(
        "• Training Set (Oldest records): 42,693 appointments (66.2%)\n"
        "• Validation Set (Intermediate chronological period): 12,366 appointments (19.2%)\n"
        "• Test Set (Most recent held-out period): 9,385 appointments (14.6%)"
    )
    add_p(
        "The systemic no-show base rate across the dataset is 15.9%, reflecting empirical private outpatient attendance norms."
    )

    add_h2("4.4 Predictive Machine Learning Pipeline and Bayesian Hyperparameter Tuning")
    add_p(
        "The predictive modeling pipeline evaluates four candidate classification algorithms: Logistic Regression (with standard scaling), Decision Trees, Random Forests, and Extreme Gradient Boosting (XGBoost). "
        "For the primary classifier, XGBoost was selected due to its robust regularization, handling of non-linear interactions, and high computational efficiency."
    )
    add_p(
        "To optimize XGBoost hyperparameters, Bayesian optimization was executed via Optuna across 50 trials on the validation set, maximizing the validation ROC-AUC objective. "
        "The search space evaluated:"
        " tree depth (max_depth: 3 to 8), learning rate (learning_rate: 0.01 to 0.20), estimator count (n_estimators: 100 to 500), minimum child weight (min_child_weight: 1 to 10), subsample ratio (subsample: 0.6 to 1.0), and feature subsampling (colsample_bytree: 0.6 to 1.0)."
    )

    add_h2("4.5 Probability Calibration and Rank-Based Operational Risk Tiers")
    add_p(
        "Raw probabilities produced by the tuned XGBoost model undergo non-parametric Isotonic Regression fitted on the chronological validation set. "
        "The calibration function maps raw scores $s \\in [0, 1]$ to calibrated probabilities $p_{\\text{cal}} = g(s)$ via piecewise constant linear interpolation, resolving probability under-estimation."
    )
    add_p(
        "Rather than imposing arbitrary probability thresholds (such as 0.50), SHAI establishes capacity-based, rank-ordered operational risk tiers defined on the validation set distribution:"
    )
    add_p(
        "• High Risk: Top 10% of validation risk distribution (threshold $p \\ge 0.272$). Represents appointments requiring proactive phone calls, personal triage, and capacity rescheduling offers.\n"
        "• Medium Risk: Next 20% of validation risk distribution (threshold $0.165 \\le p < 0.272$). Represents appointments requiring automated trilingual SMS/WhatsApp confirmation reminders.\n"
        "• Low Risk: Bottom 70% of validation risk distribution ($p < 0.165$). Managed under standard automated hospital confirmation protocols."
    )

    add_h2("4.6 Global and Local Explainability Engine (TreeSHAP)")
    add_p(
        "To provide full clinical interpretability, the inference pipeline integrates TreeSHAP. "
        "For every scored appointment, the TreeExplainer calculates exact Shapley values across all 42 input features in log-odds space. "
        "The local explanation extracts the top 6 features exhibiting the largest absolute contribution, sorting features into risk-increasing drivers (positive SHAP values) and risk-decreasing protective factors (negative SHAP values)."
    )

    add_h2("4.7 Transparent Heuristic Action Recommendation Layer")
    add_p(
        "To bridge the gap between risk prediction and clinical action, SHAI implements a transparent heuristic action recommendation layer (frontend/lib/recommend-action.ts). "
        "Rather than deploying an opaque reinforcement learning policy, the engine evaluates the patient's calibrated risk tier, comorbidity profile, and positive SHAP drivers to recommend targeted operational actions. "
        "Table 4.3 outlines the heuristic decision rules."
    )

    add_caption_table("4.3", "Rule-Based Heuristic Action Recommendation Decision Logic")
    t43 = doc.add_table(rows=6, cols=3)
    t43_data = [
        ("Action Key", "Target Action", "Trigger Logic and Underlying SHAP Attribution"),
        ("call", "Direct Phone Call", "High Risk tier OR prior_no_show among top SHAP drivers; patient has valid phone"),
        ("reschedule", "Offer New Slot", "Booking lead_days among top positive SHAP drivers; offer closer appointment date"),
        ("telehealth", "Offer Telehealth", "Transit distance_km >= 20km OR heavy_rain active; restricted to telehealth_ok departments"),
        ("sms", "SMS Reminder", "Medium Risk tier OR no previous reminder dispatched (sms_received == False)"),
        ("monitor", "Standard Protocol", "Low Risk tier with reminders confirmed; routine reception desk check-in"),
    ]
    for r_idx, (c0, c1, c2) in enumerate(t43_data):
        row = t43.rows[r_idx]
        row.cells[0].paragraphs[0].text = c0
        row.cells[1].paragraphs[0].text = c1
        row.cells[2].paragraphs[0].text = c2
    format_custom_table(t43, [1.5, 1.8, 2.9])

    add_h2("4.8 Exact Poisson-Binomial Dynamic Programming Overbooking Optimizer")
    add_p(
        "To optimize clinic session capacity, SHAI implements an exact Poisson-binomial dynamic programming convolution algorithm. "
        "For a clinic session with $n$ booked patients, each patient $i$ arrives independently with attendance probability $q_i = 1 - p_i$ (where $p_i$ is the calibrated no-show probability). "
        "The probability distribution of total patient arrivals $N$ is computed recursively without stochastic simulation error:"
    )
    add_p(
        "$$P(N = k; n) = P(N = k; n-1) \\cdot (1 - q_n) + P(N = k-1; n-1) \\cdot q_n$$"
    )
    add_p(
        "For a clinic session with physical capacity $C$, base consultation fee $F$, wait/overrun penalty $W$, and $k$ potential extra overbooked patients, the economic net value function is formulated as:"
    )
    add_p(
        "$$\\text{Value}(k) = F \\cdot \\mathbb{E}[\\min(N_k, C)] - W \\cdot \\mathbb{E}[\\max(N_k - C, 0)]$$"
    )
    add_p(
        "The optimal overbooking recommendation $k^*$ is determined via deterministic parameter search:"
    )
    add_p(
        "$$k^* = \\arg\\max_{0 \\le k \\le \\text{Free} + k_{\\text{max}}} \\text{Value}(k)$$"
    )
    add_p(
        "subject to the physician overtime boundary constraint $P(N_k > C) \\le \\alpha_{\\text{tolerance}}$."
    )

    add_h2("4.9 Ask-First Rescheduling Conversational State Machine")
    add_p(
        "To recover at-risk appointments proactively, SHAI implements an automated, multi-turn conversational state machine (backend/app/services/reschedule_flow.py). "
        "Unlike aggressive commercial bots that immediately reassign appointments, the engine enforces an 'ask-first' conversational design: the patient is first queried regarding their attendance confirmation before any changes are proposed."
    )
    add_p(
        "Figure 4.3 illustrates the finite-state transition architecture governing patient dialogue."
    )
    add_figure_image("docs/thesis_assets/fig4_3_state_machine.png", width_inches=6.0)
    add_caption_figure("4.3", "Finite-State Transition Architecture for Autonomous Conversational Rescheduling")

    add_p(
        "The state machine executes the following sequential progression:"
    )
    add_p(
        "1. awaiting_reply: System issues proactive trilingual query. Reply '1' transitions to kept (booking preserved). Reply '2' or date text transitions to offering.\n"
        "2. offering: System searches open clinic sessions across a 28-day window within the same department. Same doctor is prioritized; up to 3 departmental colleagues offered upon subsequent decline. Reply '1' transitions to pending_approval.\n"
        "3. pending_approval: Patient selection halts at an administrative governance barrier. Hospital front-desk staff review the agreed slot in the Outreach Hub and execute final approval, executing slot database locks.\n"
        "4. Timeouts and Escalations: If a patient remains silent for 24 hours, the conversation transitions to no_reply. Three consecutive unparsed messages escalate immediately to needs_staff for manual telephone triage."
    )

    add_h2("4.10 Multi-Lingual Natural Language Engine and Clinical Privacy Safeguards")
    add_p(
        "Patient communication in Sri Lanka requires localized fluency across English, Sinhala (සිංහල), and Tamil (தமிழ்). "
        "SHAI implements a hybrid natural language engine: structured state transitions utilize deterministic, native-script dialogue templates (verified in Sinhala and Tamil), while dynamic conversational drafts utilize Google Gemini API (gemini-3.1-flash-lite)."
    )
    add_p(
        "Strict clinical privacy safeguards are enforced (backend/app/outreach_drafter.py):"
    )
    add_p(
        "• Identification Sanitization: Patient full names, National Identity Card (NIC) numbers, telephone numbers, and addresses never leave the secure server. Prompt variables utilize token placeholders ({NAME}, {TIME}) populated locally post-inference."
    )
    add_p(
        "• Sensitive Specialty Masking: For stigmatizing clinical specialties—including psychiatry, psychology, mental health, substance addiction, and psychotherapy—the department name is withheld from prompts and messages. The specialty is replaced with neutral descriptors ('clinic', 'සායන', 'கிளினிக்') to prevent inadvertent disclosure across shared family mobile devices, in accordance with clinical ethical protocols established by Rajasuriya et al. (2010) [7]."
    )

    add_h2("4.11 Scientific Evaluation Protocol: Randomized Outreach Hold-Out Design")
    add_p(
        "To resolve the critical limitation of prior clinical reminder studies (the absence of a control group), SHAI implements a built-in scientific evaluation protocol via randomized hold-out partitioning (backend/app/holdout.py)."
    )
    add_p(
        "When enabled (OUTREACH_HOLDOUT_PCT > 0), the system partitions flagged high-risk appointments into an active intervention arm and an uncontacted control arm via deterministic cryptographic hashing:"
    )
    add_p(
        "$$\\text{Arm}(\\text{appt}) = \\begin{cases} \\text{holdout}, & \\text{if } \\text{SHA256}(\\text{salt} \\parallel \\text{appt\\_id}) \\pmod{10000} < 100 \\times \\text{pct} \\\\ \\text{contact}, & \\text{otherwise} \\end{cases}$$"
    )
    add_p(
        "This deterministic design ensures that administrative staff cannot manipulate or bypass control arm assignments, providing an immutable foundation for calculating true Intention-To-Treat (ITT) relative risk reductions and sample size statistical power."
    )

    add_h2("4.12 Software Quality Assurance, Testing Framework, and Verification Strategy")
    add_p(
        "To verify enterprise reliability, the SHAI platform implements a multi-tier automated testing framework. "
        "The backend testing suite is built on pytest and httpx, executing unit and transactional integration tests against an isolated PostgreSQL test database instance (noshow_test_db). "
        "The frontend testing suite is implemented via Vitest and React Testing Library, verifying component rendering, hook behavior, and state changes. "
        "Table 4.4 details the complete technology component stack and dependencies."
    )

    add_caption_table("4.4", "Software Architecture Component Catalog and Technology Stack Versions")
    t44 = doc.add_table(rows=8, cols=3)
    t44_data = [
        ("Subsystem / Component", "Technology / Framework", "Pinned Production Version"),
        ("Backend Web Framework", "FastAPI / Starlette / Uvicorn", "0.141.1 / 1.6.0 / 0.52.4"),
        ("Relational Database & ORM", "PostgreSQL / SQLAlchemy / Alembic", "16.0 / 2.0.52 / 1.19.1"),
        ("Machine Learning Core", "XGBoost / scikit-learn / TreeSHAP", "3.4.1 / 1.9.0 / 0.52.0"),
        ("Language Intelligence", "Google GenAI SDK (Gemini Flash-Lite)", "2.25.0"),
        ("Frontend Application", "Next.js (App Router) / React / TypeScript", "16.3.1 / 19.2.8 / 5.9.3"),
        ("Styling & Cartography", "Tailwind CSS v4 / MapLibre GL", "4.3.3 / 6.11.2"),
        ("Desktop Client Wrapper", "Electron / electron-builder", "33.4.11 / 25.1.8"),
    ]
    for r_idx, (c0, c1, c2) in enumerate(t44_data):
        row = t44.rows[r_idx]
        row.cells[0].paragraphs[0].text = c0
        row.cells[1].paragraphs[0].text = c1
        row.cells[2].paragraphs[0].text = c2
    format_custom_table(t44, [2.0, 2.5, 1.7])
