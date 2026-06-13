"use client";

import { useState, useRef, useCallback, useTransition } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import type {
  ConsentTemplate,
  ConsentField,
} from "@/lib/domain/consent-forms";
import { DEFAULT_TEMPLATES } from "@/lib/domain/consent-forms";
import { signConsent, type SignedConsentSummary } from "./actions";

// ── Category config ─────────────────────────────────

const CATEGORY_BADGES: Record<string, { label: string; tone: "accent" | "info" | "warning" | "neutral" | "success" }> = {
  treatment: { label: "Treatment", tone: "accent" },
  privacy: { label: "Privacy", tone: "info" },
  telehealth: { label: "Telehealth", tone: "warning" },
  research: { label: "Research", tone: "neutral" },
  cannabis: { label: "Cannabis", tone: "success" },
  general: { label: "General", tone: "neutral" },
};

// ── Signature Canvas ────────────────────────────────

function SignatureCanvas({
  onSign,
  disabled,
}: {
  onSign: (dataUrl: string) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const getPos = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const clientX =
        "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY =
        "touches" in e ? e.touches[0].clientY : e.clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    },
    []
  );

  const startDrawing = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (disabled) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx) return;
      const { x, y } = getPos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
      setIsDrawing(true);
    },
    [disabled, getPos]
  );

  const draw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing || disabled) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx) return;
      const { x, y } = getPos(e);
      ctx.lineTo(x, y);
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      setHasSignature(true);
    },
    [isDrawing, disabled, getPos]
  );

  const stopDrawing = useCallback(() => {
    if (isDrawing && hasSignature && canvasRef.current) {
      onSign(canvasRef.current.toDataURL());
    }
    setIsDrawing(false);
  }, [isDrawing, hasSignature, onSign]);

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onSign("");
  }

  return (
    <div>
      <div
        className={cn(
          "relative border-2 border-dashed rounded-lg overflow-hidden",
          disabled
            ? "border-border/40 bg-surface-muted/30"
            : "border-border-strong/60 bg-white cursor-crosshair"
        )}
      >
        <canvas
          ref={canvasRef}
          width={500}
          height={150}
          className="w-full h-[150px] touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        {!hasSignature && !disabled && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-text-subtle">
              Sign here — draw with mouse or finger
            </p>
          </div>
        )}
      </div>
      {hasSignature && !disabled && (
        <button
          type="button"
          onClick={clearCanvas}
          className="text-xs text-text-muted hover:text-danger mt-1.5 transition-colors"
        >
          Clear signature
        </button>
      )}
    </div>
  );
}

// ── Form Field Renderer ─────────────────────────────

function ConsentFieldRenderer({
  field,
  value,
  onChange,
  disabled,
}: {
  field: ConsentField;
  value: string | boolean;
  onChange: (value: string | boolean) => void;
  disabled?: boolean;
}) {
  switch (field.type) {
    case "paragraph":
      return (
        <div className="p-4 rounded-lg bg-surface-muted/50 border border-border/60">
          <p className="text-sm text-text leading-relaxed">{field.content}</p>
        </div>
      );

    case "acknowledgment":
      return (
        <label
          className={cn(
            "flex items-start gap-3 p-4 rounded-lg border transition-colors cursor-pointer",
            value
              ? "bg-accent/5 border-accent/20"
              : "bg-surface-muted/30 border-border/60 hover:border-accent/30"
          )}
        >
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            className="mt-0.5 h-4 w-4 rounded border-border-strong text-accent focus:ring-accent/20 shrink-0"
          />
          <div>
            <p className="text-sm font-medium text-text mb-1">{field.label}</p>
            {field.content && (
              <p className="text-sm text-text-muted leading-relaxed">
                {field.content}
              </p>
            )}
            {field.required && (
              <span className="text-[10px] text-danger mt-1 inline-block">
                Required
              </span>
            )}
          </div>
        </label>
      );

    case "text":
      return (
        <div>
          <label className="text-sm font-medium text-text mb-1.5 inline-block">
            {field.label}
            {field.required && <span className="text-danger ml-0.5">*</span>}
          </label>
          <Input
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || ""}
            disabled={disabled}
          />
        </div>
      );

    case "date":
      return (
        <div>
          <label className="text-sm font-medium text-text mb-1.5 inline-block">
            {field.label}
            {field.required && <span className="text-danger ml-0.5">*</span>}
          </label>
          <Input
            type="date"
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
        </div>
      );

    case "signature":
      return (
        <div>
          <label className="text-sm font-medium text-text mb-1.5 inline-block">
            {field.label}
            {field.required && <span className="text-danger ml-0.5">*</span>}
          </label>
          <SignatureCanvas
            onSign={(dataUrl) => onChange(dataUrl)}
            disabled={disabled}
          />
        </div>
      );

    default:
      return null;
  }
}

// ── Main Component ──────────────────────────────────

export function ConsentView({
  initialSignedConsents = [],
}: {
  initialSignedConsents?: SignedConsentSummary[];
}) {
  const [selectedTemplate, setSelectedTemplate] = useState<ConsentTemplate | null>(null);
  const [responses, setResponses] = useState<Record<string, string | boolean>>({});
  // Hydrated from the DB (includes consents signed during registration); new
  // signatures are appended only after the server confirms persistence.
  const [signedConsents, setSignedConsents] =
    useState<SignedConsentSummary[]>(initialSignedConsents);
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const templates = DEFAULT_TEMPLATES;

  const isTemplateSigned = (templateId: string) =>
    signedConsents.some((sc) => sc.templateId === templateId);

  function handleOpenTemplate(template: ConsentTemplate) {
    if (isTemplateSigned(template.id)) return;
    setSelectedTemplate(template);
    setResponses({});
    setSubmitError(null);
    setShowSuccess(false);
  }

  function handleFieldChange(fieldId: string, value: string | boolean) {
    setResponses((prev) => ({ ...prev, [fieldId]: value }));
  }

  function isFormComplete(): boolean {
    if (!selectedTemplate) return false;
    return selectedTemplate.fields
      .filter((f) => f.required)
      .every((f) => {
        const val = responses[f.id];
        if (f.type === "paragraph") return true;
        if (f.type === "acknowledgment") return val === true;
        return !!val;
      });
  }

  function handleSubmit() {
    if (!selectedTemplate || !isFormComplete() || isPending) return;

    const template = selectedTemplate;
    const signatureFieldId = template.fields.find((f) => f.type === "signature")?.id;
    const signatureData =
      (signatureFieldId && (responses[signatureFieldId] as string)) || undefined;

    // Don't store the signature image twice — it travels in signatureData.
    const cleanResponses: Record<string, string | boolean> = { ...responses };
    if (signatureFieldId && signatureFieldId in cleanResponses) {
      cleanResponses[signatureFieldId] = true;
    }

    setSubmitError(null);
    startTransition(async () => {
      try {
        const result = await signConsent({
          templateId: template.id,
          responses: cleanResponses,
          signatureData,
        });
        if (!result.ok) {
          setSubmitError(result.error);
          return;
        }
        setSignedConsents((prev) =>
          prev.some((sc) => sc.templateId === result.consent.templateId)
            ? prev
            : [...prev, result.consent]
        );
        setShowSuccess(true);
      } catch {
        setSubmitError("Something went wrong saving your consent. Please try again.");
      }
    });
  }

  // ── Template list view ───────────────────────

  if (!selectedTemplate) {
    return (
      <div className="space-y-4">
        {templates.map((template) => {
          const signed = isTemplateSigned(template.id);
          const catConfig = CATEGORY_BADGES[template.category] || CATEGORY_BADGES.general;
          return (
            <Card
              key={template.id}
              tone={signed ? "default" : "raised"}
              className={cn(
                "transition-all duration-200",
                signed
                  ? "opacity-80"
                  : "cursor-pointer hover:shadow-md hover:border-accent/30"
              )}
              onClick={() => handleOpenTemplate(template)}
            >
              <CardContent className="py-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge tone={catConfig.tone}>{catConfig.label}</Badge>
                      <span className="text-[10px] text-text-subtle">
                        v{template.version}
                      </span>
                    </div>
                    <h3 className="text-sm font-medium text-text">
                      {template.name}
                    </h3>
                    <p className="text-sm text-text-muted mt-0.5">
                      {template.description}
                    </p>
                  </div>

                  {signed ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center">
                        <svg
                          className="h-5 w-5 text-emerald-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium text-emerald-700">
                          Completed
                        </p>
                        <p className="text-[10px] text-text-subtle">
                          {(() => {
                            const signedAt = signedConsents.find(
                              (s) => s.templateId === template.id,
                            )?.signedAt;
                            return signedAt
                              ? new Date(signedAt).toLocaleDateString()
                              : "";
                          })()}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <Button variant="secondary" size="sm">
                      Review & Sign
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

  // ── Success state ────────────────────────────

  if (showSuccess) {
    const signedEntry = signedConsents.find(
      (s) => s.templateId === selectedTemplate.id
    );
    return (
      <div className="space-y-6">
        <Card tone="raised" className="border-l-4 border-l-emerald-500">
          <CardContent className="py-10 text-center">
            <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <svg
                className="h-8 w-8 text-emerald-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="font-display text-2xl text-text tracking-tight mb-2">
              Consent signed successfully
            </h2>
            <p className="text-sm text-text-muted max-w-md mx-auto leading-relaxed">
              Your signature for &quot;{selectedTemplate.name}&quot; has been
              recorded securely.
            </p>
            {signedEntry && (
              <p className="text-xs text-text-subtle mt-3">
                Signed at{" "}
                {new Date(signedEntry.signedAt).toLocaleString()}
              </p>
            )}
            <div className="mt-8">
              <Button
                onClick={() => {
                  setSelectedTemplate(null);
                  setShowSuccess(false);
                }}
              >
                Back to consent forms
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Form view ────────────────────────────────

  const catConfig =
    CATEGORY_BADGES[selectedTemplate.category] || CATEGORY_BADGES.general;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => setSelectedTemplate(null)}
        className="text-sm text-accent hover:underline flex items-center gap-1"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back to all forms
      </button>

      <Card tone="raised">
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <Badge tone={catConfig.tone}>{catConfig.label}</Badge>
            <span className="text-[10px] text-text-subtle">
              v{selectedTemplate.version}
            </span>
          </div>
          <CardTitle>{selectedTemplate.name}</CardTitle>
          <CardDescription>{selectedTemplate.description}</CardDescription>
        </CardHeader>

        <CardContent>
          {/* Legal text banner */}
          <div className="p-4 rounded-lg bg-amber-50/60 border border-amber-200/60 mb-6">
            <p className="text-xs font-medium uppercase tracking-wider text-amber-700 mb-1">
              Legal notice
            </p>
            <p className="text-sm text-amber-900/80 leading-relaxed">
              {selectedTemplate.legalText}
            </p>
          </div>

          {/* Form fields */}
          <div className="space-y-5">
            {selectedTemplate.fields.map((field) => (
              <ConsentFieldRenderer
                key={field.id}
                field={field}
                value={responses[field.id] ?? (field.type === "acknowledgment" ? false : "")}
                onChange={(val) => handleFieldChange(field.id, val)}
                disabled={isPending}
              />
            ))}
          </div>
        </CardContent>

        <CardFooter>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-text-subtle italic">
              By submitting, you agree to the terms above.
            </p>
            {submitError && (
              <p className="text-sm text-danger mt-1">{submitError}</p>
            )}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!isFormComplete() || isPending}
          >
            {isPending ? "Saving…" : "Submit consent"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
