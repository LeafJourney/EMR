"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { triggerManualSyncAction } from "./actions";

export default function SyncAdminPage() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function handleSync() {
    startTransition(async () => {
      const result = await triggerManualSyncAction();
      if (result.ok) {
        setMessage(result.message!);
      } else {
        setMessage("Error: " + result.error);
      }
    });
  }

  return (
    <div className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Leafly Integration Sync</h1>
      <p className="text-text-muted mb-6">Manually trigger a sync from Leafly's B2B API to our clinical Chemovar database.</p>
      
      <Button onClick={handleSync} disabled={isPending}>
        {isPending ? "Syncing..." : "Trigger Manual Sync"}
      </Button>

      {message && (
        <div className="mt-4 p-4 border rounded bg-surface-muted text-sm">
          {message}
        </div>
      )}
    </div>
  );
}
