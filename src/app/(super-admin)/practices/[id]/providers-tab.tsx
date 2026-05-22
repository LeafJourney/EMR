// Providers tab — every Provider in this practice with active/inactive
// split, joined to User for name + email. No PHI here; this is roster
// data the operator already has visibility into via the existing card.
//
// Lazy-loaded: the page only invokes loadPracticeProviders when this
// tab is selected.

import { Badge } from "@/components/ui/badge";
import { loadPracticeProviders } from "../loaders";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

export async function ProvidersTab({
  organizationId,
}: {
  organizationId: string;
}) {
  const providers = await loadPracticeProviders(organizationId);

  const active = providers.filter((p) => p.active);
  const inactive = providers.filter((p) => !p.active);

  if (providers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
        <div className="text-sm text-text-muted">
          No providers onboarded yet.
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      <ProviderSection
        title="Active providers"
        count={active.length}
        providers={active}
        emptyHint="No active providers."
      />
      {inactive.length > 0 && (
        <ProviderSection
          title="Inactive providers"
          count={inactive.length}
          providers={inactive}
          tone="muted"
          emptyHint="No inactive providers."
        />
      )}
    </div>
  );
}

function ProviderSection({
  title,
  count,
  providers,
  tone = "default",
  emptyHint,
}: {
  title: string;
  count: number;
  providers: Awaited<ReturnType<typeof loadPracticeProviders>>;
  tone?: "default" | "muted";
  emptyHint: string;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-display text-base text-text tracking-tight">
          {title}{" "}
          <span className="text-text-muted text-sm font-normal">({count})</span>
        </h2>
      </div>
      {providers.length === 0 ? (
        <div className="text-[12px] text-text-muted italic">{emptyHint}</div>
      ) : (
        <ul className="grid gap-2">
          {providers.map((p) => (
            <li
              key={p.providerId}
              className={`rounded-lg border border-border/70 ${tone === "muted" ? "bg-surface-muted/40" : "bg-surface"} px-4 py-3 flex items-center gap-4`}
            >
              <div className="h-9 w-9 rounded-full bg-accent-soft text-accent text-[12px] font-medium flex items-center justify-center shrink-0">
                {initials(p.name) || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[14px] text-text truncate font-medium">
                    {p.name}
                  </span>
                  {p.active ? (
                    <Badge tone="success">Active</Badge>
                  ) : (
                    <Badge tone="neutral">Inactive</Badge>
                  )}
                  {p.title && (
                    <span className="text-[12px] text-text-muted truncate">
                      {p.title}
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-text-muted mt-0.5 truncate">
                  {p.email}
                  {p.npi ? ` · NPI ${p.npi}` : ""}
                </div>
              </div>
              <div className="text-[11px] text-text-muted shrink-0 hidden sm:block">
                Joined {new Date(p.createdAt).toLocaleDateString()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
