"use client";

import { useState } from "react";
import { Tabs, TabList, Trigger, Panel } from "@/components/ui/tabs";
import { ModelConfigPanel } from "./model-config";
import { AgentFleetPanel } from "./agent-fleet";

type Tab = "default" | "fleet";

const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: "default", label: "Practice default", hint: "One model that powers every agent unless overridden." },
  { key: "fleet", label: "Agent fleet", hint: "Per-agent model overrides, enable / disable, fleet cost." },
];

export function AiConfigTabs({ initialAiConfig }: { initialAiConfig: any }) {
  const [tab, setTab] = useState<Tab>("default");
  const active = TABS.find((t) => t.key === tab)!;

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} urlParam="section">
      <TabList aria-label="AI configuration sections" className="mb-5">
        {TABS.map((t) => (
          <Trigger key={t.key} value={t.key}>
            {t.label}
          </Trigger>
        ))}
      </TabList>
      <p className="text-xs text-text-subtle mb-5">{active.hint}</p>
      {/* Each panel renders its own state-heavy component; mark as lazy so
          we don't double-fetch on every console open. */}
      <Panel value="default" lazy>
        <ModelConfigPanel initialAiConfig={initialAiConfig} />
      </Panel>
      <Panel value="fleet" lazy>
        <AgentFleetPanel initialAiConfig={initialAiConfig} />
      </Panel>
    </Tabs>
  );
}

