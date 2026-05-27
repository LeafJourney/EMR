import * as React from "react";
import { isValidElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import ClinicError from "./error";

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node as any).props.children);
  return "";
}

function findByText(node: ReactNode, text: string): any {
  if (isValidElement(node) && textOf(node).trim() === text) return node;
  if (isValidElement(node)) {
    const children = (node as any).props.children;
    const childList = Array.isArray(children) ? children : [children];
    for (const child of childList) {
      const hit = findByText(child, text);
      if (hit) return hit;
    }
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findByText(child, text);
      if (hit) return hit;
    }
  }
  return null;
}

describe("Clinic error recovery", () => {
  it("keeps clinic users inside the clinic when leaving the error screen", () => {
    const previousWindow = globalThis.window;
    const previousReact = (globalThis as any).React;
    const location = { href: "" };
    (globalThis as any).window = { location };
    (globalThis as any).React = React;

    try {
      const tree = ClinicError({
        error: new Error("boom"),
        reset: () => undefined,
      });

      const button = findByText(tree, "Go to Today");
      expect(button).toBeTruthy();
      button.props.onClick();

      expect(location.href).toBe("/clinic");
    } finally {
      (globalThis as any).window = previousWindow;
      (globalThis as any).React = previousReact;
    }
  });
});
