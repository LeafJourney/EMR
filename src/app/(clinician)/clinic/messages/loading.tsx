import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { MessageListSkeleton } from "@/components/ui/skeletons";

/**
 * Smart Inbox loading skeleton — mirrors the triaged thread list with
 * avatars, priority chips, and snippets. Header is rendered as static
 * copy so the eyebrow + title don't pop in.
 */
export default function Loading() {
  return (
    <PageShell maxWidth="max-w-[1400px]">
      <PageHeader
        eyebrow="Messages"
        title="Smart Inbox"
        description="Triage your conversations by urgency and category."
      />
      <MessageListSkeleton rows={8} />
    </PageShell>
  );
}
