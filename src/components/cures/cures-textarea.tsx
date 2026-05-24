"use client";

import * as React from "react";
import { Textarea } from "@/components/ui/input";
import { expandCuresShortcut, CURES_SHORTCUTS } from "@/lib/domain/cures";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

interface CuresTextareaProps extends Omit<TextareaProps, "value" | "onChange"> {
  value: string;
  onChange: (next: string) => void;
}

/**
 * EMR-781 — Textarea that auto-expands the `/cures` (or `/__`)
 * shortcut to the standardized controlled-substance review template
 * inline as the clinician types. Falls back to identity behavior when
 * the shortcut is not present, so it's safe to use anywhere a regular
 * Textarea would go.
 *
 * Wraps the design-system Textarea so visual treatment stays
 * consistent.
 */
export const CuresTextarea = React.forwardRef<HTMLTextAreaElement, CuresTextareaProps>(
  function CuresTextarea({ value, onChange, onKeyUp, ...rest }, ref) {
    const localRef = React.useRef<HTMLTextAreaElement | null>(null);
    const setRef = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        localRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
      },
      [ref],
    );

    const handleChange = React.useCallback(
      (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const next = event.target.value;
        const caret = event.target.selectionStart ?? next.length;
        const expansion = expandCuresShortcut(next, caret);
        if (!expansion) {
          onChange(next);
          return;
        }
        onChange(expansion.nextValue);
        // Restore caret position after React re-renders.
        requestAnimationFrame(() => {
          const el = localRef.current;
          if (!el) return;
          el.setSelectionRange(expansion.caret, expansion.caret);
        });
      },
      [onChange],
    );

    return (
      <Textarea
        ref={setRef}
        value={value}
        onChange={handleChange}
        onKeyUp={onKeyUp}
        {...rest}
      />
    );
  },
);

/** Lightweight hint text suitable for placing under a CURES-aware field. */
export function CuresShortcutHint({ className }: { className?: string }) {
  return (
    <p className={className ?? "text-[11px] text-text-subtle mt-1.5"}>
      Tip: type{" "}
      <code className="px-1 py-0.5 rounded bg-surface-raised border border-border font-mono text-[10px]">
        {CURES_SHORTCUTS[0]}
      </code>{" "}
      or{" "}
      <code className="px-1 py-0.5 rounded bg-surface-raised border border-border font-mono text-[10px]">
        {CURES_SHORTCUTS[1]}
      </code>{" "}
      to insert the standardized CURES review attestation.
    </p>
  );
}
