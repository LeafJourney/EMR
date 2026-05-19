"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { triggerGarminSync, getGarminSyncStatus } from "./actions";

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

interface ConnectionState {
  connected: boolean;
  lastSync: string | null;
  syncing?: boolean;
}

export function IntegrationsView() {
  const [states, setStates] = useState<Record<string, ConnectionState>>({
    "apple-health": { connected: true, lastSync: "2026-04-16 08:15" },
    fitbit: { connected: false, lastSync: null },
    oura: { connected: false, lastSync: null },
    garmin: { connected: false, lastSync: null },
    dexcom: { connected: false, lastSync: null },
    libre: { connected: false, lastSync: null },
    whoop: { connected: false, lastSync: null },
    medtronic: { connected: false, lastSync: null },
    eversense: { connected: false, lastSync: null },
  });

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Load initial Garmin state
  useEffect(() => {
    getGarminSyncStatus().then((status) => {
      setStates((prev) => ({
        ...prev,
        garmin: {
          connected: status.hasData,
          lastSync: status.lastSync ? new Date(status.lastSync).toISOString().replace("T", " ").slice(0, 16) : null,
        },
      }));
    });
  }, []);

  const handleGarminSync = async () => {
    setStates((prev) => ({
      ...prev,
      garmin: { ...prev.garmin, syncing: true },
    }));

    try {
      const res = await triggerGarminSync();
      setStates((prev) => ({
        ...prev,
        garmin: {
          connected: true,
          lastSync: new Date(res.syncTime).toISOString().replace("T", " ").slice(0, 16),
          syncing: false,
        },
      }));
      showToast("Garmin synced successfully");
    } catch (error) {
      console.error(error);
      showToast("Failed to sync Garmin data");
      setStates((prev) => ({
        ...prev,
        garmin: { ...prev.garmin, syncing: false },
      }));
    }
  };

  const toggle = (id: string) => {
    if (id === "garmin" && !states.garmin.connected) {
      window.location.href = "/api/integrations/garmin/auth";
      return;
    }

    setStates((prev) => ({
      ...prev,
      [id]: {
        connected: !prev[id].connected,
        lastSync: !prev[id].connected ? new Date().toISOString().replace("T", " ").slice(0, 16) : null,
      },
    }));
  };

  const handleManualSync = (id: string) => {
    if (id === "garmin") {
      handleGarminSync();
    } else {
      setStates((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          lastSync: new Date().toISOString().replace("T", " ").slice(0, 16),
        },
      }));
      showToast("Synced successfully");
    }
  };

  return (
    <div className="relative">
      {toastMsg && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-text text-surface px-4 py-2 rounded shadow-lg z-50 text-sm">
          {toastMsg}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {INTEGRATIONS.map((integration) => {
        const state = states[integration.id] || { connected: false, lastSync: null };
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

              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div className="text-xs text-text-subtle">
                  {state.lastSync ? `Last sync: ${state.lastSync}` : "Never synced"}
                </div>
                <div className="flex gap-2">
                  {state.connected && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleManualSync(integration.id)}
                      disabled={state.syncing}
                    >
                      {state.syncing ? "Syncing..." : "Sync Now"}
                    </Button>
                  )}
                  {integration.available ? (
                    <Button
                      variant={state.connected ? "secondary" : "primary"}
                      size="sm"
                      onClick={() => toggle(integration.id)}
                      disabled={state.syncing}
                    >
                      {state.connected ? "Disconnect" : `Connect ${integration.name}`}
                    </Button>
                  ) : (
                    <Button variant="secondary" size="sm" disabled>
                      Coming soon
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
      </div>
    </div>
  );
}

