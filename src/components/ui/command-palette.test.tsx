import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createAppRouteMatcher } from "@/lib/navigation/app-route-map";
import { AUTHENTICATED_COMMANDS } from "./command-palette";

function walkPages(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const filePath = path.join(dir, name);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      walkPages(filePath, out);
      continue;
    }
    if (name === "page.tsx") out.push(filePath);
  }
  return out;
}

function routeFromPage(filePath: string): string {
  const appRoot = path.join(process.cwd(), "src", "app");
  const relative = path.relative(appRoot, filePath).replace(/\/page\.tsx$/, "");
  const parts = relative
    .split(path.sep)
    .filter(Boolean)
    .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")))
    .map((segment) => {
      if (/^\[\[\.\.\..+\]\]$/.test(segment)) return "*";
      if (/^\[\.\.\..+\]$/.test(segment)) return "*";
      const dynamic = segment.match(/^\[(.+)\]$/);
      return dynamic ? `:${dynamic[1]}` : segment;
    });
  return `/${parts.join("/")}`;
}

describe("authenticated command palette routes", () => {
  it("points every authenticated command href at an existing app route", () => {
    const appRoot = path.join(process.cwd(), "src", "app");
    const routes = new Set(walkPages(appRoot).map(routeFromPage));
    routes.add("/");
    const matches = createAppRouteMatcher([...routes]);

    const missing = AUTHENTICATED_COMMANDS
      .filter((command) => command.href)
      .filter((command) => !matches(command.href!))
      .map((command) => `${command.id}: ${command.href}`);

    expect(missing).toEqual([]);
  });
});
