# Chapter 2: OBJECTIVES

def write_chapter2(doc, add_h1, add_h2, add_h3, add_p):
    add_h1("2 OBJECTIVES")

    add_h2("2.1 General Objective")
    add_p(
        "The overarching aim of this research is to design, engineer, evaluate, and deploy an explainable machine learning and deterministic operations orchestration platform—termed SHAI (Smart Hospital AI Operations Platform)—that accurately predicts outpatient appointment no-shows, provides transparent patient-level risk attributions, optimizes clinic session capacity through exact overbooking mathematics, and orchestrates autonomous, trilingual conversational rescheduling with human-in-the-loop clinical governance in Sri Lankan private tertiary hospitals."
    )

    add_h2("2.2 Specific Objectives")
    add_p(
        "To accomplish the general research aim, the study formulates the following specific technical, algorithmic, operational, and clinical objectives:"
    )

    add_h3("2.2.1 Predictive Modeling and Statistical Calibration Objectives")
    add_p(
        "1. To develop a robust data preprocessing and feature engineering pipeline that transforms raw patient demographic records, historical visit logs, temporal appointment indices, transit distances, and local environmental variables into an optimized numerical feature matrix."
    )
    add_p(
        "2. To benchmark candidate machine learning algorithms—including Logistic Regression, Decision Trees, Random Forests, and Gradient Boosted Decision Trees (XGBoost)—under a rigorous chronological train/validation/test split reflecting real-world clinical deployment."
    )
    add_p(
        "3. To execute Bayesian hyperparameter optimization (via Optuna) to maximize discrimination performance (ROC-AUC and Precision-Recall AUC) while avoiding overfitting to training data distributions."
    )
    add_p(
        "4. To implement non-parametric isotonic regression to map raw model classification outputs into well-calibrated posterior probabilities, minimizing Brier scores and aligning predicted risk deciles with empirical attendance frequencies."
    )

    add_h3("2.2.2 Clinical Explainability and Interpretability Objectives")
    add_p(
        "1. To integrate Tree-based Shapley Additive Explanations (TreeSHAP) into the model inference pipeline to generate local, patient-specific feature attribution scores that quantify the positive and negative impact of each variable on attendance risk."
    )
    add_p(
        "2. To compute global feature importance hierarchies across the validation cohort, identifying dominant systemic predictors of absenteeism across clinical departments."
    )
    add_p(
        "3. To design a transparent heuristic action recommendation layer that translates calibrated risk tiers and positive SHAP attributions into personalized, clinically sound operational suggestions (such as telephone outreach, SMS reminders, slot rescheduling, or telehealth offers)."
    )

    add_h3("2.2.3 Capacity Optimization and Queue Engineering Objectives")
    add_p(
        "1. To formulate an exact Poisson-binomial probability distribution algorithm via dynamic programming convolution, calculating the exact distribution of patient arrivals across heterogeneous individual attendance probabilities."
    )
    add_p(
        "2. To implement a dynamic overbooking optimization function that balances recovered consultation revenue against physician overtime and patient waiting time penalties, identifying the optimal overbooking quota per clinic session."
    )
    add_p(
        "3. To construct interactive operational tools, including a 15-minute slot risk accumulation heatmap, a multi-horizon capacity forecasting engine with 80% confidence intervals, and a 'What-If Studio' for real-time scenario simulation."
    )

    add_h3("2.2.4 Deterministic Multi-Turn Patient Orchestration Objectives")
    add_p(
        "1. To design and implement a finite-state machine (FSM) conversational architecture that executes proactive, multi-turn patient dialogue in English, Sinhala, and Tamil across SMS and WhatsApp communication channels."
    )
    add_p(
        "2. To establish an 'ask-first' rescheduling protocol that queries patient attendance confirmation before offering alternative appointments, querying real-time clinic capacity across a 28-day intra-departmental window."
    )
    add_p(
        "3. To incorporate strict human-in-the-loop clinical governance by halting automated conversational transitions at a 'pending approval' state, requiring authorized hospital staff confirmation prior to final database slot booking."
    )
    add_p(
        "4. To engineer a post-missed appointment recall queue that tracks recent non-attendees, facilitates rebooking under standard capacity constraints, and logs empirical recovery rates."
    )

    add_h3("2.2.5 Clinical Privacy, Fairness, and Scientific Hold-Out Objectives")
    add_p(
        "1. To enforce strict clinical privacy safeguards by sanitizing sensitive psychiatric, psychological, and mental health specialty designations in patient-facing messages and external LLM prompts, substituting stigmatizing terminology with neutral clinic descriptors."
    )
    add_p(
        "2. To conduct comprehensive subgroup fairness audits across demographic categories (age bands, gender, geographic transit bands, booking channels, and payment modes), verifying algorithmic equity and absence of systemic disparate impact."
    )
    add_p(
        "3. To implement a deterministic, cryptographic randomized hold-out protocol (via SHA-256 appointment hashing) that partitions an uncontacted control arm, establishing the methodological foundation for intention-to-treat (ITT) randomized controlled trials."
    )

    add_h3("2.2.6 Economic Sensitivity and Decision-Theoretic ROI Objectives")
    add_p(
        "1. To model decision-theoretic return-on-investment (ROI) by reconciling empirical local telecom tariffs, front-desk administrative labor wages, and hospital platform operating expenses."
    )
    add_p(
        "2. To conduct comprehensive multi-dimensional sensitivity analyses across empirical consultation fee ranges (LKR 2,000 to LKR 4,700) and clinical recall efficacy boundaries (17% to 38% based on Rajasuriya et al., 2010), identifying operational break-even thresholds and financial ceilings."
    )
    add_p(
        "3. To validate software system robustness through an enterprise-grade automated testing suite comprising over 200 backend unit and integration tests and frontend component tests, verifying end-to-end reliability for production clinical environments."
    )
