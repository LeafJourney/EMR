import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Eyebrow } from "@/components/ui/ornament";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Shield, Brain, Microscope, Stethoscope, LineChart, Pill, Sprout, MessageSquare } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Features | Leafjourney" };

const FEATURES = [
  {
    icon: Brain,
    title: "AI-Native Charting",
    description: "Our fleet of 13 autonomous subagents reviews patient history, listens to the encounter, and drafts complete SOAP notes before you even leave the room.",
  },
  {
    icon: Stethoscope,
    title: "Clinical Decision Support",
    description: "Real-time drug interaction checking and condition-to-cannabinoid matching powered by our proprietary database of 11,000+ peer-reviewed studies.",
  },
  {
    icon: Sprout,
    title: "Pharmacopeia Combo Wheel",
    description: "Visualize complex cannabinoid and terpene synergies with our interactive D3.js visualization to find the perfect botanical formula.",
  },
  {
    icon: LineChart,
    title: "Outcome Tracking",
    description: "Patients log their doses and symptom relief via the portal. You get beautiful sparklines and trend graphs right in the clinical dashboard.",
  },
  {
    icon: Pill,
    title: "E-Prescribing & Leafmart",
    description: "Write cannabis recommendations that seamlessly sync to Leafmart, allowing patients to securely purchase and ship verified botanical products.",
  },
  {
    icon: MessageSquare,
    title: "Secure Messaging & Triage",
    description: "HIPAA-compliant asynchronous chat with patients, featuring AI-triage that automatically flags high-risk symptoms for immediate clinical review.",
  },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-bg">
      <SiteHeader />

      <main id="main-content" className="max-w-[1320px] mx-auto px-6 lg:px-12 pt-20 pb-28">
        <div className="text-center max-w-3xl mx-auto mb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <Eyebrow className="justify-center mb-6">Platform Capabilities</Eyebrow>
          <h1 className="font-display text-5xl md:text-6xl text-text leading-[1.05] tracking-tight mb-6">
            Everything you need to practice modern medicine.
          </h1>
          <p className="text-xl text-text-muted leading-relaxed">
            Leafjourney unifies the patient experience, clinical charting, and dispensary fulfillment into one intelligent platform.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-10 mb-24 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150">
          {FEATURES.map((feature, idx) => (
            <div key={idx} className="bg-[var(--surface-muted)]/50 rounded-3xl p-8 border border-[var(--border)] hover:border-[var(--accent)] transition-colors group">
              <div className="w-14 h-14 bg-[var(--surface)] border border-[var(--border)] rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-[var(--accent)]/10 transition-all duration-300">
                <feature.icon className="w-6 h-6 text-text group-hover:text-[var(--accent)] transition-colors" />
              </div>
              <h3 className="font-display text-2xl font-medium text-text mb-3">
                {feature.title}
              </h3>
              <p className="text-text-muted leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        <div className="bg-[var(--surface)] rounded-[3rem] border border-[var(--border)] p-10 md:p-16 lg:p-24 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <Badge tone="accent" className="mb-6">Enterprise Grade</Badge>
            <h2 className="font-display text-4xl md:text-5xl text-text leading-tight mb-6">
              Built for security and compliance from day one.
            </h2>
            <ul className="space-y-4 mb-10">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-[var(--accent)] shrink-0" />
                <span className="text-lg text-text-muted">HIPAA, SOC2, and GDPR compliant infrastructure.</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-[var(--accent)] shrink-0" />
                <span className="text-lg text-text-muted">End-to-end encryption for all protected health information (PHI).</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-[var(--accent)] shrink-0" />
                <span className="text-lg text-text-muted">Immutable, cryptographic audit logs for every chart modification.</span>
              </li>
            </ul>
            <Link href="/security">
              <Button variant="secondary" size="lg">Read our Security Whitepaper</Button>
            </Link>
          </div>
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-[var(--accent)]/20 to-transparent blur-3xl rounded-full" />
            <div className="relative bg-white p-8 rounded-3xl shadow-2xl border border-[var(--border)]">
              <div className="flex items-center justify-center py-12">
                <Shield className="w-32 h-32 text-[var(--accent)] opacity-80" strokeWidth={1} />
              </div>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
