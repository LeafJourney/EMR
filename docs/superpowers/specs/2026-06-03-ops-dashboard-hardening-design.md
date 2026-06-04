# Design Spec: Operator Dashboard Hardening & Interactivity

**Date:** 2026-06-03  
**Status:** Approved  
**Author:** Antigravity  

This document details the enhancements, UI refinements, and interactive behaviors for the Operator dashboards: Documents Inbox & Outbox (mail-fax), Denials Command Center, and Claim Scrub Workbench.

---

## 1. Goal Description
The operators (billing team, medical records staff) require a more interactive, clear, and functional interface to process inbound correspondence, resolve denied claims, and scrub outgoing claims. Specifically, we are implementing a series of refinements across three dashboards:
* **Documents (Mail/Fax)**: Add Inbox/Outbox tabs, interactive document upload ("Scan"), soft-deleted items recovery, interactive split-pane document/OCR viewer, "Add Insurance" chart linkage, and "Send Fax/Email" composer.
* **Denials**: Integrate a 3-option action modal (Corrected Claim, Fix Coding, Peer-to-Peer) and align AI recommendations under the "Cindy suggests" brand.
* **Scrub**: Improve legibility, enlarge CPT/ICD-10 badges, add contextual "Fix in chart" deep-links, style warning cards, and rename the clean status state.

---

## 2. Architecture & Components

```
src/app/(operator)/ops/
├── mail-fax/
│   ├── page.tsx (Server Component: queries DB for real patients)
│   └── mail-fax-client.tsx (Client Component: interactive state, tabs, modals, viewer)
├── denials/
│   ├── page.tsx (Server Component)
│   └── denials-client.tsx (Client Component: action modals)
└── scrub/
    ├── page.tsx (Server Component)
    └── scrub-workbench.tsx (Client Component: deep-links, warning styling)
```

### Component Details

#### A. Documents Inbox & Outbox
* **`MailFaxPage` (`page.tsx`)**:
  - Fetches the active patient list from Prisma to match incoming faxes with actual patient records.
  - Passes DB patient metadata to the client component.
* **`MailFaxClient` (`mail-fax-client.tsx`)**:
  - **Tabs**: Handles `tab` state (`"inbox"` vs `"outbox"`).
  - **Filters**: Clicking the top stat tiles filters the visible inbox rows.
  - **Scan Action**: Simulates document upload with a progress bar, appending a mock item to the list.
  - **Deleted Items Drawer**: Opens a modal showing deleted documents, allowing "Recover" or "Permanent Delete".
  - **Side-by-Side OCR Viewer**: Replacing `<details>` with a collapsible container:
    - **Left**: Rendered physical document frame.
    - **Right**: OCR text display.
  - **Insurance Link**: Renders an "Insurance" button in the extracted card pointing to `/clinic/patients/${patientId}`.
  - **Outbox List**: Displays outgoing transmissions. Sending a new document appends to this list.

#### B. Denials Command Center
* **`DenialCard` (`denials-client.tsx`)**:
  - Adds a state-driven action modal triggered by "Take action".
  - The modal provides 3 clear paths:
    1. **Corrected Claim**: Triggers resubmission animation + success alert.
    2. **Fix Coding**: Links to coder view + success alert.
    3. **Peer-to-Peer**: Triggers clinical scheduler helper.
  - Renames the triage category block header to "Cindy suggests".

#### C. Claim Scrub Workbench
* **`ClaimRow` / `IssueRow` (`scrub-workbench.tsx`)**:
  - Metadata lines (serviceDate, payerName, claimNumber) styled with `text-xs font-semibold text-text-muted` for legibility.
  - CPT and ICD-10 badges enlarged to `text-xs`.
  - Contextual link `Fix in chart →` next to each rule error:
    - `MISSING_DIAGNOSIS` -> `/clinic/patients/${patientId}`
    - Others -> `/clinic/patients/${patientId}/billing`
  - Style `warning` issue boxes with `bg-amber-50/50 border border-amber-200/50 text-amber-900` to denote a soft warning.

---

## 3. Data Flow & State Management

### Outbox Additions
```
[Compose Modal] ➔ [Submit Form] ➔ [Append to Outbox State array] ➔ [Outbox List Renders Update]
```

### Clickable Filters
```
[Click Stat Tile] ➔ [Active Filter State Updated] ➔ [Filters Inbox Array]
```

---

## 4. Verification & Testing Plan
* **Manual Verification**: Run Next.js locally and verify all interactions visually:
  - Verify split-pane document viewer collapses and expands smoothly.
  - Verify clicking "Send" adds a sent fax/email to the Outbox.
  - Verify clicking "Take action" on a denied claim prompts the 3-option modal.
  - Verify deep-links redirect to the patient pages.
* **Automated Tests**: Run existing Vitest tests to ensure no regressions on the scrub/denial/OCR business logic.
