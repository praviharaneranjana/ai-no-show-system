# Chapter 3: LITERATURE REVIEW

def write_chapter3(doc, add_h1, add_h2, add_h3, add_p, add_caption_table, format_custom_table):
    add_h1("3 LITERATURE REVIEW")

    add_h2("3.1 Determinants and Dynamics of Outpatient Absenteeism")
    add_p(
        "Outpatient appointment absenteeism represents a deeply studied yet persistent operational vulnerability across global healthcare delivery systems. "
        "A comprehensive understanding of the multifaceted determinants influencing patient attendance is essential for designing effective predictive and operational interventions. "
        "Systematic reviews across international ambulatory care literature indicate that outpatient non-attendance is driven by a complex interplay of patient sociodemographics, logistical barriers, clinical characteristics, behavioral history, and temporal scheduling parameters [1], [2]."
    )
    add_p(
        "Among logistical and administrative variables, appointment lead time—defined as the elapsed interval between the date of booking creation and the scheduled clinical consultation—is universally identified as the single most powerful predictor of absenteeism [1], [2]. "
        "Extensive empirical investigations by Srinivas and Ravindran [2] and Cayirli and Veral [1] demonstrate that no-show probability scales monotonically with booking lead time. "
        "Appointments scheduled within 24 to 48 hours of consultation exhibit baseline absenteeism rates below 8%, whereas lead times exceeding 30 to 60 days frequently exceed 25% to 35% non-attendance. "
        "This dynamic is attributed to psychological factors, including symptom resolution, scheduling forgetfulness, competing personal obligations, and the emergence of logistical conflicts [1], [2]."
    )
    add_p(
        "Historical patient behavior provides another profound predictive signal. "
        "Studies evaluating patient compliance patterns consistently demonstrate that individuals with a documented history of prior missed appointments exhibit significantly higher future absenteeism rates than first-time visitors or reliably attending patients [2]. "
        "However, raw historical failure counts introduce statistical distortion for patients with few lifetime visits. "
        "To mitigate sample size instability, contemporary predictive frameworks incorporate empirical Bayesian smoothing, shrinking observed individual rates toward the systemic population base rate to generate robust historical risk indicators."
    )
    add_p(
        "Demographic and socioeconomic indicators have also been extensively investigated. "
        "Age consistently demonstrates a non-linear relationship with attendance: young adults (aged 18 to 35) consistently display the highest absenteeism rates across primary and specialty care, driven by employment constraints, mobility, and lower perceived disease vulnerability. "
        "Conversely, pediatric patients (accompanied by parents) and senior citizens (aged 65 and above) exhibit substantially higher compliance rates, reflecting familial caregiving structures and heightened health awareness. "
        "While gender associations vary across medical specialties, sociodemographic factors such as employment flexibility, educational attainment, and healthcare financing mechanisms heavily mediate attendance adherence [2], [7]."
    )
    add_p(
        "Environmental and geographical frictions represent crucial yet frequently overlooked determinants in appointment scheduling. "
        "Geographic distance and transit travel times create severe physical barriers to attendance, particularly for patients dependent on public transit networks. "
        "Furthermore, meteorological phenomena—such as adverse weather conditions, extreme precipitation, and urban flooding—impose acute transit friction, triggering abrupt spikes in clinic absenteeism. "
        "In developing tropical nations such as Sri Lanka, where monsoonal weather cycles cause localized urban flooding in Colombo and religious Poya holidays disrupt normal societal routines, environmental determinants exert profound influence on ambulatory attendance dynamics [4], [7]."
    )

    add_h2("3.2 Machine Learning in Healthcare Appointment Scheduling")
    add_p(
        "Over the past decade, healthcare informatics has shifted decisively from descriptive operational reporting toward predictive machine learning (ML) frameworks designed to forecast individual appointment outcomes at booking time [2]. "
        "Early research primarily utilized conventional statistical techniques, predominantly multivariable Logistic Regression (LR). "
        "While logistic regression provides direct interpretability via parameter odds ratios, its strict assumption of linear log-odds limits its capacity to model complex, non-linear feature interactions, threshold effects, and multi-collinear variables commonly present in electronic medical records [2]."
    )
    add_p(
        "With the emergence of modern data science toolkits, non-parametric tree-based ensemble methods have achieved preeminence in healthcare tabular predictive modeling. "
        "Decision Trees (DT) provide transparent hierarchical partitioning rules but suffer from high variance and susceptibility to overfitting. "
        "Random Forests (RF), introduced by Breiman [11], addressed these limitations through bootstrap aggregation (bagging) and random feature subspace selection, achieving substantial performance gains in clinical scheduling studies [11]."
    )
    add_p(
        "More recently, Gradient Boosted Decision Trees (GBDT)—exemplified by algorithms such as Extreme Gradient Boosting (XGBoost) [12]—have demonstrated state-of-the-art predictive accuracy across tabular healthcare benchmarks. "
        "Unlike bagging techniques, gradient boosting constructs decision trees sequentially, with each successive tree fitting the negative gradient of the loss function (pseudo-residuals) of the prior ensemble [12]. "
        "Studies by Srinivas and Ravindran [2] have demonstrated that gradient boosted ensembles consistently outperform logistic regression, support vector machines (SVM), and multi-layer perceptron neural networks in predicting outpatient no-shows, frequently achieving Receiver Operating Characteristic Area Under the Curve (ROC-AUC) scores between 0.65 and 0.78."
    )
    add_p(
        "Despite these algorithmic advancements, existing machine learning literature in appointment scheduling exhibits critical methodological limitations. "
        "First, the vast majority of studies evaluate models using standard k-fold random cross-validation. "
        "Random partitioning introduces severe temporal data leakage, as future appointment outcomes and evolving clinic schedules are used to predict past visits. "
        "In operational healthcare environments, models must be trained and evaluated using strict chronological (temporal) splits to simulate real-world prospective deployment [2]. "
        "Second, existing literature predominantly benchmarks algorithms on public, static datasets—most notably the Brazilian Kaggle Medical Appointments dataset (2016) [10]—without validating generalizability on multi-tenant, localized hospital operations featuring diverse channelling portals and local billing structures."
    )

    add_h2("3.3 The Imperative of Clinical Probability Calibration")
    add_p(
        "A critical yet frequently neglected requirement in applied clinical machine learning is probability calibration [5]. "
        "In standard binary classification tasks, algorithmic evaluation focuses almost exclusively on discrimination metrics—such as ROC-AUC, Precision-Recall AUC (PR-AUC), and F1-score—which evaluate whether positive instances are ranked higher than negative instances. "
        "However, discrimination metrics are invariant to monotonic probability shifts. "
        "A model can achieve an exemplary ROC-AUC of 0.85 while outputting probability scores that diverge radically from actual real-world frequencies [5], [13]."
    )
    add_p(
        "In healthcare operations management, raw classification scores are insufficient. "
        "Hospital capacity planning, mathematical queue optimization, and financial overbooking require true, trustworthy probabilities [13]. "
        "Formally, a predictive model $f(x)$ is perfectly calibrated if, for all samples where the model predicts an event probability $p$, the true empirical conditional probability satisfies:"
    )
    add_p(
        "$$P(Y = 1 \\mid f(X) = p) = p, \\quad \\forall p \\in [0, 1]$$"
    )
    add_p(
        "When an uncalibrated model outputs a risk score of 0.80 for a cohort of patients, but only 35% of those patients actually fail to attend, hospital administrators relying on that score will vastly overestimate absenteeism, leading to excessive overbooking, overwhelmed clinical staff, and unmanageable clinic waiting room delays [1], [5]."
    )
    add_p(
        "Modern ensemble algorithms, particularly XGBoost and neural networks, are notoriously miscalibrated. "
        "XGBoost employs gradient-based tree splitting and explicit objective regularizations (such as L1/L2 leaf weight penalties and Hessian shrinkage), which systematically compress predicted probabilities toward the distribution mean or push them toward extremes [5], [14]. "
        "Furthermore, handling severe class imbalance via positive instance re-weighting (e.g., scale_pos_weight) heavily inflates raw output scores far above empirical prevalence [14]."
    )
    add_p(
        "To restore probability fidelity, statistical calibration post-processing techniques are applied. "
        "The two principal calibration methods are Platt Scaling (parametric logistic calibration) [15] and Isotonic Regression (non-parametric monotonic fitting) [16]. "
        "While Platt scaling fits a sigmoid curve and assumes logistic error distributions [15], Isotonic Regression fits a non-parametric piecewise constant isotonic function via the Pool Adjacent Violators (PAV) algorithm, minimizing mean squared error subject to monotonic ranking constraints [16]. "
        "In healthcare domains with non-linear probability distortions and sufficient validation sample sizes, isotonic regression provides superior calibration performance, directly minimizing Brier scores and aligning decile predicted risks with empirical outcomes [17]."
    )

    add_h2("3.4 Explainable AI (XAI) in Clinical Decision-Support Systems")
    add_p(
        "The deployment of machine learning in healthcare operations is fundamentally constrained by the 'black box' problem [6], [20]. "
        "Even when an algorithm achieves high discrimination and statistical calibration, clinical staff—including receptionists, triage nurses, and hospital medical directors—are understandably hesitant to act on uninterpretable algorithmic predictions. "
        "In ambulatory clinic workflows, staff must understand *why* a specific patient is flagged as high-risk in order to execute appropriate, personalized interventions [6], [20]."
    )
    add_p(
        "To achieve interpretability in complex ensemble models, researchers have turned to Explainable Artificial Intelligence (XAI) frameworks grounded in cooperative game theory [18]. "
        "Shapley Additive Explanations (SHAP), introduced by Lundberg and Lee [6], unifies multiple interpretability methods by calculating Shapley values from cooperative game theory. "
        "In the SHAP framework, the prediction of a machine learning model for a specific instance is framed as a collaborative game where each feature value acts as a player, and the model prediction is the collective payout [6], [18]."
    )
    add_p(
        "The Shapley value $\\phi_i$ represents the average marginal contribution of feature $i$ across all possible feature subsets $S$:"
    )
    add_p(
        "$$\\phi_i = \\sum_{S \\subseteq F \\setminus \\{i\\}} \\frac{|S|!(|F| - |S| - 1)!}{|F|!} \\left[ f(S \\cup \\{i\\}) - f(S) \\right]$$"
    )
    add_p(
        "where $F$ denotes the complete feature set, and $f(S)$ represents the model's conditional expectation given feature subset $S$ [6]."
    )
    add_p(
        "For decision tree ensembles, Lundberg et al. [19] developed TreeSHAP, an exact, low-latency algorithm that computes local feature attributions in polynomial time $O(T L D^2)$ (where $T$ is tree count, $L$ is leaf count, and $D$ is maximum tree depth), bypassing exponential combinatorial evaluations. "
        "TreeSHAP provides two indispensable clinical assets: global feature importance rankings (aggregated mean absolute SHAP values across all patients) and local, instance-level attributions for individual appointment bookings [19], [20]. "
        "In operational triage, local SHAP attributions enable software systems to explain the exact risk drivers—such as extended lead time, prior no-show history, or transit distance—empowering administrative staff to deploy targeted, transparent countermeasures rather than generic interventions [19], [20]."
    )

    add_h2("3.5 Patient Engagement Interventions and Communication Modalities")
    add_p(
        "Predicting appointment absenteeism provides operational value only if paired with effective, timely patient engagement interventions. "
        "Across international healthcare literature, patient reminder modalities encompass telephone calls, automated Short Message Service (SMS) text messages, email, mobile application notifications, and interactive conversational agents [21]."
    )
    add_p(
        "A landmark Cochrane Systematic Review by Gurol-Urganci et al. [21] evaluated mobile phone messaging for outpatient appointment attendance across 42 randomized controlled trials. "
        "The meta-analysis concluded that mobile text message reminders substantially improve appointment attendance compared to no reminders (Relative Risk 1.14, 95% CI: 1.03 to 1.27), with reminder efficacy showing comparable outcomes to telephone reminders while incurring a fraction of administrative labor costs. "
        "Subsequent studies have demonstrated that personalizing reminder message content—incorporating physician names, clinical preparation instructions, and interactive confirmation requests—further amplifies attendance compliance [21]."
    )
    add_p(
        "Despite the established efficacy of broadcast SMS reminders, modern healthcare operations face two evolving operational challenges. "
        "First, static reminders offer no mechanism for dynamic rescheduling when patients cannot attend. "
        "When an automated reminder states 'Reply CANCEL if you cannot attend', patient cancellations result in vacant slots that hospital front-desk staff cannot easily backfill on short notice, converting a no-show into a late vacancy with equivalent revenue loss [1], [2]. "
        "Second, emerging conversational AI solutions—such as unconstrained Large Language Model (LLM) chatbots—introduce clinical safety and privacy hazards, including conversational hallucinations, unverified booking commitments, and the potential exposure of sensitive medical conditions across unencrypted messaging channels. "
        "Consequently, healthcare operational frameworks increasingly require hybrid conversational architectures: deterministic finite-state dialogue management combined with natural language generation, backed by strict human-in-the-loop staff verification."
    )

    add_h2("3.6 The Sri Lankan Healthcare Baseline: A Critical Analysis of Rajasuriya et al. (2010)")
    add_p(
        "A rigorous investigation of outpatient attendance within Sri Lanka requires grounding in local empirical clinical literature. "
        "The solitary peer-reviewed clinical trial evaluating appointment reminders in Sri Lanka was conducted by Rajasuriya, de Silva, and Hanwella, published in *The Psychiatrist* (2010) [7]. "
        "Given the critical importance of this study as the empirical foundation for Sri Lankan reminder efficacy, a detailed methodological synthesis and critique is warranted."
    )
    add_p(
        "Rajasuriya et al. evaluated the effectiveness of reminder interventions in reducing outpatient non-attendance at the adult psychiatric clinic of the National Hospital of Sri Lanka (NHSL), a premier public tertiary healthcare institution in Colombo [7]. "
        "The study examined new patients across two distinct operational cohorts: Phase 1 (baseline cohort, November 2006, N = 176) and Phase 2 (intervention cohort, November 2007, N = 195). "
        "The primary outcome measured was patient non-attendance at the second (follow-up) clinical appointment. "
        "Table 3.1 synthesizes the empirical parameters and findings established by the study."
    )

    add_caption_table("3.1", "Empirical Baseline Synthesis from Rajasuriya et al. (2010) Outpatient Reminder Study")
    t31 = doc.add_table(rows=8, cols=2)
    t31_data = [
        ("Clinical Setting", "Adult Psychiatric Out-Patient Clinic, National Hospital of Sri Lanka (NHSL), Colombo"),
        ("Study Cohort Size", "Phase 1: 176 new patients; Phase 2: 195 new patients (Total N = 371)"),
        ("Baseline Non-Attendance", "35.8% overall (133/371); Phase 2 pre-intervention rate: 31.3% (61/195)"),
        ("Intervention Protocol", "Telephone call or postal letter to patients who had not attended 2 weeks after due date; attendance re-evaluated at 6 weeks"),
        ("Intervention Reach", "41 of 61 patients had phone access; 20 successfully reached by call; 41 received letters"),
        ("Empirical Clinical Outcome", "Non-attendance reduced from 31.3% to 23.1% (45/195); 16 of 61 non-attendees returned to clinic"),
        ("Reported Relative Risk Reduction", "26.2% relative risk reduction; 95% Wilson confidence interval: [17.0%, 38.0%]"),
        ("Significant Risk Factors", "Male gender (OR 1.65, p=0.02), Substance use (OR 7.2), No medication prescribed (OR 5.6)"),
    ]
    for r_idx, (k, v) in enumerate(t31_data):
        row = t31.rows[r_idx]
        row.cells[0].paragraphs[0].text = k
        row.cells[1].paragraphs[0].text = v
    format_custom_table(t31, [2.2, 4.0])

    add_p(
        "A critical analysis of the Rajasuriya et al. study reveals several profound methodological and operational nuances that must inform contemporary healthcare software modeling:"
    )
    add_p(
        "1. Nature of the 26.2% Metric: The reported 26.2% relative risk reduction represents an empirical recall rate (16 recovered patients out of 61 contacted non-attendees) among patients who had *already missed* their scheduled clinic appointment by two weeks. It does not measure the probability that a prospective reminder sent *prior* to the consultation date successfully prevents an initial no-show [7]. Furthermore, the 95% Wilson confidence interval spans from 17.0% to 38.0%, reflecting significant statistical uncertainty."
    )
    add_p(
        "2. Absence of a Randomized Control Arm: The study compared historical cohorts without a concurrent randomized control group. Consequently, the observed attendance recovery may partially reflect natural clinical re-attendance ('spontaneous return') rather than the direct causal impact of the telephone or postal reminder [7]."
    )
    add_p(
        "3. Omission of Economic and Cost Accounting: While the authors qualitatively asserted that the reminder intervention was 'cost-effective', the paper presented no financial data regarding staff labor hours, telephone tariffs, or postal costs, precluding formal cost-benefit or ROI conclusions [7]."
    )
    add_p(
        "4. Public vs. Private Operational Divergence: Conducted within a state tertiary psychiatric clinic where outpatient care is free, the study did not capture private healthcare dynamics—such as specialist consultation fees (LKR 2,000 to LKR 4,700), multi-channel channelling booking portals, or digital prepayments. Therefore, while Rajasuriya et al. provides an invaluable empirical benchmark for Sri Lankan clinical recall efficacy (26.2%), deploying AI-driven outreach in private healthcare demands rigorous sensitivity modeling across the entire 17% to 38% efficacy interval alongside explicit financial cost accounting."
    )

    add_h2("3.7 Operations Research and Dynamic Overbooking Models in Healthcare")
    add_p(
        "In healthcare operations research, no-show prediction algorithms achieve tangible clinical utility only when integrated into capacity scheduling and overbooking frameworks [1]. "
        "Overbooking is the deliberate practice of scheduling more appointments than a clinic session's physical capacity in anticipation of patient absenteeism [1], [2]. "
        "The fundamental objective of overbooking is to maximize physician consultation utilization and revenue while minimizing patient waiting time and physician overtime penalties [1], [2]."
    )
    add_p(
        "Historically, hospital scheduling models addressed overbooking using static, aggregate rules—such as scheduling a flat 10% to 20% extra bookings across all sessions [1], [2]. "
        "However, static rules are inherently hazardous: if a day's cohort consists entirely of highly reliable patients, static overbooking induces severe clinic congestion, excessive patient wait times, and physician burnout. "
        "Conversely, if the cohort consists of high-risk patients, flat overbooking fails to prevent idle capacity [1], [2]."
    )
    add_p(
        "To achieve adaptive scheduling, operations researchers have formulated risk-aware overbooking models leveraging individual patient probabilities [1], [2]. "
        "When each booked patient $i$ possesses an independent probability of attendance $q_i = 1 - p_i$ (where $p_i$ is the calibrated no-show risk), the total number of arriving patients $N$ follows a Poisson-binomial distribution [22]. "
        "Unlike the standard binomial distribution (which assumes identical probabilities across trials), the Poisson-binomial distribution models the sum of independent, non-identically distributed Bernoulli random variables [22], [23]."
    )
    add_p(
        "In operational practice, evaluating the Poisson-binomial distribution presents computational hurdles. "
        "Many existing prototypes rely on Monte Carlo simulation or Gaussian normal approximations [23]. "
        "However, Monte Carlo approaches introduce stochastic variance and latency into production web applications, while normal approximations fail severely in small clinical sessions (e.g., 15 to 30 patients) where arrival distributions exhibit significant skewness [23]. "
        "In contrast, exact dynamic programming convolution—computing the discrete probability mass function via recursive polynomial convolution—provides deterministic, exact arrival probabilities in $O(n^2)$ time, enabling real-time overbooking optimization in production hospital software [23]."
    )

    add_h2("3.8 Summary and Identification of Research Gaps")
    add_p(
        "The synthesis of international and localized literature reveals four major translational and methodological gaps that motivate this dissertation:"
    )
    add_p(
        "• Gap 1: Separation of Machine Learning Discrimination from Probability Calibration. Existing healthcare scheduling literature focuses predominantly on raw discrimination metrics (ROC-AUC), neglecting statistical probability calibration. Uncalibrated risk scores undermine capacity planning and distort queue overbooking models."
    )
    add_p(
        "• Gap 2: The 'Prediction-Action' Translational Divide. Academic machine learning prototypes terminate at predicting risk scores, leaving clinical staff without transparent feature attributions or actionable operational guidance regarding how to mitigate the identified risk."
    )
    add_p(
        "• Gap 3: Absence of Localized, Multi-Turn Autonomous Rescheduling. Current clinical workflows rely on one-way broadcast SMS reminders that fail to support dynamic slot recovery. Furthermore, existing systems lack localized multilingual communication (English, Sinhala, Tamil) and fail to incorporate strict clinical governance rules for human-in-the-loop staff verification."
    )
    add_p(
        "• Gap 4: Unsubstantiated Economic Models and Lack of Scientific Evaluation Protocols. Existing systems assume arbitrary financial returns without accounting for local labor wages, telecom tariffs, or empirically grounded clinical efficacy boundaries. Furthermore, systems fail to implement randomized hold-out architectures necessary to measure true causal intervention efficacy in production."
    )
    add_p(
        "This dissertation directly addresses these research gaps through the engineering, deployment, and evaluation of the SHAI platform."
    )
