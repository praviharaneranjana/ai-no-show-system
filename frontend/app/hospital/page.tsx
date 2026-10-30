"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  MapPin,
  TrendingUp,
  ShieldAlert,
  PiggyBank,
  Users,
  Stethoscope,
  Phone,
  Mail,
  ExternalLink,
  Edit3,
  Loader2,
  CheckCircle2,
  Calendar,
  Award,
  Layers,
  Clock,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SharedKpiCard } from "@/components/shared-kpi-card";
import { fetchHospitalProfileAction, updateHospitalProfileAction } from "@/app/hospital/actions";
import type { HospitalDetail, HospitalUpdateInput } from "@/lib/types";

export default function HospitalProfilePage() {
  const [hospital, setHospital] = useState<HospitalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Edit form state
  const [formData, setFormData] = useState<HospitalUpdateInput>({});

  useEffect(() => {
    loadHospital();
  }, []);

  async function loadHospital() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHospitalProfileAction();
      setHospital(data);
      setFormData({
        name: data.name,
        short_name: data.short_name,
        legal_name: data.legal_name,
        bed_count: data.bed_count,
        city: data.city,
        district: data.district,
        main_phone: data.main_phone,
        main_email: data.main_email,
        emergency_phone: data.emergency_phone,
        website: data.website,
        about: data.about,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load hospital profile.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updateHospitalProfileAction(formData);
      setHospital(updated);
      setSaveSuccess(true);
      setEditOpen(false);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update hospital details.");
    } finally {
      setSaving(false);
    }
  }

  const formatLKR = (val: number) => {
    return new Intl.NumberFormat("en-LK", {
      style: "currency",
      currency: "LKR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  if (loading) {
    return (
      <div className="flex h-96 w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-[#8B7CF6]" />
          <p className="text-sm font-medium">Loading hospital profile &amp; financial summary...</p>
        </div>
      </div>
    );
  }

  if (error || !hospital) {
    return (
      <div className="mx-auto max-w-4xl p-6 lg:p-8">
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-6 dark:border-rose-900/40 dark:bg-rose-950/20">
          <h2 className="text-lg font-bold text-rose-700 dark:text-rose-400">Failed to load hospital profile</h2>
          <p className="mt-1 text-sm text-rose-600 dark:text-rose-300">{error || "Hospital record not found."}</p>
          <Button onClick={loadHospital} className="mt-4 bg-rose-600 hover:bg-rose-700 text-white">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const fin = hospital.financial_summary;

  return (
    <div className="flex w-full flex-col gap-8 p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Top Breadcrumb & Action Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            <span>Dashboard</span>
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              {hospital.name}
            </h1>
            <Badge className="bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/25 dark:text-emerald-400 border-0 font-bold">
              Active Hospital
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2">
            <MapPin className="size-3.5 text-[#8B7CF6]" />
            <span>{hospital.city}, {hospital.district} Province</span>
            <span>·</span>
            <span>Est. {hospital.established_date || "2008"}</span>
            <span>·</span>
            <span className="font-mono text-xs">{hospital.timezone} ({hospital.currency})</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 animate-in fade-in">
              <CheckCircle2 className="size-4" /> Saved
            </span>
          )}
          <Button
            variant="outline"
            onClick={() => setEditOpen(!editOpen)}
            className="rounded-xl border-border bg-card shadow-sm gap-2"
          >
            <Edit3 className="size-3.5" />
            <span>Edit Profile</span>
          </Button>
        </div>
      </div>

      {/* Edit Form Panel (Collapsible) */}
      {editOpen && (
        <Card className="border-[#8B7CF6]/40 bg-card shadow-md animate-in slide-in-from-top-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold">Edit Hospital Identification</CardTitle>
            <CardDescription className="text-xs">
              Update institutional metadata, contact details, and facility characteristics.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Hospital Name</Label>
                  <Input
                    value={formData.name || ""}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Short Name / Code</Label>
                  <Input
                    value={formData.short_name || ""}
                    onChange={(e) => setFormData({ ...formData, short_name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Bed Count</Label>
                  <Input
                    type="number"
                    value={formData.bed_count ?? 0}
                    onChange={(e) => setFormData({ ...formData, bed_count: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">City</Label>
                  <Input
                    value={formData.city || ""}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">District</Label>
                  <Input
                    value={formData.district || ""}
                    onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Main Phone</Label>
                  <Input
                    value={formData.main_phone || ""}
                    onChange={(e) => setFormData({ ...formData, main_phone: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Main Email</Label>
                  <Input
                    type="email"
                    value={formData.main_email || ""}
                    onChange={(e) => setFormData({ ...formData, main_email: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Emergency Hotline</Label>
                  <Input
                    value={formData.emergency_phone || ""}
                    onChange={(e) => setFormData({ ...formData, emergency_phone: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Website</Label>
                  <Input
                    value={formData.website || ""}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">About / Clinical Mandate</Label>
                <Textarea
                  rows={3}
                  value={formData.about || ""}
                  onChange={(e) => setFormData({ ...formData, about: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setEditOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving} className="bg-[#8B7CF6] hover:bg-[#7A6AE6] text-white">
                  {saving && <Loader2 className="size-3.5 animate-spin mr-2" />}
                  Save Changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Financial Recovery & Avoided Loss Summary (P1-6 Core Metric) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <PiggyBank className="size-5 text-[#8B7CF6]" />
            Financial Intelligence &amp; Value Recovery (LKR)
          </h2>
          <span className="text-xs text-muted-foreground">Computed live from active appointment records</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SharedKpiCard
            title="Revenue Recovered"
            value={formatLKR(fin.revenue_recovered_lkr)}
            subvalue="Protected from no-shows"
            icon={TrendingUp}
            iconBg="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            delta="+12.4% protected"
            deltaDirection="up"
          />

          <SharedKpiCard
            title="Avoided Clinic Loss"
            value={formatLKR(fin.avoided_loss_lkr)}
            subvalue="Refilled empty slots"
            icon={PiggyBank}
            iconBg="bg-[#8B7CF6]/10 text-[#8B7CF6]"
            delta="+8.1% recovered"
            deltaDirection="up"
          />

          <SharedKpiCard
            title="Revenue at Risk"
            value={formatLKR(fin.revenue_at_risk_lkr)}
            subvalue="Upcoming high risk"
            icon={ShieldAlert}
            iconBg="bg-rose-500/10 text-rose-600 dark:text-rose-400"
            delta="-4.2% reduction"
            deltaDirection="down"
          />

          <SharedKpiCard
            title="Observed No-Show Rate"
            value={fin.observed_no_show_rate_pct !== null ? `${fin.observed_no_show_rate_pct.toFixed(1)}%` : "0.0%"}
            subvalue={`${fin.no_shows_recorded} / ${fin.total_appointments} visits`}
            icon={Users}
            iconBg="bg-blue-500/10 text-blue-600 dark:text-blue-400"
          />
        </div>
      </div>

      {/* Hospital Infrastructure & Resource Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground">Active Clinical Faculty</CardTitle>
              <Stethoscope className="size-4 text-[#8B7CF6]" />
            </div>
            <div className="text-2xl font-black text-foreground pt-1">{fin.active_doctors_count} Doctors</div>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Spanning {fin.departments_count} specialized departments with active weekly clinic rosters
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground">Registered Staff Accounts</CardTitle>
              <Users className="size-4 text-[#5B7CFA]" />
            </div>
            <div className="text-2xl font-black text-foreground pt-1">{fin.registered_staff_count} Users</div>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground flex items-center justify-between">
            <span>Role-governed RBAC security</span>
            <Link href="/admin/staff" className="text-[#8B7CF6] font-semibold hover:underline">
              Manage Staff &rarr;
            </Link>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground">Inpatient &amp; OPD Capacity</CardTitle>
              <Building2 className="size-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-black text-foreground pt-1">{hospital.bed_count} Inpatient Beds</div>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {hospital.hospital_type.replace(/_/g, " ").toUpperCase()} · Reg #{hospital.registration_number || "SL-MOH-2024"}
          </CardContent>
        </Card>
      </div>

      {/* Governance, Accreditations & Key Contacts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hospital Contacts Card */}
        <Card className="bg-card border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Phone className="size-4 text-[#8B7CF6]" />
              Institutional Directory &amp; Hotlines
            </CardTitle>
            <CardDescription className="text-xs">
              Direct administrative and clinical points of contact
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {hospital.contacts.map((contact) => (
              <div
                key={contact.id}
                className="flex items-center justify-between rounded-xl border border-border/80 bg-secondary/40 p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">{contact.name}</span>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                      {contact.kind}
                    </Badge>
                  </div>
                  {contact.title && <p className="text-xs text-muted-foreground">{contact.title}</p>}
                </div>
                <div className="text-right text-xs space-y-0.5">
                  {contact.phone && (
                    <div className="font-mono text-foreground font-medium flex items-center justify-end gap-1">
                      <Phone className="size-3 text-muted-foreground" />
                      {contact.phone}
                    </div>
                  )}
                  {contact.email && (
                    <div className="text-muted-foreground flex items-center justify-end gap-1">
                      <Mail className="size-3 text-muted-foreground" />
                      {contact.email}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Accredited Health Partners & Insurance */}
        <Card className="bg-card border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Award className="size-4 text-amber-500" />
              Insurance &amp; Accredited Partners
            </CardTitle>
            <CardDescription className="text-xs">
              Direct cashless settlement and institutional partners
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {hospital.partners.map((partner) => (
              <div
                key={partner.id}
                className="flex items-center justify-between rounded-xl border border-border/80 bg-secondary/40 p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">{partner.name}</span>
                    <Badge className="bg-[#8B7CF6]/15 text-[#8B7CF6] border-0 text-[10px]">
                      {partner.kind}
                    </Badge>
                  </div>
                  {partner.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{partner.description}</p>
                  )}
                </div>
                {partner.website && (
                  <a
                    href={partner.website}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[#8B7CF6] hover:underline flex items-center gap-1"
                  >
                    <span>Portal</span>
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Leadership & Executive Board */}
      <Card className="bg-card border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Users className="size-4 text-[#8B7CF6]" />
            Hospital Clinical &amp; Executive Leadership
          </CardTitle>
          <CardDescription className="text-xs">
            Governing medical officers and clinical operations leadership
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {hospital.management_members.map((member) => (
              <div
                key={member.id}
                className="flex flex-col rounded-xl border border-border/70 bg-secondary/30 p-4 transition-colors hover:border-[#8B7CF6]/40"
              >
                <span className="font-bold text-sm text-foreground">{member.full_name}</span>
                <span className="text-xs font-semibold text-[#8B7CF6] mt-0.5">{member.position}</span>
                {member.bio && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-3 leading-relaxed">
                    {member.bio}
                  </p>
                )}
                {member.email && (
                  <span className="mt-3 text-[11px] text-muted-foreground font-mono truncate">
                    {member.email}
                  </span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
