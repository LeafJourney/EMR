"use client";

// Customer-facing demo-request form.
//
// History bug fixed in this rewrite: the previous version had
// `// @ts-nocheck` on top and the submit handler was literally
//
//   await new Promise(resolve => setTimeout(resolve, 1500));
//   setStatus("success");
//
// — i.e. NO API call, NO read of the form data. The handler also
// didn't bind any inputs to state or `name` attributes, so even if
// an API call had been made there'd have been no payload to send.
// Net result: every demo-request submission since this page shipped
// has been a fake-success and the lead has been silently dropped.
//
// The handler now POSTs to /api/contact (the contact route in the
// API surface — it logs structured events recipients can actually
// reconcile from until SMTP/CRM integration lands).

import { useState } from "react";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Eyebrow } from "@/components/ui/ornament";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Building, Mail, Phone, User } from "lucide-react";
import Link from "next/link";

type SubmitStatus = "idle" | "submitting" | "success" | "error";

interface DemoRequestPayload {
  name: string;
  email: string;
  phone: string;
  organization: string;
  teamSize: string;
  message: string;
}

export default function BookDemoPage() {
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg(null);

    const form = e.currentTarget;
    const fd = new FormData(form);

    const firstName = String(fd.get("firstName") ?? "").trim();
    const lastName = String(fd.get("lastName") ?? "").trim();
    const payload: DemoRequestPayload = {
      name: `${firstName} ${lastName}`.trim(),
      email: String(fd.get("email") ?? "").trim(),
      phone: String(fd.get("phone") ?? "").trim(),
      organization: String(fd.get("organization") ?? "").trim(),
      teamSize: String(fd.get("teamSize") ?? "").trim(),
      message: String(fd.get("message") ?? "").trim(),
    };

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: payload.name,
          email: payload.email,
          subject: `Demo request — ${payload.organization || "(no org)"} (${payload.teamSize || "—"})`,
          role: "demo_request",
          message: [
            payload.message || "(no problem statement provided)",
            "",
            `Phone: ${payload.phone || "—"}`,
            `Organization: ${payload.organization || "—"}`,
            `Team size: ${payload.teamSize || "—"}`,
          ].join("\n"),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ||
            `Submit failed with status ${res.status}`,
        );
      }

      setStatus("success");
      form.reset();
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Submit failed");
    }
  };

  return (
    <div className="min-h-screen bg-bg">
      <SiteHeader />

      <main id="main-content" className="max-w-[1200px] mx-auto px-6 lg:px-12 pt-20 pb-28">
        <div className="grid lg:grid-cols-2 gap-16 items-start">
          {/* Left Column: Copy & Social Proof */}
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <Eyebrow className="mb-6">Enterprise Sales</Eyebrow>
            <h1 className="font-display text-5xl md:text-6xl text-text leading-[1.05] tracking-tight mb-6">
              See Leafjourney in action.
            </h1>
            <p className="text-xl text-text-muted leading-relaxed mb-10">
              Discover how our AI-native platform can streamline your clinical
              operations, automate charting, and unlock new revenue streams
              through Leafmart.
            </p>

            <div className="space-y-6 mb-12">
              {[
                {
                  title: "Tailored Walkthrough",
                  body: "A live, 30-minute demonstration customized for your specific practice specialty.",
                },
                {
                  title: "Integration Roadmap",
                  body: "Learn how to seamlessly migrate your existing patient data and connect your current billing systems.",
                },
                {
                  title: "Pricing & ROI Analysis",
                  body: "Transparent enterprise pricing options and projected time-savings via our autonomous charting agents.",
                },
              ].map((item) => (
                <div className="flex items-start gap-4" key={item.title}>
                  <div className="w-8 h-8 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center shrink-0 mt-1">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    {/* h2 (not h3) — page h1 lives in the hero; the next
                        heading after it must be h2 for axe's heading-order
                        rule. (EMR-713 cleanup.) */}
                    <h2 className="text-base font-medium text-text mb-1">{item.title}</h2>
                    <p className="text-text-muted text-sm">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-6 bg-[var(--surface-muted)]/50 rounded-2xl border border-[var(--border)]">
              <p className="italic text-text-muted text-sm leading-relaxed mb-4">
                &ldquo;Leafjourney completely transformed our clinic. The
                autonomous subagents handle the documentation while we focus on
                the patient. It&apos;s the first time in ten years I&apos;m
                leaving the office at 5 PM.&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[var(--accent)] text-white rounded-full flex items-center justify-center font-bold text-sm">
                  SJ
                </div>
                <div>
                  <p className="font-medium text-text text-sm">
                    Dr. Sarah Jenkins
                  </p>
                  <p className="text-xs text-text-muted">
                    Medical Director, Horizon Health
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: The Form */}
          <div className="lg:pl-10 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150">
            {status === "success" ? (
              <Card tone="raised" className="border-[var(--accent)] shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-[var(--accent)]" />
                <CardContent className="p-10 text-center">
                  <div className="w-20 h-20 bg-[var(--accent)]/10 rounded-full flex items-center justify-center mx-auto mb-6 text-[var(--accent)]">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <h2 className="font-display text-3xl text-text mb-4">Request Received</h2>
                  <p className="text-text-muted leading-relaxed mb-8">
                    Thank you for your interest. A member of our enterprise
                    sales team will be in touch within 24 hours to schedule
                    your personalized demonstration.
                  </p>
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => setStatus("idle")}
                  >
                    Submit another request
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card tone="raised" className="shadow-xl">
                <CardContent className="p-8 sm:p-10">
                  <h2 className="font-display text-2xl text-text mb-6">Schedule your demo</h2>

                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <label htmlFor="firstName" className="text-xs font-medium text-text-muted uppercase tracking-wider">First Name</label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-subtle" />
                          <input id="firstName" name="firstName" required type="text" className="w-full h-11 pl-10 pr-3 bg-[var(--surface-muted)]/30 border border-[var(--border)] rounded-xl text-sm focus:border-[var(--accent)] outline-none transition-colors" placeholder="Jane" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="lastName" className="text-xs font-medium text-text-muted uppercase tracking-wider">Last Name</label>
                        <input id="lastName" name="lastName" required type="text" className="w-full h-11 px-3 bg-[var(--surface-muted)]/30 border border-[var(--border)] rounded-xl text-sm focus:border-[var(--accent)] outline-none transition-colors" placeholder="Doe" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="email" className="text-xs font-medium text-text-muted uppercase tracking-wider">Work Email</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-subtle" />
                        <input id="email" name="email" required type="email" className="w-full h-11 pl-10 pr-3 bg-[var(--surface-muted)]/30 border border-[var(--border)] rounded-xl text-sm focus:border-[var(--accent)] outline-none transition-colors" placeholder="jane@clinic.com" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="organization" className="text-xs font-medium text-text-muted uppercase tracking-wider">Organization Name</label>
                      <div className="relative">
                        <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-subtle" />
                        <input id="organization" name="organization" required type="text" className="w-full h-11 pl-10 pr-3 bg-[var(--surface-muted)]/30 border border-[var(--border)] rounded-xl text-sm focus:border-[var(--accent)] outline-none transition-colors" placeholder="Horizon Health Partners" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <label htmlFor="phone" className="text-xs font-medium text-text-muted uppercase tracking-wider">Phone Number</label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-subtle" />
                          <input id="phone" name="phone" required type="tel" className="w-full h-11 pl-10 pr-3 bg-[var(--surface-muted)]/30 border border-[var(--border)] rounded-xl text-sm focus:border-[var(--accent)] outline-none transition-colors" placeholder="(555) 123-4567" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="teamSize" className="text-xs font-medium text-text-muted uppercase tracking-wider">Team Size</label>
                        <select id="teamSize" name="teamSize" required defaultValue="" className="w-full h-11 px-3 bg-[var(--surface-muted)]/30 border border-[var(--border)] rounded-xl text-sm focus:border-[var(--accent)] outline-none transition-colors appearance-none">
                          <option value="" disabled>Select size...</option>
                          <option value="1-5">1-5 Providers</option>
                          <option value="6-20">6-20 Providers</option>
                          <option value="21-50">21-50 Providers</option>
                          <option value="50+">50+ Providers</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="message" className="text-xs font-medium text-text-muted uppercase tracking-wider">What are you hoping to solve?</label>
                      <textarea id="message" name="message" className="w-full min-h-[100px] p-3 bg-[var(--surface-muted)]/30 border border-[var(--border)] rounded-xl text-sm focus:border-[var(--accent)] outline-none transition-colors resize-y" placeholder="Briefly describe your current challenges..." />
                    </div>

                    {status === "error" && errorMsg && (
                      <p
                        role="alert"
                        className="text-xs text-[color:var(--danger)] bg-[color:var(--danger)]/10 px-3 py-2 rounded-lg border border-[color:var(--danger)]/30"
                      >
                        We couldn&apos;t submit your request: {errorMsg}. Please
                        try again or email{" "}
                        <a href="mailto:hello@leafjourney.com" className="underline">
                          hello@leafjourney.com
                        </a>
                        .
                      </p>
                    )}

                    <Button type="submit" size="lg" className="w-full mt-4" disabled={status === "submitting"}>
                      {status === "submitting" ? "Submitting Request..." : "Request Demo"}
                    </Button>

                    <p className="text-[11px] text-text-subtle text-center mt-4">
                      By submitting this form, you agree to our{" "}
                      <Link href="/security" className="underline hover:text-[var(--accent)]">
                        Privacy Policy
                      </Link>
                      .
                    </p>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
