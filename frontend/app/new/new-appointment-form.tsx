"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  User,
  MapPin,
  Stethoscope,
  CheckCircle2,
  Sparkles,
  Calendar,
  Clock,
  Printer,
  PlusCircle,
  ArrowRight,
  ArrowLeft,
  Search,
  AlertCircle,
  Phone,
  FileText,
  CloudRain,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressStages } from "@/components/ui/progress-stages";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { PhoneInput } from "@/components/ui/phone-input";
import { SegmentedCards, type SegmentedCardOption } from "@/components/ui/segmented-cards";
import { RiskPill } from "@/components/risk-pill";
import { JourneyMap } from "@/components/journey-map";
import { cn } from "@/lib/utils";
import { estimateTravelMinutes, formatTravel } from "@/lib/geo";
import { formatDriverFeature } from "@/lib/format";
import { approveConversationAction, bookConversationAction } from "@/app/outreach/thread-actions";
import type {
  SlotDict,
  Patient,
  DepartmentItem,
  DoctorItem,
  LocationItem,
  PatientSearchResult,
  IntakeResponse,
  PredictPreviewResponse,
  RiskCategory,
} from "@/lib/types";

const STAGES = [
  { id: "identity", label: "Patient Identity", description: "Demographics & NIC" },
  { id: "commute", label: "Location & Commute", description: "Sri Lanka transit" },
  { id: "clinical", label: "Clinical & Scheduling", description: "Department & Slot" },
  { id: "review", label: "Booking & Review", description: "Payment & Confirmation" },
];

const CHANNELS: SegmentedCardOption[] = [
  { value: "Phone", title: "Phone Call", description: "Inbound clinic telephone line" },
  { value: "Counter", title: "Hospital Counter", description: "Walk-in registration desk" },
  { value: "Doc990", title: "Doc990", description: "Telecommunications booking portal" },
  { value: "eChannelling", title: "eChannelling", description: "National digital gateway" },
  { value: "MyHealth", title: "MyHealth", description: "Hospital mobile application" },
];

const PAYMENTS: SegmentedCardOption[] = [
  { value: "Cash", title: "Cash", description: "Direct counter settlement" },
  { value: "Card", title: "Credit/Debit Card", description: "Visa, Mastercard, or LankaPay" },
  { value: "Prepaid_Online", title: "Prepaid Online", description: "Confirmed digital payment" },
  { value: "Corporate", title: "Corporate Billing", description: "Employer credit account" },
  { value: "Insurance", title: "Insurance Guarantee", description: "Prior cashless approval" },
];

export type ConversationPrefill = {
  conversationId: string;
  patient: Patient & { nic?: string | null; district?: string | null };
  offer: SlotDict;
  departmentId: number | null;
  departmentName: string | null;
};

// Sri Lanka calendar date (en-CA formats as YYYY-MM-DD)
const TODAY_LK = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });

export function NewAppointmentForm({ prefill = null }: { prefill?: ConversationPrefill | null }) {
  const router = useRouter();
  const pp = prefill?.patient;

  // Current wizard stage: a patient-approved offer already has steps 1-3, so land on the review step
  const [currentStage, setCurrentStage] = useState(prefill ? 3 : 0);
  // The agreed doctor/session must survive the "first doctor / first session" defaults on first load
  const keepOffer = useRef(!!prefill);
  // The approve action revalidates this page; once the conversation is booked the server stops sending
  // `prefill`, so remember the original to keep the success view (and avoid falling back to the intake buttons).
  const prefillRef = useRef(prefill);
  if (prefill) prefillRef.current = prefill;
  const [approved, setApproved] = useState<{ appointmentId: string; token: number | null; message: string } | null>(null);

  // Reference data lists
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [doctors, setDoctors] = useState<DoctorItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [patientMatches, setPatientMatches] = useState<PatientSearchResult[]>([]);

  // Stage 1: Patient Identity
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(pp?.id ?? null);
  const [patientSearchQ, setPatientSearchQ] = useState("");
  const [fullName, setFullName] = useState(pp?.full_name ?? "");
  const [nic, setNic] = useState(pp?.nic ?? "");
  const [dob, setDob] = useState(pp?.date_of_birth ?? "");
  const [gender, setGender] = useState(pp?.gender ?? "male");
  const [phone, setPhone] = useState(pp?.phone || "+94 ");
  const [email, setEmail] = useState(pp?.email ?? "");
  const [preferredLanguage, setPreferredLanguage] = useState<string>(pp?.preferred_language ?? "en");
  const [hasHypertension, setHasHypertension] = useState(pp?.hypertension ?? false);
  const [hasDiabetes, setHasDiabetes] = useState(pp?.diabetes ?? false);

  // Stage 2: Commute & Location
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [city, setCity] = useState(pp?.city ?? "Colombo 07");
  const [district, setDistrict] = useState(pp?.district ?? "Colombo");
  const [latitude, setLatitude] = useState<number | null>(pp?.latitude ?? 6.9044);
  const [longitude, setLongitude] = useState<number | null>(pp?.longitude ?? 79.8697);
  const [addressLine, setAddressLine] = useState("");
  const [distanceKm, setDistanceKm] = useState<number>(pp?.distance_km ?? 3.5);
  const [distanceSource, setDistanceSource] = useState<"road_osrm" | "estimated" | "manual">("estimated");

  // Stage 3: Clinical & Scheduling
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(prefill?.departmentId ?? null);
  const [selectedDeptName, setSelectedDeptName] = useState(prefill?.departmentName ?? "General Medicine");
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(prefill?.offer.doctor_id ?? "");
  const [appointmentDay, setAppointmentDay] = useState(prefill?.offer.date ?? TODAY_LK);
  const [selectedSessionId, setSelectedSessionId] = useState<string>(prefill?.offer.session_id ?? "");
  const [doctorSessions, setDoctorSessions] = useState<
    Array<{ id: string; name: string; start: string; end: string; room: string; remaining: number; nextToken: number }>
  >([]);
  const [clinicSession, setClinicSession] = useState("Morning");

  // Stage 4: Booking & Review
  const [bookingChannel, setBookingChannel] = useState("Counter");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [smsReminderOptIn, setSmsReminderOptIn] = useState(true);
  const [heavyRain, setHeavyRain] = useState(false);
  const [notes, setNotes] = useState("");

  // Live Ephemeral Prediction Preview State
  const [preview, setPreview] = useState<PredictPreviewResponse | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Booking outcome state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<IntakeResponse | null>(null);

  // 1. Initial Reference Data Loading
  useEffect(() => {
    async function loadRefs() {
      try {
        const dRes = await fetch("/api/departments");
        if (dRes.ok) {
          const dData = await dRes.json();
          setDepartments(dData);
          if (dData.length > 0 && !selectedDeptId) {
            setSelectedDeptId(dData[0].id);
            setSelectedDeptName(dData[0].name);
          }
        }
      } catch (e) {
        console.error("Failed to load departments", e);
      }
    }
    loadRefs();
  }, []);

  // 2. Fetch doctors when department changes
  useEffect(() => {
    async function loadDoctors() {
      if (!selectedDeptId) return;
      try {
        const docRes = await fetch(`/api/doctors?department_id=${selectedDeptId}`);
        if (docRes.ok) {
          const docData = await docRes.json();
          setDoctors(docData);
          if (keepOffer.current && prefill && docData.some((d: DoctorItem) => d.id === prefill.offer.doctor_id)) {
            setSelectedDoctorId(prefill.offer.doctor_id);
          } else if (docData.length > 0) {
            setSelectedDoctorId(docData[0].id);
          } else {
            setSelectedDoctorId("");
          }
        }
      } catch (e) {
        console.error("Failed to load doctors", e);
      }
    }
    loadDoctors();
  }, [selectedDeptId]);

  // 2b. Fetch real clinic sessions for doctor and appointment day (P2-3)
  useEffect(() => {
    async function loadDoctorSessions() {
      if (!selectedDoctorId) {
        setDoctorSessions([]);
        setSelectedSessionId("");
        return;
      }
      try {
        const res = await fetch(`/api/doctors/${selectedDoctorId}/availability?days=30`);
        if (res.ok) {
          const avail = await res.json();
          type AvailSession = { session_id: string; label: string; start_time: string; end_time: string; room: string; remaining: number; next_token: number };
          const matchingDay = (avail.days as Array<{ date: string; sessions?: AvailSession[] }> | undefined)?.find(
            (d) => d.date === appointmentDay
          );
          const mapped = (matchingDay?.sessions ?? []).map((s) => ({
            id: s.session_id,
            name: s.label,
            start: s.start_time,
            end: s.end_time,
            room: s.room,
            remaining: s.remaining,
            nextToken: s.next_token,
          }));
          setDoctorSessions(mapped);
          if (keepOffer.current && prefill?.offer.doctor_id === selectedDoctorId && mapped.some((m) => m.id === prefill.offer.session_id)) {
            setSelectedSessionId(prefill.offer.session_id);
            keepOffer.current = false; // later edits behave normally
          } else {
            setSelectedSessionId(mapped[0]?.id ?? "");
          }
        }
      } catch (e) {
        console.error("Failed to load doctor sessions", e);
      }
    }
    loadDoctorSessions();
  }, [selectedDoctorId, appointmentDay]);

  // 3. Search patients for lookup
  useEffect(() => {
    if (patientSearchQ.length < 2) return; // matches are hidden below two characters (see render)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients/search?q=${encodeURIComponent(patientSearchQ)}`);
        if (res.ok) {
          const data = await res.json();
          setPatientMatches(data);
        }
      } catch (e) {
        console.error("Patient search error", e);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [patientSearchQ]);

  // Handle selecting an existing patient
  function selectExistingPatient(p: PatientSearchResult) {
    setSelectedPatientId(p.id);
    setFullName(p.full_name);
    setPhone(p.phone || "+94 ");
    setDob(p.date_of_birth);
    setGender(p.gender || "male");
    if (p.nic) setNic(p.nic);
    if (p.city) setCity(p.city);
    if (p.district) setDistrict(p.district);
    if (p.distance_km) setDistanceKm(p.distance_km);
    setPatientMatches([]);
    setPatientSearchQ("");
  }

  // Parse Sri Lanka NIC automatically
  function handleNicChange(val: string) {
    setNic(val);
    const trimmed = val.trim();
    if (/^[0-9]{9}[vVxX]$/.test(trimmed)) {
      const year = 1900 + parseInt(trimmed.substring(0, 2), 10);
      let dayOfYear = parseInt(trimmed.substring(2, 5), 10);
      const isFemale = dayOfYear > 500;
      if (isFemale) dayOfYear -= 500;
      setGender(isFemale ? "female" : "male");
      setDob(`${year}-06-15`);
    } else if (/^[0-9]{12}$/.test(trimmed)) {
      const year = parseInt(trimmed.substring(0, 4), 10);
      let dayOfYear = parseInt(trimmed.substring(4, 7), 10);
      const isFemale = dayOfYear > 500;
      if (isFemale) dayOfYear -= 500;
      setGender(isFemale ? "female" : "male");
      setDob(`${year}-06-15`);
    }
  }

  // Calculate age live
  const calculatedAge = useMemo(() => {
    if (!dob) return null;
    const birthYear = new Date(dob).getFullYear();
    const currentYear = new Date().getFullYear();
    return Math.max(0, currentYear - birthYear);
  }, [dob]);

  // Initial location list loading
  useEffect(() => {
    async function loadInitialLocations() {
      try {
        const res = await fetch("/api/locations?q=&limit=25");
        if (res.ok) {
          const list = await res.json();
          setLocations(list);
        }
      } catch (e) {
        console.error(e);
      }
    }
    loadInitialLocations();
  }, []);

  // Dynamic remote search for Town Combobox (P2-1)
  const handleLocationSearch = (query: string) => {
    if (!query.trim()) return;
    fetch(`/api/locations?q=${encodeURIComponent(query.trim())}&limit=25`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: LocationItem[]) => {
        if (data.length > 0) {
          setLocations(data);
        }
      })
      .catch((e) => console.error("Location search error", e));
  };

  // Select location item with auto-coordinates and route calculation (P2-1)
  async function handleSelectLocation(locIdStr: string) {
    const locId = Number(locIdStr);
    const loc = locations.find((l) => l.id === locId);
    if (!loc) return;

    setSelectedLocationId(loc.id);
    setCity(loc.name);
    setDistrict(loc.district || "Colombo");
    setLatitude(loc.latitude);
    setLongitude(loc.longitude);
    try {
      const dRes = await fetch("/api/distance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: loc.latitude, longitude: loc.longitude }),
      });
      if (dRes.ok) {
        const dData = await dRes.json();
        setDistanceKm(dData.distance_km);
        setDistanceSource(dData.source);
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Geocode free-typed town name on blur if user does not use Combobox
  async function handleCityBlur() {
    const q = city.trim();
    if (!q) return;
    try {
      const res = await fetch(`/api/locations?q=${encodeURIComponent(q)}&limit=1`);
      if (res.ok) {
        const matches: LocationItem[] = await res.json();
        if (matches.length > 0) {
          const loc = matches[0];
          setSelectedLocationId(loc.id);
          if (loc.district) setDistrict(loc.district);
          setLatitude(loc.latitude);
          setLongitude(loc.longitude);
          const dRes = await fetch("/api/distance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ latitude: loc.latitude, longitude: loc.longitude }),
          });
          if (dRes.ok) {
            const dData = await dRes.json();
            setDistanceKm(dData.distance_km);
            setDistanceSource(dData.source);
          }
        }
      }
    } catch (e) {
      console.error("City blur geocoding error", e);
    }
  }

  // Live Ephemeral Prediction Preview Trigger
  useEffect(() => {
    if (!fullName || !dob || !selectedDoctorId) return;

    const timer = setTimeout(async () => {
      setIsPreviewLoading(true);
      try {
        const res = await fetch("/api/predict/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patient_id: selectedPatientId || undefined,
            patient: {
              full_name: fullName,
              date_of_birth: dob,
              gender,
              phone,
              email: email || undefined,
              city,
              district,
              location_id: selectedLocationId || undefined,
              distance_km: distanceKm,
              distance_source: distanceSource,
              preferred_language: preferredLanguage,
              nic: nic || undefined,
              hypertension: hasHypertension,
              diabetes: hasDiabetes,
            },
            doctor_id: selectedDoctorId,
            appointment_day: appointmentDay,
            booking_channel: bookingChannel,
            payment_mode: paymentMode,
            heavy_rain: heavyRain,
          }),
        });

        if (res.ok) {
          const previewJson = await res.json();
          setPreview(previewJson);
        }
      } catch (e) {
        console.error("Preview prediction error", e);
      } finally {
        setIsPreviewLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [
    fullName,
    dob,
    gender,
    selectedDoctorId,
    appointmentDay,
    selectedSessionId,
    bookingChannel,
    paymentMode,
    distanceKm,
    heavyRain,
    hasHypertension,
    hasDiabetes,
    selectedPatientId,
  ]);

  // Intake Submission Handler
  async function submitIntake(redirectAfter: boolean) {
    setIsSubmitting(true);
    setSubmissionError(null);

    const payload = {
      patient_id: selectedPatientId || undefined,
      patient: !selectedPatientId
        ? {
            full_name: fullName,
            date_of_birth: dob,
            gender,
            phone,
            email: email || undefined,
            city,
            district,
            address_line: addressLine || undefined,
            location_id: selectedLocationId || undefined,
            distance_km: distanceKm,
            distance_source: distanceSource,
            preferred_language: preferredLanguage,
            nic: nic || undefined,
            hypertension: hasHypertension,
            diabetes: hasDiabetes,
          }
        : undefined,
      doctor_id: selectedDoctorId,
      clinic_session_id: selectedSessionId || undefined,
      appointment_day: appointmentDay,
      booking_channel: bookingChannel,
      payment_mode: paymentMode,
      sms_reminder_opt_in: smsReminderOptIn,
      heavy_rain: heavyRain,
      notes: notes || undefined,
    };

    try {
      const res = await fetch("/api/appointments/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to confirm intake");
      }

      const result = (await res.json()) as IntakeResponse;
      setConfirmedBooking(result);

      if (redirectAfter) {
        router.push(`/appointments/${result.appointment.id}`);
      }
    } catch (e: unknown) {
      setSubmissionError((e instanceof Error && e.message) || "An unexpected error occurred during intake");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Patient already agreed in the outreach hub: approving books the agreed slot. If staff changed the
  // doctor, day or session in the steps above, book the changed slot instead of the agreed one.
  async function submitApproval() {
    if (!prefill) return;
    setIsSubmitting(true);
    setSubmissionError(null);
    const o = prefill.offer;
    const changed = selectedDoctorId !== o.doctor_id || selectedSessionId !== o.session_id || appointmentDay !== o.date;
    const res = changed
      ? await bookConversationAction(prefill.conversationId, {
          clinic_session_id: selectedSessionId,
          appointment_day: appointmentDay,
          doctor_id: selectedDoctorId,
          notify: smsReminderOptIn,
          language: preferredLanguage,
        })
      : await approveConversationAction(prefill.conversationId);
    setIsSubmitting(false);
    if (!res.ok) return setSubmissionError(res.message);
    const conv = "conversation" in res.data ? res.data.conversation : res.data;
    if ("booked" in res.data && !res.data.booked) {
      return setSubmissionError("That slot was just taken. The patient has been offered another option.");
    }
    setApproved({
      appointmentId: conv.appointment_id,
      token: conv.appointment?.token ?? null,
      message: "booked" in res.data ? res.data.message : "Booked and the patient has been notified.",
    });
    // Back to the patient's thread, where the rescheduled confirmation now shows.
    router.push(`/outreach?patient=${prefill.patient.id}`);
  }

  // Reset Form for another booking
  function resetForm() {
    setConfirmedBooking(null);
    setSelectedPatientId(null);
    setFullName("");
    setNic("");
    setDob("");
    setPhone("+94 ");
    setCurrentStage(0);
    setPreview(null);
  }

  const doneFill = prefillRef.current;
  if (approved && doneFill) {
    return (
      <Card className="border-emerald-500/40 bg-card shadow-xl ring-2 ring-emerald-500/20 max-w-2xl mx-auto animate-in fade-in-0 duration-300">
        <CardContent className="p-8 flex flex-col gap-5">
          <div className="flex items-center gap-3 border-b border-border/80 pb-5">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="size-7" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Approval confirmed</h2>
              <p className="text-xs text-muted-foreground">{approved.message}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
            <div>
              <span className="text-muted-foreground">Patient:</span>
              <div className="text-foreground font-semibold text-sm">{fullName}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Queue token:</span>
              <div className="text-foreground font-semibold text-sm">{approved.token ? `#${approved.token}` : "-"}</div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button className="text-xs font-semibold" onClick={() => router.push(`/appointments/${approved.appointmentId}`)}>
              Open appointment
            </Button>
            <Button variant="outline" className="text-xs" onClick={() => router.push(`/outreach?patient=${doneFill.patient.id}`)}>
              Back to outreach hub
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Render Confirmation Receipt View
  if (confirmedBooking) {
    const { appointment, patient, slot, prediction } = confirmedBooking;
    const cat = (prediction?.risk_category || "Low") as RiskCategory;

    return (
      <Card className="border-emerald-500/40 bg-card shadow-xl ring-2 ring-emerald-500/20 max-w-2xl mx-auto animate-in fade-in-0 duration-300">
        <CardContent className="p-8 flex flex-col gap-6">
          <div className="flex items-center gap-3 border-b border-border/80 pb-5">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="size-7" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Appointment Confirmed</h2>
              <p className="text-xs text-muted-foreground">
                Official queue token issued for Asiri Central Hospital
              </p>
            </div>
          </div>

          {/* Printable Token Slip */}
          <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-4">
              <div>
                <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
                  Queue Token
                </span>
                <div className="text-4xl font-extrabold text-foreground font-mono">
                  #{slot.token}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
                  Patient UHID
                </span>
                <div className="text-base font-bold text-primary font-mono">{patient.uhid}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              <div>
                <span className="text-muted-foreground">Patient:</span>
                <div className="text-foreground font-semibold text-sm">{patient.full_name}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Consultant:</span>
                <div className="text-foreground font-semibold text-sm">{slot.doctor}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Clinic Session:</span>
                <div className="text-foreground font-semibold">{slot.date} · {slot.start_time}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Room:</span>
                <div className="text-foreground font-semibold">{slot.room}</div>
              </div>
            </div>

            {/* Prediction assessment chip */}
            {prediction && (
              <div className="mt-2 border-t border-border/60 pt-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Attendance Assessment:</span>
                <RiskPill category={cat} score={prediction.risk_score} />
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => window.print()}
              className="w-full sm:w-1/2 gap-2 text-xs"
            >
              <Printer className="size-4" />
              <span>Print Token Slip</span>
            </Button>

            <Button
              onClick={() => router.push(`/appointments/${appointment.id}`)}
              className="w-full sm:w-1/2 gap-2 text-xs bg-primary text-primary-foreground font-semibold"
            >
              <Sparkles className="size-4" />
              <span>Open in Appointments</span>
            </Button>
          </div>

          <div className="text-center">
            <button
              onClick={resetForm}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
            >
              <PlusCircle className="size-3.5" />
              <span>Book Another Patient</span>
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {prefill && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-foreground">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
          <span>
            <strong>{prefill.patient.full_name}</strong> agreed to {prefill.offer.doctor_name} on {prefill.offer.date}{" "}
            {prefill.offer.start_time}. Steps 1 to 3 are filled in from the conversation; check them, then approve below.
          </span>
        </div>
      )}

      {/* Guided Progress Stages */}
      <ProgressStages
        stages={STAGES}
        currentStageIndex={currentStage}
        onStageClick={(idx) => {
          if (idx <= currentStage) setCurrentStage(idx);
        }}
      />

      {/* Main Wizard Form Body */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Wizard Inputs */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Stage 0: Patient Identity */}
          {currentStage === 0 && (
            <div className="rounded-xl border border-border/80 bg-card p-6 flex flex-col gap-5 shadow-xs">
              <div className="border-b border-border/60 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="size-4 text-primary" />
                  <h2 className="text-base font-bold text-foreground">Patient Identity & Demographics</h2>
                </div>
                {selectedPatientId && (
                  <Badge variant="outline" className="text-xs text-primary border-primary/40">
                    Existing Patient Linked
                  </Badge>
                )}
              </div>

              {/* Patient Lookup Field */}
              <div className="relative flex flex-col gap-1.5">
                <Label className="text-xs font-semibold">Search Existing Patient (UHID, NIC, Phone, Name)</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    value={patientSearchQ}
                    onChange={(e) => setPatientSearchQ(e.target.value)}
                    placeholder="e.g. SHAI-26-000042 or 981234567V..."
                    className="pl-9 h-9 text-xs"
                  />
                </div>

                {patientSearchQ.length >= 2 && patientMatches.length > 0 && (
                  <div className="absolute top-16 left-0 right-0 z-20 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto p-1 divide-y divide-border/40">
                    {patientMatches.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => selectExistingPatient(p)}
                        className="p-2 text-xs hover:bg-muted/50 cursor-pointer flex items-center justify-between"
                      >
                        <div>
                          <div className="font-semibold text-foreground">{p.full_name}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {p.uhid} · {p.phone || "No phone"} · {p.city || "Colombo"}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          Select
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Full Name */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold">Full Name *</Label>
                  <Input
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Kasun Chamara Bandara"
                    className="h-9 text-xs"
                  />
                </div>

                {/* NIC */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold">NIC Number (National Identity Card)</Label>
                  <Input
                    value={nic}
                    onChange={(e) => handleNicChange(e.target.value)}
                    placeholder="e.g. 199824501234 or 982451234V"
                    className="h-9 text-xs font-mono"
                  />
                </div>

                {/* Date of Birth & Live Age */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Date of Birth *</Label>
                    {calculatedAge !== null && (
                      <span className="text-[11px] text-primary font-mono font-medium">
                        Age: {calculatedAge} yrs
                      </span>
                    )}
                  </div>
                  <Input
                    required
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                {/* Phone */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold">Mobile Phone * (+94 Sri Lanka)</Label>
                  <PhoneInput
                    value={phone}
                    onChange={setPhone}
                    placeholder="77 123 4567"
                    className="h-9 text-xs"
                  />
                </div>

                {/* Gender */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold">Gender</Label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="h-9 px-3 rounded-md border border-input bg-background text-xs"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {/* Preferred Language */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold">Preferred Language</Label>
                  <select
                    value={preferredLanguage}
                    onChange={(e) => setPreferredLanguage(e.target.value)}
                    className="h-9 px-3 rounded-md border border-input bg-background text-xs"
                  >
                    <option value="en">English</option>
                    <option value="si">Sinhala (සිංහල)</option>
                    <option value="ta">Tamil (தமிழ்)</option>
                  </select>
                </div>
              </div>

              {/* Clinical Chronic Conditions */}
              <div className="pt-2 border-t border-border/60">
                <span className="text-xs font-semibold text-muted-foreground block mb-2">
                  Chronic Conditions (Relevant to attendance models)
                </span>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasHypertension}
                      onChange={(e) => setHasHypertension(e.target.checked)}
                      className="rounded border-input text-primary"
                    />
                    <span>Hypertension</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasDiabetes}
                      onChange={(e) => setHasDiabetes(e.target.checked)}
                      className="rounded border-input text-primary"
                    />
                    <span>Diabetes</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end pt-3">
                <Button
                  onClick={() => setCurrentStage(1)}
                  disabled={!fullName || !dob}
                  className="text-xs gap-1.5"
                >
                  <span>Continue to Location & Commute</span>
                  <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* Stage 1: Location & Commute */}
          {currentStage === 1 && (
            <div className="rounded-xl border border-border/80 bg-card p-6 flex flex-col gap-5 shadow-xs">
              <div className="border-b border-border/60 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="size-4 text-primary" />
                  <h2 className="text-base font-bold text-foreground">Location & Commute Distance</h2>
                </div>
              </div>

              {/* Searchable Town Combobox */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-semibold">City / Town (16,450 Sri Lankan Locations)</Label>
                <Combobox
                  options={locations.map((loc) => ({
                    value: String(loc.id),
                    label: `${loc.name} (${loc.district || "LK"})`,
                    subLabel: loc.province || undefined,
                  }))}
                  value={selectedLocationId ? String(selectedLocationId) : ""}
                  onChange={handleSelectLocation}
                  onSearchChange={handleLocationSearch}
                  placeholder="Select town (e.g. Kandy, Galle, Gampaha, Dehiwala)..."
                  className="h-9 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold">Town Name</Label>
                  <Input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    onBlur={handleCityBlur}
                    className="h-9 text-xs"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold">District</Label>
                  <Input
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              {/* Distance State Machine */}
              <div className="rounded-lg border border-border/80 bg-muted/20 p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Distance to Asiri Central Hospital</span>
                  <Badge variant="outline" className="text-[10px] font-mono capitalize">
                    {distanceSource === "road_osrm" ? "Road Route (OSRM)" : "Estimated / Straight Line"}
                  </Badge>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      step="0.1"
                      value={distanceKm}
                      onChange={(e) => {
                        setDistanceKm(parseFloat(e.target.value) || 0);
                        setDistanceSource("manual");
                      }}
                      className="w-24 h-9 text-xs font-mono font-bold"
                    />
                    <span className="text-xs text-muted-foreground font-mono">km</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Estimated commute time: {formatTravel(estimateTravelMinutes(distanceKm))} by road
                  </span>
                </div>
              </div>

              {/* Transit Map & Route Visualization (P2-1) */}
              <div className="rounded-xl border border-border/80 bg-muted/10 p-3 overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <MapPin className="size-3.5 text-[#8B7CF6]" />
                    <span>Patient Commute &amp; Access Route</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {city} &rarr; Colombo
                  </span>
                </div>
                <div className="rounded-lg overflow-hidden border border-border/60">
                  <JourneyMap
                    patientName={fullName || "New Patient"}
                    city={city}
                    distanceKm={distanceKm}
                    latitude={latitude}
                    longitude={longitude}
                    mapHeightClass="h-[200px]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3">
                <Button
                  variant="outline"
                  onClick={() => setCurrentStage(0)}
                  className="text-xs gap-1.5"
                >
                  <ArrowLeft className="size-3.5" />
                  <span>Back to Identity</span>
                </Button>
                <Button
                  onClick={() => setCurrentStage(2)}
                  className="text-xs gap-1.5"
                >
                  <span>Continue to Clinical Scheduling</span>
                  <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* Stage 2: Clinical & Scheduling */}
          {currentStage === 2 && (
            <div className="rounded-xl border border-border/80 bg-card p-6 flex flex-col gap-5 shadow-xs">
              <div className="border-b border-border/60 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Stethoscope className="size-4 text-primary" />
                  <h2 className="text-base font-bold text-foreground">Clinical Specialty & Scheduling</h2>
                </div>
              </div>

              {/* Department Combobox */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-semibold">Clinical Department *</Label>
                <select
                  value={selectedDeptId || ""}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    setSelectedDeptId(id);
                    const found = departments.find((d) => d.id === id);
                    if (found) setSelectedDeptName(found.name);
                  }}
                  className="h-9 px-3 rounded-md border border-input bg-background text-xs font-medium"
                >
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Doctor Cascaded Select */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-semibold">Attending Consultant / Doctor *</Label>
                <select
                  value={selectedDoctorId}
                  onChange={(e) => setSelectedDoctorId(e.target.value)}
                  className="h-9 px-3 rounded-md border border-input bg-background text-xs font-medium"
                >
                  {doctors.length === 0 ? (
                    <option value="">No doctors available for this department</option>
                  ) : (
                    doctors.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.title} {doc.full_name} ({doc.default_room || "Consultation Room"})
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Appointment Date Picker */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-semibold">Appointment Date *</Label>
                <DatePicker
                  value={appointmentDay}
                  onChange={setAppointmentDay}
                  minDate={TODAY_LK}
                  className="h-9 text-xs"
                />
              </div>

              {/* Session Slot Selection (P2-3) */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-semibold">Clinic Session Time Slot *</Label>
                {doctorSessions.length === 0 ? (
                  <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300">
                    No active clinic sessions scheduled for this doctor on this day. Please pick another date or doctor.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {doctorSessions.map((sess) => {
                      const isSelected = selectedSessionId === sess.id;
                      return (
                        <button
                          key={sess.id}
                          type="button"
                          onClick={() => setSelectedSessionId(sess.id)}
                          className={cn(
                            "flex flex-col text-left p-3 rounded-xl border transition-all cursor-pointer",
                            isSelected
                              ? "border-[#8B7CF6] bg-[#8B7CF6]/10 text-foreground ring-2 ring-[#8B7CF6]/30 font-semibold"
                              : "border-border/80 bg-card hover:border-[#8B7CF6]/50 text-foreground/80"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold">{sess.name} Session</span>
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                              {sess.remaining} slots
                            </span>
                          </div>
                          <span className="text-[11px] text-muted-foreground mt-1">
                            {sess.start} – {sess.end}
                          </span>
                          <span className="text-[10px] text-muted-foreground/80 mt-0.5">
                            {sess.room}
                          </span>
                          <span className="text-[11px] font-bold text-[#8B7CF6] mt-1.5">
                            {sess.remaining > 0 ? `Next token: #${sess.nextToken}` : "Session full"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-3">
                <Button
                  variant="outline"
                  onClick={() => setCurrentStage(1)}
                  className="text-xs gap-1.5"
                >
                  <ArrowLeft className="size-3.5" />
                  <span>Back to Commute</span>
                </Button>
                <Button
                  onClick={() => setCurrentStage(3)}
                  disabled={!selectedDoctorId || !selectedSessionId}
                  className="text-xs gap-1.5"
                >
                  <span>Continue to Booking Review</span>
                  <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* Stage 3: Booking & Review */}
          {currentStage === 3 && (
            <div className="rounded-xl border border-border/80 bg-card p-6 flex flex-col gap-5 shadow-xs">
              <div className="border-b border-border/60 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="size-4 text-primary" />
                  <h2 className="text-base font-bold text-foreground">Booking Details & Final Review</h2>
                </div>
              </div>

              {/* Booking Channel */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-semibold">Booking Channel</Label>
                <SegmentedCards
                  value={bookingChannel}
                  onChange={setBookingChannel}
                  options={CHANNELS}
                />
              </div>

              {/* Payment Mode */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-semibold">Payment Mode</Label>
                <SegmentedCards
                  value={paymentMode}
                  onChange={setPaymentMode}
                  options={PAYMENTS}
                />
              </div>

              {/* Environmental / Weather Flag */}
              <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <CloudRain className={`size-4 ${heavyRain ? "text-blue-400" : "text-muted-foreground"}`} />
                  <div>
                    <span className="text-xs font-semibold text-foreground">Heavy Rain / Monsoon Warning</span>
                    <p className="text-[10px] text-muted-foreground">
                      Model input: 1 if heavy rain is expected on the appointment day (manual toggle, no weather feed)
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={heavyRain}
                  onChange={(e) => setHeavyRain(e.target.checked)}
                  className="rounded border-input text-primary"
                />
              </div>

              {/* SMS Reminder Opt-in */}
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={smsReminderOptIn}
                  onChange={(e) => setSmsReminderOptIn(e.target.checked)}
                  className="rounded border-input text-primary"
                />
                <span>Send proactive SMS reminder in {preferredLanguage.toUpperCase()}</span>
              </label>

              {/* Error banner if any */}
              {submissionError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{submissionError}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-4 border-t border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap">
                <Button
                  variant="outline"
                  onClick={() => setCurrentStage(2)}
                  className="w-full sm:w-auto text-xs gap-1.5 shrink-0"
                >
                  <ArrowLeft className="size-3.5" />
                  <span>Back to Clinical</span>
                </Button>

                <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 flex-wrap">
                  {prefill ? (
                    <Button
                      onClick={submitApproval}
                      disabled={isSubmitting || !selectedSessionId}
                      className="w-full sm:w-auto text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 h-10 px-4 gap-2 shadow-sm"
                    >
                      <CheckCircle2 className="size-3.5" />
                      <span>{isSubmitting ? "Approving..." : "Approve & confirm booking"}</span>
                    </Button>
                  ) : (
                    <>
                      {/* Button 1: Confirm Booking only */}
                      <Button
                        onClick={() => submitIntake(false)}
                        disabled={isSubmitting}
                        variant="secondary"
                        className="w-full sm:w-auto text-xs font-semibold h-10 px-4 whitespace-nowrap"
                      >
                        <span>{isSubmitting ? "Confirming..." : "Confirm Booking"}</span>
                      </Button>

                      {/* Button 2: Confirm & Open */}
                      <Button
                        onClick={() => submitIntake(true)}
                        disabled={isSubmitting}
                        title="Confirm booking and open in Appointments"
                        className="w-full sm:w-auto text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 gap-2 shadow-sm whitespace-nowrap"
                      >
                        <Sparkles className="size-3.5 shrink-0" />
                        <span>{isSubmitting ? "Opening..." : "Confirm & Open"}</span>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Col: Live Ephemeral Prediction Preview Chip */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-primary/30 bg-card p-5 shadow-xs flex flex-col gap-4 sticky top-6">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Attendance Intelligence</h3>
              </div>
              <Badge variant="outline" className="text-[10px] text-muted-foreground font-mono">
                Live Preview
              </Badge>
            </div>

            {preview ? (
              <div className="flex flex-col gap-4 animate-in fade-in-0 duration-300">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Estimated Risk:</span>
                  <RiskPill
                    category={(preview.risk_category || "Low") as RiskCategory}
                    score={preview.risk_score}
                  />
                </div>

                {prefill && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-[11px] text-foreground">
                    <strong>Patient confirmed this slot</strong> in the outreach chat. The score is the model&apos;s own
                    estimate and does not include that confirmation; it is recorded on the booking.
                  </div>
                )}

                <div className="rounded-lg bg-muted/30 p-3 border border-border/60 flex flex-col gap-2">
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    Top Contributing Risk Drivers:
                  </span>
                  {preview.explanation && preview.explanation.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      {preview.explanation.slice(0, 3).map((f, idx) => {
                        const label = formatDriverFeature(f.feature, f.feature_label);
                        return (
                          <div key={idx} className="flex items-center justify-between text-xs gap-2">
                            <span className="text-muted-foreground truncate font-medium" title={label}>
                              {label}
                            </span>
                            <span
                              className={`font-mono text-[11px] font-semibold shrink-0 ${
                                (f.contribution || 0) > 0 ? "text-rose-400" : "text-emerald-400"
                              }`}
                            >
                              {(f.contribution || 0) > 0 ? "+" : ""}
                              {((f.contribution || 0) * 100).toFixed(1)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">None significant</span>
                  )}
                </div>

                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  Calculated by the calibrated XGBoost model from the booking and the patient&apos;s visit history.
                  No record is written to the database until booking confirmation.
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {isPreviewLoading ? (
                  <div className="flex items-center justify-center gap-2">
                    <Sparkles className="size-3.5 text-primary animate-spin" />
                    <span>Evaluating clinical factors...</span>
                  </div>
                ) : (
                  <span>Fill in patient name and clinical department to generate preview score.</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
