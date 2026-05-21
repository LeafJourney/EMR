"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { createPatientAction } from "@/app/(clinician)/clinic/patients/actions";
import { cn } from "@/lib/utils/cn";

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

interface EmergencyContactInput {
  name: string;
  relationship: string;
  phone: string;
  email: string;
}

export function NewPatientModal({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [isPending, startTransition] = useTransition();

  // Step 1: Personal Info
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [sex, setSex] = useState("");
  const [race, setRace] = useState("");
  const [maritalStatus, setMaritalStatus] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");

  // Step 2: Emergency Contacts
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContactInput[]>([
    { name: "", relationship: "", phone: "", email: "" },
    { name: "", relationship: "", phone: "", email: "" },
    { name: "", relationship: "", phone: "", email: "" },
  ]);

  // Step 3: Insurance
  const [insuranceProvider, setInsuranceProvider] = useState("");
  const [memberId, setMemberId] = useState("");
  const [groupNumber, setGroupNumber] = useState("");

  // Validation errors
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [hasValidationError, setHasValidationError] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const handleContactChange = (index: number, field: keyof EmergencyContactInput, value: string) => {
    setEmergencyContacts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const validateStep = (currentStep: number) => {
    const newErrors: Record<string, boolean> = {};
    setHasValidationError(false);

    if (currentStep === 1) {
      if (!firstName.trim()) newErrors.firstName = true;
      if (!lastName.trim()) newErrors.lastName = true;
      if (!dateOfBirth) newErrors.dateOfBirth = true;
    } else if (currentStep === 2) {
      const contact1 = emergencyContacts[0];
      if (!contact1.name.trim()) newErrors["contact-0-name"] = true;
      if (!contact1.relationship.trim()) newErrors["contact-0-relation"] = true;
      if (!contact1.phone.trim()) newErrors["contact-0-phone"] = true;
    } else if (currentStep === 3) {
      if (!insuranceProvider.trim()) newErrors.insuranceProvider = true;
      if (!memberId.trim()) newErrors.memberId = true;
    }

    setErrors(newErrors);
    const isValid = Object.keys(newErrors).length === 0;
    if (!isValid) {
      setHasValidationError(true);
    }
    return isValid;
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateStep(step)) {
      setStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setHasValidationError(false);
    setErrors({});
    setStep((prev) => Math.max(1, prev - 1));
  };

  const resetForm = () => {
    setStep(1);
    setFirstName("");
    setLastName("");
    setDateOfBirth("");
    setPhone("");
    setEmail("");
    setSex("");
    setRace("");
    setMaritalStatus("");
    setPhotoUrl("");
    setAddressLine1("");
    setAddressLine2("");
    setCity("");
    setState("");
    setPostalCode("");
    setEmergencyContacts([
      { name: "", relationship: "", phone: "", email: "" },
      { name: "", relationship: "", phone: "", email: "" },
      { name: "", relationship: "", phone: "", email: "" },
    ]);
    setInsuranceProvider("");
    setMemberId("");
    setGroupNumber("");
    setErrors({});
    setHasValidationError(false);
    setSubmitError("");
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      resetForm();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(3)) return;

    startTransition(async () => {
      setSubmitError("");

      // Filter out completely empty optional emergency contacts
      const filteredContacts = emergencyContacts.filter(
        (c, idx) => idx === 0 || c.name.trim() || c.relationship.trim() || c.phone.trim() || c.email.trim()
      );

      const res = await createPatientAction({
        firstName,
        lastName,
        dateOfBirth,
        phone,
        email,
        sex,
        race,
        maritalStatus,
        photoUrl,
        addressLine1,
        addressLine2,
        city,
        state,
        postalCode,
        emergencyContacts: filteredContacts,
        insurance: {
          providerName: insuranceProvider,
          memberId,
          groupNumber,
        },
      });

      if (res.ok) {
        setOpen(false);
        resetForm();
      } else {
        setSubmitError(res.error || "Failed to create patient chart.");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-text">Add New Patient Chart</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <form onSubmit={handleNext} className="space-y-6 py-2">
            <div className="space-y-4 animate-in fade-in duration-200">
              <h3 className="text-lg font-medium border-b border-border pb-1 text-accent font-display">
                Demographics & Contact
              </h3>

              {/* Avatar Upload */}
              <div className="flex justify-center pb-2">
                <AvatarUpload
                  initialSrc={photoUrl}
                  onUpload={(url) => setPhotoUrl(url)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text uppercase tracking-wider">
                    First Name <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={cn(
                      "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50",
                      errors.firstName && "border-danger ring-2 ring-danger/20"
                    )}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text uppercase tracking-wider">
                    Last Name <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={cn(
                      "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50",
                      errors.lastName && "border-danger ring-2 ring-danger/20"
                    )}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text uppercase tracking-wider">
                    Date of Birth <span className="text-danger">*</span>
                  </label>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className={cn(
                      "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50",
                      errors.dateOfBirth && "border-danger ring-2 ring-danger/20"
                    )}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text uppercase tracking-wider">Sex</label>
                  <select
                    value={sex}
                    onChange={(e) => setSex(e.target.value)}
                    className="w-full rounded-md border border-border bg-surface px-3 h-9 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                  >
                    {SEX_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt || "Select..."}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text uppercase tracking-wider">Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text uppercase tracking-wider">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="patient@example.com"
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text uppercase tracking-wider">Race / Ethnicity</label>
                  <input
                    type="text"
                    value={race}
                    onChange={(e) => setRace(e.target.value)}
                    placeholder="e.g. Hispanic, White, Black..."
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text uppercase tracking-wider">Marital Status</label>
                  <select
                    value={maritalStatus}
                    onChange={(e) => setMaritalStatus(e.target.value)}
                    className="w-full rounded-md border border-border bg-surface px-3 h-9 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                  >
                    {MARITAL_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt || "Select..."}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Address Fields */}
              <div className="space-y-3 pt-2">
                <h4 className="text-sm font-semibold text-text border-b border-border/40 pb-1">Residential Address</h4>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs text-text-muted">Address Line 1</label>
                    <input
                      type="text"
                      value={addressLine1}
                      onChange={(e) => setAddressLine1(e.target.value)}
                      placeholder="123 Main St"
                      className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-text-muted">Address Line 2</label>
                    <input
                      type="text"
                      value={addressLine2}
                      onChange={(e) => setAddressLine2(e.target.value)}
                      placeholder="Apt, Suite, Unit..."
                      className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs text-text-muted">City</label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-text-muted">State</label>
                      <input
                        type="text"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        placeholder="CA"
                        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-text-muted">Zip Code</label>
                      <input
                        type="text"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        placeholder="90210"
                        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {hasValidationError && (
              <p className="text-sm text-danger font-medium bg-danger/10 border border-danger/20 rounded-md px-3 py-2">
                Please complete each field.
              </p>
            )}

            <div className="pt-4 flex items-center justify-between border-t border-border mt-6">
              <div className="text-xs text-text-muted font-medium">Step 1 of 3</div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Next</Button>
              </div>
            </div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleNext} className="space-y-6 py-2">
            <div className="space-y-4 animate-in fade-in duration-200">
              <h3 className="text-lg font-medium border-b border-border pb-1 text-accent font-display">
                Emergency Contacts
              </h3>
              <p className="text-xs text-text-muted">
                Add up to 3 emergency contacts. Contact 1 is required; contacts 2 and 3 are optional.
              </p>

              {emergencyContacts.map((contact, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "p-4 rounded-lg border bg-surface-muted/30 space-y-3",
                    idx === 0 ? "border-accent/30" : "border-border/60"
                  )}
                >
                  <div className="flex items-center justify-between border-b border-border/40 pb-1">
                    <span className="text-xs font-bold text-accent uppercase tracking-wider">
                      Contact {idx + 1} {idx === 0 && <span className="text-danger">*</span>}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs text-text">Name</label>
                      <input
                        type="text"
                        value={contact.name}
                        onChange={(e) => handleContactChange(idx, "name", e.target.value)}
                        className={cn(
                          "w-full rounded-md border border-border bg-surface px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent/50",
                          errors[`contact-${idx}-name`] && "border-danger ring-2 ring-danger/20"
                        )}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-text">Relationship</label>
                      <input
                        type="text"
                        value={contact.relationship}
                        onChange={(e) => handleContactChange(idx, "relationship", e.target.value)}
                        placeholder="e.g. Spouse, Friend..."
                        className={cn(
                          "w-full rounded-md border border-border bg-surface px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent/50",
                          errors[`contact-${idx}-relation`] && "border-danger ring-2 ring-danger/20"
                        )}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-text">Phone</label>
                      <input
                        type="tel"
                        value={contact.phone}
                        onChange={(e) => handleContactChange(idx, "phone", e.target.value)}
                        placeholder="(555) 123-4567"
                        className={cn(
                          "w-full rounded-md border border-border bg-surface px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent/50",
                          errors[`contact-${idx}-phone`] && "border-danger ring-2 ring-danger/20"
                        )}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-text">Email (optional)</label>
                      <input
                        type="email"
                        value={contact.email}
                        onChange={(e) => handleContactChange(idx, "email", e.target.value)}
                        placeholder="contact@example.com"
                        className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent/50"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {hasValidationError && (
              <p className="text-sm text-danger font-medium bg-danger/10 border border-danger/20 rounded-md px-3 py-2">
                Please complete each field.
              </p>
            )}

            <div className="pt-4 flex items-center justify-between border-t border-border mt-6">
              <div className="text-xs text-text-muted font-medium">Step 2 of 3</div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={handleBack}>
                  Back
                </Button>
                <Button type="submit">Next</Button>
              </div>
            </div>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleSubmit} className="space-y-6 py-2">
            <div className="space-y-4 animate-in fade-in duration-200">
              <h3 className="text-lg font-medium border-b border-border pb-1 text-accent font-display">
                Insurance Information
              </h3>
              <p className="text-xs text-text-muted">
                Please enter the primary insurance provider details below.
              </p>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text uppercase tracking-wider">
                    Primary Insurance Provider <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={insuranceProvider}
                    onChange={(e) => setInsuranceProvider(e.target.value)}
                    placeholder="e.g. Blue Shield"
                    className={cn(
                      "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50",
                      errors.insuranceProvider && "border-danger ring-2 ring-danger/20"
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-text uppercase tracking-wider">
                      Member ID / Card ID <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      value={memberId}
                      onChange={(e) => setMemberId(e.target.value)}
                      className={cn(
                        "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50",
                        errors.memberId && "border-danger ring-2 ring-danger/20"
                      )}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-text uppercase tracking-wider">Group Number</label>
                    <input
                      type="text"
                      value={groupNumber}
                      onChange={(e) => setGroupNumber(e.target.value)}
                      className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                    />
                  </div>
                </div>
              </div>
            </div>

            {hasValidationError && (
              <p className="text-sm text-danger font-medium bg-danger/10 border border-danger/20 rounded-md px-3 py-2">
                Please complete each field.
              </p>
            )}

            {submitError && (
              <p className="text-sm text-danger font-medium bg-danger/10 border border-danger/20 rounded-md px-3 py-2">
                {submitError}
              </p>
            )}

            <div className="pt-4 flex items-center justify-between border-t border-border mt-6">
              <div className="text-xs text-text-muted font-medium">Step 3 of 3</div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={handleBack} disabled={isPending}>
                  Back
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Creating Chart..." : "Create Patient"}
                </Button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
