import { describe, it, expect } from "vitest";
import {
  defaultLayout,
  hideWidget,
  normalizeLayout,
  PORTAL_WIDGETS,
  reorderWidget,
  resetLayout,
  showWidget,
  visibleWidgets,
  type PortalLayout,
  type PortalWidgetId,
} from "./customization";

describe("defaultLayout", () => {
  it("includes all default-visible widgets in order", () => {
    const layout = defaultLayout();
    const expected = PORTAL_WIDGETS.filter((w) => w.defaultVisible).map((w) => w.id);
    expect(layout.order).toEqual(expected);
  });

  it("hides all non-default, non-required widgets", () => {
    const layout = defaultLayout();
    for (const w of PORTAL_WIDGETS) {
      if (!w.defaultVisible && !w.required) {
        expect(layout.hidden).toContain(w.id);
      }
    }
  });
});

describe("normalizeLayout", () => {
  it("drops unknown widget ids from order and hidden lists", () => {
    const layout = normalizeLayout({
      order: ["plant-health", "bogus", "next-visit"],
      hidden: ["also-bogus", "quote"],
    });
    expect(layout.order).not.toContain("bogus" as PortalWidgetId);
    expect(layout.hidden).not.toContain("also-bogus" as PortalWidgetId);
  });

  it("appends required widgets if they are missing from order", () => {
    const layout = normalizeLayout({ order: ["plant-health"] });
    expect(layout.order).toContain("next-visit"); // next-visit is required
  });

  it("strips required widgets from the hidden list", () => {
    const layout = normalizeLayout({ hidden: ["next-visit", "quote"] });
    expect(layout.hidden).not.toContain("next-visit");
    expect(layout.hidden).toContain("quote");
  });

  it("returns a default-shaped layout for empty input", () => {
    const layout = normalizeLayout({});
    expect(Array.isArray(layout.order)).toBe(true);
    expect(Array.isArray(layout.hidden)).toBe(true);
    expect(layout.accent).toBe("default");
  });

  it("rejects unknown accent values", () => {
    const layout = normalizeLayout({ accent: "ultra-violet" as unknown as "indigo" });
    expect(layout.accent).toBe("default");
  });
});

describe("reorderWidget", () => {
  it("swaps the widget with its neighbor when moving up", () => {
    const base: PortalLayout = {
      order: ["plant-health", "four-pillars", "next-visit"],
      hidden: [],
    };
    const moved = reorderWidget(base, "four-pillars", "up");
    expect(moved.order).toEqual(["four-pillars", "plant-health", "next-visit"]);
  });

  it("swaps the widget with its neighbor when moving down", () => {
    const base: PortalLayout = {
      order: ["plant-health", "four-pillars", "next-visit"],
      hidden: [],
    };
    const moved = reorderWidget(base, "plant-health", "down");
    expect(moved.order).toEqual(["four-pillars", "plant-health", "next-visit"]);
  });

  it("returns the same layout when moving past the edge", () => {
    const base: PortalLayout = {
      order: ["plant-health", "next-visit"],
      hidden: [],
    };
    expect(reorderWidget(base, "plant-health", "up")).toEqual(base);
    expect(reorderWidget(base, "next-visit", "down")).toEqual(base);
  });

  it("no-ops when the widget is not in the layout", () => {
    const base: PortalLayout = { order: ["plant-health"], hidden: [] };
    expect(reorderWidget(base, "messages", "up")).toEqual(base);
  });
});

describe("hideWidget / showWidget", () => {
  it("hides a non-required widget", () => {
    const base: PortalLayout = {
      order: ["plant-health", "four-pillars", "next-visit"],
      hidden: [],
    };
    const hidden = hideWidget(base, "four-pillars");
    expect(hidden.order).not.toContain("four-pillars");
    expect(hidden.hidden).toContain("four-pillars");
  });

  it("refuses to hide required widgets", () => {
    const base: PortalLayout = {
      order: ["plant-health", "next-visit"],
      hidden: [],
    };
    expect(hideWidget(base, "next-visit")).toEqual(base);
  });

  it("showWidget restores a hidden widget to the bottom of order", () => {
    const base: PortalLayout = {
      order: ["plant-health", "next-visit"],
      hidden: ["four-pillars"],
    };
    const shown = showWidget(base, "four-pillars");
    expect(shown.hidden).not.toContain("four-pillars");
    expect(shown.order[shown.order.length - 1]).toBe("four-pillars");
  });
});

describe("visibleWidgets / resetLayout", () => {
  it("visibleWidgets returns defs in order", () => {
    const layout: PortalLayout = {
      order: ["four-pillars", "plant-health"],
      hidden: [],
    };
    const widgets = visibleWidgets(layout);
    expect(widgets.map((w) => w.id)).toEqual(["four-pillars", "plant-health"]);
  });

  it("resetLayout matches defaultLayout", () => {
    expect(resetLayout().order).toEqual(defaultLayout().order);
  });
});
