"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  Building,
  Key,
  CheckCircle2,
  Globe,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function ProfilePage() {
  const [name, setName] = useState("Dr. Anura Jayasinghe");
  const [email, setEmail] = useState("admin@shai.health.gov.lk");
  const [station, setStation] = useState("Counter 02 — Outpatient Triage");
  const [department, setDepartment] = useState("General Outpatient Department (OPD)");
  const [language, setLanguage] = useState("en");
  const [audioAlerts, setAudioAlerts] = useState(true);
  const [smsSyncAlerts, setSmsSyncAlerts] = useState(true);

  const [savedSuccess, setSavedSuccess] = useState(false);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  }

  return (
    <div className="flex w-full flex-col gap-6 p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Back link & Title */}
      <div className="flex flex-col gap-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="size-3.5" />
          <span>Back to dashboard</span>
        </Link>

        <div className="flex items-center gap-3 border-b border-border/80 pb-5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <User className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Staff Profile & Workstation Settings
              </h1>
              <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                Hospital Administrator
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Manage your personal credentials, assigned clinic counter, and system notification preferences.
            </p>
          </div>
        </div>
      </div>

      {savedSuccess && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 className="size-4" />
          <span>Profile and workstation settings saved successfully.</span>
        </div>
      )}

      <form onSubmit={handleSave} className="flex flex-col gap-6">
        {/* User Identity & Clinic Station */}
        <Card className="border-border/80 bg-card shadow-xs">
          <CardHeader className="border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <Building className="size-4 text-primary" />
              <CardTitle className="text-base">Identity & Station Assignment</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Staff identification and physical station in Asiri Central Hospital.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">Staff Full Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">Institutional Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">Current Counter / Workstation</Label>
              <Input
                value={station}
                onChange={(e) => setStation(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">Assigned Department</Label>
              <Input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </CardContent>
        </Card>

        {/* Localization & Language */}
        <Card className="border-border/80 bg-card shadow-xs">
          <CardHeader className="border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <Globe className="size-4 text-primary" />
              <CardTitle className="text-base">Localization & Outreach Preferences</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Configure default language for patient outreach messages and portal views.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5 max-w-sm">
              <Label className="text-xs font-semibold">Primary Workspace Language</Label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="h-9 px-3 rounded-md border border-input bg-background text-xs font-medium"
              >
                <option value="en">English (Hospital Official)</option>
                <option value="si">Sinhala (සිංහල)</option>
                <option value="ta">Tamil (தமிழ்)</option>
              </select>
            </div>

            <div className="pt-2 flex flex-col gap-3">
              <label className="flex items-center gap-2.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={audioAlerts}
                  onChange={(e) => setAudioAlerts(e.target.checked)}
                  className="rounded border-input text-primary"
                />
                <span>Play audible chime when high-risk patient enters intake triage</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={smsSyncAlerts}
                  onChange={(e) => setSmsSyncAlerts(e.target.checked)}
                  className="rounded border-input text-primary"
                />
                <span>Notify counter when background HIS sync completes batch scoring</span>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Security & Password */}
        <Card className="border-border/80 bg-card shadow-xs">
          <CardHeader className="border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <Key className="size-4 text-primary" />
              <CardTitle className="text-base">Security & Authentication</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Password credentials and active session encryption.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">Current Password</Label>
              <Input
                type="password"
                placeholder="••••••••••••"
                className="h-9 text-xs"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">New Password</Label>
              <Input
                type="password"
                placeholder="Minimum 8 characters"
                className="h-9 text-xs"
              />
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end">
          <Button type="submit" className="gap-2 text-xs font-semibold h-9 px-5">
            <Save className="size-3.5" />
            <span>Save Settings</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
