"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  Lock,
  Mail,
  User,
  Phone,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  ArrowRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShaiLogo } from "@/components/shai-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { resolveEmailDomainAction, listPublicHospitalsAction, registerStaffAction } from "@/app/register/actions";
import type { HospitalBasic, DomainResolveResponse } from "@/lib/types";

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [requestedRole, setRequestedRole] = useState("front_desk");

  // Domain resolution & Hospital Selection
  const [domainCheck, setDomainCheck] = useState<DomainResolveResponse | null>(null);
  const [checkingDomain, setCheckingDomain] = useState(false);
  const [hospitals, setHospitals] = useState<HospitalBasic[]>([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>("");
  const [hospitalSearch, setHospitalSearch] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load public hospitals list for fallback dropdown
    listPublicHospitalsAction()
      .then((res) => {
        setHospitals(res);
        if (res.length > 0) {
          setSelectedHospitalId(res[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // When email changes, check domain if contains @
  async function handleEmailBlur() {
    if (!email.includes("@")) return;
    const domain = email.split("@")[1];
    if (!domain || domain.length < 3) return;

    setCheckingDomain(true);
    try {
      const res = await resolveEmailDomainAction(email.trim());
      setDomainCheck(res);
      if (res.registered && res.hospital_id) {
        setSelectedHospitalId(res.hospital_id);
      }
    } catch {
      // domain check failed or offline
    } finally {
      setCheckingDomain(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const finalHospitalId = domainCheck?.hospital_id || selectedHospitalId;
      if (!finalHospitalId) {
        setError("Please select your hospital facility.");
        setLoading(false);
        return;
      }

      const res = await registerStaffAction({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
        requested_role: requestedRole,
        hospital_id: finalHospitalId,
      });

      try {
        localStorage.setItem("shai_user_name", fullName);
        localStorage.setItem("shai_hospital_name", res.hospital_name || "Hospital");
      } catch {}

      router.push("/approval-pending");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to register staff account.");
    } finally {
      setLoading(false);
    }
  }

  const filteredHospitals = hospitals.filter((h) =>
    h.name.toLowerCase().includes(hospitalSearch.toLowerCase()) ||
    h.city.toLowerCase().includes(hospitalSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-[#06080E] relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 size-96 rounded-full bg-[#6C5CE7]/20 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 size-96 rounded-full bg-[#8B7CF6]/15 blur-[140px] pointer-events-none" />

      <div className="absolute top-5 right-5 z-30">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-xl rounded-3xl border border-[#6C5CE7]/30 bg-[#0C101A]/95 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6 relative z-10">
        <div className="flex items-center justify-between">
          <ShaiLogo tone="dark" size="default" />
          <span className="text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full bg-white/10 text-slate-300">
            Staff Onboarding
          </span>
        </div>

        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-white">Create Hospital Staff Account</h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Register your clinical credentials. Once submitted, your hospital administrator will verify your identity.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-xl bg-rose-950/40 border border-rose-800 p-3 text-xs text-rose-300">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          {/* Email input & Domain check feedback */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-200">Institutional or Work Email</Label>
            <div className="relative">
              <Input
                type="email"
                required
                placeholder="doctor.name@asiri.lk"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={handleEmailBlur}
                className="bg-[#121622] border-slate-700 text-white pl-9 h-10 text-xs focus-visible:ring-[#8B7CF6]"
              />
              <Mail className="size-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>

            {checkingDomain && (
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-1">
                <Loader2 className="size-3 animate-spin text-[#8B7CF6]" />
                <span>Checking institutional domain...</span>
              </p>
            )}

            {domainCheck?.registered && domainCheck.hospital_name && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-800/60 p-2 rounded-lg mt-1">
                <CheckCircle2 className="size-3.5 shrink-0" />
                <span>Verified Domain: <strong>{domainCheck.hospital_name}</strong></span>
              </div>
            )}
          </div>

          {/* Hospital Selection (Searchable fallback if email domain not automatically tied) */}
          {(!domainCheck?.registered || !domainCheck.hospital_id) && (
            <div className="space-y-1.5 rounded-xl border border-slate-800 bg-[#121622]/60 p-3">
              <Label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Building2 className="size-3.5 text-[#8B7CF6]" />
                <span>Select Your Hospital in Sri Lanka</span>
              </Label>
              <div className="space-y-2">
                <div className="relative">
                  <Search className="size-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <Input
                    placeholder="Search Sri Lankan hospitals..."
                    value={hospitalSearch}
                    onChange={(e) => setHospitalSearch(e.target.value)}
                    className="h-8 pl-8 text-xs bg-[#0C101A] border-slate-700 text-white"
                  />
                </div>

                <Select value={selectedHospitalId} onValueChange={(val) => setSelectedHospitalId(val || "")}>
                  <SelectTrigger className="h-9 text-xs bg-[#0C101A] border-slate-700 text-white">
                    <SelectValue placeholder="Choose hospital" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#121622] border-slate-700 text-white max-h-56">
                    {filteredHospitals.map((h) => (
                      <SelectItem key={h.id} value={h.id} className="text-xs focus:bg-slate-800">
                        {h.name} · {h.city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Full Name & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-200">Full Name</Label>
              <div className="relative">
                <Input
                  required
                  placeholder="Dr. K. N. Perera"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="bg-[#121622] border-slate-700 text-white pl-9 h-10 text-xs"
                />
                <User className="size-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-200">Contact Number</Label>
              <div className="relative">
                <Input
                  placeholder="+94 77 123 4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="bg-[#121622] border-slate-700 text-white pl-9 h-10 text-xs"
                />
                <Phone className="size-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          </div>

          {/* Password & Requested Role */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-200">Secure Password</Label>
              <div className="relative">
                <Input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-[#121622] border-slate-700 text-white pl-9 h-10 text-xs"
                />
                <Lock className="size-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-200">Requested Role</Label>
              <Select value={requestedRole} onValueChange={(val) => setRequestedRole(val || "front_desk")}>
                <SelectTrigger className="h-10 text-xs bg-[#121622] border-slate-700 text-white">
                  <SelectValue placeholder="Select Role" />
                </SelectTrigger>
                <SelectContent className="bg-[#121622] border-slate-700 text-white">
                  <SelectItem value="front_desk">Front Desk &amp; Triage</SelectItem>
                  <SelectItem value="manager">Clinical Ops Manager</SelectItem>
                  <SelectItem value="analyst">Data Analyst</SelectItem>
                  <SelectItem value="admin">Hospital Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-xl bg-gradient-to-r from-[#8B7CF6] to-[#5B7CFA] text-white font-semibold text-sm shadow-lg shadow-[#8B7CF6]/25 hover:opacity-95 mt-4"
          >
            {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : <ArrowRight className="size-4 mr-2" />}
            <span>Submit Registration for Approval</span>
          </Button>
        </form>

        <div className="text-center pt-2 border-t border-slate-800 text-xs text-slate-400">
          <span>Already have an approved account? </span>
          <Link href="/login" className="font-semibold text-[#8B7CF6] hover:underline">
            Sign in here
          </Link>
        </div>
      </div>
    </div>
  );
}
