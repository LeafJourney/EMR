"use client";

import { useEffect } from "react";
import { useFormState } from "react-dom";
import { saveProfileAction, type ProfileResult } from "./actions";
import { Input, FieldGroup } from "@/components/ui/input";
import { SubmitButton } from "@/lib/ui/form-helpers";
import { DatePicker, toISODate } from "@/components/ui/date-picker";
import { useToast } from "@/components/ui/toast";

// Patient self-service DOB shouldn't be in the future. Computed once per
// render — adequate for a form that's open briefly.
const PROFILE_TODAY = toISODate(new Date());


export interface ProfileValues {
  firstName: string;
  lastName: string;
  dateOfBirth: string; // ISO date string or ""
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  sex: string;
  race: string;
  maritalStatus: string;
  uniqueThing: string;
}

const SEX_OPTIONS = ["", "Female", "Male", "Intersex", "Prefer not to say"];
const MARITAL_OPTIONS = [
  "",
  "Single",
  "Married",
  "Domestic partnership",
  "Divorced",
  "Widowed",
  "Separated",
  "Prefer not to say",
];

export function ProfileForm({ initial }: { initial: ProfileValues }) {
  const [state, formAction] = useFormState<ProfileResult | null, FormData>(
    saveProfileAction,
    null,
  );
  const { toast } = useToast();

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast({ title: "Profile saved", variant: "success" });
    } else {
      toast({
        title: "Couldn't save profile",
        description: state.error,
        variant: "error",
      });
    }
  }, [state, toast]);

  // Calculate age from DOB
  let age: number | null = null;
  if (initial.dateOfBirth) {
    const dob = new Date(initial.dateOfBirth);
    const today = new Date();
    age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
  }

  return (
    <form action={formAction} className="space-y-8">
      {/* ---- Section 1: Identity ---- */}
      <section>
        <h2 className="font-display text-lg font-medium text-text tracking-tight mb-5">
          Identity
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldGroup label="First name" htmlFor="firstName">
            <Input
              id="firstName"
              name="firstName"
              defaultValue={initial.firstName}
              required
            />
          </FieldGroup>
          <FieldGroup label="Last name" htmlFor="lastName">
            <Input
              id="lastName"
              name="lastName"
              defaultValue={initial.lastName}
              required
            />
          </FieldGroup>
          <FieldGroup
            label="Date of birth"
            htmlFor="dateOfBirth"
            hint={age !== null ? `Age: ${age}` : undefined}
          >
            <DatePicker
              id="dateOfBirth"
              name="dateOfBirth"
              defaultValue={initial.dateOfBirth}
              max={PROFILE_TODAY}
              placeholder="Date of birth"
            />
          </FieldGroup>
          <FieldGroup label="Sex" htmlFor="sex">
            <select
              id="sex"
              name="sex"
              defaultValue={initial.sex}
              className="flex w-full rounded-md border border-border-strong bg-surface px-3 h-10 text-sm text-text transition-colors duration-200 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            >
              {SEX_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt || "Select..."}
                </option>
              ))}
            </select>
          </FieldGroup>
          <FieldGroup label="Race / Ethnicity" htmlFor="race">
            <Input
              id="race"
              name="race"
              defaultValue={initial.race}
              placeholder="e.g. Hispanic, White, Black, Asian..."
            />
          </FieldGroup>
          <FieldGroup label="Marital status" htmlFor="maritalStatus">
            <select
              id="maritalStatus"
              name="maritalStatus"
              defaultValue={initial.maritalStatus}
              className="flex w-full rounded-md border border-border-strong bg-surface px-3 h-10 text-sm text-text transition-colors duration-200 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            >
              {MARITAL_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt || "Select..."}
                </option>
              ))}
            </select>
          </FieldGroup>
        </div>
      </section>

      {/* ---- Section 2: Contact ---- */}
      <section>
        <h2 className="font-display text-lg font-medium text-text tracking-tight mb-5">
          Contact
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldGroup label="Phone" htmlFor="phone">
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={initial.phone}
              placeholder="(555) 123-4567"
            />
          </FieldGroup>
          <FieldGroup label="Email" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={initial.email}
              placeholder="you@example.com"
            />
          </FieldGroup>
        </div>
        <div className="mt-4 space-y-4">
          <FieldGroup label="Address line 1" htmlFor="addressLine1">
            <Input
              id="addressLine1"
              name="addressLine1"
              defaultValue={initial.addressLine1}
              placeholder="123 Main St"
            />
          </FieldGroup>
          <FieldGroup label="Address line 2" htmlFor="addressLine2">
            <Input
              id="addressLine2"
              name="addressLine2"
              defaultValue={initial.addressLine2}
              placeholder="Apt, suite, unit..."
            />
          </FieldGroup>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <FieldGroup label="City" htmlFor="city">
              <Input
                id="city"
                name="city"
                defaultValue={initial.city}
              />
            </FieldGroup>
            <FieldGroup label="State" htmlFor="state">
              <Input
                id="state"
                name="state"
                defaultValue={initial.state}
                placeholder="CA"
              />
            </FieldGroup>
            <FieldGroup label="Zip code" htmlFor="postalCode">
              <Input
                id="postalCode"
                name="postalCode"
                defaultValue={initial.postalCode}
                placeholder="90210"
              />
            </FieldGroup>
          </div>
        </div>
      </section>

      {/* ---- Section 3: About you ---- */}
      <section>
        <h2 className="font-display text-lg font-medium text-text tracking-tight mb-2">
          About you
        </h2>
        <p className="text-sm text-text-muted mb-5">
          Dr. Patel loves learning one unique thing about every patient.
        </p>
        <FieldGroup
          label="1 unique thing about you"
          htmlFor="uniqueThing"
          hint="Something that makes you, you. A hobby, a fun fact, anything."
        >
          <Input
            id="uniqueThing"
            name="uniqueThing"
            defaultValue={initial.uniqueThing}
            placeholder="e.g. I once hiked the entire Appalachian Trail"
          />
        </FieldGroup>
      </section>

      {/* ---- Submit ---- */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <SubmitButton idleLabel="Save profile" pendingLabel="Saving profile…" />
      </div>
    </form>
  );
}
