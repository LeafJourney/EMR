"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "leafjourney-cookie-consent";

export function CookieConsent() {
  const [show, setShow] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // SSR safety: localStorage is only on the client.
    if (typeof window === "undefined") return;

    let consent: string | null = null;
    try {
      consent = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Some browsers (private mode, restrictive ITP) throw on access.
      // Treat as "not consented yet" rather than silently swallowing.
      consent = null;
    }

    if (consent) return;

    const timer = setTimeout(() => setShow(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  const setConsent = (value: "accepted" | "declined") => {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // If we can't persist, at least dismiss the banner for this
      // session so the user isn't stuck looking at it.
    }
    setShow(false);
  };

  // The Leafnerd FHIR-intelligence SPA is a full-bleed, self-contained surface
  // (often shown in live demos) — keep the global cookie banner off it.
  if (pathname?.startsWith("/leafnerd")) return null;

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pointer-events-none">
      <div className="max-w-4xl mx-auto pointer-events-auto bg-[var(--surface)] border border-[var(--border)] shadow-2xl rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6 animate-in slide-in-from-bottom-10 fade-in duration-500">
        <div className="flex-1">
          <h3 className="font-display text-lg font-medium text-text mb-1">
            We value your privacy
          </h3>
          <p className="text-sm text-text-muted leading-relaxed">
            We use cookies to enhance your browsing experience, serve
            personalized content, and analyze our traffic. By clicking
            &quot;Accept All&quot;, you consent to our use of cookies as
            outlined in our Privacy Policy.
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
          <Button
            variant="secondary"
            onClick={() => setConsent("declined")}
            className="w-full sm:w-auto"
          >
            Decline
          </Button>
          <Button
            onClick={() => setConsent("accepted")}
            className="w-full sm:w-auto"
          >
            Accept All
          </Button>
        </div>
      </div>
    </div>
  );
}
