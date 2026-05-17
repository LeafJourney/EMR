"use client";

import { useState } from "react";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function LeaflySyncAdminPage() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; syncedCount?: number; error?: string } | null>(null);

  async function handleManualSync() {
    setIsSyncing(true);
    setResult(null);

    try {
      const res = await fetch("/api/cron/leafly-sync", { method: "POST" });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ success: false, error: String(err) });
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <PageShell maxWidth="max-w-[800px]">
      <PageHeader
        eyebrow="Integrations"
        title="Leafly API Sync"
        description="Manage the synchronization of the Leafly Strain Database into the Verdant Apothecary EMR."
      />

      <Card tone="raised">
        <CardHeader>
          <CardTitle>Manual Synchronization</CardTitle>
          <CardDescription>
            This action will fetch the latest strains from the Leafly API, run them through the DeepSeek translation pipeline to generate clinical therapeutic tags, and upsert them into the database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Button onClick={handleManualSync} disabled={isSyncing}>
              {isSyncing ? "Syncing..." : "Trigger Manual Sync"}
            </Button>
            {isSyncing && <p className="text-sm text-text-muted animate-pulse">Running sync pipeline...</p>}
          </div>

          {result && (
            <div className={`p-4 rounded-md border ${result.success ? "bg-success/10 border-success/20" : "bg-danger/10 border-danger/20"}`}>
              {result.success ? (
                <div className="flex items-center gap-3">
                  <Badge tone="success">Success</Badge>
                  <p className="text-sm text-success">
                    Successfully synchronized {result.syncedCount} strains.
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Badge tone="danger">Failed</Badge>
                  <p className="text-sm text-danger">
                    Error: {result.error}
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
