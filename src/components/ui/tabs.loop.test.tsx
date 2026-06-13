// @vitest-environment jsdom
//
// Regression: mounting <Tabs> with registered <Trigger>s must settle.
//
// The Trigger registration effect used to depend on the whole context
// object. Registering bumps layoutToken (part of the context), which
// invalidated the context, which re-ran every Trigger's effect, which
// re-registered and bumped the token again — an unconditional update loop
// (React #185, "Maximum update depth exceeded") that crashed every Tabs
// surface client-side: AI config, super-admin console, communications
// overlay, terpenes lab, seed-trove wallet, portal Learn.
//
// This test mounts the compound component in a real DOM and fails if the
// effect cascade doesn't converge.
import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  usePathname: () => "/test",
  useSearchParams: () => new URLSearchParams(),
}));

// framer-motion's spring ticking is irrelevant here; render a plain span so
// the loop test exercises only the registration/measure machinery.
vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children, ...props }: any) =>
          React.createElement("span", stripMotionProps(props), children),
    },
  ),
  useReducedMotion: () => true,
}));

function stripMotionProps(props: Record<string, unknown>) {
  const { initial, animate, transition, ...rest } = props;
  return rest;
}

import { Tabs, TabList, Trigger, Panel } from "./tabs";

function Harness() {
  const [tab, setTab] = React.useState("one");
  return (
    <Tabs value={tab} onValueChange={setTab} urlParam="section">
      <TabList aria-label="Test tabs">
        <Trigger value="one">One</Trigger>
        <Trigger value="two">Two</Trigger>
      </TabList>
      <Panel value="one">first panel</Panel>
      <Panel value="two" lazy>
        second panel
      </Panel>
    </Tabs>
  );
}

describe("Tabs mount stability", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) act(() => root!.unmount());
    container?.remove();
  });

  it("mounts triggers without an effect-driven update loop (React #185)", () => {
    container = document.createElement("div");
    document.body.appendChild(container);

    // React surfaces "Maximum update depth exceeded" as a thrown error
    // inside act() — mounting is the assertion.
    expect(() => {
      act(() => {
        root = createRoot(container!);
        root.render(<Harness />);
      });
    }).not.toThrow();

    expect(container.textContent).toContain("One");
    expect(container.textContent).toContain("first panel");
  });
});
