# Design System

**Benchmark:** Linear, Notion, Superhuman, Hims — not legacy EMR software.

The design language must feel modern, calm, spacious, clinically credible, and unmistakably premium. Information-dense where it needs to be, but never cluttered. No dashboard-builder chrome. No "AI sparkle" gimmicks. Restraint is a feature.

## 1. Tokens

Tokens live in `src/app/globals.css` as CSS custom properties and are referenced by Tailwind via `tailwind.config.ts`. This keeps theming centralized and dark-mode-ready even if dark mode isn't the V1 default.

### Color

The palette is intentionally narrow. One neutral ramp, one accent (a calm clinical green), and a small set of semantic colors.

| Token                | Light          | Purpose                            |
| -------------------- | -------------- | ---------------------------------- |
| `--bg`               | `#FAFAF9`      | App background                     |
| `--surface`          | `#FFFFFF`      | Cards, panels                      |
| `--surface-muted`    | `#F5F5F4`      | Subtle backgrounds, hover states   |
| `--border`           | `#E7E5E4`      | Dividers, card borders             |
| `--border-strong`    | `#D6D3D1`      | Input borders                      |
| `--text`             | `#0C0A09`      | Primary text                       |
| `--text-muted`       | `#57534E`      | Secondary text                     |
| `--text-subtle`      | `#A8A29E`      | Tertiary text, placeholders        |
| `--accent`           | `#047857`      | Primary CTAs, active nav           |
| `--accent-soft`      | `#ECFDF5`      | Accent backgrounds                 |
| `--success`          | `#059669`      | Success states                     |
| `--warning`          | `#B45309`      | Warnings                           |
| `--danger`           | `#B91C1C`      | Destructive states                 |
| `--info`             | `#1D4ED8`      | Info states                        |

**Rule:** never use more than two colors per screen. The accent exists to direct attention, not to decorate.

#### Status accents (Fleet Command Directive, June 2026)

Soft, low-saturation fill/text pairs for status communication in clinical
workspaces. They are indicators, not decoration — they don't count against
the two-color rule, but they obey its spirit: pastel fills, quiet presence.
Defined in `src/app/globals.css` (light + dark) and exposed via
`tailwind.config.ts`.

| Token pair                                  | Light fill / text     | Purpose                                  |
| ------------------------------------------- | --------------------- | ---------------------------------------- |
| `--status-positive-bg` / `--status-positive-fg` | `#E2F0D9` / `#385723` | Approvals, positive status (sage)        |
| `--status-alert-bg` / `--status-alert-fg`       | `#FCE4D6` / `#C65911` | Alerts, immediate gaps (soft terracotta) |
| `--status-link-bg` / `--status-link-fg`         | `#DDEBF7` / `#1F4E78` | Interactive links (muted slate blue)     |

Tailwind: `bg-status-positive-bg text-status-positive-fg`, etc. Dark mode
follows the existing pastel approach — preserve hue, drop fill value,
brighten text. Use these for status chips, highlighted rows, and inline
insight cards; keep `--success` / `--warning` / `--danger` for hard semantic
states (toasts, destructive actions, validation).

### Typography

- **Sans:** Inter (via `next/font/google`), with variable font features enabled.
- **Mono:** JetBrains Mono (used only for codes, identifiers, timestamps in dense tables).

Scale:

| Token     | Size      | Line height | Use                      |
| --------- | --------- | ----------- | ------------------------ |
| `text-xs` | 12px      | 16px        | Labels, metadata         |
| `text-sm` | 14px      | 20px        | Body, table cells        |
| `text-base` | 15px    | 24px        | Default paragraph        |
| `text-lg` | 17px      | 26px        | Emphasized body          |
| `text-xl` | 20px      | 28px        | Section headers          |
| `text-2xl`| 24px      | 32px        | Page headers             |
| `text-3xl`| 30px      | 36px        | Hero                     |

Weights: 400 (body), 500 (emphasized), 600 (headings). Never 700 — it reads as shouty in this aesthetic.

### Spacing

8px base grid. Tailwind's default spacing scale is fine; the discipline is not in the scale, it's in the usage.

- Card padding: `p-6` (24px)
- Card gap in stacks: `gap-4` (16px)
- Section vertical rhythm: `space-y-8` (32px)
- Page max width: `max-w-[1400px]` for clinician workspace, `max-w-[960px]` for patient portal

### Radius

- `rounded-lg` (8px) for cards and inputs
- `rounded-md` (6px) for buttons
- `rounded-full` for avatars and pills

### Shadow

Two shadows only:

- `shadow-sm` — resting card elevation. A single 1px hairline, not a blur.
- `shadow-md` — modal / popover. Restrained.

No neon glows. No layered 4-stop shadows.

### Motion

- Durations: 150ms (micro), 200ms (default), 300ms (page transitions).
- Easing: `cubic-bezier(0.2, 0, 0, 1)` — smooth out, no bounce.
- Respect `prefers-reduced-motion`.

## 2. Primitives

All primitives live in `src/components/ui/`. They are hand-rolled, not pulled from a library. Each one is small, opinionated, and composable.

- `Button` — `variant: primary | secondary | ghost | danger`, `size: sm | md | lg`. Icon support via `leadingIcon`, `trailingIcon`.
- `Card` — surface container with consistent padding. Subcomponents: `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.
- `Input`, `Textarea`, `Select` — shared focus ring (`ring-2 ring-accent/20`), consistent 40px height.
- `Badge` — `tone: neutral | accent | success | warning | danger | info`. Pill-shaped, 12px text.
- `Avatar` — initial-based fallback, image support, size variants.
- `Separator` — 1px hairline.
- `Label` — 13px, muted, uppercase tracking-wide for section labels only; regular case for form labels.
- `EmptyState` — icon + title + description + optional CTA. Used liberally instead of empty tables.
- `Skeleton` — shimmer-free, static muted blocks. Calm loading, not busy.

## 3. Composite patterns

### Card + Timeline
The core metaphor for longitudinal views. Cards stack in a vertical timeline with subtle left-edge ticks and date labels. Used for: patient record timeline, encounter history, outcome logs.

### Side Panel (Research, AI assist)
A persistent 360px right-hand panel that can be collapsed. Never a modal. Never a floating chat bubble.

### Two-column chart
Clinician workspace uses a 2-column layout: left is navigation + patient list, right is the chart. Chart is internally split into a summary header + tabbed sub-sections.

### Metric tile
Used on dashboards. `Label → Value → Trend → Sparkline`. Single metric per tile. Never more.

### Task list
Checkbox + title + metadata row + optional inline action. Used on patient dashboard, ops dashboard, and Mission Control approval queue.

## 4. Layout patterns

### AppShell
Every authenticated role uses the same `AppShell` composition:

```
┌────────────────────────────────────────────────────┐
│  TopBar                                            │
├───────────┬────────────────────────────────────────┤
│           │                                        │
│  SideNav  │            Content area                │
│  (240px)  │            (fluid, max-width capped)   │
│           │                                        │
└───────────┴────────────────────────────────────────┘
```

The shell is role-aware: SideNav items, TopBar actions, and avatar menu come from a per-role config. One component, multiple experiences.

### Marketing / acquisition
Totally distinct from the app shell. No nav chrome. Hero + clear CTA + trust markers. Inter at larger sizes, generous whitespace.

## 5. Content voice

- Warm but precise. Never chirpy.
- Short sentences. Active voice.
- No exclamation points in the product UI.
- Errors explain what went wrong **and** what the user can do next.
- AI outputs are labeled as drafts. Always.

## 6. Accessibility

- Minimum contrast 4.5:1 for body text, 3:1 for UI elements.
- All interactive elements focusable and keyboard-operable.
- `aria-label` on icon-only buttons.
- Forms use proper `<label>` association; never placeholder-as-label.
- Keyboard shortcuts in the clinician workspace (J/K for patient list, / for search, G+P for dashboard) — documented inline.

## 7. What we explicitly avoid

- Rainbow color charts
- Pill badges on every field
- Emojis in the UI
- Multiple competing font families
- "Glassmorphism"
- Excessive modals — prefer inline panels and drawers
- "AI" branding on every feature
- Dashboards that look like someone dragged 30 widgets onto a grid

## 8. Fleet Command Directive (June 2026)

Dr. Patel's Core Master Prompt Blueprint (epic EMR-1125) sets hard efficiency
budgets on top of everything above. Full rules live in `CLAUDE.md`
("Fleet Command Directive"); the design-relevant summary:

### The Four Golden Axioms

1. **Click-Elimination** — routine clinical workflows complete in **≤2
   clicks** from the primary dashboard viewport. Contextual prediction,
   hover actions, autofill, Cmd+K.
2. **Scroll-Elimination** — critical patient/encounter details fit a
   **single non-scrolling viewport**. Tabbed side drawers, expanding canvas
   grids, split viewports. No endless vertical timelines.
3. **Typing-Reduction** — no manual typing of standard clinical prose or
   routine code lookups. Ambient capture drafts + intelligent defaults.
4. **Zen-Density** — spacious 16–24px padding grid, soft pastel status
   indicators (§1 status accents), muted neutral backgrounds, clear text
   hierarchy. Information appears only when relevant.

Designs requiring scrolling for mandatory forms, multi-step wizards, or
stacked pop-up confirmations are rejected and rebuilt with slide-out
contextual drawers and predictive entry. Sub-workflows never use popups —
drawers or inline expanding rows only, minimum 12px separation.

### Workspace geometry

| Region                | Layout                                          | Scroll mitigation                                | Click shortcuts                                        |
| --------------------- | ----------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------ |
| Global Control Box    | Centered floating search bar (Cmd+K)            | 0px — results render in a clean overlay          | Instant focus; contextual actions per query             |
| Patient Summary HUD   | Sticky header row, top 80px of the screen       | 0px — key stats in horizontal groups             | Hover opens a tooltip bubble with trend graphs          |
| Active Care Canvas    | Three-column grid with clean gutters            | Deep history lives inside scroll-free tab rows   | One click expands a section; click-away collapses it    |
| Context Action Drawer | Right-hand slide-out drawer overlay             | Drawer height adapts dynamically to content      | Single-click approve / authorize / save actions         |

The existing AppShell (§4) and side-panel patterns (§3) remain the
foundation; the geometry above is the target composition for clinician
encounter workspaces as they are rebuilt under EMR-1125.
