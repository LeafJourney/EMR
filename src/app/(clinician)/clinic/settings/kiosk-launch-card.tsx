import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Front-desk kiosk launch point.
 *
 * The check-in kiosk is intentionally isolated: it runs under its own `kiosk`
 * role at /kiosk and a clinician/patient session is redirected away from it.
 * That security model is correct, but it left the kiosk undiscoverable — QA
 * couldn't find any entry point. This card surfaces it (without weakening the
 * isolation): it explains the device model and links to /kiosk for a device
 * signed in to the kiosk account.
 */
export function KioskLaunchCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Front-desk kiosk</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-text-muted leading-relaxed">
          The patient check-in kiosk runs as its own front-desk device mode,
          deliberately isolated from your clinician session for security. Open it
          on a dedicated tablet or front-desk screen signed in to your clinic&apos;s
          kiosk account — patients can then look up their visit, verify their date
          of birth, and check in or continue intake on their phone.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <Link
            href="/kiosk"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 w-fit items-center rounded-md bg-accent px-3 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-hover"
          >
            Open kiosk check-in ↗
          </Link>
          <span className="text-xs text-text-subtle leading-relaxed">
            Opens in a new tab. The device must be signed in to the kiosk account
            (<code className="text-text-muted">kiosk@demo.health</code> in the
            demo) — for security your own clinician session can&apos;t open the
            kiosk.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
