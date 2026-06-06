"use client";

import { useEffect, useState } from "react";
import { LogIn, ArrowRight, User, Shield, Stethoscope, Landmark, RefreshCw } from "lucide-react";

interface Persona {
  name: string;
  role: string;
  email: string;
  redirect: string;
  icon: React.ComponentType<any>;
  badgeClass: string;
  cardClass: string;
}

const PERSONAS: Persona[] = [
  {
    name: "Dr. Lena Reyes",
    role: "Population Health Lead",
    email: "lena.reyes@leafjourney.com",
    redirect: "/leafnerd",
    icon: Shield,
    badgeClass: "bg-accent-soft text-accent border-accent/20",
    cardClass: "border-accent/10 hover:border-accent/30 hover:bg-accent-soft/10",
  },
  {
    name: "Dr. Neal Patel",
    role: "Lead Clinician",
    email: "clinician@demo.health",
    redirect: "/post-sign-in",
    icon: Stethoscope,
    badgeClass: "bg-peach/20 text-highlight border-peach-deep/30",
    cardClass: "border-peach-deep/10 hover:border-peach-deep/30 hover:bg-peach/10",
  },
  {
    name: "Avery Hale",
    role: "Practice Owner / Operator",
    email: "owner@demo.health",
    redirect: "/post-sign-in",
    icon: Landmark,
    badgeClass: "bg-rose/20 text-text-soft border-rose-deep/30",
    cardClass: "border-rose-deep/10 hover:border-rose-deep/30 hover:bg-rose/10",
  },
  {
    name: "Daniel Kim",
    role: "Patient",
    email: "patient@demo.health",
    redirect: "/post-sign-in",
    icon: User,
    badgeClass: "bg-lilac/20 text-text border-lilac-deep/30",
    cardClass: "border-lilac-deep/10 hover:border-lilac-deep/30 hover:bg-lilac/10",
  },
];

export function SandboxLogins() {
  const [customEmail, setCustomEmail] = useState("");
  const [activeEmail, setActiveEmail] = useState<string | null>(null);

  useEffect(() => {
    const getDevEmail = () => {
      const match = document.cookie.match(/(?:^|; )dev_user_email=([^;]*)/);
      return match ? decodeURIComponent(match[1]) : null;
    };
    setActiveEmail(getDevEmail());
  }, []);

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customEmail.trim()) return;
    window.location.href = `/api/dev/login?email=${encodeURIComponent(customEmail)}&redirect=${encodeURIComponent("/post-sign-in")}`;
  };

  return (
    <div className="w-full max-w-[380px] bg-glass-bg backdrop-blur-md border border-glass-border rounded-2xl shadow-lg px-6 py-8 flex flex-col relative overflow-hidden text-left lm-fade-in">
      {/* Background soft glow decoration */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-highlight/5 rounded-full blur-xl pointer-events-none" />

      <div className="relative z-10 flex flex-col h-full justify-between gap-6">
        <div>
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display text-xl text-text tracking-tight flex items-center gap-2">
              Sandbox Personas
            </h2>
            {activeEmail && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            )}
          </div>
          <p className="text-xs text-text-subtle">
            Bypass authentication for local clinical workspace testing
          </p>

          {activeEmail && (
            <div className="mt-4 p-3 rounded-xl bg-accent-soft/30 border border-accent/15 flex items-center justify-between transition-all">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-accent">Active Dev Session</p>
                <p className="text-xs font-mono text-text truncate mt-0.5">{activeEmail}</p>
              </div>
              <a
                href="/api/dev/logout?redirect=/sign-in"
                className="flex items-center gap-1 text-[10px] text-accent hover:text-accent-hover font-semibold underline shrink-0 ml-2"
              >
                <RefreshCw size={10} className="animate-spin-slow" />
                Clear
              </a>
            </div>
          )}

          <div className="space-y-3 mt-6">
            {PERSONAS.map((p) => {
              const Icon = p.icon;
              return (
                <a
                  key={p.email}
                  href={`/api/dev/login?email=${encodeURIComponent(p.email)}&redirect=${encodeURIComponent(p.redirect)}`}
                  className={`block p-3.5 rounded-xl border bg-surface/40 hover:bg-surface hover:-translate-y-0.5 hover:shadow-sm transition-all duration-200 group ${p.cardClass}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-semibold text-xs text-text group-hover:text-accent transition-colors flex items-center gap-1.5">
                      <Icon size={13} className="text-text-muted group-hover:text-accent transition-colors" />
                      {p.name}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${p.badgeClass}`}>
                      {p.role}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-text-muted">
                    <span className="font-mono truncate max-w-[190px]">{p.email}</span>
                    <span className="text-text-subtle shrink-0 flex items-center gap-0.5 group-hover:text-accent transition-colors">
                      {p.redirect === "/leafnerd" ? "leafnerd" : "home"}
                      <ArrowRight size={10} className="group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <form onSubmit={handleCustomSubmit} className="flex gap-2">
            <input
              type="email"
              value={customEmail}
              onChange={(e) => setCustomEmail(e.target.value)}
              placeholder="Or enter custom email..."
              className="flex-1 bg-bg/40 border border-border text-xs rounded-lg h-9 px-3 text-text placeholder:text-text-subtle focus:border-accent focus:ring-1 focus:ring-accent/20 focus:outline-none transition-colors"
            />
            <button
              type="submit"
              className="bg-accent hover:bg-accent-hover text-accent-ink rounded-lg h-9 px-3 text-xs font-semibold shadow-sm transition-colors flex items-center gap-1"
            >
              Go <LogIn size={11} />
            </button>
          </form>
          <p className="text-[10px] text-text-subtle text-center mt-3">
            Sandbox utility enabled strictly in development mode.
          </p>
        </div>
      </div>
    </div>
  );
}
