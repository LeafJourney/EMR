# Left-Click Booking & Auto-Patient Pre-selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow left-clicking empty scheduling slots to immediately open the Schedule Patient modal, and auto-select the patient if a patient query parameter is present in the URL.

**Architecture:** Pass the URL-parsed patient ID prop from the server component to the client calendar. Update the slot click handlers to support clicking, and pass the patient detail through to the schedule modal.

**Tech Stack:** React, Next.js, TailwindCSS, TypeScript

---

### Task 1: Update Server Page SearchParams and Prop Passing

**Files:**
- Modify: `src/app/(clinician)/clinic/schedule/page.tsx:9-96`

- [ ] **Step 1: Update page component arguments**
  Add `patient` and `patientId` to `searchParams` type signature of `ClinicianSchedulePage`.
  ```typescript
  export default async function ClinicianSchedulePage({
    searchParams,
  }: {
    searchParams: { week?: string; view?: string; patient?: string; patientId?: string };
  }) {
  ```

- [ ] **Step 2: Pass patientId prop to ScheduleCalendar**
  Add `patientId={searchParams.patient || searchParams.patientId}` to the `<ScheduleCalendar>` JSX instantiation:
  ```typescript
        <ScheduleCalendar
          weekStartIso={weekStart.toISOString()}
          appointments={dtos}
          initialView={(searchParams.view as "day" | "week" | "list") ?? "week"}
          timeZone={timeZone}
          patients={patients.map((p) => ({
            id: p.id,
            firstName: p.firstName,
            lastName: p.lastName,
            phone: p.phone,
            dateOfBirthIso: p.dateOfBirth?.toISOString() ?? null,
            email: p.email,
            address: p.addressLine1
              ? `${p.addressLine1}${p.city ? `, ${p.city}` : ""}${p.state ? ` ${p.state}` : ""}`
              : null,
          }))}
          patientId={searchParams.patient || searchParams.patientId}
        />
  ```

- [ ] **Step 3: Run typecheck to verify interface compatibility**
  Run: `npm run typecheck`  
  Expected: Compile errors in `schedule-calendar.tsx` regarding the unrecognized `patientId` prop (verifying task is set up to receive the prop).

- [ ] **Step 4: Commit**
  ```bash
  git add src/app/\(clinician\)/clinic/schedule/page.tsx
  git commit -m "feat(schedule): read patient search parameter on server page"
  ```

---

### Task 2: Implement Component Prop and Setup Click Handling on ScheduleCalendar

**Files:**
- Modify: `src/app/(clinician)/clinic/schedule/schedule-calendar.tsx:42-402`

- [ ] **Step 1: Update ScheduleCalendar Props type definition**
  Modify the `Props` type definition to include `patientId?: string;`:
  ```typescript
  type Props = {
    weekStartIso: string;
    appointments: AppointmentDTO[];
    initialView?: View;
    timeZone: string;
    patients: PatientDTO[];
    patientId?: string;
  };
  ```

- [ ] **Step 2: Add handleSlotClick function inside ScheduleCalendar**
  Inside the component body, add `patientId` to destructured props:
  ```typescript
  export function ScheduleCalendar({
    weekStartIso,
    appointments,
    initialView = "week",
    timeZone,
    patients,
    patientId,
  }: Props) {
  ```
  Add the helper to construct Date from slot indices:
  ```typescript
    const handleSlotClick = (dayIdx: number, slotIdx: number) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + dayIdx);
      d.setMinutes(FIRST_HOUR * 60 + slotIdx * SLOT_MIN);
      d.setSeconds(0);
      d.setMilliseconds(0);
      setShowScheduleModal(d);
    };
  ```

- [ ] **Step 3: Update WeekGrid and DayGrid instantiation inside ScheduleCalendar**
  Pass the slot click handler down to grids:
  ```typescript
        <WeekGrid
          weekStart={weekStart}
          appointments={appointments}
          onDrop={onDrop}
          onContextMenu={handleSlotContextMenu}
          onSlotClick={handleSlotClick}
          pending={pending}
        />
  ```
  And for `DayGrid`:
  ```typescript
        <DayGrid
          day={dayStart}
          appointments={appointments.filter((a) =>
            sameDay(new Date(a.startAtIso), dayStart),
          )}
          onDrop={(apptId, slotIdx) => {
            const dayIdx = Math.round(
              (dayStart.getTime() - weekStart.getTime()) / 86_400_000,
            );
            return onDrop(apptId, dayIdx, slotIdx);
          }}
          onContextMenu={(e, slotIdx) => {
            const dayIdx = Math.round(
              (dayStart.getTime() - weekStart.getTime()) / 86_400_000,
            );
            return handleSlotContextMenu(e, dayIdx, slotIdx);
          }}
          onSlotClick={(slotIdx) => {
            const dayIdx = Math.round(
              (dayStart.getTime() - weekStart.getTime()) / 86_400_000,
            );
            return handleSlotClick(dayIdx, slotIdx);
          }}
          pending={pending}
        />
  ```

- [ ] **Step 4: Update ScheduleModal rendering in ScheduleCalendar**
  Pass `initialPatient` to the `ScheduleModal`:
  ```typescript
        <ScheduleModal
          startDate={showScheduleModal}
          patients={patients}
          appointments={appointments}
          timeZone={timeZone}
          onClose={() => setShowScheduleModal(null)}
          initialPatient={patients.find((p) => p.id === patientId) || null}
          onSave={async (patientId, duration, modality, notes, force) => {
  ```

- [ ] **Step 5: Run typecheck to verify interface compatibility**
  Run: `npm run typecheck`  
  Expected: Compile errors in `WeekGrid`, `DayGrid`, and `ScheduleModal` regarding the new props/callbacks.

- [ ] **Step 6: Commit**
  ```bash
  git add src/app/\(clinician\)/clinic/schedule/schedule-calendar.tsx
  git commit -m "feat(schedule): add prop definitions and event wiring in calendar component"
  ```

---

### Task 3: Implement Left-Click Handlers in Grid and Slot Sub-components

**Files:**
- Modify: `src/app/(clinician)/clinic/schedule/schedule-calendar.tsx:410-600`

- [ ] **Step 1: Update WeekGrid signature and Slots rendering**
  Update the signature of `WeekGrid` to receive `onSlotClick`:
  ```typescript
  function WeekGrid({
    weekStart,
    appointments,
    onDrop,
    onContextMenu,
    onSlotClick,
    pending,
  }: {
    weekStart: Date;
    appointments: AppointmentDTO[];
    onDrop: (apptId: string, dayIdx: number, slotIdx: number) => void;
    onContextMenu: (e: React.MouseEvent, dayIdx: number, slotIdx: number) => void;
    onSlotClick: (dayIdx: number, slotIdx: number) => void;
    pending: boolean;
  }) {
  ```
  Pass `onClick` down to the `Slot` components:
  ```typescript
                  {DAYS.map((_, dayIdx) => (
                    <Slot
                      key={`${dayIdx}:${slotIdx}`}
                      dayIdx={dayIdx}
                      slotIdx={slotIdx}
                      appointment={findAppt(appointments, weekStart, dayIdx, slotIdx)}
                      onDrop={(apptId) => onDrop(apptId, dayIdx, slotIdx)}
                      onContextMenu={(e) => onContextMenu(e, dayIdx, slotIdx)}
                      onClick={() => onSlotClick(dayIdx, slotIdx)}
                      pending={pending}
                      hourMark={isHourMark}
                    />
                  ))}
  ```

- [ ] **Step 2: Update Slot component signature and handlers**
  Modify `Slot` component to accept `onClick`:
  ```typescript
  function Slot({
    dayIdx,
    slotIdx,
    appointment,
    onDrop,
    onContextMenu,
    onClick,
    pending,
    hourMark,
  }: {
    dayIdx: number;
    slotIdx: number;
    appointment: AppointmentDTO | null;
    onDrop: (apptId: string) => void;
    onContextMenu: (e: React.MouseEvent) => void;
    onClick: () => void;
    pending: boolean;
    hourMark: boolean;
  }) {
  ```
  And update its rendering logic to trigger `onClick` only when there is no appointment, and use `cursor-pointer` for empty cells:
  ```typescript
    const [isOver, setIsOver] = React.useState(false);
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsOver(false);
          const apptId = e.dataTransfer.getData("text/appt-id");
          if (apptId) onDrop(apptId);
        }}
        onContextMenu={onContextMenu}
        onClick={(e) => {
          if (!appointment) {
            onClick();
          }
        }}
        className={cn(
          "border-r border-border/40 hover:bg-surface-muted transition-colors",
          appointment ? "cursor-context-menu" : "cursor-pointer",
          hourMark && "border-t border-border/60",
          isOver && "bg-accent-soft/50",
          pending && "opacity-70",
        )}
        style={{ height: SQUARE }}
      >
        {appointment && <AppointmentChip appt={appointment} />}
      </div>
    );
  }
  ```

- [ ] **Step 3: Update DayGrid component signature and handlers**
  Modify the `DayGrid` component definition to receive and call `onSlotClick`:
  ```typescript
  function DayGrid({
    day,
    appointments,
    onDrop,
    onContextMenu,
    onSlotClick,
    pending,
  }: {
    day: Date;
    appointments: AppointmentDTO[];
    onDrop: (apptId: string, slotIdx: number) => void;
    onContextMenu: (e: React.MouseEvent, slotIdx: number) => void;
    onSlotClick: (slotIdx: number) => void;
    pending: boolean;
  }) {
  ```
  And update the click handling and classes inside `DayGrid`:
  ```typescript
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const apptId = e.dataTransfer.getData("text/appt-id");
                      if (apptId) onDrop(apptId, slotIdx);
                    }}
                    onContextMenu={(e) => onContextMenu(e, slotIdx)}
                    onClick={() => {
                      if (!inSlot) {
                        onSlotClick(slotIdx);
                      }
                    }}
                    className={cn(
                      "border-l border-border/40 hover:bg-surface-muted transition-colors",
                      inSlot ? "cursor-context-menu" : "cursor-pointer",
                      isHourMark && "border-t border-border/60",
                      pending && "opacity-70",
                    )}
                    style={{ height: SQUARE }}
                  >
                    {inSlot && <AppointmentChip appt={inSlot} />}
                  </div>
  ```

- [ ] **Step 4: Run typecheck to verify interface compatibility**
  Run: `npm run typecheck`  
  Expected: Compile errors only in `ScheduleModal` related to the new `initialPatient` prop.

- [ ] **Step 5: Commit**
  ```bash
  git add src/app/\(clinician\)/clinic/schedule/schedule-calendar.tsx
  git commit -m "feat(schedule): support onClick on empty slots in WeekGrid and DayGrid"
  ```

---

### Task 4: Implement Initial Patient Pre-selection in ScheduleModal

**Files:**
- Modify: `src/app/(clinician)/clinic/schedule/schedule-calendar.tsx:838-892`

- [ ] **Step 1: Add initialPatient prop type to ScheduleModal**
  Modify `ScheduleModal` definition:
  ```typescript
  function ScheduleModal({
    startDate,
    patients,
    appointments,
    timeZone,
    onClose,
    onSave,
    initialPatient,
  }: {
    startDate: Date;
    patients: PatientDTO[];
    appointments: AppointmentDTO[];
    timeZone: string;
    onClose: () => void;
    onSave: (patientId: string, duration: number, modality: string, notes: string, force: boolean) => void;
    initialPatient?: PatientDTO | null;
  }) {
  ```

- [ ] **Step 2: Update selectedPatient state initialization**
  Initialize `selectedPatient` with the `initialPatient` prop:
  ```typescript
    const [search, setSearch] = React.useState("");
    const [selectedPatient, setSelectedPatient] = React.useState<PatientDTO | null>(initialPatient || null);
  ```

- [ ] **Step 3: Run typecheck to verify interface compatibility**
  Run: `npm run typecheck`  
  Expected: SUCCESS (no errors)

- [ ] **Step 4: Run local test suite**
  Run: `npm test`  
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add src/app/\(clinician\)/clinic/schedule/schedule-calendar.tsx
  git commit -m "feat(schedule): pre-select patient in ScheduleModal via initialPatient prop"
  ```
