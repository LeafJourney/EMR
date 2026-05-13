"use client";

import { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

type EmailFrequency = "instant" | "daily" | "weekly" | "off";
type ContactWindow = "anytime" | "business_hours" | "no_weekends";
type LanguagePref = "en" | "es" | "fr" | "zh" | "ko" | "vi" | "ar" | "ht";

interface NotificationCategory {
  id: string;
  label: string;
  description: string;
  email: boolean;
  sms: boolean;
}

// EMR-175 additions
const CONTACT_WINDOW_OPTIONS: { value: ContactWindow; label: string; helper: string }[] = [
  { value: "anytime", label: "Anytime", helper: "Always OK to reach you" },
  { value: "business_hours", label: "Business hours", helper: "Mon-Fri 9-5 in your timezone" },
  { value: "no_weekends", label: "No weekends", helper: "Weekdays only" },
];

const LANGUAGE_OPTIONS: { value: LanguagePref; label: string }[] = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "zh", label: "中文" },
  { value: "ko", label: "한국어" },
  { value: "vi", label: "Tiếng Việt" },
  { value: "ar", label: "العربية" },
  { value: "ht", label: "Kreyòl ayisyen" },
];

const EMAIL_FREQUENCY_OPTIONS: { value: EmailFrequency; label: string }[] = [
  { value: "instant", label: "Instant" },
  { value: "daily", label: "Daily digest" },
  { value: "weekly", label: "Weekly digest" },
  { value: "off", label: "Off" },
];

const DEFAULT_CATEGORIES: NotificationCategory[] = [
  {
    id: "appointments",
    label: "Appointment reminders",
    description: "Upcoming visit reminders and scheduling changes",
    email: true,
    sms: true,
  },
  {
    id: "messages",
    label: "Message alerts",
    description: "New messages from your care team",
    email: true,
    sms: true,
  },
  {
    id: "labs",
    label: "Lab results",
    description: "Notifications when new lab results are available",
    email: true,
    sms: false,
  },
  {
    id: "dosing",
    label: "Dosing reminders",
    description: "Reminders for your cannabis treatment schedule",
    email: false,
    sms: true,
  },
  {
    id: "billing",
    label: "Billing",
    description: "Payment confirmations and billing statements",
    email: true,
    sms: false,
  },
];

export function CommunicationPreferences() {
  const [smsOptIn, setSmsOptIn] = useState(true);
  const [emailFrequency, setEmailFrequency] =
    useState<EmailFrequency>("instant");
  const [categories, setCategories] =
    useState<NotificationCategory[]>(DEFAULT_CATEGORIES);
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("07:00");
  // EMR-175 additions — stored in the CommunicationPreference.preferences JSON.
  const [contactWindow, setContactWindow] = useState<ContactWindow>("anytime");
  const [language, setLanguage] = useState<LanguagePref>("en");
  const [emergencyOverride, setEmergencyOverride] = useState(true);
  const [marketingOptOut, setMarketingOptOut] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggleCategory(
    id: string,
    channel: "email" | "sms"
  ) {
    setCategories((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, [channel]: !c[channel] } : c
      )
    );
  }

  function handleSave() {
    setSaving(true);
    setSaved(false);
    // Simulated save
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }, 800);
  }

  return (
    <Card tone="raised" className="mt-8">
      <CardHeader>
        <CardTitle>Communication Preferences</CardTitle>
        <CardDescription>
          Control how and when you receive notifications from Leafjourney.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* ── SMS opt-in ── */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text">SMS notifications</p>
            <p className="text-xs text-text-subtle mt-0.5">
              Receive text messages for important updates
            </p>
          </div>
          <button
            role="switch"
            aria-checked={smsOptIn}
            onClick={() => setSmsOptIn(!smsOptIn)}
            className={cn(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2",
              smsOptIn ? "bg-accent" : "bg-border-strong"
            )}
          >
            <span
              className={cn(
                "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                smsOptIn ? "translate-x-6" : "translate-x-1"
              )}
            />
          </button>
        </div>

        {/* ── Email frequency ── */}
        <div>
          <p className="text-sm font-medium text-text mb-1">Email frequency</p>
          <p className="text-xs text-text-subtle mb-3">
            How often to receive email digests
          </p>
          <div className="flex items-center gap-1 p-1 bg-surface-muted rounded-lg w-fit">
            {EMAIL_FREQUENCY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setEmailFrequency(opt.value)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
                  emailFrequency === opt.value
                    ? "bg-accent text-accent-ink shadow-sm"
                    : "text-text-muted hover:text-text hover:bg-surface"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Notification categories ── */}
        <div>
          <p className="text-sm font-medium text-text mb-1">
            Notification categories
          </p>
          <p className="text-xs text-text-subtle mb-4">
            Toggle email and SMS for each category
          </p>
          <div className="space-y-3">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface p-4"
              >
                <div className="min-w-0 mr-4">
                  <p className="text-sm font-medium text-text">{cat.label}</p>
                  <p className="text-xs text-text-subtle mt-0.5">
                    {cat.description}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => toggleCategory(cat.id, "email")}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors duration-200",
                      cat.email
                        ? "bg-accent-soft text-accent border-accent/20"
                        : "bg-surface-muted text-text-subtle border-border"
                    )}
                    aria-label={`${cat.label} email ${cat.email ? "enabled" : "disabled"}`}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="M22 4L12 13L2 4" />
                    </svg>
                    Email
                  </button>
                  <button
                    onClick={() => toggleCategory(cat.id, "sms")}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors duration-200",
                      cat.sms
                        ? "bg-accent-soft text-accent border-accent/20"
                        : "bg-surface-muted text-text-subtle border-border"
                    )}
                    aria-label={`${cat.label} SMS ${cat.sms ? "enabled" : "disabled"}`}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <rect x="5" y="2" width="14" height="20" rx="2" />
                      <line x1="12" y1="18" x2="12" y2="18" />
                    </svg>
                    SMS
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Quiet hours ── */}
        <div>
          <p className="text-sm font-medium text-text mb-1">Quiet hours</p>
          <p className="text-xs text-text-subtle mb-3">
            Suppress non-urgent notifications during these hours
          </p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label
                htmlFor="quiet-start"
                className="text-xs text-text-muted font-medium"
              >
                From
              </label>
              <Input
                id="quiet-start"
                type="time"
                value={quietStart}
                onChange={(e) => setQuietStart(e.target.value)}
                className="w-32"
              />
            </div>
            <span className="text-text-subtle">to</span>
            <div className="flex items-center gap-2">
              <label
                htmlFor="quiet-end"
                className="text-xs text-text-muted font-medium"
              >
                Until
              </label>
              <Input
                id="quiet-end"
                type="time"
                value={quietEnd}
                onChange={(e) => setQuietEnd(e.target.value)}
                className="w-32"
              />
            </div>
          </div>
        </div>

        {/* ── Contact window (EMR-175) ── */}
        <div>
          <p className="text-sm font-medium text-text mb-1">When to contact you</p>
          <p className="text-xs text-text-subtle mb-3">
            Combines with quiet hours. We always honor the more restrictive setting.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {CONTACT_WINDOW_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setContactWindow(opt.value)}
                className={cn(
                  "text-left rounded-lg border p-3 transition-colors duration-200",
                  contactWindow === opt.value
                    ? "border-accent bg-accent-soft/40 ring-1 ring-accent/30"
                    : "border-border bg-surface hover:border-accent/40",
                )}
              >
                <p className="text-sm font-medium text-text">{opt.label}</p>
                <p className="text-xs text-text-subtle mt-0.5">{opt.helper}</p>
              </button>
            ))}
          </div>
        </div>

        {/* ── Language (EMR-175) ── */}
        <div>
          <p className="text-sm font-medium text-text mb-1">Language</p>
          <p className="text-xs text-text-subtle mb-3">
            All patient-facing messages will be sent in this language when possible.
          </p>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as LanguagePref)}
            aria-label="Preferred language"
            className="h-10 px-3 rounded-md border border-border bg-surface text-sm text-text focus:outline-none focus:border-accent"
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* ── Marketing opt-out (EMR-175 / TCPA) ── */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">No marketing messages</p>
            <p className="text-xs text-text-subtle mt-0.5">
              Keep clinical and account messages, opt out of promotional content.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={marketingOptOut}
            onClick={() => setMarketingOptOut(!marketingOptOut)}
            className={cn(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2",
              marketingOptOut ? "bg-accent" : "bg-border-strong",
            )}
          >
            <span
              className={cn(
                "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                marketingOptOut ? "translate-x-6" : "translate-x-1",
              )}
            />
          </button>
        </div>

        {/* ── Emergency override (EMR-175) ── */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-900">
                Emergency contact override
              </p>
              <p className="text-xs text-amber-800/80 mt-0.5">
                Always allow your care team to reach you in a clinical emergency, regardless
                of the preferences above. Recommended.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={emergencyOverride}
              onClick={() => setEmergencyOverride(!emergencyOverride)}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 focus-visible:ring-offset-2",
                emergencyOverride ? "bg-amber-500" : "bg-amber-200",
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                  emergencyOverride ? "translate-x-6" : "translate-x-1",
                )}
              />
            </button>
          </div>
        </div>

        {/* ── Save button ── */}
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save preferences"}
          </Button>
          {saved && (
            <Badge tone="success">Preferences saved</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
