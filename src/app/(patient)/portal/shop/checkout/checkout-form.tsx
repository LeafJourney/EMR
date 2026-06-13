"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const INPUT_CLASS =
  "flex w-full rounded-md border border-border bg-surface px-3 h-10 text-sm text-text placeholder:text-text-subtle focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all";

interface CheckoutFormProps {
  items: any[];
  subtotal: number;
  tax: number;
  total: number;
  onSuccess: (orderId: string) => void;
}

export function CheckoutForm({ items, subtotal, tax, total, onSuccess }: CheckoutFormProps) {
  const [fulfillmentType, setFulfillmentType] = useState<"pickup" | "ach">("pickup");

  // Form states
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [zip, setZip] = useState("");

  // ACH states
  const [achRouting, setAchRouting] = useState("");
  const [achAccount, setAchAccount] = useState("");
  const [achAuthorized, setAchAuthorized] = useState(false);

  // Pickup / Dispensary states
  const [searchZip, setSearchZip] = useState("");
  const [dispensaries, setDispensaries] = useState<any[]>([]);
  const [selectedDispensaryId, setSelectedDispensaryId] = useState<string | null>(null);
  const [isLoadingDispensaries, setIsLoadingDispensaries] = useState(false);
  const [dispensaryError, setDispensaryError] = useState("");

  // Submit / error states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Auto-fetch dispensaries when ZIP code changes or initially
  const fetchDispensaries = useCallback(async (loc: string) => {
    if (!loc) return;
    setIsLoadingDispensaries(true);
    setDispensaryError("");
    try {
      const res = await fetch(`/api/dispensary/nearby?address=${encodeURIComponent(loc)}`);
      if (res.ok) {
        const data = await res.json();
        setDispensaries(data.results || []);
        if (data.results?.length > 0) {
          setSelectedDispensaryId(data.results[0].id);
        }
      } else {
        setDispensaryError("Failed to find nearby dispensaries.");
      }
    } catch (err) {
      setDispensaryError("Network error finding dispensaries.");
    } finally {
      setIsLoadingDispensaries(false);
    }
  }, []);

  useEffect(() => {
    const loc = searchZip || zip || "Seattle, WA";
    fetchDispensaries(loc);
  }, [zip, searchZip, fetchDispensaries]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fulfillmentType === "ach" && (!achRouting || !achAccount || !achAuthorized)) {
      setSubmitError("Please fill out all ACH information and authorize the payment.");
      return;
    }
    if (fulfillmentType === "pickup" && !selectedDispensaryId) {
      setSubmitError("Please select a dispensary for order pickup.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      const res = await fetch("/api/shop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          subtotal,
          tax,
          total,
          fulfillmentType,
          dispensaryId: fulfillmentType === "pickup" ? selectedDispensaryId : null,
          achRouting: fulfillmentType === "ach" ? achRouting : null,
          achAccount: fulfillmentType === "ach" ? achAccount : null,
          shippingAddress: {
            name,
            addressLine1: address,
            city,
            state: stateCode,
            postalCode: zip,
            email,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        onSuccess(data.orderId);
      } else {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data.error || "An error occurred during checkout.");
      }
    } catch (err) {
      setSubmitError("A connection error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ── Fulfillment Type Selector ─────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 p-1 rounded-xl bg-muted/30 border border-border">
        <button
          type="button"
          onClick={() => {
            setFulfillmentType("pickup");
            setSubmitError("");
          }}
          className={`py-3 px-4 rounded-lg text-sm font-semibold transition-all ${
            fulfillmentType === "pickup"
              ? "bg-white text-text shadow-sm border border-border"
              : "text-text-muted hover:text-text"
          }`}
        >
          🏪 Reserve for Pick-up
        </button>
        <button
          type="button"
          onClick={() => {
            setFulfillmentType("ach");
            setSubmitError("");
          }}
          className={`py-3 px-4 rounded-lg text-sm font-semibold transition-all ${
            fulfillmentType === "ach"
              ? "bg-white text-text shadow-sm border border-border"
              : "text-text-muted hover:text-text"
          }`}
        >
          🏦 Pre-pay via ACH
        </button>
      </div>

      {/* ── Contact & Shipping Address info ───────────────────── */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <h3 className="text-sm font-bold text-text uppercase tracking-wider mb-2">
            Patient Information
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="name" className="block text-xs font-semibold text-text-muted mb-1">
                Full Name
              </label>
              <input
                id="name"
                required
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-text-muted mb-1">
                Email Address
              </label>
              <input
                id="email"
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div>
            <label htmlFor="address" className="block text-xs font-semibold text-text-muted mb-1">
              Address
            </label>
            <input
              id="address"
              required
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St"
              className={INPUT_CLASS}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="city" className="block text-xs font-semibold text-text-muted mb-1">
                City
              </label>
              <input
                id="city"
                required
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Seattle"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="stateCode" className="block text-xs font-semibold text-text-muted mb-1">
                State
              </label>
              <input
                id="stateCode"
                required
                type="text"
                maxLength={2}
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value.toUpperCase())}
                placeholder="WA"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="zip" className="block text-xs font-semibold text-text-muted mb-1">
                ZIP Code
              </label>
              <input
                id="zip"
                required
                type="text"
                value={zip}
                onChange={(e) => {
                  setZip(e.target.value);
                  if (e.target.value.length >= 5) {
                    setSearchZip(e.target.value);
                  }
                }}
                placeholder="98101"
                className={INPUT_CLASS}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Pickup Dispensary Selection ────────────────────────── */}
      {fulfillmentType === "pickup" && (
        <Card className="border-2 border-emerald-500/10">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-bold text-text uppercase tracking-wider">
                Select Pickup Dispensary
              </h3>
              {selectedDispensaryId && (
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                  Dispensary Selected
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter ZIP or City to search..."
                value={searchZip}
                onChange={(e) => setSearchZip(e.target.value)}
                className={`${INPUT_CLASS} flex-1`}
              />
              <button
                type="button"
                onClick={() => fetchDispensaries(searchZip || zip)}
                className="px-4 py-2 bg-muted hover:bg-muted/80 text-text text-sm font-semibold rounded-lg border border-border"
              >
                Search
              </button>
            </div>

            {dispensaryError && (
              <p className="text-xs text-red-600 font-medium">⚠️ {dispensaryError}</p>
            )}

            {isLoadingDispensaries ? (
              <div className="flex justify-center items-center py-6 text-text-muted gap-2 text-xs">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-600" />
                Finding nearby dispensaries...
              </div>
            ) : dispensaries.length === 0 ? (
              <p className="text-xs text-text-muted italic text-center py-4">
                No dispensaries found within 30 miles. Please enter a different location.
              </p>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {dispensaries.map((disp) => {
                  const isSelected = selectedDispensaryId === disp.id;
                  return (
                    <label
                      key={disp.id}
                      className={`flex items-start justify-between gap-4 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        isSelected
                          ? "border-emerald-500 bg-emerald-50/30"
                          : "border-border hover:border-accent/40"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <input
                          type="radio"
                          name="dispensary"
                          checked={isSelected}
                          onChange={() => setSelectedDispensaryId(disp.id)}
                          className="mt-1 h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                        />
                        <div>
                          <p className="text-sm font-semibold text-text">{disp.name}</p>
                          <p className="text-xs text-text-muted">
                            📍 {disp.geo.addressLine1}, {disp.geo.city}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                        {disp.distanceMiles.toFixed(1)} mi
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── ACH Bank details ─────────────────────────────────── */}
      {fulfillmentType === "ach" && (
        <Card className="border-2 border-emerald-500/10">
          <CardContent className="pt-6 space-y-4">
            <h3 className="text-sm font-bold text-text uppercase tracking-wider">
              ACH Bank Account Pre-Payment
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="achRouting" className="block text-xs font-semibold text-text-muted mb-1">
                  Routing Number
                </label>
                <input
                  id="achRouting"
                  required
                  type="text"
                  maxLength={9}
                  value={achRouting}
                  onChange={(e) => setAchRouting(e.target.value.replace(/\D/g, ""))}
                  placeholder="9-digit routing code"
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="achAccount" className="block text-xs font-semibold text-text-muted mb-1">
                  Account Number
                </label>
                <input
                  id="achAccount"
                  required
                  type="text"
                  value={achAccount}
                  onChange={(e) => setAchAccount(e.target.value.replace(/\D/g, ""))}
                  placeholder="Checking account number"
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            <div className="p-3 bg-muted/40 rounded-lg border border-border/80">
              <p className="text-[11px] text-text-muted leading-relaxed">
                ⚖️ <strong>ACH Authorization Agreement:</strong> By checking the box below, you authorize
                Leafjourney and its payment processing partners to electronically debit your bank account
                for the total order amount of <strong>${total.toFixed(2)}</strong>. You certify that you are
                an authorized signer on this account.
              </p>
              <label className="mt-3 flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={achAuthorized}
                  onChange={(e) => setAchAuthorized(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs text-text font-medium select-none">
                  I authorize this ACH pre-payment transaction.
                </span>
              </label>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submit Order card */}
      {submitError && (
        <p className="text-sm font-medium text-red-600 flex items-center gap-1.5">
          <span>⚠️</span> {submitError}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full h-12 text-base font-semibold"
        disabled={isSubmitting}
      >
        {isSubmitting
          ? "Processing Order..."
          : fulfillmentType === "pickup"
          ? "Reserve Order for Pickup"
          : "Pre-pay and Complete Order"}
      </Button>
    </form>
  );
}
