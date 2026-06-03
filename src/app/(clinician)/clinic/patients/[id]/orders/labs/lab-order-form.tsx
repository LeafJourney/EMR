"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, FieldGroup } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FileUpload, type FileUploadItem } from "@/components/ui/file-upload";
import { LAB_CATALOG } from "@/lib/domain/clinical-orders";
import { COMMON_PROBLEMS } from "@/lib/domain/problem-list";
import { cn } from "@/lib/utils/cn";
import { useToast } from "@/components/ui/toast";

type Priority = "stat" | "routine";

interface Props {
  patientName: string;
}

export function LabOrderForm({ patientName }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [icd10Query, setIcd10Query] = useState("");
  const [icd10Selected, setIcd10Selected] = useState<string[]>([]);
  const [priority, setPriority] = useState<Priority>("routine");
  const [attachments, setAttachments] = useState<FileUploadItem[]>([]);
  const { toast } = useToast();

  const grouped = useMemo(() => {
    const map = new Map<string, typeof LAB_CATALOG>();
    for (const lab of LAB_CATALOG) {
      if (!map.has(lab.category)) map.set(lab.category, []);
      map.get(lab.category)!.push(lab);
    }
    return Array.from(map.entries());
  }, []);

  const icd10Matches = useMemo(() => {
    const q = icd10Query.trim().toLowerCase();
    if (!q) return [];
    return COMMON_PROBLEMS.filter(
      (p) =>
        !icd10Selected.includes(p.icd10) &&
        (p.icd10.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)),
    ).slice(0, 6);
  }, [icd10Query, icd10Selected]);

  function toggleLab(code: string) {
    setSelected((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  function addIcd10(code: string) {
    setIcd10Selected((prev) => [...prev, code]);
    setIcd10Query("");
  }

  function removeIcd10(code: string) {
    setIcd10Selected((prev) => prev.filter((c) => c !== code));
  }

  const fastingSelected = selected
    .map((code) => LAB_CATALOG.find((l) => l.code === code))
    .filter((l) => l && l.fasting);

  function submit() {
    if (selected.length === 0) return;
    const orderId = `LAB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const payload = {
      orderId,
      patientName,
      labs: selected,
      reason,
      diagnoses: icd10Selected,
      priority,
      attachments: attachments.map(a => a.file.name),
      timestamp: new Date().toISOString(),
    };

    console.log("[Simulation] Lab Order Submitted:", JSON.stringify(payload, null, 2));

    toast({
      title: "Order simulated",
      description: `Lab order simulated & logged for ${patientName}.`,
      variant: "success",
    });

    // Reset inputs
    setSelected([]);
    setReason("");
    setIcd10Selected([]);
    setPriority("routine");
    setAttachments([]);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-accent/20 bg-accent/[0.03] p-4 flex gap-3 items-start">
        <span className="text-accent text-base mt-0.5">ℹ️</span>
        <div>
          <p className="text-sm font-medium text-text">Demo mode enabled</p>
          <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
            Lab orders are simulated in this sandbox environment. Submitting an order prints the full HL7/FHIR payload to the terminal console log. No real transmission is performed.
          </p>
        </div>
      </div>
      <Card tone="raised">
        <CardHeader>
          <CardTitle className="text-base">Select labs</CardTitle>
          <CardDescription>
            Grouped by category. Fasting labs are flagged.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {grouped.map(([category, labs]) => (
              <div key={category}>
                <p className="text-[11px] uppercase tracking-[0.14em] text-text-subtle font-medium mb-2">
                  {category}
                </p>
                <ul className="space-y-1.5">
                  {labs.map((lab) => {
                    const isSelected = selected.includes(lab.code);
                    return (
                      <li key={lab.code}>
                        <label
                          className={cn(
                            "flex items-start gap-3 p-2 rounded-md cursor-pointer border transition-colors",
                            isSelected
                              ? "border-emerald-300 bg-emerald-50"
                              : "border-transparent hover:bg-surface-muted",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleLab(lab.code)}
                            className="mt-0.5 h-4 w-4 accent-emerald-600"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-text-subtle tabular-nums">
                                {lab.code}
                              </span>
                              {lab.fasting && (
                                <Badge tone="warning" className="text-[10px]">
                                  Fasting
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-text">{lab.name}</p>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {fastingSelected.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">
            Fasting required
          </p>
          <p className="text-xs text-amber-700 mt-1">
            The following selected labs require 8-12 hour fasting:{" "}
            {fastingSelected.map((l) => l!.name).join(", ")}. Please instruct
            the patient accordingly.
          </p>
        </div>
      )}

      <Card tone="raised">
        <CardHeader>
          <CardTitle className="text-base">Clinical details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <FieldGroup label="Reason / clinical indication">
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Clinical rationale for these labs..."
              />
            </FieldGroup>

            <div>
              <FieldGroup label="Supporting diagnoses (ICD-10)">
                <Input
                  value={icd10Query}
                  onChange={(e) => setIcd10Query(e.target.value)}
                  placeholder="Search ICD-10..."
                />
              </FieldGroup>

              {icd10Matches.length > 0 && (
                <ul className="mt-2 border border-border rounded-lg divide-y divide-border/60 bg-surface-raised">
                  {icd10Matches.map((m) => (
                    <li key={m.icd10}>
                      <button
                        type="button"
                        onClick={() => addIcd10(m.icd10)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-muted"
                      >
                        <span className="font-mono text-xs text-text-subtle tabular-nums w-20 shrink-0">
                          {m.icd10}
                        </span>
                        <span className="text-text">{m.description}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {icd10Selected.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  {icd10Selected.map((code) => {
                    const prob = COMMON_PROBLEMS.find((p) => p.icd10 === code);
                    return (
                      <span
                        key={code}
                        className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 text-xs rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"
                      >
                        <span className="font-mono">{code}</span>
                        <span className="text-emerald-700/80">
                          {prob?.description ?? ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeIcd10(code)}
                          className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-emerald-700/70 hover:bg-emerald-200"
                          aria-label="Remove"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <FieldGroup label="Supporting attachments (optional)">
              <p className="text-[11px] text-text-subtle -mt-1 mb-2">
                Prior result PDFs, requisition forms, or insurance cards.
                They&apos;ll travel with the order to the lab.
              </p>
              {/*
                Server-side TODO: there is no /api/labs/orders/[id]/attachments
                endpoint yet. The handler below resolves locally so the UI
                ships ready-to-wire — once a real upload route is in place,
                replace the resolve with `createFetchUploadHandler({ url: ... })`.
              */}
              <FileUpload
                accept=".pdf,.png,.jpg,.jpeg,.heic,.webp"
                maxFiles={5}
                maxSizeMB={15}
                concurrency={2}
                label="Drop requisitions or prior results"
                hint="PDF or image — up to 15 MB per file"
                onUpload={async (file, { onProgress }) => {
                  // Local-only: simulate the upload so the queue UI is
                  // exercisable today. Replace once the server route lands.
                  for (let p = 0; p <= 100; p += 20) {
                    onProgress?.(p);
                    await new Promise((r) => setTimeout(r, 80));
                  }
                  return { id: `local-${file.name}`, name: file.name };
                }}
                onComplete={(items) => setAttachments(items)}
              />
            </FieldGroup>

            <FieldGroup label="Priority">
              <div className="flex gap-2">
                {(["routine", "stat"] as Priority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-full border transition-colors",
                      priority === p
                        ? p === "stat"
                          ? "bg-red-600 text-white border-red-600"
                          : "bg-emerald-600 text-white border-emerald-600"
                        : "bg-surface-raised text-text-muted border-border hover:bg-surface-muted",
                    )}
                  >
                    {p.toUpperCase()}
                  </button>
                ))}
              </div>
            </FieldGroup>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <p className="text-xs text-text-subtle">
          {selected.length} lab{selected.length !== 1 ? "s" : ""} selected
          {attachments.filter((a) => a.status === "uploaded").length > 0 &&
            ` · ${attachments.filter((a) => a.status === "uploaded").length} attachment${attachments.filter((a) => a.status === "uploaded").length !== 1 ? "s" : ""}`}
        </p>
        <Button
          onClick={submit}
          disabled={selected.length === 0}
        >
          Submit order
        </Button>
      </div>
    </div>
  );
}
