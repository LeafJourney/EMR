"use client";

import * as React from "react";
import { Phone, ShieldAlert, Activity, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/ui/ornament";

// EMR-383 — Apple-style emergency safety alert (patient portal, web)
//
// A full-screen "Are you OK?" prompt with a 15s countdown that auto-dials 911
// unless the patient cancels. The prompt can be opened three ways:
//   1. the "Test the emergency alert" button (explicit demo)
//   2. the "Simulate a detected fall" button (mimics automatic detection)
//   3. a best-effort DeviceMotion listener (when fall detection is enabled)
//
// Everything that touches a browser API is feature-detected and guarded so it
// never runs during SSR. The web build cannot force speakerphone or detect a
// car crash — that requires the native app's platform emergency APIs — so this
// surface is the manual + best-effort motion trigger plus one-tap 911 dial.

const COUNTDOWN_START = 15; // seconds before auto-dial
const IMPACT_THRESHOLD = 30; // m/s^2 acceleration magnitude that looks like a fall

export function SafetyAlertClient() {
  const [open, setOpen] = React.useState(false);
  const [secondsLeft, setSecondsLeft] = React.useState(COUNTDOWN_START);
  const [detectionEnabled, setDetectionEnabled] = React.useState(false);
  const [detectionNote, setDetectionNote] = React.useState<string | null>(null);

  const okButtonRef = React.useRef<HTMLButtonElement | null>(null);
  // Keep the open flag readable from inside the motion listener without
  // re-subscribing the listener every render.
  const openRef = React.useRef(open);
  React.useEffect(() => {
    openRef.current = open;
  }, [open]);

  const openPrompt = React.useCallback(() => {
    setSecondsLeft(COUNTDOWN_START);
    setOpen(true);
  }, []);

  const cancel = React.useCallback(() => {
    setOpen(false);
    setSecondsLeft(COUNTDOWN_START);
  }, []);

  const callNow = React.useCallback(() => {
    if (typeof window !== "undefined") {
      window.location.href = "tel:911";
    }
    setOpen(false);
  }, []);

  // Countdown — ticks once per second while the prompt is open; auto-dials at 0.
  React.useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;

    const id = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          // Defer the navigation out of the state updater.
          window.setTimeout(() => callNow(), 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [open, callNow]);

  // Move focus to "I'm OK" when the prompt opens; Escape cancels.
  React.useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;

    okButtonRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, cancel]);

  // Best-effort fall detection via DeviceMotion. Subscribes only while enabled.
  React.useEffect(() => {
    if (!detectionEnabled) return;
    if (typeof window === "undefined") return;
    if (typeof DeviceMotionEvent === "undefined") {
      setDetectionNote("This device doesn't expose motion sensors in the browser.");
      setDetectionEnabled(false);
      return;
    }

    let cancelled = false;

    const onMotion = (event: DeviceMotionEvent) => {
      if (openRef.current) return; // already prompting
      const a = event.accelerationIncludingGravity;
      if (!a) return;
      const { x, y, z } = a;
      if (x == null || y == null || z == null) return;
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      if (magnitude > IMPACT_THRESHOLD) {
        openPrompt();
      }
    };

    const subscribe = () => {
      if (cancelled) return;
      window.addEventListener("devicemotion", onMotion);
      setDetectionNote("Fall detection is active on this device.");
    };

    // iOS 13+ gates motion behind a permission prompt that must be requested
    // from a user gesture (the toggle click that flipped this on).
    const reqPerm = (DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    }).requestPermission;

    if (typeof reqPerm === "function") {
      reqPerm()
        .then((state) => {
          if (cancelled) return;
          if (state === "granted") {
            subscribe();
          } else {
            setDetectionNote("Motion permission was denied. The manual buttons still work.");
            setDetectionEnabled(false);
          }
        })
        .catch(() => {
          if (cancelled) return;
          setDetectionNote("Couldn't start motion sensors. The manual buttons still work.");
          setDetectionEnabled(false);
        });
    } else {
      subscribe();
    }

    return () => {
      cancelled = true;
      window.removeEventListener("devicemotion", onMotion);
    };
  }, [detectionEnabled, openPrompt]);

  return (
    <>
      {/* Settings card */}
      <Card tone="raised" className="mb-8">
        <CardContent className="py-6">
          <Eyebrow className="mb-3">Try it out</Eyebrow>
          <p className="text-sm text-text-muted leading-relaxed mb-5 max-w-xl">
            Run the alert yourself so you know exactly what it looks like, or
            turn on best-effort fall detection for this device. Nothing dials
            unless the countdown finishes or you tap Call&nbsp;911.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="primary"
              size="lg"
              leadingIcon={<ShieldAlert className="h-5 w-5" aria-hidden="true" />}
              onClick={openPrompt}
              className="w-full sm:w-auto"
            >
              Test the emergency alert
            </Button>
            <Button
              variant="secondary"
              size="lg"
              leadingIcon={<Activity className="h-5 w-5" aria-hidden="true" />}
              onClick={openPrompt}
              className="w-full sm:w-auto"
            >
              Simulate a detected fall
            </Button>
          </div>

          {/* Fall-detection toggle */}
          <div className="mt-6 flex items-start justify-between gap-4 rounded-2xl border border-border bg-bg px-4 py-4">
            <div className="min-w-0">
              <p className="font-medium text-text">Enable fall detection on this device</p>
              <p className="text-sm text-text-muted mt-1 leading-relaxed">
                Listens for a hard impact using your device&apos;s motion sensors
                while this page is open. Best-effort only.
              </p>
              {detectionNote && (
                <p className="text-[13px] text-text-subtle mt-2">{detectionNote}</p>
              )}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={detectionEnabled}
              aria-label="Enable fall detection on this device"
              onClick={() => {
                setDetectionNote(null);
                setDetectionEnabled((v) => !v);
              }}
              className={[
                "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full",
                "transition-colors duration-200 ease-smooth",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                detectionEnabled ? "bg-accent" : "bg-surface-muted border border-border-strong/60",
              ].join(" ")}
            >
              <span
                className={[
                  "inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-smooth",
                  detectionEnabled ? "translate-x-6" : "translate-x-1",
                ].join(" ")}
              />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Full-screen alert overlay */}
      {open && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="safety-alert-heading"
          aria-describedby="safety-alert-countdown"
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-danger px-6 py-10 text-white"
        >
          <button
            type="button"
            onClick={cancel}
            aria-label="Dismiss alert"
            className="absolute top-5 right-5 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>

          <div className="w-full max-w-md text-center">
            <ShieldAlert className="mx-auto h-14 w-14 mb-6 opacity-90" aria-hidden="true" />
            <h2
              id="safety-alert-heading"
              className="font-display text-4xl sm:text-5xl tracking-tight leading-[1.05]"
            >
              Are you OK?
            </h2>
            <p className="text-base text-white/85 mt-4 leading-relaxed">
              It looks like you may have had a fall or hard impact.
            </p>

            <p
              id="safety-alert-countdown"
              aria-live="assertive"
              className="mt-7 text-2xl font-display tabular-nums"
            >
              Calling 911 in {secondsLeft}s
            </p>

            <div className="mt-8 flex flex-col gap-4">
              <a
                href="tel:911"
                onClick={() => setOpen(false)}
                className="flex min-h-[76px] w-full items-center justify-center gap-3 rounded-2xl bg-white text-2xl font-semibold text-danger shadow-lg transition-transform duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
              >
                <Phone className="h-7 w-7" aria-hidden="true" />
                Call 911
              </a>

              <button
                type="button"
                ref={okButtonRef}
                onClick={cancel}
                className="flex min-h-[68px] w-full items-center justify-center rounded-2xl border-2 border-white/70 bg-transparent text-xl font-medium text-white transition-colors duration-150 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
              >
                I&apos;m OK
              </button>
            </div>

            <p className="mt-6 text-sm text-white/75">
              Calling will use your phone&apos;s dialer.
            </p>
          </div>
        </div>
      )}

      {/* Capability explainer — lives on the page, never inside the overlay */}
      <Card tone="ambient">
        <CardContent className="py-6">
          <div className="flex items-start gap-3">
            <Badge tone="info" className="mt-0.5">
              Web version
            </Badge>
          </div>
          <p className="text-sm text-text-muted leading-relaxed mt-3">
            Full crash detection and automatic speakerphone dialing require the{" "}
            <span className="font-medium text-text">LeafJourney native iOS / Android app</span>,
            which uses Apple and Google&apos;s platform emergency APIs. This web
            version can&apos;t force speakerphone or reliably detect a car crash,
            so it provides the manual alert, a best-effort motion trigger, and a
            one-tap 911 dial instead.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
