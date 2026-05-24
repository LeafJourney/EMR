"use client";

// ---------------------------------------------------------------------------
// EMR-308 — Share dialog
// ---------------------------------------------------------------------------
// iOS-style sheet that previews the leaf-art share card and lists each
// platform target. Each click POSTs an analytics event to /api/share and
// then opens the platform deep link in a new tab. Native Web Share is
// preferred when available (mobile).
//
// Migrated to the canonical `<Dialog>` primitive (ux/modal-consistency-sweep)
// for unified backdrop, focus trap, and close affordance.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Check } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";
import { SHARE_TARGETS } from "./share-targets";
import { buildLeafArtSvg } from "./leaf-art";
import type { SharePayload, ShareTargetId } from "./types";

interface ShareDialogProps {
  payload: SharePayload;
  onClose: () => void;
}

export function ShareDialog({ payload, onClose }: ShareDialogProps) {
  const [copied, setCopied] = useState(false);

  const svg = buildLeafArtSvg({
    seed: payload.url,
    title: payload.title,
  });
  const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

  async function track(target: ShareTargetId) {
    // Fire-and-forget — never block the share itself.
    try {
      await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          source: payload.source,
          url: payload.url,
        }),
      });
    } catch {
      /* swallow */
    }
  }

  async function handleClick(targetId: ShareTargetId) {
    void track(targetId);
    if (targetId === "copy-link") {
      try {
        await navigator.clipboard.writeText(payload.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        /* clipboard blocked — show the URL inline as a fallback */
      }
      return;
    }
    if (targetId === "native") {
      const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
      if (nav.share) {
        try {
          await nav.share({
            title: payload.title,
            text: payload.description ?? payload.title,
            url: payload.url,
          });
        } catch {
          /* user cancelled */
        }
      }
      return;
    }
    const target = SHARE_TARGETS.find((t) => t.id === targetId);
    const url = target?.buildUrl(payload);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        className={cn(
          "max-w-[480px] bg-white p-6 rounded-3xl",
        )}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-text-muted font-bold mb-1">
              Share
            </p>
            <DialogTitle className="font-display text-xl text-text">
              {payload.title}
            </DialogTitle>
          </div>
          {/* Dialog primitive ships an absolute-positioned X — keep the spot
              clear so the two affordances don't collide. */}
        </div>

        {/* Leaf-art preview */}
        <img
          src={dataUrl}
          alt=""
          className="w-full aspect-[1200/630] rounded-2xl mb-5 border border-slate-100"
        />

        {/* Targets grid */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {SHARE_TARGETS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleClick(t.id)}
              className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <span className="h-11 w-11 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-bold">
                {t.id === "copy-link" && copied ? (
                  <Check className="w-4 h-4 text-accent" />
                ) : (
                  t.label.slice(0, 2)
                )}
              </span>
              <span className="text-[10px] font-semibold text-text">{t.label}</span>
            </button>
          ))}
        </div>

        <p className="text-xs text-text-muted text-center">
          Sharing helps more people find evidence-based cannabis care.
        </p>
      </DialogContent>
    </Dialog>
  );
}
