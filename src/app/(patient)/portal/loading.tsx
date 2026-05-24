import { PageShell } from "@/components/shell/PageHeader";

export default function Loading() {
  return (
    <PageShell maxWidth="max-w-[1040px]">
      <div className="animate-pulse motion-reduce:animate-none space-y-6 md:space-y-8">
        
        {/* ── Hero greeting card skeleton ── */}
        <div className="h-56 md:h-64 rounded-2xl md:rounded-3xl bg-gradient-to-r from-surface-muted to-surface-raised border border-border/50" />

        {/* ── Symptom sparklines (4 items) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="h-[104px] rounded-xl bg-surface-muted" />
          <div className="h-[104px] rounded-xl bg-surface-muted" />
          <div className="h-[104px] rounded-xl bg-surface-muted" />
          <div className="h-[104px] rounded-xl bg-surface-muted" />
        </div>

        {/* ── Daily Vitals ── */}
        <div className="h-28 rounded-xl bg-surface-muted" />

        {/* ── Top row: Health grade (3) + Lifestyle bars (5) + AI tips (4) ── */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-5">
          <div className="md:col-span-3 h-52 rounded-2xl bg-surface-muted" />
          <div className="md:col-span-5 h-52 rounded-2xl bg-surface-muted" />
          <div className="md:col-span-4 h-52 rounded-2xl bg-surface-muted" />
        </div>

        {/* ── Second row: Cannabis module + Next visit + Mood ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
          <div className="h-44 rounded-2xl bg-surface-muted" />
          <div className="h-44 rounded-2xl bg-surface-muted" />
          <div className="h-44 rounded-2xl bg-surface-muted" />
        </div>

      </div>
    </PageShell>
  );
}
