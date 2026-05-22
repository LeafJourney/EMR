import { redirect } from "next/navigation";

// EMR-691 — route renamed `/clinic/communications/zoom` → `/clinic/communications/beam`.
// This redirect preserves inbound links from older bookmarks, agent
// outputs, and historical messages.

export const metadata = { title: "Beam telehealth" };

export default function ZoomRedirectPage() {
  redirect("/clinic/communications/beam");
}
