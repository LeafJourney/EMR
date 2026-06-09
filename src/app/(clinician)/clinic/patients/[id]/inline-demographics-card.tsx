"use client";

/**
 * Inline-edit demographics + insurance card.
 *
 * Drop-in for the patient chart. Each field uses the <InlineEdit>
 * primitive: click swaps in an input, Enter / blur saves, Esc cancels,
 * errors surface via the project toast system.
 *
 * Server-side writes go through `updatePatientDemographicField` /
 * `updatePatientInsuranceField` so we keep all chart-write auditing in
 * one place.
 */

import {
  InlineEdit,
  inlineValidators,
} from "@/components/ui/inline-edit";
import {
  updatePatientDemographicField,
  updatePatientInsuranceField,
} from "./actions";

interface Props {
  patientId: string;
  /** Marks read-only for unauthorized viewers. */
  canEdit: boolean;
  initial: {
    firstName: string;
    lastName: string;
    /** ISO date string (YYYY-MM-DD) or empty. */
    dateOfBirth: string;
    email: string;
    phone: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    postalCode: string;
  };
  insurance: {
    providerName: string;
    memberId: string;
    groupNumber: string;
  };
}

function unwrap<T extends { ok: true } | { ok: false; error: string }>(
  res: T,
): asserts res is Extract<T, { ok: true }> {
  if (!res.ok) throw new Error(res.error);
}

export function InlineDemographicsCard({
  patientId,
  canEdit,
  initial,
  insurance,
}: Props) {
  const makeDemo =
    (field: Parameters<typeof updatePatientDemographicField>[1]) =>
    async (next: string) => {
      const res = await updatePatientDemographicField(patientId, field, next);
      unwrap(res);
    };
  const makeIns =
    (field: Parameters<typeof updatePatientInsuranceField>[1]) =>
    async (next: string) => {
      const res = await updatePatientInsuranceField(patientId, field, next);
      unwrap(res);
    };

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-xs uppercase tracking-wider text-text-subtle font-semibold mb-2">
          Demographics
        </h3>
        <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-y-1 text-sm">
          <Row label="First name">
            <InlineEdit
              value={initial.firstName}
              onSave={makeDemo("firstName")}
              validator={inlineValidators.required("First name")}
              placeholder="Add first name"
              ariaLabel="first name"
              disabled={!canEdit}
            />
          </Row>
          <Row label="Last name">
            <InlineEdit
              value={initial.lastName}
              onSave={makeDemo("lastName")}
              validator={inlineValidators.required("Last name")}
              placeholder="Add last name"
              ariaLabel="last name"
              disabled={!canEdit}
            />
          </Row>
          <Row label="DOB">
            <InlineEdit
              value={initial.dateOfBirth}
              onSave={makeDemo("dateOfBirth")}
              validator={inlineValidators.isoDate}
              type="date"
              placeholder="YYYY-MM-DD"
              ariaLabel="date of birth"
              disabled={!canEdit}
              renderDisplay={(v) => v || "Add DOB"}
            />
          </Row>
          <Row label="Email">
            <div className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <InlineEdit
                  value={initial.email}
                  onSave={makeDemo("email")}
                  validator={inlineValidators.email}
                  type="email"
                  placeholder="Add email"
                  ariaLabel="email"
                  disabled={!canEdit}
                />
              </div>
              {/* EMR-826 — click-to-mail icon next to the contact detail. */}
              {initial.email && (
                <a
                  href={`mailto:${initial.email}`}
                  title={`Email ${initial.email}`}
                  aria-label="Send email"
                  className="shrink-0 text-text-subtle hover:text-accent"
                >
                  <MailIcon />
                </a>
              )}
            </div>
          </Row>
          <Row label="Phone">
            <div className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <InlineEdit
                  value={initial.phone}
                  onSave={makeDemo("phone")}
                  validator={inlineValidators.phone}
                  type="tel"
                  placeholder="Add phone"
                  ariaLabel="phone"
                  disabled={!canEdit}
                />
              </div>
              {/* EMR-826 — click-to-call icon next to the contact detail. */}
              {initial.phone && (
                <a
                  href={`tel:${initial.phone.replace(/[^0-9+]/g, "")}`}
                  title={`Call ${initial.phone}`}
                  aria-label="Call"
                  className="shrink-0 text-text-subtle hover:text-accent"
                >
                  <PhoneIcon />
                </a>
              )}
            </div>
          </Row>
          <Row label="Address">
            <InlineEdit
              value={initial.addressLine1}
              onSave={makeDemo("addressLine1")}
              placeholder="Add street address"
              ariaLabel="street address"
              disabled={!canEdit}
            />
          </Row>
          <Row label="Apt / Suite">
            <InlineEdit
              value={initial.addressLine2}
              onSave={makeDemo("addressLine2")}
              placeholder="—"
              ariaLabel="apartment or suite"
              disabled={!canEdit}
            />
          </Row>
          <Row label="City">
            <InlineEdit
              value={initial.city}
              onSave={makeDemo("city")}
              placeholder="Add city"
              ariaLabel="city"
              disabled={!canEdit}
            />
          </Row>
          <Row label="State">
            <InlineEdit
              value={initial.state}
              onSave={makeDemo("state")}
              placeholder="Add state"
              ariaLabel="state"
              disabled={!canEdit}
            />
          </Row>
          <Row label="ZIP">
            <InlineEdit
              value={initial.postalCode}
              onSave={makeDemo("postalCode")}
              validator={inlineValidators.postalCode}
              placeholder="Add ZIP"
              ariaLabel="postal code"
              disabled={!canEdit}
            />
          </Row>
        </dl>
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-wider text-text-subtle font-semibold mb-2">
          Insurance
        </h3>
        <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-y-1 text-sm">
          <Row label="Carrier">
            <InlineEdit
              value={insurance.providerName}
              onSave={makeIns("providerName")}
              placeholder="Add carrier"
              ariaLabel="insurance carrier"
              disabled={!canEdit}
            />
          </Row>
          <Row label="Member ID">
            <InlineEdit
              value={insurance.memberId}
              onSave={makeIns("memberId")}
              placeholder="Add member ID"
              ariaLabel="member ID"
              disabled={!canEdit}
            />
          </Row>
          <Row label="Group #">
            <InlineEdit
              value={insurance.groupNumber}
              onSave={makeIns("groupNumber")}
              placeholder="Add group number"
              ariaLabel="group number"
              disabled={!canEdit}
            />
          </Row>
        </dl>
      </section>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-xs text-text-subtle py-1 self-center">{label}</dt>
      <dd className="min-w-0 py-0.5">{children}</dd>
    </>
  );
}

// EMR-826 — compact click-to-contact glyphs.
function MailIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
      <path d="M3 6l7 5 7-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
      <path d="M6 3H4a1 1 0 0 0-1 1c0 7.18 5.82 13 13 13a1 1 0 0 0 1-1v-2a1 1 0 0 0-.76-.97l-2.45-.61a1 1 0 0 0-1 .27l-.7.86a10.6 10.6 0 0 1-4.4-4.4l.86-.7a1 1 0 0 0 .27-1l-.61-2.45A1 1 0 0 0 6 3z" />
    </svg>
  );
}
