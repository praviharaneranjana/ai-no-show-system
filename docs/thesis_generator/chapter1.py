# Chapter 1: INTRODUCTION

def write_chapter1(doc, add_h1, add_h2, add_h3, add_p):
    add_h1("1 INTRODUCTION")

    add_h2("1.1 Background and Context")
    add_p(
        "Outpatient healthcare delivery represents the foundational interface between modern healthcare systems and the populations they serve. "
        "In contemporary clinical environments, the ambulatory care operational model depends critically on the deterministic scheduling of consultant specialist consultations, diagnostic investigations, and therapy sessions [1]. "
        "When an outpatient clinical schedule operates with high predictability, clinical capacity is maximized, physician consultation hours are smoothly utilized, and patient queues remain stable. "
        "However, outpatient absenteeism—widely termed the 'patient no-show' phenomenon—imposes a severe, destabilizing operational friction across healthcare systems worldwide [2]."
    )
    add_p(
        "A patient no-show is formally defined as an instance where an individual with a confirmed outpatient appointment fails to attend the scheduled clinical session without providing advance notice of cancellation [1], [2]. "
        "In global healthcare operations literature, reported outpatient no-show rates exhibit substantial variation, typically ranging from 12% to over 30% depending on geographical jurisdiction, socioeconomic demographics, clinical specialty, and healthcare delivery models [1], [2]. "
        "When patients fail to arrive as booked, healthcare providers face immediate idle clinic capacity that cannot be retroactively recovered or backfilled at short notice. "
        "This dynamic degrades operational efficiency, inflates administrative overhead, and generates substantial financial deficits in both public and fee-for-service private health ecosystems [2]."
    )
    add_p(
        "In Sri Lanka, healthcare operates within a distinctive dual-tier architecture comprising an extensive free-at-the-point-of-delivery public healthcare system alongside an expanding, market-driven private healthcare sector [3]. "
        "While public tertiary facilities—such as the National Hospital of Sri Lanka (NHSL)—manage high patient volumes without mandatory advance booking fees, private tertiary hospitals (such as Asiri Health, Lanka Hospitals, Nawaloka Hospitals, and Durdans) provide structured outpatient specialist consultations through multi-channel booking systems widely known in Sri Lanka as 'channelling' services [4]."
    )
    add_p(
        "Under the Sri Lankan private channelling paradigm, medical specialists and surgical consultants conduct evening and weekend outpatient clinics across hospital facilities, balancing private consultations with daytime commitments in state university faculties or public teaching hospitals [3], [4]. "
        "Patients book specific consultation slots through digital telecommunication portals (e.g., Doc990, eChannelling), hospital mobile applications (e.g., MyHealth), direct hospital telephone lines, or walk-in registration counters [4]. "
        "In this operational context, outpatient appointment absenteeism induces unique operational strains: consultant doctors operate under strict time windows, clinic support teams (nurses, phlebotomists, and registration officers) are deployed on hourly shifts, and unfilled consultation slots represent irrecoverable revenue loss for both attending specialists and the hospital enterprise [2], [4]."
    )

    add_h2("1.2 Problem Statement")
    add_p(
        "Despite significant advancements in artificial intelligence and machine learning applications within diagnostic medicine, outpatient operational management in Sri Lankan healthcare institutions remains predominantly reactive, manual, and technologically fragmented. "
        "When private hospital administration schedules outpatient appointments, front-desk staff typically treat every scheduled booking as having an identical probability of attendance. "
        "Consequently, clinics experience abrupt fluctuations between severe over-capacity delays and vacant appointment slots, impairing clinical throughput and generating substantial revenue attrition."
    )
    add_p(
        "Specifically, the operational problem manifests across four primary failure modes:"
    )
    add_p(
        "1. Predictive Disconnect and Lack of Calibrated Risk Assessment: Existing hospital information systems (HIS) treat appointment scheduling as a static transaction record rather than a probabilistic queue. While machine learning classifiers (such as Gradient Boosted Decision Trees) can predict absenteeism, existing academic prototypes focus exclusively on raw discrimination (e.g., ROC-AUC) without calibrating predicted outputs into mathematically sound, reliable probabilities. Without calibrated probabilities, a hospital cannot reliably determine expected patient attendance or evaluate risk-based overbooking strategies [5]."
    )
    add_p(
        "2. Absence of Clinical Explainability and Actionable Guidance: Standard machine learning models operate as opaque 'black boxes'. Hospital administrators and front-desk receptionists cannot interpret why a specific patient is classified as high-risk. Without explainable factor attributions (such as Shapley additive explanations), healthcare personnel cannot identify the underlying friction—whether driven by booking lead time, historical non-attendance, transit distance, or payment mode—and therefore cannot formulate targeted interventions [6]."
    )
    add_p(
        "3. Fragmented, Static Interventions and Lack of Automated Rescheduling: Current clinical communication practices rely on broadcast, generic SMS notifications that fail to account for patient-specific barriers. Furthermore, when a patient cannot attend, existing workflows do not provide automated, intelligent rescheduling options, forcing patients to abandon consultations or re-queue manually. In Sri Lanka's multilingual environment, the lack of localized, automated multi-turn communication in English, Sinhala, and Tamil creates significant language barriers, compounding clinic non-attendance [7]."
    )
    add_p(
        "4. Unsubstantiated Economic Models and Operational Blind Spots: Most proposed no-show mitigation systems justify their implementation using arbitrary return-on-investment (ROI) assumptions, ignoring local labor rates, telecom messaging tariffs, and empirically proven clinical recall rates. In Sri Lanka, the solitary published empirical baseline on psychiatric reminder efficacy (Rajasuriya et al., 2010) reported a 26.2% recall rate but was conducted without a randomized control arm [7]. Deploying predictive interventions without rigorous sensitivity analysis or randomized hold-out protocols exposes hospitals to unverified operational costs."
    )

    add_h2("1.3 Research Justification and Motivation")
    add_p(
        "Addressing outpatient absenteeism through an integrated, explainable AI platform is of paramount clinical, economic, and operational importance. "
        "From a clinical continuity perspective, appointment non-attendance disrupts therapeutic compliance, delays diagnostic intervention for chronic non-communicable diseases (such as diabetes, cardiovascular conditions, and endocrine disorders), and elevates the risk of avoidable emergency hospital admissions [8]. "
        "In Sri Lanka, where chronic non-communicable diseases account for over 75% of the total disease burden, facilitating consistent outpatient consultation adherence directly supports preventive healthcare outcomes [8]."
    )
    add_p(
        "From an institutional and economic standpoint, private tertiary hospitals in Sri Lanka incur substantial financial liabilities from unutilized clinic slots. "
        "With average private specialist consultation fees ranging from LKR 2,000 to over LKR 4,700, and institutional platform operating costs requiring defensible justification, an intelligent decision-support system that identifies high-risk appointments, recovers idle capacity through mathematically sound overbooking, and provides trilingual conversational rescheduling can protect millions of rupees in annual hospital revenue [9]."
    )
    add_p(
        "Furthermore, this research is motivated by the necessity of bridging the translational gap between academic machine learning research and enterprise software engineering. "
        "While numerous studies benchmark no-show prediction algorithms on static datasets (such as the public Kaggle Medical Appointments dataset in Brazil [10]), very few investigate how machine learning models integrate into active clinical workflows, interface with relational database schemas, execute low-latency inference, and provide transparent human-in-the-loop governance for hospital receptionists and clinic managers."
    )

    add_h2("1.4 Research Questions and Hypotheses")
    add_p(
        "To systematically address the stated research problem, this dissertation investigates the following primary research questions:"
    )
    add_p(
        "• Research Question 1 (RQ1): To what extent can an ensemble gradient boosted decision tree (GBDT) classifier, trained on multi-attribute healthcare appointment records and calibrated via non-parametric isotonic regression, accurately discriminate and reliably predict outpatient no-show probabilities compared to traditional linear and tree-based baseline models?"
    )
    add_p(
        "• Research Question 2 (RQ2): What are the dominant behavioral, logistical, clinical, and environmental features driving outpatient non-attendance in Sri Lankan hospital appointments, and how can local TreeSHAP explanations be operationalized to derive transparent, patient-specific clinical actions?"
    )
    add_p(
        "• Research Question 3 (RQ3): How can an exact Poisson-binomial dynamic programming convolution model leverage calibrated probabilities to optimize clinic session overbooking while strictly constraining patient waiting time and physician overtime penalties?"
    )
    add_p(
        "• Research Question 4 (RQ4): Can a deterministic, trilingual conversational state machine with human-in-the-loop staff approval facilitate autonomous patient rescheduling, and under what economic conditions does predictive outreach achieve positive financial return on investment (ROI) within Sri Lankan private healthcare facilities?"
    )
    add_p(
        "In evaluating these questions, the study posits the following testable research hypotheses:"
    )
    add_p(
        "• Hypothesis 1 (H1): Appointment booking lead time (days between booking and clinic date) exhibits a statistically significant positive association with the odds of patient non-attendance (Odds Ratio > 1.0, p < 0.05)."
    )
    add_p(
        "• Hypothesis 2 (H2): Patient financial commitment via digital prepayment (Prepaid Online) significantly reduces the odds of appointment absenteeism compared to counter cash settlement (Odds Ratio < 1.0, p < 0.05)."
    )
    add_p(
        "• Hypothesis 3 (H3): Environmental friction factors, specifically heavy monsoon rainfall and proximity to religious Poya holidays, significantly increase appointment absenteeism odds (Odds Ratio > 1.0, p < 0.05)."
    )
    add_p(
        "• Hypothesis 4 (H4): A risk-ranked patient outreach policy based on calibrated model probabilities captures substantially higher no-show volume (Lift >= 1.8x at top 20% tier) than random outreach targeting, achieving positive economic net benefit across realistic private hospital consultation fees."
    )

    add_h2("1.5 Scope and Delimitations of the Study")
    add_p(
        "The primary scope of this dissertation encompasses the software engineering design, algorithmic development, statistical calibration, and empirical evaluation of SHAI (Smart Hospital AI Operations Platform), deployed for an outpatient ambulatory care environment modeled upon private tertiary hospitals in Colombo, Sri Lanka (specifically contextualized to Asiri Central Hospital). "
        "The technical system comprises a full-stack web and desktop platform (Next.js 16, TypeScript, Tailwind CSS, FastAPI, PostgreSQL 16, and Electron 33) supporting clinical triage, master schedule visualization, capacity overbooking optimization, trilingual message drafting, and role-based staff administration."
    )
    add_p(
        "The delimitations of this research are explicitly established to ensure scientific transparency:"
    )
    add_p(
        "1. Synthetic Healthcare Data: In compliance with institutional patient privacy governance and the non-availability of anonymized production hospital datasets, the primary model training and operational evaluation are executed on synthetic appointment datasets (N = 64,444 and 73,941 records) generated from documented clinical assumptions, verified against empirical Sri Lankan demographic profiles, and cross-validated on the real-world Kaggle medical appointment benchmark (N = 110,527)."
    )
    add_p(
        "2. Simulated Communication Gateway: While the platform implements complete trilingual natural language generation (Google Gemini API), deterministic state machine dialogue management, and webhook ingress architectures, outbound SMS and WhatsApp transmissions are logged to database audit tables and executed through a simulated channel rather than an active commercial telecom gateway."
    )
    add_p(
        "3. Departmental Rescheduling Boundaries: Automated appointment rescheduling options are constrained within the same clinical specialty department (e.g., General Medicine to General Medicine, Dermatology to Dermatology) to adhere to clinical governance standards and avoid cross-specialty clinical mismatches."
    )

    add_h2("1.6 Outline of the Dissertation")
    add_p(
        "The remainder of this dissertation is structured as follows:"
    )
    add_p(
        "• Chapter 2 (Objectives): Formulates the general research aim alongside detailed specific objectives spanning machine learning engineering, statistical calibration, explainable AI, capacity optimization, conversational orchestration, clinical safety, and decision-theoretic economic modeling."
    )
    add_p(
        "• Chapter 3 (Literature Review): Conducts an in-depth critical survey of the multidisciplinary literature, examining behavioural determinants of no-shows, predictive machine learning benchmarks, probability calibration methodologies, explainability paradigms, patient engagement interventions, an audit of Sri Lankan baseline clinical evidence (Rajasuriya et al., 2010), and dynamic overbooking operations research."
    )
    add_p(
        "• Chapter 4 (Methodology): Provides a comprehensive, reproducible software engineering specification of the SHAI platform architecture, relational data schemas, feature engineering pipeline, XGBoost training and Optuna tuning, isotonic probability calibration, TreeSHAP integration, exact Poisson-binomial convolution overbooking, ask-first conversational state machine, privacy guards, and randomized hold-out evaluation protocols."
    )
    add_p(
        "• Chapter 5 (Results): Details empirical findings across exploratory data analysis, four-model benchmark comparisons, Kaggle generalizability validation, calibration curves and Brier score evaluations, multivariable logistic regression odds ratios, global TreeSHAP rankings, subgroup fairness audits, 90-day operational database replay, financial sensitivity matrices, and automated test suite execution."
    )
    add_p(
        "• Chapter 6 (Discussion and Conclusions): Synthesizes research contributions, reconciles findings with international and local literature, discusses practical managerial implications for Sri Lankan hospital administration, addresses clinical safety and ethical privacy safeguards, acknowledges study limitations, proposes directions for future research, and provides concluding insights."
    )
    add_p(
        "• References and Appendices: Presents complete IEEE bibliographic citations alongside supplementary technical artifacts, database schemas, feature definitions, conversational dialogue templates, and administrative audit logs."
    )
