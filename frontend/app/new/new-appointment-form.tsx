"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import {
  User,
  Calendar,
  Sparkles,
  ArrowRight,
  PlusCircle,
  ShieldAlert,
  Loader2,
} from "lucide-react";

import { createAppointmentAction, type NewAppointmentState } from "@/app/new/actions";
import { ShapTornadoChart } from "@/components/shap-tornado-chart";
import { RiskPill } from "@/components/risk-pill";
import { DotRingGauge } from "@/components/dot-ring-gauge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: NewAppointmentState = {};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const DEPARTMENTS = [
  "General Medicine",
  "Cardiology",
  "Orthopedics",
  "Pediatrics",
  "Dermatology",
  "Ophthalmology",
  "Neurology",
  "Gynecology",
  "Oncology",
];

const KNOWN_CONSULTANTS = ["Dr. Rohan Perera", "Dr. Neluka Fernando", "Dr. Anura Jayasinghe"];

const BOOKING_CHANNELS = ["Doc990", "eChannelling", "Asiri MyHealth", "Hospital Counter"];

const PAYMENT_MODES = [
  "Credit Card (NSR Protected)",
  "Credit Card",
  "Corporate Insurance",
  "Cash",
];

export function NewAppointmentForm() {
  const [state, formAction, pending] = useActionState(
    createAppointmentAction,
    initialState
  );

  const [scheduledDay, setScheduledDay] = useState(today());
  const [appointmentDay, setAppointmentDay] = useState("");
  const [selectedDept, setSelectedDept] = useState("General Medicine");
  const [dob, setDob] = useState("");

  // Live age calculation
  const calculatedAge = dob
    ? Math.max(
        0,
        new Date().getFullYear() -
          new Date(dob).getFullYear() -
          (new Date().getMonth() < new Date(dob).getMonth() ||
          (new Date().getMonth() === new Date(dob).getMonth() &&
            new Date().getDate() < new Date(dob).getDate())
            ? 1
            : 0)
      )
    : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Prediction Result Reveal Card */}
      {state.result && (
        <Card className="border-primary/40 bg-card shadow-lg ring-2 ring-primary/20 animate-in fade-in-0 slide-in-from-top-4 duration-500">
          <CardHeader className="border-b border-border/60 pb-3 bg-muted/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Sparkles className="size-4" />
                </div>
                <div>
                  <CardTitle className="text-base">Instant AI Prediction Result</CardTitle>
                  <CardDescription className="text-xs">
                    Assessed for <strong>{state.result.patient.full_name}</strong>
                  </CardDescription>
                </div>
              </div>
              <RiskPill
                category={state.result.prediction.risk_category}
                score={state.result.prediction.risk_score}
                size="default"
              />
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-5 p-5">
            <div className="flex flex-col sm:flex-row items-center gap-5 rounded-2xl border border-border/80 bg-muted/20 p-5">
              <DotRingGauge
                score={state.result.prediction.risk_score}
                category={state.result.prediction.risk_category}
                size={140}
              />

              <div className="flex flex-1 flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    Calibrated No-Show Risk:
                  </span>
                  <span className="text-sm font-bold tabular-nums text-foreground">
                    {Math.round(state.result.prediction.risk_score * 100)}%
                  </span>
                </div>

                <div
                  className={`rounded-xl border p-3.5 text-xs leading-relaxed ${
                    state.result.prediction.risk_category === "High"
                      ? "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200 font-medium"
                      : state.result.prediction.risk_category === "Medium"
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 font-medium"
                      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                  }`}
                >
                  <div className="font-semibold mb-0.5 flex items-center gap-1.5">
                    <ShieldAlert className="size-3.5" />
                    <span>Staff Action Recommendation:</span>
                  </div>
                  {state.result.prediction.recommendation}
                </div>
              </div>
            </div>

            {/* SHAP Feature Tornado Chart */}
            <div className="flex flex-col gap-1">
              <ShapTornadoChart contributions={state.result.prediction.explanation} />
            </div>

            {/* Payoff Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
                className="gap-1.5 text-xs"
              >
                <PlusCircle className="size-3.5" />
                <span>Schedule Another Appointment</span>
              </Button>

              <Button
                variant="default"
                size="sm"
                className="gap-1.5 text-xs shadow-xs"
                nativeButton={false}
                render={
                  <Link href={`/appointments/${state.result.appointment.id}`}>
                    <span>View Complete Appointment Details</span>
                    <ArrowRight className="size-3.5" />
                  </Link>
                }
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Intake Form */}
      {!state.result && (
        <form action={formAction} className="flex flex-col gap-6">
          {/* Section 1: Patient Details */}
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <User className="size-4 text-primary" />
                <div>
                  <CardTitle className="text-base">1. Patient Demographics & Conditions</CardTitle>
                  <CardDescription className="text-xs">
                    Basic identification, contact info, and medical risk factors.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-4">
              <Field label="Full Name *" htmlFor="full_name">
                <Input
                  id="full_name"
                  name="full_name"
                  placeholder="e.g. Eleanor Vance"
                  required
                  disabled={pending}
                  className="h-9 text-xs"
                />
              </Field>

              <Field label="UHID (Unique Health ID)" htmlFor="uhid">
                <Input
                  id="uhid"
                  name="uhid"
                  placeholder="e.g. UHID-ASIRI-9812"
                  disabled={pending}
                  className="h-9 text-xs"
                />
              </Field>

              <Field
                label={
                  <span className="flex items-center justify-between">
                    <span>Date of Birth *</span>
                    {calculatedAge !== null && (
                      <span className="text-[11px] font-normal text-muted-foreground">
                        Age: <strong>{calculatedAge} yrs</strong>
                      </span>
                    )}
                  </span>
                }
                htmlFor="date_of_birth"
              >
                <Input
                  id="date_of_birth"
                  name="date_of_birth"
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  required
                  disabled={pending}
                  className="h-9 text-xs"
                />
              </Field>

              <Field label="Gender" htmlFor="gender">
                <select
                  id="gender"
                  name="gender"
                  disabled={pending}
                  className="h-9 w-full rounded-lg border border-input bg-card px-2.5 text-xs outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20 text-foreground"
                  defaultValue=""
                >
                  <option value="">Prefer not to say</option>
                  <option value="F">Female</option>
                  <option value="M">Male</option>
                  <option value="O">Other</option>
                </select>
              </Field>

              <Field label="Phone Number" htmlFor="phone">
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="e.g. +1 (555) 234-5678"
                  disabled={pending}
                  className="h-9 text-xs"
                />
              </Field>

              <Field label="Email Address" htmlFor="email">
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="e.g. patient@example.com"
                  disabled={pending}
                  className="h-9 text-xs"
                />
              </Field>

              <Field label="City / Residential Area" htmlFor="city">
                <Input
                  id="city"
                  name="city"
                  placeholder="e.g. Nugegoda"
                  disabled={pending}
                  className="h-9 text-xs"
                />
              </Field>

              <Field
                label="Distance from Hospital (km)"
                htmlFor="distance_km"
              >
                <Input
                  id="distance_km"
                  name="distance_km"
                  type="number"
                  min={0}
                  step="0.1"
                  placeholder="e.g. 12.5"
                  disabled={pending}
                  className="h-9 text-xs"
                />
              </Field>

              <Field
                label="Handicap Severity Level"
                htmlFor="handicap"
                className="sm:col-span-2"
              >
                <select
                  id="handicap"
                  name="handicap"
                  disabled={pending}
                  className="h-9 w-full rounded-lg border border-input bg-card px-2.5 text-xs outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20 text-foreground"
                  defaultValue="0"
                >
                  <option value="0">0 — No disability / handicap</option>
                  <option value="1">1 — Mild handicap</option>
                  <option value="2">2 — Moderate handicap</option>
                  <option value="3">3 — Severe handicap</option>
                  <option value="4">4 — Very severe handicap</option>
                </select>
              </Field>

              {/* Conditions Checklist */}
              <div className="flex flex-col gap-2.5 sm:col-span-2 border-t border-border/60 pt-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Recorded Chronic Conditions & Welfare
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <ConditionCheckbox
                    name="hypertension"
                    label="Hypertension History"
                    hint="Diagnosed high blood pressure"
                    disabled={pending}
                  />
                  <ConditionCheckbox
                    name="diabetes"
                    label="Diabetes History"
                    hint="Type 1 or Type 2 diagnosis"
                    disabled={pending}
                  />
                  <ConditionCheckbox
                    name="alcoholism"
                    label="Alcoholism History"
                    hint="Alcohol dependence recorded"
                    disabled={pending}
                  />
                  <ConditionCheckbox
                    name="scholarship"
                    label="Bolsa Família / Scholarship"
                    hint="Enrolled in social welfare program"
                    disabled={pending}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Appointment Details */}
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <Calendar className="size-4 text-primary" />
                <div>
                  <CardTitle className="text-base">2. Appointment Scheduling & Department</CardTitle>
                  <CardDescription className="text-xs">
                    Booking dates and clinical department assignment.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-4">
              <Field label="Scheduled On (Booking Date) *" htmlFor="scheduled_day">
                <Input
                  id="scheduled_day"
                  name="scheduled_day"
                  type="date"
                  value={scheduledDay}
                  onChange={(e) => setScheduledDay(e.target.value)}
                  required
                  disabled={pending}
                  className="h-9 text-xs"
                />
              </Field>

              <Field label="Appointment Date (Visit Date) *" htmlFor="appointment_day">
                <Input
                  id="appointment_day"
                  name="appointment_day"
                  type="date"
                  min={scheduledDay}
                  value={appointmentDay}
                  onChange={(e) => setAppointmentDay(e.target.value)}
                  required
                  disabled={pending}
                  className="h-9 text-xs"
                />
              </Field>

              <Field label="Clinical Department" htmlFor="department" className="sm:col-span-2">
                <div className="flex flex-col gap-2">
                  <select
                    id="department"
                    name="department"
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    disabled={pending}
                    className="h-9 w-full rounded-lg border border-input bg-card px-2.5 text-xs outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20 text-foreground"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </Field>

              <Field label="Consultant" htmlFor="doctor_name">
                <Input
                  id="doctor_name"
                  name="doctor_name"
                  list="known-consultants"
                  placeholder="e.g. Dr. Rohan Perera"
                  defaultValue={KNOWN_CONSULTANTS[0]}
                  disabled={pending}
                  className="h-9 text-xs"
                />
                <datalist id="known-consultants">
                  {KNOWN_CONSULTANTS.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </Field>

              <Field label="Scheduled Clinic Time" htmlFor="scheduled_time">
                <Input
                  id="scheduled_time"
                  name="scheduled_time"
                  type="time"
                  defaultValue="17:30"
                  disabled={pending}
                  className="h-9 text-xs"
                />
              </Field>

              <Field label="Booking Channel" htmlFor="booking_channel">
                <select
                  id="booking_channel"
                  name="booking_channel"
                  disabled={pending}
                  className="h-9 w-full rounded-lg border border-input bg-card px-2.5 text-xs outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20 text-foreground"
                  defaultValue={BOOKING_CHANNELS[0]}
                >
                  {BOOKING_CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Payment Mode" htmlFor="payment_mode">
                <select
                  id="payment_mode"
                  name="payment_mode"
                  disabled={pending}
                  className="h-9 w-full rounded-lg border border-input bg-card px-2.5 text-xs outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20 text-foreground"
                  defaultValue={PAYMENT_MODES[0]}
                >
                  {PAYMENT_MODES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="sm:col-span-2 rounded-lg border border-border/80 bg-muted/20 p-3">
                <label className="flex items-center gap-2.5 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    name="sms_received"
                    defaultChecked
                    disabled={pending}
                    className="size-4 rounded border-input accent-primary"
                  />
                  <div>
                    <span className="text-foreground">Send SMS Reminder</span>
                    <p className="text-[11px] font-normal text-muted-foreground">
                      Automated text confirmation scheduled before appointment.
                    </p>
                  </div>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Form Error */}
          {state.error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive font-medium">
              {state.error}
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            size="lg"
            disabled={pending}
            className="w-full gap-2 text-sm shadow-md font-semibold h-10"
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span>Running XGBoost Model & Generating SHAP Explanations…</span>
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                <span>Register Appointment & Predict No-Show Risk</span>
              </>
            )}
          </Button>
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ConditionCheckbox({
  name,
  label,
  hint,
  disabled,
}: {
  name: string;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-card p-2.5 text-xs transition-colors hover:bg-muted/30 cursor-pointer">
      <input
        type="checkbox"
        name={name}
        disabled={disabled}
        className="size-4 rounded border-input accent-primary mt-0.5"
      />
      <div className="flex flex-col">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </div>
    </label>
  );
}
