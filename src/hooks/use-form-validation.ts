"use client";

import { useState } from "react";

/**
 * Lightweight required-field validation hook.
 *
 * Call `validate(fields)` on form submit — it marks the form as
 * submitted and returns true only if every value is non-empty.
 * Call `fieldInvalid(value)` per-field to decide whether to show
 * the red-border / aria-invalid state.
 */
export function useFormValidation() {
  const [submitted, setSubmitted] = useState(false);

  function validate(fields: Record<string, string>): boolean {
    setSubmitted(true);
    return Object.values(fields).every((v) => v.trim() !== "");
  }

  function fieldInvalid(value: string): boolean {
    return submitted && !value.trim();
  }

  return { validate, fieldInvalid, submitted };
}
