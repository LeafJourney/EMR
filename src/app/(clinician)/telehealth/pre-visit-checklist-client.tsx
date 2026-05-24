"use client";

import { useCallback, useEffect, useState } from "react";
import { LeafSprig } from "@/components/ui/ornament";
import { Button } from "@/components/ui/button";

// EMR-598 — every bullet must map to a real probe the browser can run.
// Static "Use a private, quiet room" bullets are gone; they were never
// verifiable.
type ProbeState = "pending" | "pass" | "fail";

interface Probe {
  key: string;
  label: string;
  detail: string;
  state: ProbeState;
}

const INITIAL_PROBES: Probe[] = [
  {
    key: "camera",
    label: "Camera available",
    detail: "Checking…",
    state: "pending",
  },
  {
    key: "microphone",
    label: "Microphone available",
    detail: "Checking…",
    state: "pending",
  },
  {
    key: "network",
    label: "Internet reachable",
    detail: "Checking…",
    state: "pending",
  },
  {
    key: "webrtc",
    label: "Video calling supported in this browser",
    detail: "Checking…",
    state: "pending",
  },
];

/* ------------------------------------------------------------------ */
/*  Probe implementations                                              */
/* ------------------------------------------------------------------ */

async function probePermission(
  name: "camera" | "microphone",
): Promise<{ state: ProbeState; detail: string }> {
  if (typeof navigator === "undefined" || !navigator.permissions) {
    return { state: "fail", detail: "Permissions API unsupported" };
  }
  try {
    // `camera` and `microphone` are valid PermissionName values in the
    // Permissions API spec but aren't in the DOM lib's narrow union, so we
    // cast to keep TS happy without disabling the check site-wide.
    const status = await navigator.permissions.query({
      name: name as PermissionName,
    });
    if (status.state === "granted") {
      return { state: "pass", detail: "Permission granted" };
    }
    if (status.state === "denied") {
      return { state: "fail", detail: "Permission denied in browser settings" };
    }
    return { state: "fail", detail: "Not yet granted — allow on join" };
  } catch {
    return { state: "fail", detail: "Could not query permission" };
  }
}

async function probeNetwork(): Promise<{ state: ProbeState; detail: string }> {
  if (typeof navigator === "undefined") {
    return { state: "fail", detail: "Navigator unavailable" };
  }
  if (!navigator.onLine) {
    return { state: "fail", detail: "Browser reports offline" };
  }
  // Self-hosted favicon request — tiny, same-origin, cached. We don't trust
  // the response body; reaching the server at all is the signal.
  try {
    const res = await fetch("/favicon.ico", {
      method: "HEAD",
      cache: "no-store",
    });
    if (res.ok || res.status === 304) {
      return { state: "pass", detail: "Connection reachable" };
    }
    return { state: "fail", detail: `Origin replied ${res.status}` };
  } catch {
    return { state: "fail", detail: "Network probe failed" };
  }
}

function probeWebRTC(): { state: ProbeState; detail: string } {
  if (typeof window === "undefined") {
    return { state: "fail", detail: "No window" };
  }
  if (typeof window.RTCPeerConnection === "undefined") {
    return { state: "fail", detail: "Browser doesn't support WebRTC" };
  }
  return { state: "pass", detail: "RTCPeerConnection available" };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PreVisitChecklistClient() {
  const [probes, setProbes] = useState<Probe[]>(INITIAL_PROBES);
  const [running, setRunning] = useState(false);

  const runProbes = useCallback(async () => {
    setRunning(true);
    setProbes(INITIAL_PROBES);

    const [camera, microphone, network] = await Promise.all([
      probePermission("camera"),
      probePermission("microphone"),
      probeNetwork(),
    ]);
    const webrtc = probeWebRTC();

    setProbes([
      { key: "camera", label: "Camera available", ...camera },
      { key: "microphone", label: "Microphone available", ...microphone },
      { key: "network", label: "Internet reachable", ...network },
      {
        key: "webrtc",
        label: "Video calling supported in this browser",
        ...webrtc,
      },
    ]);
    setRunning(false);
  }, []);

  useEffect(() => {
    void runProbes();
  }, [runProbes]);

  return (
    <ul className="space-y-2.5 text-sm">
      {probes.map((p) => (
        <li key={p.key} className="flex items-start gap-2.5">
          <LeafIndicator state={p.state} />
          <div className="min-w-0 flex-1">
            <p className={textClass(p.state)}>{p.label}</p>
            <p className="text-xs text-text-subtle mt-0.5">{p.detail}</p>
          </div>
        </li>
      ))}
      <li className="pt-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => void runProbes()}
          disabled={running}
        >
          {running ? "Re-checking…" : "Re-run checks"}
        </Button>
      </li>
    </ul>
  );
}

function LeafIndicator({ state }: { state: ProbeState }) {
  const color =
    state === "pass"
      ? "text-success"
      : state === "fail"
        ? "text-[color:var(--leaf-dry,#8b5a2b)]"
        : "text-text-subtle";

  const stateLabel =
    state === "pass" ? "passed" : state === "fail" ? "failed" : "checking";

  return (
    <span
      aria-label={stateLabel}
      className={[
        "mt-0.5 shrink-0 transition-transform duration-300",
        color,
        state === "fail" ? "opacity-80 rotate-12" : "",
        state === "pending" ? "animate-pulse" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <LeafSprig size={14} className="text-current" />
    </span>
  );
}

function textClass(state: ProbeState): string {
  if (state === "pass") return "text-success font-medium";
  if (state === "fail") return "text-danger font-medium";
  return "text-text-muted";
}
