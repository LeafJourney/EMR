"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, FieldGroup } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { IMAGING_CATALOG } from "@/lib/domain/clinical-orders";
import { COMMON_PROBLEMS } from "@/lib/domain/problem-list";
import { cn } from "@/lib/utils/cn";
import { useToast } from "@/components/ui/toast";
import { createClinicalOrder } from "../actions";

interface Props {
  patientId: string;
  patientName: string;
}

const MODALITIES = ["X-ray", "MRI", "CT", "US", "DEXA"] as const;
type Modality = (typeof MODALITIES)[number];

export function ImagingOrderForm({ patientId, patientName }: Props) {
  const [modality, setModality] = useState<Modality>("X-ray");
  const [studyCode, setStudyCode] = useState<string>("");
  const [indication, setIndication] = useState("");
  const [icd10Query, setIcd10Query] = useState("");
  const [icd10Selected, setIcd10Selected] = useState<string[]>([]);
  const [priorAuth, setPriorAuth] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const { toast } = useToast();

  const availableStudies = useMemo(
    () => IMAGING_CATALOG.filter((i) => i.modality === modality),
    [modality],
  );

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

  function addIcd10(code: string) {
    setIcd10Selected((prev) => [...prev, code]);
    setIcd10Query("");
  }

  function removeIcd10(code: string) {
    setIcd10Selected((prev) => prev.filter((c) => c !== code));
  }

  async function submit() {
    if (!studyCode || submitting) return;
    const study = IMAGING_CATALOG.find((i) => i.code === studyCode);
    if (!study) return;
    setSubmitting(true);

    let result: Awaited<ReturnType<typeof createClinicalOrder>>;
    try {
      result = await createClinicalOrder({
        patientId,
        orderType: "imaging",
        orderCode: studyCode,
        orderName: `${modality} — ${study.name}`,
        priority: "routine",
        diagnosisCodes: icd10Selected,
        payload: {
          patientName,
          modality,
          studyCode,
          studyName: study.name,
          indication,
          diagnoses: icd10Selected,
          priorAuth,
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      result = { ok: false, error: "Something went wrong placing the order. Please try again." };
    } finally {
      setSubmitting(false);
    }

    if (!result.ok) {
      toast({
        title: "Order failed",
        description: result.error,
        variant: "error",
      });
      return;
    }

    setPlacedOrderId(result.orderId);
    toast({
      title: "Order placed",
      description: `Imaging order saved to ${patientName}'s chart.`,
      variant: "success",
    });

    // Reset inputs
    setStudyCode("");
    setIndication("");
    setIcd10Selected([]);
    setPriorAuth(false);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-accent/20 bg-accent/[0.03] p-4 flex gap-3 items-start">
        <span className="text-accent text-base mt-0.5">ℹ️</span>
        <div>
          <p className="text-sm font-medium text-text">External transmission not yet connected</p>
          <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
            Submitting an order saves it to the patient&apos;s chart as part of
            the permanent record. However, electronic transmission to the
            imaging center (HL7/FHIR) is not yet connected in this sandbox
            environment — the order must be sent to the imaging center
            manually.
          </p>
        </div>
      </div>

      {placedOrderId && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-800">
            Order placed and saved to the chart
          </p>
          <p className="text-xs text-emerald-700 mt-1">
            Order ID{" "}
            <span className="font-mono">{placedOrderId}</span> was recorded for{" "}
            {patientName}. It appears in the placed orders list below. External
            transmission to the imaging center is not yet connected — send the
            order manually.
          </p>
        </div>
      )}
      <Card tone="raised">
        <CardHeader>
          <CardTitle className="text-base">Modality</CardTitle>
          <CardDescription>Choose the imaging modality first.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            {MODALITIES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setModality(m);
                  setStudyCode("");
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-full border transition-colors",
                  modality === m
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                    : "bg-surface-raised text-text-muted border-border hover:bg-surface-muted",
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card tone="raised">
        <CardHeader>
          <CardTitle className="text-base">Study</CardTitle>
        </CardHeader>
        <CardContent>
          {availableStudies.length === 0 ? (
            <p className="text-sm text-text-muted">
              No studies in the catalog for this modality.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {availableStudies.map((s) => {
                const isSelected = studyCode === s.code;
                return (
                  <li key={s.code}>
                    <label
                      className={cn(
                        "flex items-start gap-3 p-2 rounded-md cursor-pointer border transition-colors",
                        isSelected
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-transparent hover:bg-surface-muted",
                      )}
                    >
                      <input
                        type="radio"
                        name="study"
                        checked={isSelected}
                        onChange={() => setStudyCode(s.code)}
                        className="mt-0.5 h-4 w-4 accent-emerald-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-text-subtle tabular-nums">
                            {s.code}
                          </span>
                          <Badge tone="accent" className="text-[10px]">
                            {s.modality}
                          </Badge>
                        </div>
                        <p className="text-sm text-text">{s.name}</p>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card tone="raised">
        <CardHeader>
          <CardTitle className="text-base">Clinical indication</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <FieldGroup label="Clinical indication">
              <Textarea
                value={indication}
                onChange={(e) => setIndication(e.target.value)}
                placeholder="Reason for the study, relevant history, previous imaging..."
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

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={priorAuth}
                onChange={(e) => setPriorAuth(e.target.checked)}
                className="h-4 w-4 accent-emerald-600"
              />
              <span className="text-sm text-text">
                Prior authorization required for this study
              </span>
            </label>

            {priorAuth && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                A prior authorization packet will be generated after submission.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button onClick={submit} disabled={!studyCode || submitting}>
          {submitting ? "Placing order..." : "Submit order"}
        </Button>
      </div>
    </div>
  );
}
