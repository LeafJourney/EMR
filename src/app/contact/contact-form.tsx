"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Mail } from "lucide-react";

const RECIPIENTS = ["neal@leafjourney.com", "scott@leafjourney.com"];

export function ContactForm() {
  const params = useSearchParams();
  const role = params.get("role") ?? "";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState(role ? `Re: ${role}` : "");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const mailtoHref = `mailto:${RECIPIENTS.join(",")}?subject=${encodeURIComponent(
    subject || "Leafjourney inquiry"
  )}&body=${encodeURIComponent(message)}`;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim() || !message.trim()) {
      setError("Please fill in your name, email, and message.");
      return;
    }
    setStatus("submitting");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message, role }),
      });
      if (!res.ok) throw new Error(await res.text());
      setStatus("success");
    } catch {
      // Fall back to a mailto so the message still reaches the founders even
      // if the inbound API hasn't been wired to SMTP yet.
      setStatus("error");
      setError(
        "We couldn't send your message right now. Please use the email button below to send it directly."
      );
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h2 className="font-display text-2xl text-emerald-900 mb-2">
          Message sent.
        </h2>
        <p className="text-emerald-800 text-sm leading-relaxed">
          Neal and Scott will get back to you personally. Expect a reply within
          one to two business days.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-border bg-surface-raised p-6 md:p-10 shadow-sm"
      noValidate
    >
      {role && (
        <p className="mb-6 inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent">
          Applying for: {role}
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label htmlFor="contact-name" className="block text-sm font-medium text-text mb-1.5">
            Your name
          </label>
          <input
            id="contact-name"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm focus:border-accent focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="contact-email" className="block text-sm font-medium text-text mb-1.5">
            Email
          </label>
          <input
            id="contact-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm focus:border-accent focus:outline-none"
          />
        </div>
      </div>
      <div className="mt-5">
        <label htmlFor="contact-subject" className="block text-sm font-medium text-text mb-1.5">
          Subject
        </label>
        <input
          id="contact-subject"
          name="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="What's this about?"
          className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm focus:border-accent focus:outline-none"
        />
      </div>
      <div className="mt-5">
        <label htmlFor="contact-message" className="block text-sm font-medium text-text mb-1.5">
          Message
        </label>
        <textarea
          id="contact-message"
          name="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          rows={7}
          className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm focus:border-accent focus:outline-none resize-none"
          placeholder="Tell us about yourself, the role, and how you'd contribute…"
        />
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-rose-600">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          size="lg"
          disabled={status === "submitting"}
        >
          {status === "submitting" ? "Sending…" : "Send"}
        </Button>
        <a
          href={mailtoHref}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-medium text-text hover:border-accent transition-colors"
        >
          <Mail className="w-4 h-4" />
          Or open in your mail app
        </a>
      </div>

      <p className="mt-6 text-xs text-text-subtle leading-relaxed">
        Sent directly to neal@leafjourney.com and scott@leafjourney.com. We
        don&apos;t share your message.
      </p>
    </form>
  );
}
