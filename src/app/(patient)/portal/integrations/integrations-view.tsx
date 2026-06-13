"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { connectDevice, disconnectDevice, syncDevice } from "./actions";
import type { DeviceConnectionState } from "./providers";

interface Integration {
  id: string;
  name: string;
  icon: string;
  blurb: string;
  dataTypes: string[];
  available: boolean;
}

const INTEGRATIONS: Integration[] = [
  {
    id: "apple-health",
    name: "Apple Health",
    icon: "🍎",
    blurb: "Sync steps, sleep, heart rate, and mindfulness minutes from your iPhone.",
    dataTypes: ["Steps", "Sleep", "Heart rate", "Mindful minutes", "Workouts"],
    available: true,
  },
  {
    id: "fitbit",
    name: "Fitbit",
    icon: "⌚",
    blurb: "Pull activity, sleep stages, and resting heart rate from your Fitbit device.",
    dataTypes: ["Steps", "Sleep stages", "Resting HR", "Active zone minutes"],
    available: true,
  },
  {
    id: "oura",
    name: "Oura Ring",
    icon: "💍",
    blurb: "Readiness scores, sleep quality, HRV, and body temperature trends.",
    dataTypes: ["Sleep quality", "HRV", "Readiness", "Body temperature"],
    available: true,
  },
  {
    id: "garmin",
    name: "Garmin",
    icon: "🏃",
    blurb: "Training load, stress tracking, and detailed activity metrics.",
    dataTypes: ["Training load", "Stress", "Body battery", "VO2 max"],
    available: true,
  },
  {
    id: "dexcom",
    name: "Dexcom",
    icon: "📉",
    blurb: "Continuous glucose monitoring and time-in-range tracking.",
    dataTypes: ["EGV", "Time in range", "Average glucose"],
    available: true,
  },
  {
    id: "libre",
    name: "FreeStyle Libre",
    icon: "🩸",
    blurb: "Continuous glucose trends and critical event tracking.",
    dataTypes: ["Glucose levels", "Hyper/Hypo alerts", "Time in range"],
    available: true,
  },
  {
    id: "whoop",
    name: "Whoop",
    icon: "⚡",
    blurb: "Strain, recovery, and sleep performance tracking.",
    dataTypes: ["Strain", "Recovery", "Sleep performance", "HRV"],
    available: true,
  },
  {
    id: "medtronic",
    name: "Medtronic Guardian",
    icon: "🛡️",
    blurb: "Advanced sensor glucose tracking and clinical alerts.",
    dataTypes: ["Sensor Glucose", "Rate of Change", "Time in range"],
    available: true,
  },
  {
    id: "eversense",
    name: "Eversense",
    icon: "🧬",
    blurb: "Implantable CGM with estimated A1C and trend arrows.",
    dataTypes: ["Interstitial Glucose", "eA1C", "Trend Arrows"],
    available: true,
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

interface IntegrationsViewProps {
  initialStates: Record<string, DeviceConnectionState>;
}

export function IntegrationsView({ initialStates }: IntegrationsViewProps) {
  const [states, setStates] = useState<Record<string, DeviceConnectionState>>(
    initialStates ?? {},
  );
  // Per-card pending flag so one card's spinner doesn't block the others.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

  const stateFor = (id: string) => states[id] ?? DISCONNECTED;

  const run = (
    id: string,
    action: (provider: string) => Promise<
      | { ok: true; state: DeviceConnectionState }
      | { ok: false; error: string }
    >,
  ) => {
    setPending((p) => ({ ...p, [id]: true }));
    startTransition(async () => {
      try {
        const result = await action(id);
        setStates((prev) => ({
          ...prev,
          [id]: result.ok
            ? result.state
            : { ...stateFor(id), error: result.error },
        }));
      } finally {
        setPending((p) => ({ ...p, [id]: false }));
      }
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {INTEGRATIONS.map((integration) => {
        const state = stateFor(integration.id);
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
                {!integration.available ? (
                  <Badge tone="neutral">Coming soon</Badge>
                ) : state.connected ? (
                  <Badge tone="success">Connected</Badge>
                ) : (
                  <Badge tone="neutral">Not connected</Badge>
                )}
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
                {integration.available ? (
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
                ) : (
                  <Button variant="secondary" size="sm" disabled>
                    Coming soon
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
