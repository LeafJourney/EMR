"use client";

import { useCallback, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { uploadDocumentAction, type UploadResult } from "./actions";
import { Button } from "@/components/ui/button";
import { LeafSprig } from "@/components/ui/ornament";
import { SubmitButton } from "@/lib/ui/form-helpers";

function UploadButton() {
  return <SubmitButton size="sm" idleLabel="Upload" pendingLabel="Uploading\u2026" />;
}

export function UploadForm({ onClose }: { onClose?: () => void }) {
  const [state, formAction] = useFormState<UploadResult | null, FormData>(
    uploadDocumentAction,
    null,
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const [simulating, setSimulating] = useState(false);

  const handleFile = useCallback((f: File) => {
    setFile(f);
    if (inputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(f);
      inputRef.current.files = dt.files;
    }
    setSimulating(true);
    setProgress(0);
    let current = 0;
    const interval = setInterval(() => {
      current += Math.random() * 25 + 10;
      if (current >= 100) {
        current = 100;
        clearInterval(interval);
        setSimulating(false);
      }
      setProgress(Math.min(current, 100));
    }, 200);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Success state
  if (state?.ok) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
        <div className="flex justify-center mb-3">
          <div className="h-12 w-12 rounded-full bg-accent-soft flex items-center justify-center">
            <svg
              className="h-6 w-6 text-accent"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
          </div>
        </div>
        <h3 className="font-display text-lg text-text mb-1">Uploaded!</h3>
        <p className="text-sm text-text-muted max-w-xs mx-auto">
          Our system is classifying your document. You&apos;ll see it
          organized in your records momentarily.
        </p>
        <div className="mt-5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setFile(null);
              setProgress(0);
              onClose?.();
            }}
          >
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {/* File is carried by the named input below; no metadata fields needed */}

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`
          relative flex flex-col items-center justify-center gap-3 rounded-2xl
          border-2 border-dashed cursor-pointer
          px-6 py-10 transition-colors duration-200
          ${
            dragOver
              ? "border-accent bg-accent-soft/40"
              : "border-border-strong bg-surface-muted/50 hover:bg-surface-muted/80"
          }
        `}
      >
        <LeafSprig size={36} className="text-accent/60" />
        <div className="text-center">
          <p className="text-sm font-medium text-text">
            Drop files here or click to browse
          </p>
          <p className="text-xs text-text-subtle mt-1">
            PDF, images, or scanned documents
          </p>
        </div>
        <input
          ref={inputRef}
          name="file"
          type="file"
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.gif,.tiff,.doc,.docx,.xlsx,.xls,.csv,.txt,.heic"
          onChange={handleInputChange}
        />
      </div>

      {/* Selected file preview */}
      {file && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text truncate">
                {file.name}
              </p>
              <p className="text-xs text-text-subtle mt-0.5">
                {formatSize(file.size)} &middot; {file.type || "unknown type"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setProgress(0);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="text-text-subtle hover:text-text transition-colors text-xs"
            >
              Remove
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-2 w-full rounded-full bg-surface-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300 ease-smooth bg-gradient-to-r from-accent to-accent-strong"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-text-subtle mt-1.5">
            {simulating
              ? `Processing\u2026 ${Math.round(progress)}%`
              : progress >= 100
                ? "Ready to upload"
                : "Waiting\u2026"}
          </p>
        </div>
      )}

      {/* Error state */}
      {state?.ok === false && (
        <p className="text-sm text-danger">{state.error}</p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        {onClose && (
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        )}
        {file && !simulating && progress >= 100 && <UploadButton />}
      </div>
    </form>
  );
}
