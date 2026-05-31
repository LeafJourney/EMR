import { getCurrentUser } from "@/lib/auth/session";
import { KioskFlow } from "./kiosk-flow";

// Force dynamic — this surface depends on the kiosk session and must never be
// statically cached.
export const dynamic = "force-dynamic";

export default async function KioskHomePage() {
  const user = await getCurrentUser();
  const clinicName = user?.organizationName ?? "the clinic";

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-xl text-center">
        <p className="text-[11px] uppercase tracking-[0.2em] text-accent font-medium mb-3">
          Welcome to {clinicName}
        </p>
        <h1 className="font-display text-4xl md:text-5xl text-text tracking-tight leading-[1.05] mb-3">
          Let&rsquo;s get you checked in
        </h1>
        <p className="text-[15px] text-text-muted mb-10 leading-relaxed">
          Type your name to find your appointment.
        </p>
        <KioskFlow />
      </div>
    </div>
  );
}
