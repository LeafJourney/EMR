"use client";

import { useState, useMemo, useRef, Children, type ReactNode } from "react";
import Link from "next/link";
import {
  Send,
  Trash2,
  Plus,
  Check,
  FileText,
  AlertTriangle,
  RotateCcw,
  X,
  Upload,
  Eye,
  EyeOff,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Paperclip,
  Pencil,
  CheckCircle2,
  ScanLine,
  ExternalLink
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ModalShell } from "@/components/ui/modal-shell";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import {
  crossCheckCoverage,
  summarizeCrossCheck,
  type CoverageOnFile,
  type CrossCheckResult,
  type DocumentSource,
  type DocumentType
} from "@/lib/billing/mail-fax-ocr";
import { KAISER_SAMPLE_CARD } from "./sample-docs";

// ---------------------------------------------------------------------------
// Prop interfaces
// ---------------------------------------------------------------------------

interface DbPatient {
  id: string;
  firstName: string;
  lastName: string;
}

interface ScanRow {
  id: string;
  receivedAt: string;
  source: DocumentSource;
  patientName: string;
  patientMrn: string;
  rawOcr: string;
  coverages: CoverageOnFile[];
  /** EMR-986: actual scanned file (data-URI / sample URL) for full-size preview. */
  documentUrl: string;
  /** EMR-986: file format, drives which preview renderer is used. */
  documentType: "pdf" | "jpg" | "docx";
}

// EMR-934: outbox identifier is rendered as "{method} – {docType} – sent {date}, {time}".
interface OutboxItem {
  id: string;
  sentAt: string;
  recipient: string;
  subject: string;
  status: "sent" | "delivered" | "failed";
  method: "fax" | "email";
  /** EMR-934: human-readable document kind sent in this transmission. */
  docType: string;
}

// EMR-977: chart-document categories a routed inbound document can be filed under.
const CHART_DOC_CATEGORIES = [
  "Insurance card",
  "EOB / remittance",
  "Denial letter",
  "Prior auth approval",
  "Lab result",
  "Imaging report",
  "Referral",
  "Consent form",
  "Correspondence",
  "Other",
] as const;

interface DeletedItem {
  id: string;
  deletedAt: string;
  patientName: string;
  originalName: string;
  rawOcr: string;
  docType: string;
}

const SOURCE_LABEL: Record<DocumentSource, string> = {
  mail: "Mail",
  fax: "Fax",
  "portal-upload": "Portal upload",
};

const DOC_TYPE_LABEL: Record<DocumentType, string> = {
  "insurance-card": "Insurance card",
  eob: "EOB",
  "denial-letter": "Denial letter",
  "auth-approval": "PA approval",
  unknown: "Unknown",
};

// EMR-981: exact match = green, mismatches/errors = red, NEW coverage = blue (info).
function tonForResult(result: CrossCheckResult) {
  if (result.isExactMatch) return "success" as const;
  if (result.mismatches.length > 0) return "danger" as const;
  if (result.isNewCoverage) return "info" as const;
  return "neutral" as const;
}

// EMR-981: high = green (success), medium = yellow (warning), low = ORANGE.
// Badge has no orange tone, so low-confidence is rendered as a local <span>
// (see ConfidenceBadge below) instead of a Badge.
function tonForConfidence(confidence: CrossCheckResult["confidence"]) {
  return confidence === "high"
    ? ("success" as const)
    : ("warning" as const);
}

// EMR-934: outbox row identifier — "{method} – {docType} – sent {date}, {time}".
function outboxIdentifier(item: OutboxItem): string {
  const d = new Date(item.sentAt);
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${item.method.toUpperCase()} – ${item.docType} – sent ${date}, ${time}`;
}

// EMR-981: confidence chip — Badge for high/medium, local orange span for low.
function ConfidenceBadge({ confidence }: { confidence: CrossCheckResult["confidence"] }) {
  if (confidence === "low") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full border tracking-wide bg-orange-100 text-orange-700 border-orange-200">
        low confidence
      </span>
    );
  }
  return <Badge tone={tonForConfidence(confidence)}>{confidence} confidence</Badge>;
}

// ---------------------------------------------------------------------------
// Initial mock data
// ---------------------------------------------------------------------------

const INITIAL_OUTBOX: OutboxItem[] = [
  {
    id: "outbound-001",
    sentAt: "2026-06-02T18:30:00Z",
    recipient: "Dr. Okafor (Fax: 415-555-0199)",
    subject: "Medical Records Release — Maya Reyes",
    status: "delivered",
    method: "fax",
    docType: "Medical records release",
  },
  {
    id: "outbound-002",
    sentAt: "2026-06-02T14:15:00Z",
    recipient: "cindy.m@bluecross.com",
    subject: "Prior Authorization Appeal — Claim #CLM-88710",
    status: "sent",
    method: "email",
    docType: "PA appeal",
  },
  {
    // EMR-938: >90 days old — auto-archived, hidden from the main outbox list.
    id: "outbound-archived-001",
    sentAt: "2026-01-04T09:00:00Z",
    recipient: "records@valleyclinic.org",
    subject: "Chart Summary — Jonas Reiter",
    status: "delivered",
    method: "email",
    docType: "Chart summary",
  },
];

const INITIAL_DELETED: DeletedItem[] = [
  {
    id: "scan-deleted-1",
    deletedAt: "2026-06-02T10:00:00Z",
    patientName: "John Doe",
    originalName: "Unknown_Document_Scan.pdf",
    rawOcr: "No readable insurance details found in this blurred fax page.",
    docType: "Unknown",
  },
  {
    // EMR-948: deleted >30 days ago — outside the recovery window, hidden.
    id: "scan-deleted-old",
    deletedAt: "2026-04-20T10:00:00Z",
    patientName: "Priya Anand",
    originalName: "Old_Duplicate_Fax.pdf",
    rawOcr: "Duplicate of an already-filed EOB; removed during cleanup.",
    docType: "EOB",
  },
];

// ---------------------------------------------------------------------------
// Client component logic
// ---------------------------------------------------------------------------

// EMR-970 — resizable document/OCR split pane. Stacks on mobile; on lg+ a
// draggable divider lets the operator widen either the scan or the OCR text.
// Takes exactly two children (left = document, right = OCR).
function OcrSplitView({ children }: { children: ReactNode }) {
  const panes = Children.toArray(children);
  const left = panes[0] ?? null;
  const right = panes[1] ?? null;
  const [pct, setPct] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);

  function startDrag() {
    function move(ev: PointerEvent) {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const next = ((ev.clientX - rect.left) / rect.width) * 100;
      setPct(Math.min(78, Math.max(22, next)));
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Mobile: stacked */}
      <div className="grid grid-cols-1 gap-4 lg:hidden">
        {left}
        {right}
      </div>
      {/* Desktop: resizable split */}
      <div ref={containerRef} className="hidden lg:flex items-stretch">
        <div style={{ width: `${pct}%` }} className="min-w-0">
          {left}
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Drag to resize document and OCR panes"
          onPointerDown={startDrag}
          className="mx-1.5 w-1.5 shrink-0 cursor-col-resize self-stretch rounded-full bg-border hover:bg-accent/60 transition-colors"
        />
        <div style={{ width: `${100 - pct}%` }} className="min-w-0">
          {right}
        </div>
      </div>
    </div>
  );
}

export function MailFaxClient({
  dbPatients,
  initialScans,
}: {
  dbPatients: DbPatient[];
  initialScans: ScanRow[];
}) {
  const [activeTab, setActiveTab] = useState<"inbox" | "outbox">("inbox");

  // EMR-948: full-screen "Deleted items" view toggle (shares live state).
  const [view, setView] = useState<"main" | "deleted">("main");

  // Inbox lists, Outbox lists, Deleted lists
  const [scans, setScans] = useState<ScanRow[]>(initialScans);
  const [outbox, setOutbox] = useState<OutboxItem[]>(INITIAL_OUTBOX);
  const [deletedItems, setDeletedItems] = useState<DeletedItem[]>(INITIAL_DELETED);

  // Active Filter based on clickable Stat Cards
  const [selectedFilter, setSelectedFilter] = useState<"all" | "flagged" | "exact" | "low">("all");

  // EMR-966 — filter inbox documents by source (Fax / Mail / Upload).
  const [sourceFilter, setSourceFilter] = useState<"all" | "fax" | "mail" | "portal-upload">("all");

  // OCR expanded row states (document preview)
  const [expandedOCRId, setExpandedOCRId] = useState<string | null>(null);

  // EMR-970: per-card collapse. A card id present here is COLLAPSED.
  const [collapsedCardIds, setCollapsedCardIds] = useState<Set<string>>(new Set());

  // EMR-938: show the small archived-outbox affordance.
  const [showArchived, setShowArchived] = useState(false);

  // Dialog controls
  const [composeOpen, setComposeOpen] = useState(false);

  // Scan Simulation progress
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  // Compose form inputs
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [method, setMethod] = useState<"fax" | "email">("fax");
  const [composeDocType, setComposeDocType] = useState("");
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // EMR-977: Edit/Route modal state.
  const [editScanId, setEditScanId] = useState<string | null>(null);
  const [editPatientQuery, setEditPatientQuery] = useState("");
  const [editDob, setEditDob] = useState("");
  const [editCategory, setEditCategory] = useState<string>(CHART_DOC_CATEGORIES[0]);
  const [editDocDate, setEditDocDate] = useState("");

  // Resolve a DB patient id from a scanned patient name. Returns null when there
  // is no CONFIDENT match (EMR-983: do NOT fall back to dbPatients[0]).
  const resolvePatientId = (patientName: string): string | null => {
    const parts = patientName.trim().toLowerCase().split(/\s+/);
    const firstName = parts[0] ?? "";
    const lastName = parts.length > 1 ? parts[parts.length - 1] : "";
    // Strongest signal: first + last both match.
    const full = dbPatients.find(
      (p) =>
        p.firstName.toLowerCase() === firstName &&
        p.lastName.toLowerCase() === lastName
    );
    if (full) return full.id;
    // Fall back to a unique first-name match only.
    const byFirst = dbPatients.filter((p) => p.firstName.toLowerCase() === firstName);
    if (byFirst.length === 1) return byFirst[0].id;
    return null;
  };

  // Run cross check over scanned list
  const reviewed = useMemo(() => {
    return scans.map((scan) => ({
      ...scan,
      result: crossCheckCoverage(scan.rawOcr, scan.coverages),
    }));
  }, [scans]);

  // Compute stat metrics
  const totalScans = reviewed.length;
  const flaggedCount = reviewed.filter(
    (r) => r.result.mismatches.length > 0 || r.result.isNewCoverage
  ).length;
  const lowConfidenceCount = reviewed.filter(
    (r) => r.result.confidence === "low"
  ).length;
  const exactMatchesCount = reviewed.filter((r) => r.result.isExactMatch).length;

  // Filter reviewed list by the active stat-card filter AND document source.
  const filteredScans = useMemo(() => {
    let list = reviewed;
    if (selectedFilter === "flagged") {
      list = list.filter((r) => r.result.mismatches.length > 0 || r.result.isNewCoverage);
    } else if (selectedFilter === "exact") {
      list = list.filter((r) => r.result.isExactMatch);
    } else if (selectedFilter === "low") {
      list = list.filter((r) => r.result.confidence === "low");
    }
    // EMR-966 — filter by document source (Fax / Mail / Upload).
    if (sourceFilter !== "all") {
      list = list.filter((r) => r.source === sourceFilter);
    }
    return list;
  }, [reviewed, selectedFilter, sourceFilter]);

  // EMR-938: 90-day retention — split outbox into active vs archived.
  const NOW = Date.now();
  const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  const activeOutbox = useMemo(
    () => outbox.filter((o) => NOW - new Date(o.sentAt).getTime() <= NINETY_DAYS_MS),
    [outbox, NOW, NINETY_DAYS_MS]
  );
  const archivedOutbox = useMemo(
    () => outbox.filter((o) => NOW - new Date(o.sentAt).getTime() > NINETY_DAYS_MS),
    [outbox, NOW, NINETY_DAYS_MS]
  );

  // EMR-948: deleted items within the last 30 days, oldest-first (chronological).
  const recentDeleted = useMemo(
    () =>
      deletedItems
        .filter((d) => NOW - new Date(d.deletedAt).getTime() <= THIRTY_DAYS_MS)
        .sort((a, b) => new Date(a.deletedAt).getTime() - new Date(b.deletedAt).getTime()),
    [deletedItems, NOW, THIRTY_DAYS_MS]
  );

  // EMR-934 / EMR-970: short document-kind label derived from the cross-check.
  const docTypeLabel = (result: CrossCheckResult) => DOC_TYPE_LABEL[result.documentType];

  // Handle Scanning Simulation
  const handleScanSimulation = () => {
    setScanning(true);
    setScanProgress(0);
    const interval = setInterval(() => {
      setScanProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setScanning(false);
          // Append new scan record
          const nextScanId = `scan-${Date.now()}`;
          const newRecord: ScanRow = {
            id: nextScanId,
            receivedAt: new Date().toISOString(),
            source: "portal-upload",
            patientName: "Avery Hale",
            patientMrn: "MLN-H0012",
            rawOcr: "KAISER PERMANENTE\nMember ID: K99881122\nGroup Number: CA-992\nSubscriber: Avery Hale\nEffective Date: 2026-03-01",
            coverages: [
              {
                payerName: "Kaiser Permanente",
                memberId: "K99881100",
                groupNumber: "CA-992"
              }
            ],
            documentUrl: KAISER_SAMPLE_CARD,
            documentType: "jpg",
          };
          setScans((prevScans) => [newRecord, ...prevScans]);
          triggerToast("Document upload scanned successfully!");
          return 100;
        }
        return prev + 25;
      });
    }, 300);
  };

  // EMR-948: real file-input fallback for the Scan action. Reads the chosen file
  // as a data-URI so the actual document renders in the preview (no upload).
  const handleScanFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const ext = (file.name.split(".").pop() ?? "").toLowerCase();
      const documentType: ScanRow["documentType"] =
        ext === "pdf" ? "pdf" : ext === "docx" ? "docx" : "jpg";
      const newRecord: ScanRow = {
        id: `scan-${Date.now()}`,
        receivedAt: new Date().toISOString(),
        source: "portal-upload",
        patientName: "Unmatched Patient",
        patientMrn: "MLN-NEW",
        rawOcr: `Uploaded file: ${file.name}\n(Awaiting OCR — no text extracted yet.)`,
        coverages: [],
        documentUrl: dataUrl,
        documentType,
      };
      setScans((prev) => [newRecord, ...prev]);
      triggerToast(`Scanned "${file.name}" into the inbox.`);
    };
    reader.readAsDataURL(file);
  };

  // EMR-977: Approve = optimistically file the doc into the chart, remove from inbox.
  const handleApprove = (scan: ScanRow, result: CrossCheckResult) => {
    setScans((prev) => prev.filter((s) => s.id !== scan.id));
    const filedDate = new Date(scan.receivedAt).toLocaleDateString();
    triggerToast(
      `Filed "${docTypeLabel(result)}" into ${scan.patientName}'s chart (${filedDate}).`
    );
  };

  // EMR-977: open the Edit/Route modal pre-filled from the scan.
  const openEditModal = (scan: ScanRow, result: CrossCheckResult) => {
    setEditScanId(scan.id);
    setEditPatientQuery(scan.patientName);
    setEditDob("");
    const matchedCategory =
      CHART_DOC_CATEGORIES.find(
        (c) => c.toLowerCase() === docTypeLabel(result).toLowerCase()
      ) ?? CHART_DOC_CATEGORIES[0];
    setEditCategory(matchedCategory);
    setEditDocDate(new Date(scan.receivedAt).toISOString().slice(0, 10));
  };

  // EMR-977: Route = apply the edits optimistically + toast + remove from inbox.
  const handleRouteEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editScanId) return;
    const target = scans.find((s) => s.id === editScanId);
    setScans((prev) => prev.filter((s) => s.id !== editScanId));
    setEditScanId(null);
    triggerToast(
      `Routed ${editPatientQuery || target?.patientName || "document"} → ${editCategory}` +
        (editDocDate ? ` (${editDocDate})` : "")
    );
  };

  // EMR-970: toggle a single card's collapsed state.
  const toggleCardCollapse = (id: string) => {
    setCollapsedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Soft Delete Action
  const handleDeleteScan = (scan: ScanRow, docType: string) => {
    setScans((prev) => prev.filter((s) => s.id !== scan.id));
    setDeletedItems((prev) => [
      {
        id: scan.id,
        deletedAt: new Date().toISOString(),
        patientName: scan.patientName,
        originalName: `deleted_scan_${scan.id}.${scan.documentType}`,
        rawOcr: scan.rawOcr,
        docType,
      },
      ...prev,
    ]);
    triggerToast(`Document for ${scan.patientName} moved to Deleted Items.`);
  };

  // Recover soft-deleted items
  const handleRecover = (item: DeletedItem) => {
    setDeletedItems((prev) => prev.filter((i) => i.id !== item.id));
    const recoveredRecord: ScanRow = {
      id: item.id,
      receivedAt: new Date().toISOString(),
      source: "fax",
      patientName: item.patientName,
      patientMrn: "MLN-X9002",
      rawOcr: item.rawOcr,
      coverages: [],
      documentUrl: KAISER_SAMPLE_CARD,
      documentType: "jpg",
    };
    setScans((prev) => [recoveredRecord, ...prev]);
    triggerToast(`Document for ${item.patientName} recovered to Inbox.`);
  };

  // Permanent delete
  const handlePermanentDelete = (id: string) => {
    setDeletedItems((prev) => prev.filter((i) => i.id !== id));
    triggerToast("Item permanently deleted.");
  };

  // Handle compose action
  const handleComposeSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient || !subject) return;

    const newItem: OutboxItem = {
      id: `outbound-${Date.now()}`,
      sentAt: new Date().toISOString(),
      recipient,
      subject,
      status: "sent",
      method,
      docType: composeDocType.trim() || "Document",
    };

    setOutbox((prev) => [newItem, ...prev]);
    setComposeOpen(false);
    setRecipient("");
    setSubject("");
    setBody("");
    setComposeDocType("");
    setAttachmentName(null);
    triggerToast(`Document successfully queue-sent via ${method.toUpperCase()}!`);
  };

  const triggerToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-text text-background px-4 py-3 rounded-xl shadow-lg border border-border/20 transition-all duration-300 transform translate-y-0 text-sm font-medium">
          <Check className="w-4 h-4 text-accent" />
          {successToast}
        </div>
      )}

      {view === "deleted" ? (
        /* EMR-948: full-screen Deleted items view (last 30 days, chronological). */
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <button
                type="button"
                onClick={() => setView("main")}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-subtle hover:text-text transition-colors mb-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to inbox
              </button>
              <h1 className="text-2xl font-semibold text-text tracking-tight">Deleted items</h1>
              <p className="text-sm text-text-subtle mt-1">
                Soft-deleted documents from the last 30 days. Recover them to the inbox or remove permanently.
              </p>
            </div>
          </div>

          {recentDeleted.length === 0 ? (
            <EmptyState
              title="No recently deleted documents"
              description="Items deleted in the last 30 days appear here."
            />
          ) : (
            <div className="space-y-3">
              {recentDeleted.map((item) => (
                <Card key={item.id} tone="raised">
                  <CardContent className="py-4 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-lg bg-surface-muted flex items-center justify-center shrink-0 border border-border">
                        <FileText className="w-4 h-4 text-text-subtle" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text">{item.patientName}</p>
                        <p className="text-xs text-text-subtle mt-0.5">
                          {item.docType} · {item.originalName}
                        </p>
                        <p className="text-[11px] text-text-subtle mt-0.5 tabular-nums">
                          Deleted {new Date(item.deletedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRecover(item)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent-soft text-accent text-xs font-semibold hover:bg-accent-soft/80 transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Recover
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePermanentDelete(item.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-danger text-xs font-semibold hover:bg-red-100 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Permanently delete
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
      <>
      {/* Header and top commands */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text tracking-tight">Documents Processing Center</h1>
          <p className="text-sm text-text-subtle mt-1">
            Inbound mail packets, faxes, and portal uploads are OCR'd, parsed, and cross-checked.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Scan + Deleted items moved above the stat tiles (EMR-948). */}
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent text-accent-ink hover:bg-accent/90 transition-colors text-xs font-semibold shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
            Compose Outbound
          </button>
        </div>
      </div>

      {/* Progress bar during simulation */}
      {scanning && (
        <div className="w-full bg-surface-muted rounded-full h-1 overflow-hidden">
          <div 
            className="bg-accent h-full transition-all duration-300" 
            style={{ width: `${scanProgress}%` }}
          />
        </div>
      )}

      {/* Tabs navigation */}
      <div className="border-b border-border flex gap-4">
        <button
          type="button"
          onClick={() => setActiveTab("inbox")}
          className={cn(
            "pb-3 text-sm font-semibold border-b-2 px-1 -mb-px transition-colors",
            activeTab === "inbox" 
              ? "border-accent text-text" 
              : "border-transparent text-text-subtle hover:text-text"
          )}
        >
          Inbox ({scans.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("outbox")}
          className={cn(
            "pb-3 text-sm font-semibold border-b-2 px-1 -mb-px transition-colors",
            activeTab === "outbox" 
              ? "border-accent text-text" 
              : "border-transparent text-text-subtle hover:text-text"
          )}
        >
          Outbox ({activeOutbox.length})
        </button>
      </div>

      {/* EMR-966 — filter inbox by document source */}
      {activeTab === "inbox" && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-text-subtle mr-1">
            Source
          </span>
          {([
            { key: "all", label: "All" },
            { key: "fax", label: "Fax" },
            { key: "mail", label: "Mail" },
            { key: "portal-upload", label: "Upload" },
          ] as const).map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSourceFilter(s.key)}
              aria-pressed={sourceFilter === s.key}
              className={cn(
                "px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors",
                sourceFilter === s.key
                  ? "bg-accent text-accent-ink border-accent"
                  : "bg-surface-muted text-text-muted border-border hover:bg-surface-raised",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab Panels */}
      {activeTab === "inbox" ? (
        <>
          {/* EMR-948: Scan (left) + Deleted items (right) directly above the
              "Flagged for review" stat tile. Scan offers a real file input as
              well as the existing simulation. */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleScanSimulation}
                disabled={scanning}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-raised transition-colors text-xs font-semibold text-text shadow-sm disabled:opacity-60"
              >
                <ScanLine className="w-3.5 h-3.5" />
                {scanning ? `Scanning (${scanProgress}%)` : "Scan"}
              </button>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-border bg-surface hover:bg-surface-raised transition-colors text-xs font-semibold text-text-subtle hover:text-text shadow-sm cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                Upload file…
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.docx"
                  onChange={handleScanFile}
                  className="sr-only"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => setView("deleted")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-raised transition-colors text-xs font-semibold text-text-subtle hover:text-text shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Deleted items ({recentDeleted.length})
            </button>
          </div>

          {/* Stat Filters Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button 
              type="button"
              onClick={() => setSelectedFilter("all")}
              className="text-left focus-visible:outline-none"
            >
              <StatCard 
                label="Total Scans" 
                value={String(totalScans)} 
                size="sm"
                className={cn(selectedFilter === "all" && "ring-2 ring-accent ring-offset-1")}
              />
            </button>
            <button 
              type="button"
              onClick={() => setSelectedFilter("flagged")}
              className="text-left focus-visible:outline-none"
            >
              <StatCard
                label="Flagged for Review"
                value={String(flaggedCount)}
                hint="Mismatches or new coverage"
                tone={flaggedCount > 0 ? "warning" : "neutral"}
                size="sm"
                className={cn(selectedFilter === "flagged" && "ring-2 ring-accent ring-offset-1")}
              />
            </button>
            <button 
              type="button"
              onClick={() => setSelectedFilter("exact")}
              className="text-left focus-visible:outline-none"
            >
              <StatCard
                label="Exact Matches"
                value={String(exactMatchesCount)}
                hint="Auto-clear ready"
                tone="success"
                size="sm"
                className={cn(selectedFilter === "exact" && "ring-2 ring-accent ring-offset-1")}
              />
            </button>
            <button 
              type="button"
              onClick={() => setSelectedFilter("low")}
              className="text-left focus-visible:outline-none"
            >
              <StatCard
                label="Low Confidence"
                value={String(lowConfidenceCount)}
                hint="Needs manual reading"
                tone={lowConfidenceCount > 0 ? "danger" : "neutral"}
                size="sm"
                className={cn(selectedFilter === "low" && "ring-2 ring-accent ring-offset-1")}
              />
            </button>
          </div>

          {/* Inbox List */}
          {filteredScans.length === 0 ? (
            <EmptyState
              title="No scans match criteria"
              description="Clear filter or wait for faxes to arrive."
            />
          ) : (
            <div className="space-y-4">
              {filteredScans.map((scan) => {
                const { result } = scan;
                // EMR-983/970: reliably matched DB id, or null when not confident.
                const patientId = resolvePatientId(scan.patientName);
                const isExpanded = expandedOCRId === scan.id;
                const isCollapsed = collapsedCardIds.has(scan.id); // EMR-970
                const typeLabel = docTypeLabel(result);

                return (
                  <Card key={scan.id} tone="raised" className="overflow-hidden">
                    <CardHeader className="pb-3 border-b border-border/50">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <CardTitle className="flex items-center gap-2 text-base">
                            {/* EMR-970: patient name links to the chart (reliable id). */}
                            {patientId ? (
                              <Link
                                href={`/clinic/patients/${patientId}`}
                                onClick={(e) => e.stopPropagation()}
                                className="font-semibold text-text hover:text-accent hover:underline"
                              >
                                {scan.patientName}
                              </Link>
                            ) : (
                              <span className="font-semibold text-text">{scan.patientName}</span>
                            )}
                            {/* EMR-981 Rename MRN bubble to MLN */}
                            <Badge tone="neutral" className="font-mono bg-surface-muted border-border font-semibold">
                              MLN: {scan.patientMrn.replace("MRN-", "")}
                            </Badge>
                          </CardTitle>
                          <CardDescription className="text-xs text-text-subtle mt-0.5">
                            {SOURCE_LABEL[scan.source]} ·{" "}
                            {typeLabel} · received{" "}
                            {new Date(scan.receivedAt).toLocaleString()}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* EMR-981: confidence chip (low = orange span). */}
                          <ConfidenceBadge confidence={result.confidence} />
                          <Badge tone={tonForResult(result)}>
                            {summarizeCrossCheck(result)}
                          </Badge>
                          {/* EMR-970: collapse / expand the whole card. */}
                          <button
                            type="button"
                            onClick={() => toggleCardCollapse(scan.id)}
                            title={isCollapsed ? "Expand" : "Collapse"}
                            aria-expanded={!isCollapsed}
                            className="p-1 rounded text-text-subtle hover:text-text hover:bg-surface-muted transition-colors"
                          >
                            {isCollapsed ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronUp className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteScan(scan, typeLabel)}
                            title="Move to Deleted Items"
                            className="p-1 rounded text-text-subtle hover:text-danger hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </CardHeader>

                    {/* EMR-970: collapsed cards hide everything below the header. */}
                    {!isCollapsed && (
                    <CardContent className="pt-4">
                      {/* EMR-977: per-document Approve / Edit / Delete actions. */}
                      <div className="flex flex-wrap items-center gap-2 mb-4">
                        <button
                          type="button"
                          onClick={() => handleApprove(scan, result)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-accent-ink hover:bg-accent/90 transition-colors text-xs font-semibold shadow-sm"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approve &amp; file
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(scan, result)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-raised transition-colors text-xs font-semibold text-text"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit / Route
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteScan(scan, typeLabel)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-red-50 hover:text-danger transition-colors text-xs font-semibold text-text-subtle"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>

                      {/* Grid cards for extracted info */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Extracted block with Insurance action */}
                        <div className="rounded-xl border border-border bg-surface-muted/50 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-subtle">
                              Extracted Scan Data
                            </p>
                            {/* EMR-983: link to the patient's manual insurance-entry
                                surface; disabled when there is no confident match. */}
                            {patientId ? (
                              <Link
                                href={`/clinic/patients/${patientId}/billing#insurance`}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline"
                              >
                                <Plus className="w-3 h-3" />
                                Insurance
                              </Link>
                            ) : (
                              <span
                                title="No confident patient match — open the chart manually to add insurance."
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-text-subtle/60 cursor-not-allowed"
                              >
                                <Plus className="w-3 h-3" />
                                Insurance
                              </span>
                            )}
                          </div>

                          <ul className="text-xs space-y-2 tabular-nums">
                            {[
                              { label: "Payer", value: result.extracted.payerName },
                              { label: "Member ID", value: result.extracted.memberId },
                              { label: "Group", value: result.extracted.groupNumber },
                              { label: "Plan Type", value: result.extracted.planType },
                              { label: "Effective Date", value: result.extracted.effectiveDate },
                            ].map((r) => (
                              <li key={r.label} className="flex items-baseline gap-2">
                                <span className="text-[10px] font-medium uppercase tracking-wider text-text-subtle w-24 shrink-0">
                                  {r.label}
                                </span>
                                <span className={r.value ? "text-text font-medium" : "text-text-subtle italic"}>
                                  {r.value ?? "—"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* On-file block */}
                        <div className="rounded-xl border border-border bg-surface p-4">
                          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-subtle mb-3">
                            On File in Chart
                          </p>
                          {scan.coverages.length === 0 ? (
                            <p className="text-xs text-text-muted italic">
                              No coverage records found. This scan will register new insurer details.
                            </p>
                          ) : (
                            <ul className="text-xs text-text space-y-1.5">
                              {scan.coverages.map((c, i) => (
                                <li key={i} className="tabular-nums flex justify-between">
                                  <span className="font-semibold">{c.payerName}</span>{" "}
                                  <span className="text-text-muted font-mono">
                                    ID {c.memberId}
                                    {c.groupNumber ? ` · GRP ${c.groupNumber}` : ""}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}

                          {result.mismatches.length > 0 && (
                            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800 mb-1 flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                Mismatches Found
                              </p>
                              <ul className="text-[11px] text-amber-900 space-y-1">
                                {result.mismatches.map((m) => (
                                  <li key={m.field} className="tabular-nums">
                                    <span className="font-semibold uppercase text-[9px] bg-amber-100 px-1 py-0.5 rounded text-amber-800 mr-1.5">{m.field}</span>
                                    <span className="line-through opacity-60 mr-1">{m.onFile ?? "—"}</span>
                                    <ChevronRight className="inline-block w-3 h-3 mx-0.5 text-amber-600" />
                                    <span className="font-semibold text-amber-950">{m.scanned ?? "—"}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* EMR-986: Side-by-side View Actual Text / OCR viewer */}
                      <div className="mt-4 pt-3 border-t border-border/50">
                        <button
                          type="button"
                          onClick={() => setExpandedOCRId(isExpanded ? null : scan.id)}
                          className="inline-flex items-center gap-1 text-xs text-text-subtle hover:text-text font-semibold focus:outline-none"
                        >
                          {isExpanded ? (
                            <>
                              <EyeOff className="w-3.5 h-3.5" />
                              Hide Document Preview
                            </>
                          ) : (
                            <>
                              <Eye className="w-3.5 h-3.5" />
                              View actual text
                            </>
                          )}
                        </button>

                        {isExpanded && (
                          <OcrSplitView>
                            {/* EMR-986: Left Pane renders the ACTUAL full-size
                                document (image / pdf / docx) — not a mock. */}
                            <div className="rounded-xl border border-border bg-white shadow-sm relative min-h-[260px] overflow-hidden flex flex-col">
                              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-surface-muted/50 shrink-0">
                                <span className="text-[10px] uppercase tracking-wider text-text-subtle font-bold flex items-center gap-1.5">
                                  <FileText className="w-3.5 h-3.5" />
                                  Original document · {scan.documentType.toUpperCase()}
                                </span>
                                <a
                                  href={scan.documentUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent hover:underline"
                                >
                                  Open <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                              <div className="flex-1 min-h-[220px] bg-slate-50">
                                {scan.documentType === "jpg" ? (
                                  <img
                                    src={scan.documentUrl}
                                    alt={`Scanned document for ${scan.patientName}`}
                                    className="w-full h-full max-h-[360px] object-contain"
                                  />
                                ) : scan.documentType === "pdf" ? (
                                  <iframe
                                    src={scan.documentUrl}
                                    title={`Scanned document for ${scan.patientName}`}
                                    className="w-full h-[360px] border-0"
                                  />
                                ) : (
                                  // docx (and any other) — no inline renderer, offer download.
                                  <div className="h-full flex flex-col items-center justify-center gap-2 p-6 text-center">
                                    <FileText className="w-8 h-8 text-text-subtle" />
                                    <p className="text-xs text-text-subtle">
                                      No inline preview for {scan.documentType.toUpperCase()} files.
                                    </p>
                                    <a
                                      href={scan.documentUrl}
                                      download
                                      className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                                    >
                                      Download document <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Right Pane: Editable Raw OCR Viewer */}
                            <div className="rounded-xl border border-border bg-slate-900 text-slate-200 p-4 font-mono text-xs flex flex-col">
                              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2 shrink-0">
                                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Extracted Plain OCR Output</span>
                                <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-[9px]">RAW TEXT</Badge>
                              </div>
                              <pre className="flex-1 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[220px] select-text">
                                {scan.rawOcr}
                              </pre>
                            </div>
                          </OcrSplitView>
                        )}
                      </div>
                    </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* Outbox Chronological List */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text">Chronological Outbound Transmissions</h3>
            <span className="text-xs text-text-subtle">{activeOutbox.length} messages sent</span>
          </div>

          {activeOutbox.length === 0 ? (
            <EmptyState
              title="No outbound faxes or emails"
              description="Click 'Compose Outbound' to transmit documents."
            />
          ) : (
            <div className="space-y-3">
              {activeOutbox.map((item) => (
                <Card key={item.id} className="hover:border-accent/40 transition-colors">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-surface-muted flex items-center justify-center shrink-0 border border-border">
                          <Send className="w-4 h-4 text-text-subtle" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-text">{item.subject}</p>
                          {/* EMR-934: "{method} – {docType} – sent {date}, {time}" */}
                          <p className="text-xs text-text-subtle mt-0.5 tabular-nums">
                            {outboxIdentifier(item)}
                          </p>
                          <p className="text-[11px] text-text-subtle mt-0.5">
                            To: <span className="font-medium text-text">{item.recipient}</span>
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge
                          tone={item.status === "delivered" ? "success" : "info"}
                          className="text-[9px]"
                        >
                          {item.status.toUpperCase()}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* EMR-938: 90-day retention — archived items hidden behind an affordance. */}
          {archivedOutbox.length > 0 && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowArchived((s) => !s)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-subtle hover:text-text transition-colors"
              >
                {showArchived ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Archived ({archivedOutbox.length})
                <span className="font-normal text-text-subtle">· older than 90 days</span>
              </button>
              {showArchived && (
                <div className="space-y-2 mt-3 animate-in fade-in slide-in-from-top-1 duration-200">
                  {archivedOutbox.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-border bg-surface-muted/30 px-4 py-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-text truncate">{item.subject}</p>
                        <p className="text-[11px] text-text-subtle tabular-nums">{outboxIdentifier(item)}</p>
                      </div>
                      <Badge tone="neutral" className="text-[9px] shrink-0">ARCHIVED</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      </>
      )}

      {/* COMPOSE MODAL */}
      <ModalShell
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        maxWidth="max-w-lg"
        title="Compose Outbound Document"
        description="Transmit faxes or emails to patients, clinics, or insurance networks."
      >
        <form onSubmit={handleComposeSend} className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setMethod("fax")}
              className={cn(
                "p-3 rounded-lg border text-center font-semibold text-xs transition-all",
                method === "fax" 
                  ? "bg-accent/10 border-accent text-accent" 
                  : "bg-surface border-border hover:bg-surface-raised"
              )}
            >
              Fax Transmission
            </button>
            <button
              type="button"
              onClick={() => setMethod("email")}
              className={cn(
                "p-3 rounded-lg border text-center font-semibold text-xs transition-all",
                method === "email" 
                  ? "bg-accent/10 border-accent text-accent" 
                  : "bg-surface border-border hover:bg-surface-raised"
              )}
            >
              Email Transmission
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-subtle uppercase">Recipient Destination</label>
            <Input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder={method === "fax" ? "Fax number (e.g. 415-555-0100)" : "Email address (e.g. contact@care.com)"}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-subtle uppercase">Subject / Description</label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Medical Records Release form"
                required
              />
            </div>
            {/* EMR-934: document type recorded on the outbox identifier. */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-subtle uppercase">Document Type</label>
              <Input
                value={composeDocType}
                onChange={(e) => setComposeDocType(e.target.value)}
                placeholder="e.g. Records release, PA appeal"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-subtle uppercase">Message Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write a brief cover note..."
              rows={4}
              className="w-full text-sm rounded-md border border-border bg-surface p-2.5 text-text focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* EMR-938: real file input bound to state (shows the attached filename). */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-subtle uppercase block">Attachment File</label>
            <label className="border border-dashed border-border rounded-lg p-4 text-center text-xs text-text-subtle bg-surface-muted/50 hover:bg-surface-muted transition-colors cursor-pointer flex flex-col items-center gap-1.5">
              {attachmentName ? (
                <>
                  <Paperclip className="w-4 h-4 text-accent" />
                  <span className="text-text font-medium break-all">{attachmentName}</span>
                  <span className="text-[10px] text-text-subtle">Click to replace</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 text-text-subtle" />
                  <span>Select Medical PDF, EOB, or scan card</span>
                </>
              )}
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.docx"
                onChange={(e) => setAttachmentName(e.target.files?.[0]?.name ?? null)}
                className="sr-only"
              />
            </label>
            {attachmentName && (
              <button
                type="button"
                onClick={() => setAttachmentName(null)}
                className="text-[11px] text-text-subtle hover:text-danger font-semibold inline-flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Remove attachment
              </button>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <button
              type="button"
              onClick={() => setComposeOpen(false)}
              className="px-3 py-1.5 rounded-lg border hover:bg-surface-raised transition-colors text-xs font-semibold"
            >
              Cancel
            </button>
            {/* EMR-938: clear Send action. */}
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent text-accent-ink hover:bg-accent/90 transition-colors text-xs font-semibold"
            >
              <Send className="w-3.5 h-3.5" />
              Send
            </button>
          </div>
        </form>
      </ModalShell>

      {/* EMR-977: Edit / Route modal — change patient, category, doc date. */}
      <ModalShell
        open={editScanId !== null}
        onClose={() => setEditScanId(null)}
        maxWidth="max-w-md"
        title="Edit & route document"
        description="Confirm the patient and file this document into the chart."
      >
        <form onSubmit={handleRouteEdit} className="space-y-4 px-6 py-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-subtle uppercase">Patient name or DOB</label>
            <Input
              value={editPatientQuery}
              onChange={(e) => setEditPatientQuery(e.target.value)}
              placeholder="Search patient by name"
            />
            <Input
              value={editDob}
              onChange={(e) => setEditDob(e.target.value)}
              type="date"
              className="mt-2"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-subtle uppercase">Chart document category</label>
            <select
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
              className="w-full text-sm rounded-md border border-border bg-surface p-2.5 text-text focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {CHART_DOC_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-subtle uppercase">Document date</label>
            <Input
              value={editDocDate}
              onChange={(e) => setEditDocDate(e.target.value)}
              type="date"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <button
              type="button"
              onClick={() => setEditScanId(null)}
              className="px-3 py-1.5 rounded-lg border hover:bg-surface-raised transition-colors text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent text-accent-ink hover:bg-accent/90 transition-colors text-xs font-semibold"
            >
              <ChevronRight className="w-3.5 h-3.5" />
              Route
            </button>
          </div>
        </form>
      </ModalShell>
    </div>
  );
}
