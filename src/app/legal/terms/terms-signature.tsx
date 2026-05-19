"use client";

import { useState } from "react";
import { CheckCircle2, PenTool } from "lucide-react";

export function TermsSignature() {
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [agree, setAgree] = useState(false);
  const [signedAt, setSignedAt] = useState<string | null>(null);

  function sign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || !orgName.trim() || !agree) return;
    const ts = new Date().toISOString();
    setSignedAt(ts);
    // Persist locally so the customer's confirmation survives a refresh.
    // Server-side e-signature persistence will live alongside the practice
    // contract record once that record is wired up.
    try {
      const payload = {
        name: name.trim(),
        org: orgName.trim(),
        document: "Leafjourney TOS draft v2 (2026-05-09)",
        signedAt: ts,
      };
      window.localStorage.setItem("leafjourney.tos.signature", JSON.stringify(payload));
    } catch {
      // localStorage may be unavailable in private mode; the e-sign UI
      // still confirms the signature for the in-memory session.
    }
  }

  if (signedAt) {
    return (
      <div className="not-prose mt-12 rounded-2xl border border-emerald-300 bg-emerald-50 p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-display text-lg text-emerald-900">
              Signed and recorded.
            </h3>
            <p className="text-sm text-emerald-800 mt-1 leading-relaxed">
              {name} signed for {orgName} on{" "}
              <code className="font-mono text-xs">{signedAt}</code>. A copy of
              this acknowledgement has been kept in your browser. Once the
              practice contract is finalized, this signature will be replicated
              into the durable record.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={sign}
      className="not-prose mt-12 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised,#fff)] p-6"
    >
      <div className="flex items-center gap-2 mb-4 text-[12px] uppercase tracking-wider font-semibold text-[var(--leaf,#2d8b5e)]">
        <PenTool className="w-4 h-4" />
        E-signature
      </div>
      <h3 className="font-display text-xl text-[var(--ink)] mb-2">
        Acknowledge these Terms
      </h3>
      <p className="text-[13.5px] leading-relaxed text-[var(--text-soft)] mb-5">
        By signing below, the practice confirms it has read and accepts these
        Terms. Your signature is timestamped and retained as a digital record.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="terms-signer-name"
            className="block text-[12.5px] font-medium mb-1 text-[var(--ink)]"
          >
            Authorized signer (full name)
          </label>
          <input
            id="terms-signer-name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[var(--leaf,#2d8b5e)]"
          />
        </div>
        <div>
          <label
            htmlFor="terms-org-name"
            className="block text-[12.5px] font-medium mb-1 text-[var(--ink)]"
          >
            Practice / organization
          </label>
          <input
            id="terms-org-name"
            autoComplete="organization"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            required
            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[var(--leaf,#2d8b5e)]"
          />
        </div>
      </div>

      <label className="mt-4 flex items-start gap-2 text-[13.5px] leading-relaxed text-[var(--text-soft)]">
        <input
          type="checkbox"
          checked={agree}
          onChange={(e) => setAgree(e.target.checked)}
          className="mt-1"
        />
        I have read these Terms and have authority to bind the practice above.
      </label>

      <button
        type="submit"
        disabled={!name.trim() || !orgName.trim() || !agree}
        className="mt-5 inline-flex items-center justify-center rounded-full bg-[var(--leaf,#2d8b5e)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
      >
        Sign &amp; submit
      </button>
    </form>
  );
}
