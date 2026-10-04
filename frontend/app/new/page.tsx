import Link from "next/link";
import { ArrowLeft, UserPlus } from "lucide-react";

import { NewAppointmentForm, type ConversationPrefill } from "@/app/new/new-appointment-form";
import { getDoctors, getPatient, getThread } from "@/lib/api";

// Opened from the outreach hub's "Approve and book": load the agreed offer so the wizard arrives filled in.
async function loadPrefill(patientId: string, conversationId: string): Promise<ConversationPrefill | null> {
  try {
    const [patient, thread, doctors] = await Promise.all([getPatient(patientId), getThread(patientId), getDoctors()]);
    const conv = thread.conversation;
    if (!conv || conv.id !== conversationId || conv.state !== "pending_approval" || !conv.offer) return null;
    const doctor = doctors.find((d) => d.id === conv.offer!.doctor_id);
    return {
      conversationId: conv.id,
      patient: patient as ConversationPrefill["patient"],
      offer: conv.offer,
      departmentId: doctor?.department_id ?? null,
      departmentName: doctor?.department_name ?? null,
    };
  } catch {
    return null;
  }
}

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams?: Promise<{ conversation?: string; patient?: string }>;
}) {
  const sp = searchParams ? await searchParams : undefined;
  const prefill = sp?.conversation && sp?.patient ? await loadPrefill(sp.patient, sp.conversation) : null;

  return (
    <div className="flex w-full flex-col gap-6 p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Back link & Title */}
      <div className="flex flex-col gap-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="size-3.5" />
          <span>Back to appointments triage</span>
        </Link>

        <div className="flex items-center gap-3 border-b border-border/80 pb-5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UserPlus className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              New Appointment Intake
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Register a patient and booking to trigger instant machine-learning attendance prediction and SHAP feature analysis.
            </p>
          </div>
        </div>
      </div>

      <NewAppointmentForm prefill={prefill} />
    </div>
  );
}
