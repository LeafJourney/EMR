import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import type { DocumentKind } from "@prisma/client";
import type { DocumentData } from "./document-card";
import { RecordsShell } from "./records-shell";
import Link from "next/link";

export const metadata = { title: "Records" };

const FILTER_TABS: { label: string; value: string }[] = [
  { label: "All", value: "all" },
  { label: "Notes", value: "note" },
  { label: "Labs", value: "lab" },
  { label: "Images", value: "image" },
  { label: "Letters", value: "letter" },
  { label: "Other", value: "other" },
  { label: "Needs Review", value: "needs_review" },
];

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: { filter?: string; upload?: string };
}) {
  const user = await requireRole("patient");

  const activeFilter = searchParams.filter ?? "all";
  const showUpload = searchParams.upload === "1";

  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
  });

  if (!patient) {
    return (
      <PageShell maxWidth="max-w-[960px]">
        <PageHeader eyebrow="My Records" title="My Records" />
        <PatientSectionNav section="health" />
        <p className="text-sm text-text-muted">No patient profile found.</p>
      </PageShell>
    );
  }

  // Build the Prisma where clause from the active filter
  const kindFilter: DocumentKind | undefined =
    activeFilter !== "all" && activeFilter !== "needs_review"
      ? (activeFilter as DocumentKind)
      : undefined;

  // Fetch filtered documents and total count in parallel
  const [filteredDocs, totalCount] = await Promise.all([
    prisma.document.findMany({
      where: {
        patientId: patient.id,
        deletedAt: null,
        ...(kindFilter ? { kind: kindFilter } : {}),
        ...(activeFilter === "needs_review" ? { needsReview: true } : {}),
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.document.count({
      where: {
        patientId: patient.id,
        deletedAt: null,
      },
    }),
  ]);

  const documents: DocumentData[] = filteredDocs.map((doc) => ({
    id: doc.id,
    originalName: doc.originalName,
    kind: doc.kind,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    tags: doc.tags,
    aiClassified: doc.aiClassified,
    aiTags: doc.aiTags,
    aiConfidence: doc.aiConfidence,
    needsReview: doc.needsReview,
    createdAt: doc.createdAt.toISOString(),
  }));

  return (
    <PageShell maxWidth="max-w-[960px]">
      <PageHeader
        eyebrow="My Records"
        title="My Records"
        description="Upload notes, labs, and letters. We organize them so your care team is ready for your visit."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/portal/records/download">
              <Button variant="secondary">Download my chart</Button>
            </Link>
            <Link href="/portal/records/release">
              <Button variant="secondary">Send to another doctor</Button>
            </Link>
            <Link href="/portal/records?upload=1">
              <Button>Upload a file</Button>
            </Link>
          </div>
        }
      />

      {/* EMR-195: section nav with two-row collapsible "More" ribbon */}
      <PatientSectionNav section="health" />

      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 mb-6 overflow-x-auto pb-1 -mx-1 px-1">
        {FILTER_TABS.map((tab) => {
          const isActive = activeFilter === tab.value;
          return (
            <Link
              key={tab.value}
              href={
                tab.value === "all"
                  ? "/portal/records"
                  : `/portal/records?filter=${tab.value}`
              }
              className={`
                inline-flex items-center px-3.5 py-1.5 rounded-full text-sm font-medium
                transition-colors duration-200 whitespace-nowrap
                ${
                  isActive
                    ? "bg-accent text-accent-ink shadow-sm"
                    : "bg-surface-muted/70 text-text-muted hover:bg-surface-muted hover:text-text"
                }
              `}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Upload form + document list */}
      <RecordsShell
        documents={documents}
        showUpload={showUpload}
        isEmpty={totalCount === 0}
      />
    </PageShell>
  );
}
