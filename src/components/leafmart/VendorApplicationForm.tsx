"use client";

import { useState } from "react";
import { FileUpload, type FileUploadItem } from "@/components/ui/file-upload";

const PRODUCT_TYPES = [
  { slug: "tinctures", label: "Tinctures" },
  { slug: "edibles", label: "Edibles" },
  { slug: "topicals", label: "Topicals" },
  { slug: "beverages", label: "Beverages" },
  { slug: "serums", label: "Serums" },
  { slug: "capsules", label: "Capsules" },
  { slug: "flower", label: "Flower" },
  { slug: "vapes", label: "Vapes" },
  { slug: "other", label: "Other" },
];

interface FormState {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  productTypes: string[];
  hasCoa: "yes" | "no" | "";
  description: string;
}

const EMPTY: FormState = {
  companyName: "",
  contactName: "",
  email: "",
  phone: "",
  website: "",
  productTypes: [],
  hasCoa: "",
  description: "",
};

const inputClass =
  "w-full rounded-2xl border border-[var(--border)] px-4 py-3.5 text-[15px] text-[var(--ink)] bg-[var(--surface)] placeholder:text-[var(--muted)] focus:border-[var(--leaf)] focus:ring-1 focus:ring-[var(--leaf)] transition-colors outline-none";

export function VendorApplicationForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [topError, setTopError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<FileUploadItem[]>([]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key as string]) {
      setErrors((e) => {
        const next = { ...e };
        delete next[key as string];
        return next;
      });
    }
  }

  function toggleProductType(slug: string) {
    setForm((f) => ({
      ...f,
      productTypes: f.productTypes.includes(slug)
        ? f.productTypes.filter((s) => s !== slug)
        : [...f.productTypes, slug],
    }));
    if (errors.productTypes) {
      setErrors((e) => {
        const next = { ...e };
        delete next.productTypes;
        return next;
      });
    }
  }

  function clientValidate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!form.companyName.trim()) e.companyName = "Company name is required";
    if (!form.contactName.trim()) e.contactName = "Contact name is required";
    if (!form.email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) e.email = "Enter a valid email";
    if (form.website.trim() && !/^https?:\/\//i.test(form.website.trim())) e.website = "Use http:// or https://";
    if (form.productTypes.length === 0) e.productTypes = "Pick at least one product type";
    if (!form.hasCoa) e.hasCoa = "Tell us about your COA testing";
    if (!form.description.trim()) e.description = "A short description is required";
    else if (form.description.trim().length < 20) e.description = "Tell us a bit more (min 20 characters)";
    return e;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTopError(null);
    const localErrors = clientValidate();
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/leafmart/vendor-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        if (json?.errors && typeof json.errors === "object") {
          setErrors(json.errors as Record<string, string>);
        } else {
          setTopError(json?.error ?? `Submission failed (${res.status}).`);
        }
        return;
      }
      setSuccess(json?.message ?? "Thanks — we'll be in touch.");
      setForm(EMPTY);
      setErrors({});
    } catch {
      setTopError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-[24px] sm:rounded-[28px] p-7 sm:p-10 bg-[var(--leaf-soft)] border border-[var(--leaf)] text-left"
      >
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-[var(--leaf)] flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M4 9.5L7.5 13L14 6" stroke="#FFF8E8" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="eyebrow text-[var(--leaf)] mb-2">Application received</p>
            <h3 className="font-display text-[22px] sm:text-[26px] font-medium tracking-tight text-[var(--ink)] mb-2">
              Thanks — your submission is in.
            </h3>
            <p className="text-[14.5px] sm:text-[15px] text-[var(--text-soft)] leading-relaxed max-w-[520px]">
              {success}
            </p>
            <button
              type="button"
              onClick={() => setSuccess(null)}
              className="mt-5 text-[13.5px] font-medium text-[var(--leaf)] hover:underline"
            >
              Submit another application
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5 sm:gap-6">
      {topError && (
        <div role="alert" className="rounded-2xl bg-[#FBE9E7] border border-[var(--danger)] text-[var(--danger)] px-5 py-3.5 text-[14px]">
          {topError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
        <FormField label="Company name" htmlFor="vf-company" error={errors.companyName} required>
          <input
            id="vf-company"
            type="text"
            value={form.companyName}
            onChange={(e) => update("companyName", e.target.value)}
            placeholder="Acme Botanicals Co."
            required
            aria-invalid={Boolean(errors.companyName)}
            aria-describedby={errors.companyName ? "vf-company-err" : undefined}
            className={inputClass}
          />
        </FormField>

        <FormField label="Contact name" htmlFor="vf-contact" error={errors.contactName} required>
          <input
            id="vf-contact"
            type="text"
            value={form.contactName}
            onChange={(e) => update("contactName", e.target.value)}
            placeholder="Your full name"
            required
            aria-invalid={Boolean(errors.contactName)}
            aria-describedby={errors.contactName ? "vf-contact-err" : undefined}
            className={inputClass}
          />
        </FormField>

        <FormField label="Email" htmlFor="vf-email" error={errors.email} required>
          <input
            id="vf-email"
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="you@brand.com"
            required
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "vf-email-err" : undefined}
            className={inputClass}
          />
        </FormField>

        <FormField label="Phone (optional)" htmlFor="vf-phone" error={errors.phone}>
          <input
            id="vf-phone"
            type="tel"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="(555) 555-5555"
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={errors.phone ? "vf-phone-err" : undefined}
            className={inputClass}
          />
        </FormField>

        <FormField label="Website (optional)" htmlFor="vf-website" error={errors.website} className="sm:col-span-2">
          <input
            id="vf-website"
            type="url"
            value={form.website}
            onChange={(e) => update("website", e.target.value)}
            placeholder="https://yourbrand.com"
            aria-invalid={Boolean(errors.website)}
            aria-describedby={errors.website ? "vf-website-err" : undefined}
            className={inputClass}
          />
        </FormField>
      </div>

      <fieldset>
        <legend className="text-[13px] font-semibold text-[var(--ink)] mb-2">
          Product types <span className="text-[var(--danger)]" aria-hidden="true">*</span>
        </legend>
        <p className="text-[12.5px] text-[var(--muted)] mb-3">Pick all that apply.</p>
        <div className="flex flex-wrap gap-2">
          {PRODUCT_TYPES.map((t) => {
            const checked = form.productTypes.includes(t.slug);
            return (
              <label
                key={t.slug}
                className={
                  "inline-flex items-center gap-2 cursor-pointer rounded-full px-4 py-2 text-[13px] font-medium border transition-colors " +
                  (checked
                    ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
                    : "bg-[var(--surface)] text-[var(--ink)] border-[var(--border)] hover:border-[var(--leaf)]")
                }
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleProductType(t.slug)}
                  className="sr-only"
                />
                {t.label}
              </label>
            );
          })}
        </div>
        {errors.productTypes && (
          <p id="vf-types-err" role="alert" className="mt-2 text-[12.5px] text-[var(--danger)]">{errors.productTypes}</p>
        )}
      </fieldset>

      <fieldset>
        <legend className="text-[13px] font-semibold text-[var(--ink)] mb-2">
          Do you have current COA testing? <span className="text-[var(--danger)]" aria-hidden="true">*</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {(["yes", "no"] as const).map((v) => {
            const selected = form.hasCoa === v;
            return (
              <label
                key={v}
                className={
                  "inline-flex items-center gap-2 cursor-pointer rounded-full px-5 py-2.5 text-[13.5px] font-medium border transition-colors " +
                  (selected
                    ? "bg-[var(--leaf)] text-[var(--bg)] border-[var(--leaf)]"
                    : "bg-[var(--surface)] text-[var(--ink)] border-[var(--border)] hover:border-[var(--leaf)]")
                }
              >
                <input
                  type="radio"
                  name="hasCoa"
                  value={v}
                  checked={selected}
                  onChange={() => update("hasCoa", v)}
                  className="sr-only"
                />
                {v === "yes" ? "Yes" : "Not yet"}
              </label>
            );
          })}
        </div>
        {errors.hasCoa && (
          <p role="alert" className="mt-2 text-[12.5px] text-[var(--danger)]">{errors.hasCoa}</p>
        )}
      </fieldset>

      <div>
        <p className="text-[13px] font-semibold text-[var(--ink)] mb-2">
          Documents (optional)
        </p>
        <p className="text-[12.5px] text-[var(--muted)] mb-3">
          Drop your latest COA, W-9, or product spec sheets. PDF or image,
          up to 15 MB each. We&apos;ll request anything else we need
          during review.
        </p>
        {/*
          Server-side TODO: /api/leafmart/vendor-apply currently accepts
          JSON only. Once the route gains a multipart variant (or a
          paired /attachments endpoint), swap the local handler for
          `createFetchUploadHandler({ url: "/api/leafmart/vendor-apply/attachments" })`.
        */}
        <FileUpload
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          maxFiles={6}
          maxSizeMB={15}
          concurrency={2}
          label="Drop COA / tax documents"
          hint="PDF or image — up to 15 MB per file"
          onUpload={async (file, { onProgress }) => {
            for (let p = 0; p <= 100; p += 25) {
              onProgress?.(p);
              await new Promise((r) => setTimeout(r, 60));
            }
            return { id: `local-${file.name}`, name: file.name };
          }}
          onComplete={(items) => setDocuments(items)}
        />
        {documents.filter((d) => d.status === "uploaded").length > 0 && (
          <p className="mt-2 text-[12.5px] text-[var(--leaf)]">
            {documents.filter((d) => d.status === "uploaded").length} document
            {documents.filter((d) => d.status === "uploaded").length !== 1 ? "s" : ""}
            {" "}attached.
          </p>
        )}
      </div>

      <FormField label="Tell us about your products" htmlFor="vf-desc" error={errors.description} required>
        <textarea
          id="vf-desc"
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
          placeholder="What you make, who it's for, and why you think it belongs on the Leafmart shelf."
          rows={5}
          required
          aria-invalid={Boolean(errors.description)}
          aria-describedby={errors.description ? "vf-desc-err" : undefined}
          className={`${inputClass} resize-y min-h-[120px]`}
        />
      </FormField>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center rounded-full font-medium bg-[var(--ink)] text-[var(--bg)] hover:bg-[var(--leaf)] transition-colors px-6 sm:px-7 py-3.5 sm:py-4 text-[14.5px] sm:text-[15px] disabled:opacity-60 disabled:cursor-not-allowed w-full sm:w-auto"
        >
          {submitting ? (
            <>
              <span className="lm-pulse mr-2" aria-hidden="true">●</span>
              Submitting…
            </>
          ) : (
            <>Submit application →</>
          )}
        </button>
        <p className="text-[12.5px] text-[var(--muted)]">
          We review every submission within 5 business days.
        </p>
      </div>
    </form>
  );
}

function FormField({
  label,
  htmlFor,
  error,
  children,
  required,
  className = "",
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-[var(--ink)] mb-2">
        {label}{required && <span className="text-[var(--danger)] ml-1" aria-hidden="true">*</span>}
      </label>
      {children}
      {error && (
        <p id={`${htmlFor}-err`} role="alert" className="mt-1.5 text-[12.5px] text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
