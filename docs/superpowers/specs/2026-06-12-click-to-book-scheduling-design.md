# Design Spec: Left-Click Booking & Auto-Patient Pre-selection on Scheduling page

**Date**: 2026-06-12  
**Status**: Approved  

## Purpose & Goals
The scheduling calendar currently requires clinicians to right-click an empty slot to schedule an appointment, showing a context menu. Furthermore, the schedule page does not support automatically pre-selecting the patient when arriving from a link containing `?patient=...` (such as the "Book on schedule" button on tasks). 

This design aims to:
- Make left-clicking empty grid slots in both week and day views immediately trigger the **Schedule Patient** modal.
- Automatically pre-select the patient when a `patient` or `patientId` URL query parameter is supplied.
- Retain the right-click context menu (which allows scheduling a patient or creating a blocked time slot).
- Swap the cursor to a pointer for empty slots to make them visually interactive.

## Proposed Changes

### 1. Server Page Component
Modify `/Users/scottwayman/EMR/src/app/(clinician)/clinic/schedule/page.tsx` to:
- Read `patient` and `patientId` search parameters.
- Pass `patientId` to `<ScheduleCalendar>` falling back to either parameter.

### 2. Client Calendar Component
Modify `/Users/scottwayman/EMR/src/app/(clinician)/clinic/schedule/schedule-calendar.tsx` to:
- Accept `patientId` prop.
- Wire up an `onClick` event on empty slots in `Slot` (Week view) and `DayGrid` (Day view) to invoke `handleSlotClick`.
- Change cursor on empty slots from `cursor-context-menu` to `cursor-pointer`.
- Pass `initialPatient` to the `ScheduleModal` component, resolved from the local `patients` array using the `patientId` prop.
- Inside `ScheduleModal`, initialize `selectedPatient` state with the `initialPatient` prop so the patient card (with change option) renders by default instead of the search field.

## Verification Plan

### Automated Tests
- Run `npm test` to ensure there are no breaking regressions with calendar interactions.
- Run `npm run typecheck` to verify TypeScript compilation.

### Manual Verification
- Navigate to `/clinic/schedule?patient=<id>` and click an empty slot. Verify the modal opens with the selected patient already populated.
- Left-click an empty slot on week/day view with no query parameter. Verify the modal opens with a search input.
- Right-click an empty slot on week/day view. Verify the context menu still opens.
