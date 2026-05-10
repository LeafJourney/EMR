"use client";

import { useState, useTransition } from "react";
import type { DocumentKind } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { deleteDocumentAction } from "./actions";
import { DocumentActions } from "@/components/patient/document-actions";

type BadgeTone = "accent" | "highlight" | "info" | "danger" | "neutral" | "warning";

const KIND_TONE: Record<DocumentKind, BadgeTone> = {
  note: "accent",
  lab: "highlight",
  image: "info",
  diagnosis: "danger",
  letter: "neutral",
  other: "neutral",
  unclassified: "warning",
};

const KIND_LABEL: Record<DocumentKind, string> = {
  note: "Note",
  lab: "Lab",
  image: "Image",
  diagnosis: "Diagnosis",
  letter: "Letter",
  other: "Other",
  unclassified: "Unclassified",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export interface DocumentData {
  id: string;
  originalName: string;
  kind: DocumentKind;
  mimeType: string;
  sizeBytes: number;
  tags: string[];
  aiClassified: boolean;
  aiTags: string[];
  aiConfidence: number | null;
  needsReview: boolean;
  createdAt: string;
}

export function DocumentCard({ doc }: { doc: DocumentData }) {
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [deleted, setDeleted] = useState(false);

  if (deleted) return null;

  const handleDelete = () => {
    if (!confirm("Remove this document? It can be restored by your care team.")) {
      return;
    }
    startTransition(async () => {
      const result = await deleteDocumentAction(doc.id);
      if (result.ok) {
        setDeleted(true);
      }
    });
  };

  return (
    <Card
      className="card-hover cursor-pointer transition-all duration-200"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="px-5 py-4">
        {/* Compact row */}
        <div className="flex items-center gap-3">
          {/* Kind badge on left */}
          <Badge tone={KIND_TONE[doc.kind]}>{KIND_LABEL[doc.kind]}</Badge>

          {/* File info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-text truncate">
                {doc.originalName}
              </p>
              {doc.aiClassified && (
                <Badge tone="accent" className="text-[10px]">
                  AI classified
                </Badge>
              )}
              {doc.needsReview && (
                <Badge tone="warning">Needs review</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-text-subtle">
                {formatDate(doc.createdAt)} &middot; {formatSize(doc.sizeBytes)}
              </p>
              {/* AI tags as small pills */}
              {doc.aiTags.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  {doc.aiTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-block px-1.5 py-0 text-[10px] rounded-md bg-surface-muted text-text-subtle border border-border/60"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Expand chevron */}
          <svg
            className={`h-4 w-4 text-text-subtle transition-transform duration-200 shrink-0 ${
              expanded ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 8.25l-7.5 7.5-7.5-7.5"
            />
          </svg>
        </div>

        {/* Expanded detail panel */}
        {expanded && (
          <div
            className="mt-4 pt-4 border-t border-border/60 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <p className="text-text-subtle text-xs">File name</p>
                <p className="text-text font-medium break-all">
                  {doc.originalName}
                </p>
              </div>
              <div>
                <p className="text-text-subtle text-xs">Type</p>
                <p className="text-text">{doc.mimeType}</p>
              </div>
              <div>
                <p className="text-text-subtle text-xs">Size</p>
                <p className="text-text">{formatSize(doc.sizeBytes)}</p>
              </div>
              <div>
                <p className="text-text-subtle text-xs">Uploaded</p>
                <p className="text-text">{formatDate(doc.createdAt)}</p>
              </div>
              <div>
                <p className="text-text-subtle text-xs">Classification</p>
                <p className="text-text">
                  {KIND_LABEL[doc.kind]}
                  {doc.aiConfidence != null && (
                    <span className="text-text-subtle ml-1">
                      ({Math.round(doc.aiConfidence * 100)}% confidence)
                    </span>
                  )}
                </p>
              </div>
              {doc.tags.length > 0 && (
                <div>
                  <p className="text-text-subtle text-xs">Tags</p>
                  <div className="flex gap-1 flex-wrap mt-0.5">
                    {doc.tags.map((tag) => (
                      <Badge key={tag} tone="neutral">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {doc.needsReview && (
              <div className="rounded-lg bg-highlight-soft border border-highlight/25 px-4 py-3">
                <p className="text-sm text-[color:var(--highlight-hover)]">
                  Our team will review this document to ensure it is properly
                  classified and filed in your chart.
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <a
                href={`/portal/records/${doc.id}/view`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="secondary" size="sm">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="mr-1">
                    <path d="M7 3C4 3 1.5 7 1.5 7s2.5 4 5.5 4 5.5-4 5.5-4S10 3 7 3Z" stroke="currentColor" strokeWidth="1"/>
                    <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1"/>
                  </svg>
                  View
                </Button>
              </a>
              <DocumentActions documentId={doc.id} documentName={doc.originalName} />
              <Button
                variant="danger"
                size="sm"
                onClick={handleDelete}
                disabled={isPending}
              >
                {isPending ? "Removing\u2026" : "Remove"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
