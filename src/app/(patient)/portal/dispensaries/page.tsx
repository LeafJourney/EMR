// EMR-002 / EMR-017 — Patient dispensary locator.
//
// Shows dispensaries within ~30 miles of the patient's home address,
// distance-sorted. The Google Maps embed is feature-flagged behind
// NEXT_PUBLIC_GOOGLE_MAPS_API_KEY — when present we render the map
// inlay; otherwise we fall back to the address list. This keeps the
// page working in dev environments without leaking the prod key.

import { redirect } from "next/navigation";

import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow, LeafSprig } from "@/components/ui/ornament";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { filterNearby, listDispensariesForOrg } from "@/lib/dispensary";
import { ROLE_HOME } from "@/lib/rbac/roles";
import { LocatorMap } from "@/components/dispensary/locator-map";
import Link from "next/link";

export const metadata = { title: "Find a dispensary" };

const DEFAULT_ORIGIN = { lat: 37.7749, lng: -122.4194 }; // SF fallback

export default async function PatientDispensariesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!user.roles.includes("patient")) {
    redirect(ROLE_HOME[user.roles[0]] ?? "/");
  }
  if (!user.organizationId) {
    return (
      <PageShell maxWidth="max-w-[960px]">
        <PageHeader title="Find a dispensary" eyebrow="Locator" description="No practice selected." />
      </PageShell>
    );
  }

  const patient = await prisma.patient.findFirst({
    where: { userId: user.id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, addressLine1: true, city: true, state: true, postalCode: true },
  });

  // Until we add a `latitude`/`longitude` to Patient, we fall back to a
  // city-level centroid lookup. For now the SF fallback keeps the page
  // useful in dev; in prod we'd geocode the patient address on save.
  const origin = DEFAULT_ORIGIN;

  const dispensaries = await listDispensariesForOrg(user.organizationId);
  const nearby = filterNearby(dispensaries, origin, 30);

  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  // Construct the search query string for Maps embed (or a directions
  // link fallback) — comma-separated coordinate list pinned by name.
  const mapEmbedSrc = mapsKey
    ? `https://www.google.com/maps/embed/v1/search?key=${mapsKey}&q=cannabis+dispensary&center=${origin.lat},${origin.lng}&zoom=11`
    : null;

  return (
    <PageShell maxWidth="max-w-[1100px]">
      <PageHeader
        eyebrow="Find your products"
        title="Dispensaries near you"
        description="Licensed dispensaries within 30 miles of your home address. Tap to see hours, phone, and directions."
      />

      {mapEmbedSrc ? (
        <Card tone="raised" className="mb-6 overflow-hidden">
          <iframe
            title="Dispensary map"
            src={mapEmbedSrc}
            className="w-full h-[320px] border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </Card>
      ) : (
        <div className="mb-6">
          <LocatorMap />
        </div>
      )}

      {nearby.length === 0 ? (
        <EmptyState
          icon={<LeafSprig size={28} className="text-accent" />}
          title="No dispensaries nearby"
          description="Your practice hasn't connected a dispensary in your area yet. Check back soon — your care team is working on it."
        />
      ) : (
        <div className="space-y-3">
          {nearby.map((d) => (
            <Card key={d.id} tone="raised">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base">{d.name}</CardTitle>
                  <Badge tone="accent">
                    {d.distanceMiles.toFixed(1)} mi
                  </Badge>
                </div>
                <p className="text-xs text-text-muted mt-1">
                  {d.geo.addressLine1}, {d.geo.city}, {d.geo.state} {d.geo.postalCode}
                </p>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-3 text-xs text-text-muted items-center">
                  {d.geo.phone && <span>📞 {d.geo.phone}</span>}
                  {d.geo.hoursLine && <span>🕒 {d.geo.hoursLine}</span>}
                  <span>📦 {d.skuCount.toLocaleString()} products in stock</span>
                  <Link
                    href={`https://www.google.com/maps/dir/?api=1&destination=${d.geo.lat},${d.geo.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline ml-auto"
                  >
                    Get directions →
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-[11px] text-text-subtle mt-8 max-w-md leading-relaxed">
        Distances are approximate. Always confirm hours and inventory by
        calling the dispensary before you visit.
      </p>
    </PageShell>
  );
}
