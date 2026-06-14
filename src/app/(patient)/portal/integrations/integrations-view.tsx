"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { connectDevice, disconnectDevice, syncDevice } from "./actions";
import type {
  DeviceActionResult,
  DeviceConnectionState,
  ProviderAvailability,
} from "./providers";

interface Integration {
  id: string;
  name: string;
  icon: string;
  blurb: string;
  dataTypes: string[];
}

const INTEGRATIONS: Integration[] = [
  {
    id: "apple-health",
    name: "Apple Health",
    icon: "🍎",
    blurb: "Sync steps, sleep, heart rate, and mindfulness minutes from your iPhone.",
    dataTypes: ["Steps", "Sleep", "Heart rate", "Mindful minutes", "Workouts"],
  },
  {
    id: "android",
    name: "Android Health Connect",
    icon: "🤖",
    blurb: "Sync steps, sleep, heart rate, and HRV from Android Health Connect.",
    dataTypes: ["Steps", "Sleep", "Heart rate", "HRV"],
  },
  {
    id: "fitbit",
    name: "Fitbit",
    icon: "⌚",
    blurb: "Pull activity, sleep stages, and resting heart rate from your Fitbit device.",
    dataTypes: ["Steps", "Sleep stages", "Resting HR", "Active zone minutes"],
  },
  {
    id: "oura",
    name: "Oura Ring",
    icon: "💍",
    blurb: "Readiness scores, sleep quality, HRV, and body temperature trends.",
    dataTypes: ["Sleep quality", "HRV", "Readiness", "Body temperature"],
  },
  {
    id: "garmin",
    name: "Garmin",
    icon: "🏃",
    blurb: "Training load, stress tracking, and detailed activity metrics.",
    dataTypes: ["Training load", "Stress", "Body battery", "VO2 max"],
  },
  {
    id: "dexcom",
    name: "Dexcom",
    icon: "📉",
    blurb: "Continuous glucose monitoring and time-in-range tracking.",
    dataTypes: ["EGV", "Time in range", "Average glucose"],
  },
  {
    id: "libre",
    name: "FreeStyle Libre",
    icon: "🩸",
    blurb: "Continuous glucose trends and critical event tracking.",
    dataTypes: ["Glucose levels", "Hyper/Hypo alerts", "Time in range"],
  },
  {
    id: "whoop",
    name: "Whoop",
    icon: "⚡",
    blurb: "Strain, recovery, and sleep performance tracking.",
    dataTypes: ["Strain", "Recovery", "Sleep performance", "HRV"],
  },
  {
    id: "medtronic",
    name: "Medtronic Guardian",
    icon: "🛡️",
    blurb: "Advanced sensor glucose tracking and clinical alerts.",
    dataTypes: ["Sensor Glucose", "Rate of Change", "Time in range"],
  },
  {
    id: "eversense",
    name: "Eversense",
    icon: "🧬",
    blurb: "Implantable CGM with estimated A1C and trend arrows.",
    dataTypes: ["Interstitial Glucose", "eA1C", "Trend Arrows"],
  },
];

const DISCONNECTED: DeviceConnectionState = {
  connected: false,
  lastSync: null,
  error: null,
};

function formatSync(iso: string | null): string {
  if (!iso) return "Never synced";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never synced";
  return `Last sync: ${d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

const DEFAULT_AVAILABILITY: ProviderAvailability = {
  available: false,
  mode: null,
  connectKind: null,
  reason: "not_implemented",
};

const NAME_BY_ID: Record<string, string> = Object.fromEntries(
  INTEGRATIONS.map((i) => [i.id, i.name]),
);

type Banner = { tone: "success" | "danger"; text: string };

/** Banner copy for the connect-callback status an OAuth route redirects with. */
function bannerFor(slug: string, status: string): Banner | null {
  const name = NAME_BY_ID[slug] ?? "Your device";
  switch (status) {
    case "connected":
      return { tone: "success", text: `${name} connected — your recent data is syncing in.` };
    case "error":
      return { tone: "danger", text: `We couldn't finish connecting ${name}. Please try again.` };
    case "unavailable":
      return { tone: "danger", text: `${name} isn't available to connect right now.` };
    default:
      return null;
  }
}

interface IntegrationsViewProps {
  initialStates: Record<string, DeviceConnectionState>;
  availability: Record<string, ProviderAvailability>;
}

export function IntegrationsView({
  initialStates,
  availability,
}: IntegrationsViewProps) {
  const [states, setStates] = useState<Record<string, DeviceConnectionState>>(
    initialStates ?? {},
  );
  // Per-card pending flag so one card's spinner doesn't block the others.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

  const searchParams = useSearchParams();
  // Generic OAuth2 routes redirect with ?integration=<slug>&status=<status>;
  // Garmin's routes use the legacy ?garmin=<status>.
  const integrationParam = searchParams.get("integration");
  const statusParam = searchParams.get("status");
  const garminStatus = searchParams.get("garmin");
  const [banner, setBanner] = useState<Banner | null>(null);
  useEffect(() => {
    const b =
      integrationParam && statusParam
        ? bannerFor(integrationParam, statusParam)
        : garminStatus
          ? bannerFor("garmin", garminStatus)
          : null;
    if (b) {
      setBanner(b);
      // Strip the query params so a refresh doesn't re-show the banner.
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [integrationParam, statusParam, garminStatus]);

  const stateFor = (id: string) => states[id] ?? DISCONNECTED;
  const availFor = (id: string) => availability[id] ?? DEFAULT_AVAILABILITY;

  const run = (
    id: string,
    action: (provider: string) => Promise<DeviceActionResult>,
  ) => {
    setPending((p) => ({ ...p, [id]: true }));
    startTransition(async () => {
      try {
        const result = await action(id);
        // Live OAuth connect: hand off to the provider's consent screen.
        if (result.ok && "redirect" in result) {
          window.location.href = result.redirect;
          return;
        }
        setStates((prev) => ({
          ...prev,
          [id]:
            result.ok && "state" in result
              ? result.state
              : { ...stateFor(id), error: result.ok ? null : result.error },
        }));
      } finally {
        setPending((p) => ({ ...p, [id]: false }));
      }
    });
  };

  return (
    <div className="space-y-5">
      {banner ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            banner.tone === "success"
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
          role="status"
        >
          {banner.text}
        </div>
      ) : null}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {INTEGRATIONS.map((integration) => {
        const state = stateFor(integration.id);
        const avail = availFor(integration.id);
        const available = avail.available;
        const isSimulated = avail.mode === "mock";
        // Apple Health / Android Health Connect: on-device, connected from the
        // mobile app — no web "Connect" handshake exists.
        const isMobile = avail.connectKind === "mobile-app";
        const busy = !!pending[integration.id];
        return (
          <Card key={integration.id} tone="raised">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="h-12 w-12 rounded-xl bg-surface-muted border border-border flex items-center justify-center text-2xl">
                    {integration.icon}
                  </div>
                  <div>
                    <CardTitle>{integration.name}</CardTitle>
                    <CardDescription>{integration.blurb}</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {isSimulated && available ? (
                    <Badge tone="warning">Demo data</Badge>
                  ) : null}
                  {!available ? (
                    <Badge tone="neutral">Coming soon</Badge>
                  ) : state.connected ? (
                    <Badge tone="success">Connected</Badge>
                  ) : isMobile ? (
                    <Badge tone="info">In the app</Badge>
                  ) : (
                    <Badge tone="neutral">Not connected</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
                  Data syncs
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {integration.dataTypes.map((dt) => (
                    <Badge key={dt} tone="neutral">
                      {dt}
                    </Badge>
                  ))}
                </div>
              </div>

              {state.error ? (
                <div className="text-xs text-danger">{state.error}</div>
              ) : null}

              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div className="text-xs text-text-subtle">
                  {busy ? "Syncing…" : formatSync(state.lastSync)}
                </div>
                {!available ? (
                  <Button variant="secondary" size="sm" disabled>
                    Coming soon
                  </Button>
                ) : isMobile ? (
                  // On-device providers connect from the mobile app.
                  state.connected ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => run(integration.id, disconnectDevice)}
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <span className="text-xs text-text-subtle">
                      Set up in the LeafJourney app
                    </span>
                  )
                ) : (
                  <div className="flex items-center gap-2">
                    {state.connected ? (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() => run(integration.id, syncDevice)}
                        >
                          Sync now
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() => run(integration.id, disconnectDevice)}
                        >
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={busy}
                        onClick={() => run(integration.id, connectDevice)}
                      >
                        Connect {integration.name}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
      </div>
    </div>
  );
}
