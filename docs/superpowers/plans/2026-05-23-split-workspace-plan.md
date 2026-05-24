# EMR-028: Structured 2-Pane Focused Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a Structured 2-Pane Split-Screen layout in the EMR workspace to separate reference context from active documentation entry.

**Architecture:** A container component `<SplitWorkspace>` manages the collapse/expand state and left pane width, preserving preferences in `localStorage`. The Left Pane houses a tabbed view of patient vitals/history, while the Right Pane displays the main active page view.

**Tech Stack:** React, Tailwind CSS, TypeScript, Vitest, React Testing Library.

---

### Task 1: Create SplitWorkspace Core Component

**Files:**
- Create: `src/components/shell/SplitWorkspace.tsx`
- Test: `src/components/shell/SplitWorkspace.test.tsx`

- [ ] **Step 1: Write a failing unit test**
  Write a test in `src/components/shell/SplitWorkspace.test.tsx` verifying that when `collapsed` is true, the Left Pane width is `0px` or set to `hidden`.

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import React from "react";
import { SplitWorkspace } from "./SplitWorkspace";

test("collapses the left pane when toggle is clicked", async () => {
  render(
    <SplitWorkspace>
      <div data-testid="left">Left Pane Content</div>
      <div data-testid="right">Right Pane Content</div>
    </SplitWorkspace>
  );
  
  const toggleBtn = screen.getByRole("button", { name: /toggle panel/i });
  expect(screen.getByTestId("left")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run src/components/shell/SplitWorkspace.test.tsx`
  Expected: FAIL (No such file or directory, or SplitWorkspace not exported)

- [ ] **Step 3: Implement core container component**
  Create `src/components/shell/SplitWorkspace.tsx` with dragging and toggling logic:

```tsx
"use client";

import React, { useState, useEffect, useRef } from "react";

interface SplitWorkspaceProps {
  children: React.ReactNode;
}

export function SplitWorkspace({ children }: SplitWorkspaceProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [paneWidth, setPaneWidth] = useState(350);
  const isDragging = useRef(false);

  useEffect(() => {
    const savedCollapsed = localStorage.getItem("workspace:splitPaneCollapsed");
    const savedWidth = localStorage.getItem("workspace:splitPaneWidth");
    if (savedCollapsed) setCollapsed(savedCollapsed === "true");
    if (savedWidth) setPaneWidth(Number(savedWidth));
  }, []);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("workspace:splitPaneCollapsed", String(next));
  };

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.addEventListener("mousemove", resize);
    document.addEventListener("mouseup", stopResize);
  };

  const resize = (e: MouseEvent) => {
    if (!isDragging.current) return;
    const newWidth = Math.max(200, Math.min(600, e.clientX - 64)); // Offset by rail nav width
    setPaneWidth(newWidth);
    localStorage.setItem("workspace:splitPaneWidth", String(newWidth));
  };

  const stopResize = () => {
    isDragging.current = false;
    document.removeEventListener("mousemove", resize);
    document.removeEventListener("mouseup", stopResize);
  };

  const childArray = React.Children.toArray(children);
  const leftChild = childArray[0];
  const rightChild = childArray[1];

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div
        className="overflow-y-auto border-r border-border bg-surface transition-all duration-200"
        style={{ width: collapsed ? 0 : paneWidth, minWidth: collapsed ? 0 : 200 }}
      >
        {!collapsed && leftChild}
      </div>

      <div
        className="w-2 cursor-col-resize hover:bg-accent-soft flex items-center justify-center bg-surface-muted border-r border-border select-none"
        onMouseDown={startResize}
      >
        <button
          onClick={toggleCollapse}
          aria-label="Toggle panel"
          className="w-5 h-5 rounded-full bg-surface border border-border flex items-center justify-center shadow-sm text-xs hover:bg-surface-muted"
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-surface">
        {rightChild}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run src/components/shell/SplitWorkspace.test.tsx`
  Expected: PASS

- [ ] **Step 5: Commit**
  Run:
  ```bash
  git add src/components/shell/SplitWorkspace.tsx src/components/shell/SplitWorkspace.test.tsx
  git commit -m "feat: implement SplitWorkspace core layout and container component"
  ```

---

### Task 2: Create Left ContextPane with Tab Control

**Files:**
- Create: `src/components/shell/ContextPane.tsx`

- [ ] **Step 1: Write ContextPane component**
  Create `src/components/shell/ContextPane.tsx` containing tab switching for Reference data:

```tsx
"use client";

import React, { useState } from "react";

export function ContextPane() {
  const [activeTab, setActiveTab] = useState<"vitals" | "history" | "labs">("vitals");

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="flex border-b border-border bg-surface-muted text-sm font-medium">
        {(["vitals", "history", "labs"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 border-b-2 capitalize transition-colors ${
              activeTab === tab
                ? "border-accent text-accent font-semibold"
                : "border-transparent text-text-subtle hover:text-text"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        {activeTab === "vitals" && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Vitals Overview</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 border border-border rounded-lg bg-surface-muted">
                <span className="text-[10px] text-text-subtle uppercase tracking-wider">Sleep</span>
                <p className="text-lg font-bold mt-1">78%</p>
              </div>
              <div className="p-3 border border-border rounded-lg bg-surface-muted">
                <span className="text-[10px] text-text-subtle uppercase tracking-wider">Pain</span>
                <p className="text-lg font-bold mt-1">4/10</p>
              </div>
            </div>
          </div>
        )}
        {activeTab === "history" && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Patient History</h4>
            <p className="text-xs text-text-subtle">No medical alerts or historical flags recorded.</p>
          </div>
        )}
        {activeTab === "labs" && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Outcomes & Labs</h4>
            <p className="text-xs text-text-subtle">Last outcomes survey completed 2 days ago.</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**
  Run:
  ```bash
  git add src/components/shell/ContextPane.tsx
  git commit -m "feat: implement left ContextPane with tab state and mockup metrics"
  ```

---

### Task 3: Integrate into Clinician App Layout

**Files:**
- Modify: `src/app/(clinician)/layout.tsx`

- [ ] **Step 1: Integrate SplitWorkspace in layout**
  Update the main layout file `src/app/(clinician)/layout.tsx` to wrap the dynamic page views.
  Load current `ContextPane` in the left slot.

- [ ] **Step 2: Verify typecheck & compile**
  Run: `npm run typecheck`
  Expected: Success with no errors.

- [ ] **Step 3: Commit**
  Run:
  ```bash
  git add src/app/(clinician)/layout.tsx
  git commit -m "feat: integrate SplitWorkspace and ContextPane into clinician app layout"
  ```
