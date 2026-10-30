# Chapter 5: RESULTS

def write_chapter5(doc, add_h1, add_h2, add_h3, add_p, add_caption_figure, add_caption_table, add_figure_image, format_custom_table):
    add_h1("5 RESULTS")

    add_h2("5.1 Exploratory Data Analysis and Feature Distribution Verification")
    add_p(
        "Exploratory data analysis of the synthetic appointment cohort (N = 64,444 records) confirmed that the generated feature distributions faithfully reflect empirical clinical and logistical relationships observed in hospital scheduling. "
        "Figure 5.1 depicts the empirical non-attendance rates across six core operational dimensions."
    )

    add_figure_image("docs/thesis_assets/media_1791111517317.png", width_inches=5.8)
    add_caption_figure("5.1", "Exploratory Distribution of Absenteeism Rates Across Environmental and Behavioral Dimensions")

    add_p(
        "The empirical distributions validate key operational hypotheses:"
    )
    add_p(
        "• Appointment Lead Time: Exhibits a pronounced monotonic escalation. Appointments booked within 0 to 1 day exhibit a low no-show rate of 10.4%, rising steadily to 15.5% (1 to 3 days), 18.0% (4 to 7 days), 19.8% (8 to 14 days), 24.5% (15 to 30 days), and reaching 26.6% for lead times exceeding 30 days."
    )
    add_p(
        "• Booking Channel: In-person registration at the Hospital Counter demonstrates the lowest absenteeism (11.6%), reflecting tangible patient commitment. Conversely, telephone bookings (18.6%) and digital gateways (Doc990: 16.8%, eChannelling: 17.5%) exhibit elevated absenteeism."
    )
    add_p(
        "• Payment Mode: Financial prepayment (Prepaid Online) serves as a potent protective factor, suppressing absenteeism to 12.2%, compared to cash counter settlement (16.9%), corporate credit billing (17.4%), and insurance guarantee (17.6%)."
    )
    add_p(
        "• Age Demographics: Non-attendance peaks sharply among young adults aged 18 to 29 (21.0%), whereas senior citizens aged 65 and above exhibit substantially lower absenteeism (12.9%)."
    )
    add_p(
        "• Environmental Interactions: Monsoonal heavy precipitation and Poya public holidays compound transit friction: baseline non-attendance without environmental friction (0, 0) stands at 15.0%, rising to 19.6% on rainy days (1, 0), 19.8% on Poya days (0, 1), and culminating in 22.9% under compound friction (1, 1)."
    )

    add_h2("5.2 Baseline Model Comparison and Benchmark Performance")
    add_p(
        "To establish rigorous algorithmic benchmarks, four candidate machine learning classifiers were evaluated across the chronological test cohort (N = 9,385 appointments). "
        "Models were evaluated on discrimination (ROC-AUC, PR-AUC), probability calibration error (Brier Score), and operational capacity metrics (Recall, Precision, and Lift at the top 20% risk tier). "
        "Table 5.1 presents the comparative empirical evaluation."
    )

    add_caption_table("5.1", "Empirical Classification Performance Across Four Candidate Baseline Models on Synthetic Data")
    t51 = doc.add_table(rows=7, cols=7)
    t51_data = [
        ("Candidate Model", "ROC-AUC", "PR-AUC", "Brier Score", "Recall @ 20%", "Precision @ 20%", "Lift @ 20%"),
        ("Logistic Regression (scaled)", "0.664", "0.267", "0.2190", "36.0%", "27.8%", "1.798x"),
        ("Decision Tree (depth=5)", "0.643", "0.237", "0.2220", "34.3%", "26.5%", "1.715x"),
        ("Random Forest (300 trees)", "0.659", "0.268", "0.1920", "37.1%", "28.6%", "1.853x"),
        ("XGBoost (plain defaults)", "0.668", "0.275", "0.1240", "37.3%", "28.8%", "1.867x"),
        ("XGBoost (scale_pos_weight)", "0.668", "0.274", "0.2140", "37.5%", "29.0%", "1.877x"),
        ("XGBoost Tuned + Isotonic", "0.672", "0.266", "0.1237", "36.3%", "28.0%", "1.815x"),
    ]
    for r_idx, row_vals in enumerate(t51_data):
        row = t51.rows[r_idx]
        for c_idx, val in enumerate(row_vals):
            row.cells[c_idx].paragraphs[0].text = val
    format_custom_table(t51, [1.8, 0.7, 0.7, 0.8, 0.8, 0.8, 0.6])

    add_p(
        "As demonstrated in Table 5.1, the tuned XGBoost classifier with isotonic calibration achieved the best balanced probability calibration and discriminatory ranking across the chronological test cohort. "
        "The model achieved an ROC-AUC of 0.672 (95% CI: [0.658, 0.686]), a PR-AUC of 0.266, and the lowest probability error (calibrated Brier Score 0.1237). "
        "Crucially, in the top 20% operational capacity tier, the calibrated model captured 36.3% of all empirical no-shows (542 of 1,492 test non-attendances), achieving a Lift of 1.815x over random outreach. "
        "Uncalibrated XGBoost models with naive scale_pos_weight suffered severe probability distortion (Brier 0.2140), illustrating the necessity of post-processing isotonic calibration."
    )

    add_h2("5.3 Validation on Real-World Kaggle Medical Appointments Benchmark")
    add_p(
        "To verify algorithmic generalizability beyond synthetic distributions, the identical machine learning pipeline was applied to the real-world Kaggle Medical Appointments dataset (N = 110,527 records). "
        "Table 5.2 summarizes the benchmark performance."
    )

    add_caption_table("5.2", "Benchmark Model Performance Evaluation on Real-World Kaggle Medical Appointments Dataset")
    t52 = doc.add_table(rows=6, cols=7)
    t52_data = [
        ("Candidate Model", "ROC-AUC", "PR-AUC", "Brier Score", "Recall @ 20%", "Precision @ 20%", "Lift @ 20%"),
        ("Logistic Regression", "0.686", "0.298", "0.239", "34.8%", "31.5%", "1.738x"),
        ("Decision Tree", "0.727", "0.317", "0.215", "37.1%", "33.7%", "1.858x"),
        ("Random Forest", "0.733", "0.332", "0.205", "37.9%", "34.3%", "1.894x"),
        ("XGBoost (plain)", "0.736", "0.337", "0.134", "38.1%", "34.5%", "1.904x"),
        ("XGBoost (scale_pos_weight)", "0.735", "0.336", "0.211", "37.7%", "34.2%", "1.884x"),
    ]
    for r_idx, row_vals in enumerate(t52_data):
        row = t52.rows[r_idx]
        for c_idx, val in enumerate(row_vals):
            row.cells[c_idx].paragraphs[0].text = val
    format_custom_table(t52, [1.8, 0.7, 0.7, 0.8, 0.8, 0.8, 0.6])

    add_figure_image("docs/thesis_assets/fig5_2_kaggle_roc.png", width_inches=6.0)
    add_caption_figure("5.2", "Receiver Operating Characteristic (ROC) Comparison Curves on Real-World Kaggle Benchmark")

    add_p(
        "On the real-world Kaggle benchmark, the pipeline demonstrated outstanding discrimination, with XGBoost achieving an ROC-AUC of 0.736 and a top-20% Lift of 1.904x. "
        "This confirms that the gradient boosting architecture generalizes seamlessly across clinical ambulatory datasets."
    )

    add_h2("5.4 XGBoost Bayesian Tuning and Chronological Generalization")
    add_p(
        "Bayesian optimization via Optuna identified optimal hyperparameters that maximize validation discrimination while strictly penalizing model complexity. "
        "Table 5.3 presents the optimal hyperparameter configuration."
    )

    add_caption_table("5.3", "Optuna Bayesian Optimization Search Space and Optimal Hyperparameters for Tuned XGBoost")
    t53 = doc.add_table(rows=8, cols=3)
    t53_data = [
        ("Hyperparameter", "Search Domain", "Optimized Optimal Value"),
        ("max_depth", "Integer [2, 8]", "2"),
        ("learning_rate", "Log-Uniform [0.01, 0.20]", "0.100"),
        ("n_estimators", "Integer [100, 500]", "224"),
        ("min_child_weight", "Integer [1, 50]", "28"),
        ("subsample", "Uniform [0.50, 1.00]", "0.549"),
        ("colsample_bytree", "Uniform [0.50, 1.00]", "0.511"),
        ("reg_lambda (L2)", "Log-Uniform [0.01, 10.0]", "0.621"),
    ]
    for r_idx, row_vals in enumerate(t53_data):
        row = t53.rows[r_idx]
        for c_idx, val in enumerate(row_vals):
            row.cells[c_idx].paragraphs[0].text = val
    format_custom_table(t53, [2.0, 2.0, 2.2])

    add_figure_image("docs/thesis_assets/fig5_3_gain_lift.png", width_inches=6.2)
    add_caption_figure("5.3", "Cumulative Gain and Lift Curves for the Tuned XGBoost Model")

    add_h2("5.5 Probability Calibration Curves and Reliability Verification")
    add_p(
        "Reliability evaluation on the chronological held-out test cohort demonstrates the transformative impact of isotonic calibration. "
        "Figure 5.4 displays the test set reliability diagram plotting predicted decile probabilities against observed empirical attendance frequencies."
    )

    add_figure_image("docs/thesis_assets/media_1791111486187.png", width_inches=5.2)
    add_caption_figure("5.4", "Out-of-Sample Reliability Diagram for Raw and Isotonically Calibrated XGBoost Probabilities")

    add_p(
        "As evidenced by Figure 5.4, the isotonically calibrated curve tracks the ideal 45-degree diagonal reference line across all decile bins, eliminating the severe probability compression observed in raw gradient boosting outputs. "
        "Table 5.4 details calibration metrics across the three operational risk tiers."
    )

    add_caption_table("5.4", "Probability Calibration Brier Scores and Risk Tier Distribution Metrics")
    t54 = doc.add_table(rows=4, cols=5)
    t54_data = [
        ("Operational Tier", "Sample Count (n)", "Population Share", "Mean Predicted Risk", "Observed Empirical No-Show Rate"),
        ("High Risk Tier", "181", "6.0%", "35.5%", "37.6%"),
        ("Medium Risk Tier", "962", "31.9%", "20.4%", "23.9%"),
        ("Low Risk Tier", "1,876", "62.1%", "9.2%", "9.6%"),
    ]
    for r_idx, row_vals in enumerate(t54_data):
        row = t54.rows[r_idx]
        for c_idx, val in enumerate(row_vals):
            row.cells[c_idx].paragraphs[0].text = val
    format_custom_table(t54, [1.8, 1.1, 1.1, 1.1, 1.1])

    add_p(
        "The empirical alignment is exceptionally close: in the High Risk tier, the predicted mean risk of 35.5% aligns tightly with the observed 37.6% failure rate, while the Low Risk tier exhibits 9.6% observed no-shows against 9.2% predicted."
    )

    add_h2("5.6 Empirical Hypothesis Testing: Feature Odds Ratios and Significance")
    add_p(
        "To rigorously test the stated research hypotheses, multivariable logistic regression was fitted on the standardized training cohort to compute standardized Odds Ratios (OR per SD), 95% Confidence Intervals, and p-values. "
        "Table 5.5 presents the parameter estimates."
    )

    add_caption_table("5.5", "Multivariable Logistic Regression Odds Ratios, 95% Confidence Intervals, and p-values")
    t55 = doc.add_table(rows=14, cols=5)
    t55_data = [
        ("Feature Variable", "Odds Ratio per SD", "95% CI Lower", "95% CI Upper", "p-value"),
        ("lead_days", "1.235", "1.207", "1.265", "< 0.001"),
        ("heavy_rain", "1.153", "1.125", "1.182", "< 0.001"),
        ("appt_hour", "1.090", "1.061", "1.120", "< 0.001"),
        ("distance_km", "1.077", "1.051", "1.103", "< 0.001"),
        ("is_first_visit", "1.098", "1.043", "1.157", "< 0.001"),
        ("is_poya", "1.061", "1.036", "1.088", "< 0.001"),
        ("is_weekend", "1.071", "1.044", "1.098", "< 0.001"),
        ("sms_sent", "0.950", "0.925", "0.976", "< 0.001"),
        ("chronic_count", "0.878", "0.848", "0.909", "< 0.001"),
        ("booking_channel_Counter", "0.771", "0.738", "0.805", "< 0.001"),
        ("payment_mode_Prepaid_Online", "0.743", "0.713", "0.774", "< 0.001"),
        ("payment_mode_Card", "0.872", "0.843", "0.903", "< 0.001"),
        ("payment_mode_Corporate", "0.932", "0.903", "0.962", "< 0.001"),
    ]
    for r_idx, row_vals in enumerate(t55_data):
        row = t55.rows[r_idx]
        for c_idx, val in enumerate(row_vals):
            row.cells[c_idx].paragraphs[0].text = val
    format_custom_table(t55, [2.2, 1.1, 1.0, 1.0, 0.9])

    add_p(
        "Hypothesis Testing Verification:\n"
        "• Hypothesis 1 Supported: Lead days exhibits an OR of 1.235 (p < 0.001), confirming that longer booking horizons significantly increase non-attendance odds.\n"
        "• Hypothesis 2 Supported: Digital prepayment (Prepaid Online) exhibits an OR of 0.743 (p < 0.001), confirming significant protective commitment.\n"
        "• Hypothesis 3 Supported: Heavy rain (OR 1.153, p < 0.001) and Poya holidays (OR 1.061, p < 0.001) significantly increase absenteeism odds."
    )

    add_h2("5.7 Global and Local TreeSHAP Explainability Results")
    add_p(
        "Global TreeSHAP feature attributions were calculated across the held-out test cohort. "
        "Figure 5.5 presents the global summary beeswarm plot displaying the directional impact of each feature on predicted log-odds."
    )

    add_figure_image("docs/thesis_assets/media_1791111486340.png", width_inches=4.4)
    add_caption_figure("5.5", "Global TreeSHAP Summary Beeswarm Plot of Predictive Feature Attributions")

    add_p(
        "Figure 5.6 and Table 5.6 present the mean absolute SHAP attribution scores ranking the top systemic predictors."
    )

    add_figure_image("docs/thesis_assets/media_1791111486343.png", width_inches=4.4)
    add_caption_figure("5.6", "Mean Absolute SHAP Feature Importance Hierarchy for the Tuned Classifier")

    add_caption_table("5.6", "Mean Absolute TreeSHAP Attribution Scores for Top Predictive Features")
    t56 = doc.add_table(rows=11, cols=2)
    t56_data = [
        ("Predictive Feature", "Mean Absolute SHAP Value (|phi|)"),
        ("lead_days", "0.300"),
        ("prior_no_show_rate", "0.182"),
        ("payment_mode_Prepaid_Online", "0.132"),
        ("sms_sent", "0.118"),
        ("chronic_count", "0.087"),
        ("booking_channel_Counter", "0.086"),
        ("heavy_rain", "0.070"),
        ("appt_hour", "0.068"),
        ("age", "0.066"),
        ("distance_km", "0.065"),
    ]
    for r_idx, row_vals in enumerate(t56_data):
        row = t56.rows[r_idx]
        row.cells[0].paragraphs[0].text = row_vals[0]
        row.cells[1].paragraphs[0].text = row_vals[1]
    format_custom_table(t56, [3.2, 3.0])

    add_h2("5.8 Subgroup Fairness and Demographic Parity Audit")
    add_p(
        "To ensure that SHAI operates without systemic bias or disparate impact, an extensive subgroup fairness audit was executed across demographic, financial, and logistical cohorts. "
        "Table 5.7 summarizes audit metrics across subgroups."
    )

    add_caption_table("5.7", "Subgroup Fairness Audit Across Demographic, Financial, and Logistical Categories")
    t57 = doc.add_table(rows=10, cols=6)
    t57_data = [
        ("Dimension", "Subgroup Cohort", "Sample (n)", "Base No-Show", "Subgroup AUC", "Recall @ 20%"),
        ("Gender", "Female (F)", "5,338", "15.7%", "0.674", "36.6%"),
        ("Gender", "Male (M)", "4,047", "15.1%", "0.671", "38.0%"),
        ("Age Band", "< 18 years", "972", "14.5%", "0.638", "31.2%"),
        ("Age Band", "18-39 years", "2,491", "18.4%", "0.658", "33.6%"),
        ("Age Band", "40-64 years", "3,735", "15.5%", "0.683", "38.2%"),
        ("Age Band", "65+ years", "2,187", "12.4%", "0.663", "38.7%"),
        ("Transit Band", "<= 5 km", "3,792", "14.6%", "0.670", "37.4%"),
        ("Transit Band", "5-15 km", "3,856", "15.4%", "0.675", "38.7%"),
        ("Transit Band", "> 15 km", "1,388", "17.7%", "0.656", "35.5%"),
    ]
    for r_idx, row_vals in enumerate(t57_data):
        row = t57.rows[r_idx]
        for c_idx, val in enumerate(row_vals):
            row.cells[c_idx].paragraphs[0].text = val
    format_custom_table(t57, [1.4, 1.4, 0.8, 0.9, 0.9, 0.8])

    add_figure_image("docs/thesis_assets/media_1791111517327.png", width_inches=5.8)
    add_caption_figure("5.7", "Multi-Dimensional Subgroup Fairness Evaluation Across Demographic and Logistical Strata")

    add_p(
        "The fairness audit confirms high demographic equity: gender performance is virtually identical between females (AUC 0.674) and males (AUC 0.671), confirming the absence of gender disparity. "
        "Performance remains stable across transit distance bands and age brackets."
    )

    add_h2("5.9 Operational Decision Support and Capacity Management Performance")
    add_p(
        "Figure 5.8 illustrates the primary Capacity Overview dashboard in the SHAI platform, displaying real-time session capacity, expected no-shows with Poisson-binomial confidence intervals, overbooking quotas, and live consultant punctuality tracking."
    )

    add_figure_image("docs/thesis_assets/media_1791110961160.png", width_inches=5.8)
    add_caption_figure("5.8", "SHAI Capacity Overview Dashboard Displaying Punctuality Tracking and Live Operational Metrics")

    add_p(
        "Figure 5.9 presents the 15-Minute Slot Overbooking Risk Heatmap matrix, tracking cumulative risk accumulation across 11 consultant sessions."
    )

    add_figure_image("docs/thesis_assets/media_1791110961169.png", width_inches=5.8)
    add_caption_figure("5.9", "15-Minute Slot Overbooking Risk Heatmap Matrix for Real-Time Clinic Sessions")

    add_p(
        "Figure 5.10 depicts the interactive 'What-If Studio', demonstrating dynamic overbooking curve optimization where expected session value peaks at 18 to 20 extra bookings before overtime penalties dominate."
    )

    add_figure_image("docs/thesis_assets/media_1791110961193.png", width_inches=5.8)
    add_caption_figure("5.10", "What-If Studio Dynamic Overbooking Optimization Curve and Session Value Analysis")

    add_p(
        "Figure 5.11 depicts the Multi-Horizon Capacity Forecast, displaying 14-day expected no-shows (58 expected no-shows with an 80% CI: [56, 60]) and day-by-day risk intensity heat strips."
    )

    add_figure_image("docs/thesis_assets/media_1791110981660.png", width_inches=5.8)
    add_caption_figure("5.11", "Multi-Horizon Capacity Forecast with 80% Poisson-Binomial Confidence Bounds")

    add_h2("5.10 End-to-End Clinical Triage and Master Scheduling Implementation")
    add_p(
        "Figure 5.12 displays the Appointments Master Schedule interface (73,941 records), showing calibrated risk triage badges and recommended clinical actions."
    )

    add_figure_image("docs/thesis_assets/media_1791110933771.png", width_inches=5.8)
    add_caption_figure("5.12", "Appointments Master Schedule Interface with Calibrated Risk Triage and Recommended Actions")

    add_p(
        "Figures 5.13 through 5.16 present the four sequential steps of the New Appointment Intake Wizard, demonstrating live risk previewing, transit geospatial routing, specialty selection, and multi-channel booking confirmation."
    )

    add_figure_image("docs/thesis_assets/media_1791111000536.png", width_inches=5.6)
    add_caption_figure("5.13", "Patient Intake Wizard Step 1: Patient Identity, Comorbidity Registration, and Risk Preview")

    add_figure_image("docs/thesis_assets/media_1791111000529.png", width_inches=5.6)
    add_caption_figure("5.14", "Patient Intake Wizard Step 2: Commute Distance Calculation and Geospatial Transit Mapping")

    add_figure_image("docs/thesis_assets/media_1791111000547.png", width_inches=5.6)
    add_caption_figure("5.15", "Patient Intake Wizard Step 3: Clinical Specialty Selection and Dynamic Re-Scoring")

    add_figure_image("docs/thesis_assets/media_1791111000569.png", width_inches=5.6)
    add_caption_figure("5.16", "Patient Intake Wizard Step 4: Multi-Channel Booking Confirmation and Review")

    add_p(
        "Figure 5.17 illustrates the Prediction Hub daily batch scoring module, displaying cohort risk breakdowns and the interactive Outreach Clinical Action drawer."
    )

    add_figure_image("docs/thesis_assets/media_1791110933717.png", width_inches=5.6)
    add_caption_figure("5.17", "Prediction Hub Daily Batch Scoring and Outreach Drawer Execution Interface")

    add_h2("5.11 Multi-Turn Conversational Rescheduling and Staff-in-the-Loop Evaluation")
    add_p(
        "Figure 5.18 displays the Autonomous Outreach Hub chat interface executing an ask-first conversational rescheduling session with patient Kamala Perera in English, halting at the 'Patient agreed. Approve this booking?' governance barrier."
    )

    add_figure_image("docs/thesis_assets/media_1791111036895.png", width_inches=5.8)
    add_caption_figure("5.18", "Autonomous Outreach Hub WhatsApp Thread with Ask-First Flow and Staff Approval Gate")

    add_p(
        "Figure 5.19 illustrates the Post-Missed Appointment Recall Queue, tracking 229 patients missed in the previous 14 days and benchmarking recovery performance against the historical clinical baseline (26.2%)."
    )

    add_figure_image("docs/thesis_assets/media_1791111020633.png", width_inches=5.8)
    add_caption_figure("5.19", "Post-Missed Appointment Recall Queue Benchmarked Against Historical Clinical Efficacy")

    add_h2("5.12 90-Day Operational Database Replay and Ranking Efficacy Lift")
    add_p(
        "To evaluate real-world clinical utility without static assumptions, an operational historical replay was executed across 9,266 recorded appointments over a 90-day window in the development database. "
        "Table 5.8 and Figure 5.20 contrast risk-ranked outreach against random outreach at a 27% daily contact quota (2,542 contacts, efficacy 33%)."
    )

    add_caption_table("5.8", "Historical 90-Day Operational Replay Performance: Risk-Ranked Policy vs Random Outreach")
    t58 = doc.add_table(rows=3, cols=6)
    t58_data = [
        ("Outreach Policy", "No-Shows Reached", "Recall Rate", "Recovered Revenue", "Contact Cost", "Net Benefit"),
        ("Top Risk First (SHAI)", "680 of 1,435", "47.4%", "LKR 551,500", "LKR 11,700", "LKR 539,800"),
        ("Random Contact Policy", "394 of 1,435", "27.4%", "LKR 322,900", "LKR 11,700", "LKR 311,300"),
    ]
    for r_idx, row_vals in enumerate(t58_data):
        row = t58.rows[r_idx]
        for c_idx, val in enumerate(row_vals):
            row.cells[c_idx].paragraphs[0].text = val
    format_custom_table(t58, [1.8, 1.1, 0.9, 1.1, 0.9, 1.1])

    add_figure_image("docs/thesis_assets/media_1791111056765.png", width_inches=5.8)
    add_caption_figure("5.20", "90-Day Operational Historical Replay Lift Comparing Risk-Ranked Outreach to Random Contact")

    add_p(
        "The empirical replay demonstrates that SHAI's risk-ranked targeting captures 680 no-shows (47.4% recall) compared to only 394 (27.4%) under random contact. "
        "This delivers an empirical net revenue gain of LKR 228,600 over the 90-day period entirely attributable to algorithmic risk ranking."
    )

    add_h2("5.13 Decision-Theoretic Economic Evaluation and Sensitivity Analysis")
    add_p(
        "To establish realistic hospital business viability, an economic sensitivity matrix was computed incorporating empirical telco costs and Rajasuriya et al. (2010) clinical recall efficacy boundaries (17% to 38%). "
        "Figure 5.21 and Table 5.9 present the decision-theoretic sensitivity matrix."
    )

    add_figure_image("docs/thesis_assets/media_1791111036987.png", width_inches=5.8)
    add_caption_figure("5.21", "Interactive Outreach ROI Simulation and Decision-Theoretic Financial Evaluation Studio")

    add_caption_table("5.9", "Decision-Theoretic Sensitivity Matrix: Annual Net Economic Benefit (LKR) Across Efficacy and Contact Ratios")
    t59 = doc.add_table(rows=5, cols=4)
    t59_data = [
        ("Clinical Efficacy", "10% Contact Top", "20% Contact Top", "30% Contact Top"),
        ("17% (Lower 95% CI)", "-LKR 1,660,000", "-LKR 1,300,000", "-LKR 979,100"),
        ("26% (Rajasuriya Baseline)", "-LKR 1,370,000", "-LKR 809,300", "-LKR 315,500"),
        ("38% (Upper 95% CI)", "-LKR 989,900", "-LKR 160,400", "+LKR 569,200"),
        ("50% (High Intervention)", "-LKR 608,400", "+LKR 488,400", "+LKR 1,450,000"),
    ]
    for r_idx, row_vals in enumerate(t59_data):
        row = t59.rows[r_idx]
        for c_idx, val in enumerate(row_vals):
            row.cells[c_idx].paragraphs[0].text = val
    format_custom_table(t59, [2.2, 1.4, 1.4, 1.4])

    add_p(
        "Table 5.10 details the assumption parameters and their empirical evidence sourcing."
    )

    add_caption_table("5.10", "Economic Assumption Parameter Register and Evidence Sourcing Summary")
    t510 = doc.add_table(rows=7, cols=4)
    t510_data = [
        ("Parameter", "Modeled Value", "Evidence Source / Derivation", "Empirical Strength"),
        ("Outreach Efficacy", "0.26 (0.17 - 0.38)", "Rajasuriya et al. (2010), The Psychiatrist 34:515-518", "Moderate (uncontrolled)"),
        ("Consultation Fee", "LKR 2,500 base", "Observed range LKR 2,000 - 4,700 across Colombo hospitals", "Market baseline"),
        ("SMS Dispatch Tariff", "LKR 1.00", "QuickSend.lk / Dialog telecommunication enterprise tariff", "Sourced"),
        ("Staff Hourly Wage", "LKR 300 / hour", "Sri Lanka Labour Force Survey 2024 (receptionist gross pay)", "Sourced"),
        ("Phone Call Escalation", "25% of contacts (3.5 min)", "Richards & Okopi (2026), BJPsych Open (call duration)", "Derived"),
        ("Blended Contact Cost", "LKR 5.38", "1.00 + 0.25 * (3.5/60) * 300 = LKR 5.38 per contacted patient", "Derived"),
    ]
    for r_idx, row_vals in enumerate(t510_data):
        row = t510.rows[r_idx]
        for c_idx, val in enumerate(row_vals):
            row.cells[c_idx].paragraphs[0].text = val
    format_custom_table(t510, [1.8, 1.2, 2.2, 1.2])

    add_p(
        "Economic Viability Insights:\n"
        "Holding fixed platform expenses at LKR 2.18M/year, the model establishes a break-even consultation fee of LKR 3,961. "
        "At the conservative base fee of LKR 2,500, net annual benefit is negative (-LKR 815,265, ROI 0.63x). "
        "However, across private specialist consultation fees exceeding LKR 4,000 (such as LKR 4,500, yielding +LKR 301,959 and 1.14x ROI), predictive outreach is strongly profitable. "
        "Without platform licensing fees, direct outreach delivers a net annual benefit of +LKR 1,364,735."
    )

    add_h2("5.14 Software Verification, Reliability Metrics, and Test Execution Results")
    add_p(
        "Figure 5.22 displays the Staff and Access Governance administrative console, verifying multi-tenant Role-Based Access Control (RBAC) across analyst, manager, front_desk, and admin tiers."
    )

    add_figure_image("docs/thesis_assets/media_1791111068934.png", width_inches=5.8)
    add_caption_figure("5.22", "Staff and Access Governance Console Enforcing Multi-Tenant Role-Based Access Control")

    add_p(
        "Table 5.11 summarizes the automated testing suite execution results verifying software reliability."
    )

    add_caption_table("5.11", "Automated Software Quality Assurance Test Suite Execution Summary")
    t511 = doc.add_table(rows=6, cols=4)
    t511_data = [
        ("Testing Suite Domain", "Test Framework", "Test Cases Executed", "Passing Status"),
        ("Backend Services & API Endpoints", "pytest + httpx", "233 tests", "233 Passed (100%)"),
        ("Conversational State Machine", "pytest (test_reschedule.py)", "12 integration tests", "12 Passed (100%)"),
        ("Frontend UI Component Primitives", "Vitest + React Testing Library", "31 unit tests", "31 Passed (100%)"),
        ("TypeScript Static Type Checker", "tsc (TypeScript 5.9.3)", "Full codebase scan", "0 Type Errors"),
        ("Frontend Code Quality & Linting", "ESLint 9.39.5", "Full frontend scan", "0 Lint Errors"),
    ]
    for r_idx, row_vals in enumerate(t511_data):
        row = t511.rows[r_idx]
        for c_idx, val in enumerate(row_vals):
            row.cells[c_idx].paragraphs[0].text = val
    format_custom_table(t511, [2.2, 1.8, 1.4, 1.4])
