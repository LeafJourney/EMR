"use client";

import Link from "next/link";
import { useState } from "react";
import { Wordmark } from "@/components/ui/logo";

type FooterLink = { label: string; href?: string; external?: boolean };

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Patient Portal", href: "/sign-up" },
      { label: "Clinician Portal", href: "/sign-up" },
      { label: "Operator Dashboard" },
      { label: "The LeafMart", href: "https://www.theleafmart.com/", external: true },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Security", href: "/security" },
      { label: "Careers", href: "/contact" },
      { label: "Press" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Education", href: "/education" },
      { label: "Developer", href: "/developer" },
      { label: "Status", href: "/status" },
      { label: "Blog" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/security#privacy" },
      { label: "Terms", href: "/legal/terms" },
      { label: "HIPAA", href: "/security#hipaa" },
    ],
  },
];

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: FooterLink[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border sm:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between py-4 sm:py-0 sm:cursor-default sm:pointer-events-none text-left"
      >
        <span className="text-[12.5px] font-semibold tracking-[1.2px] uppercase text-text sm:mb-3.5 block">
          {title}
        </span>
        <span
          aria-hidden="true"
          className="sm:hidden text-text-subtle text-2xl leading-none transition-transform duration-200"
          style={{ transform: open ? "rotate(45deg)" : "rotate(0)" }}
        >
          +
        </span>
      </button>
      <ul
        className="overflow-hidden sm:!max-h-none sm:!opacity-100 sm:!visible sm:block space-y-2.5 sm:pb-0 transition-[max-height,opacity] duration-300 ease-out"
        style={{
          maxHeight: open ? "300px" : "0px",
          opacity: open ? 1 : 0,
          visibility: open ? "visible" : "hidden",
          paddingBottom: open ? "16px" : "0px",
        }}
      >
        {links.map((link) => (
          <li key={link.label}>
            {link.href ? (
              <Link
                href={link.href}
                {...(link.external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="text-sm text-text-muted hover:text-text transition-colors"
              >
                {link.label}
              </Link>
            ) : (
              <span className="text-sm text-text-muted">{link.label}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      setStatus("error");
      setMessage("Enter a valid email");
      return;
    }
    setStatus("submitting");
    // Earlier this handler was a setTimeout fake-success — same silent-
    // drop pattern PR #258 fixed in /book-demo and pass 5 fixed in
    // /status. Newsletter subscriptions from the site-wide footer were
    // silently dropped on every marketing page since launch.
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed.split("@")[0] || "Newsletter subscriber",
          email: trimmed,
          subject: "Newsletter subscription",
          role: "newsletter_subscribe",
          message:
            "User opted in to the marketing newsletter via the site " +
            "footer. Surface: " +
            (typeof window !== "undefined" ? window.location.pathname : ""),
        }),
      });
      if (!res.ok) throw new Error(`POST /api/contact returned ${res.status}`);
      setStatus("success");
      setMessage("You're on the list. Watch your inbox.");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage(
        "We could not record your subscription. Try again or email hello@leafjourney.com.",
      );
    }
  }

  return (
    <div className="mb-8 sm:mb-10 max-w-[460px]">
      <h3 className="font-display text-[20px] font-medium tracking-tight text-text mb-2">
        Stay in the loop
      </h3>
      <p className="text-[13.5px] text-text-muted mb-4 leading-relaxed">
        New features, research highlights, and the occasional field note from the team. No filler.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2" noValidate>
        <label htmlFor="leafjourney-newsletter-email" className="sr-only">
          Email address
        </label>
        <input
          id="leafjourney-newsletter-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status !== "idle") setStatus("idle");
            if (message) setMessage(null);
          }}
          placeholder="you@email.com"
          aria-invalid={status === "error"}
          aria-describedby={message ? "leafjourney-newsletter-msg" : undefined}
          required
          className="flex-1 rounded-full border border-border bg-surface px-4 py-2.5 text-[14px] text-text placeholder:text-text-subtle focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-colors"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="rounded-full bg-accent text-accent-ink px-5 py-2.5 text-[13px] font-medium hover:bg-accent-strong transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {status === "submitting" ? "Joining…" : "Join"}
        </button>
      </form>
      {message && (
        <p
          id="leafjourney-newsletter-msg"
          role={status === "error" ? "alert" : "status"}
          className={`mt-2 text-[12.5px] ${status === "error" ? "text-danger" : "text-accent"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}

function BackToTop() {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined") {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }}
      className="text-[12px] text-text-subtle hover:text-text transition-colors inline-flex items-center gap-1"
    >
      <span aria-hidden="true">↑</span> Back to top
    </button>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border" role="contentinfo">
      <div className="max-w-[1320px] mx-auto px-6 lg:px-12 py-10 sm:py-12">
        {/* Top: brand + newsletter */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8 sm:mb-10">
          <div>
            <Wordmark size="md" className="mb-4" />
            <p className="text-[13.5px] text-text-muted leading-relaxed max-w-[360px]">
              An AI-native cannabis care platform. Patient portal, clinician
              workspace, and practice operations — unified.
            </p>
          </div>
          <NewsletterSignup />
        </div>

        {/* Link columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-2 sm:gap-y-8 mb-8 sm:mb-10">
          {COLUMNS.map((col) => (
            <FooterColumn key={col.title} title={col.title} links={col.links} />
          ))}
        </div>

        {/* Cannabis disclaimer */}
        <p className="text-xs italic text-text-muted leading-relaxed max-w-3xl mb-6">
          Cannabis should be considered a medicine — please use it carefully and
          judiciously. Do not abuse cannabis, and respect the plant and its
          healing properties. Leafjourney is a demonstration product and is not
          a substitute for medical advice. All educational material on this
          website is strictly for that — education. Any and all changes to
          medications or treatment plans must be discussed with your healthcare
          provider first.
        </p>

        {/* Bottom bar */}
        <div className="pt-6 border-t border-border flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-text-subtle">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <span>&copy; {new Date().getFullYear()} Leafjourney Health.</span>
            <BackToTop />
          </div>
          <div className="flex flex-col sm:flex-row gap-1 sm:gap-4">
            <span>Hemp-derived products ship nationally where permitted.</span>
            <span>Licensed cannabis available intrastate only.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
