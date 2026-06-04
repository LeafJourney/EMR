"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { 
  Send, 
  Trash2, 
  Plus, 
  Check, 
  FileText, 
  FileCheck, 
  AlertTriangle, 
  FolderOpen, 
  RotateCcw, 
  X, 
  Upload, 
  Eye, 
  EyeOff,
  ChevronRight,
  Sparkles,
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
}

interface OutboxItem {
  id: string;
  sentAt: string;
  recipient: string;
  subject: string;
  status: "sent" | "delivered" | "failed";
  method: "fax" | "email";
}

interface DeletedItem {
  id: string;
  deletedAt: string;
  patientName: string;
  originalName: string;
  rawOcr: string;
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

function tonForResult(result: CrossCheckResult) {
  if (result.isExactMatch) return "success" as const;
  if (result.mismatches.length > 0) return "danger" as const;
  if (result.isNewCoverage) return "warning" as const;
  return "neutral" as const;
}

function tonForConfidence(confidence: CrossCheckResult["confidence"]) {
  return confidence === "high"
    ? ("success" as const)
    : confidence === "medium"
      ? ("warning" as const)
      : ("danger" as const);
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
  },
  {
    id: "outbound-002",
    sentAt: "2026-06-02T14:15:00Z",
    recipient: "cindy.m@bluecross.com",
    subject: "Prior Authorization Appeal — Claim #CLM-88710",
    status: "sent",
    method: "email",
  }
];

const INITIAL_DELETED: DeletedItem[] = [
  {
    id: "scan-deleted-1",
    deletedAt: "2026-06-02T10:00:00Z",
    patientName: "John Doe",
    originalName: "Unknown_Document_Scan.pdf",
    rawOcr: "No readable insurance details found in this blurred fax page.",
  }
];

// ---------------------------------------------------------------------------
// Client component logic
// ---------------------------------------------------------------------------

export function MailFaxClient({
  dbPatients,
  initialScans,
}: {
  dbPatients: DbPatient[];
  initialScans: ScanRow[];
}) {
  const [activeTab, setActiveTab] = useState<"inbox" | "outbox">("inbox");
  
  // Inbox lists, Outbox lists, Deleted lists
  const [scans, setScans] = useState<ScanRow[]>(initialScans);
  const [outbox, setOutbox] = useState<OutboxItem[]>(INITIAL_OUTBOX);
  const [deletedItems, setDeletedItems] = useState<DeletedItem[]>(INITIAL_DELETED);
  
  // Active Filter based on clickable Stat Cards
  const [selectedFilter, setSelectedFilter] = useState<"all" | "flagged" | "exact" | "low">("all");
  
  // OCR expanded row states
  const [expandedOCRId, setExpandedOCRId] = useState<string | null>(null);
  
  // Dialog controls
  const [composeOpen, setComposeOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  
  // Scan Simulation progress
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  
  // Compose form inputs
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [method, setMethod] = useState<"fax" | "email">("fax");
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Map patientName to DB patient ID (e.g. Maya Castillo -> Maya Reyes, or fallback to first patient)
  const getPatientId = (patientName: string) => {
    const firstName = patientName.split(" ")[0].toLowerCase();
    const match = dbPatients.find(p => p.firstName.toLowerCase() === firstName);
    return match?.id ?? dbPatients[0]?.id ?? "placeholder-id";
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

  // Filter reviewed list based on active filter tab
  const filteredScans = useMemo(() => {
    if (selectedFilter === "all") return reviewed;
    if (selectedFilter === "flagged") {
      return reviewed.filter((r) => r.result.mismatches.length > 0 || r.result.isNewCoverage);
    }
    if (selectedFilter === "exact") {
      return reviewed.filter((r) => r.result.isExactMatch);
    }
    if (selectedFilter === "low") {
      return reviewed.filter((r) => r.result.confidence === "low");
    }
    return reviewed;
  }, [reviewed, selectedFilter]);

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
            ]
          };
          setScans((prevScans) => [newRecord, ...prevScans]);
          triggerToast("Document upload scanned successfully!");
          return 100;
        }
        return prev + 25;
      });
    }, 300);
  };

  // Soft Delete Action
  const handleDeleteScan = (id: string, name: string, ocr: string) => {
    setScans((prev) => prev.filter((s) => s.id !== id));
    setDeletedItems((prev) => [
      {
        id,
        deletedAt: new Date().toISOString(),
        patientName: name,
        originalName: `deleted_scan_${id}.pdf`,
        rawOcr: ocr,
      },
      ...prev,
    ]);
    triggerToast(`Document for ${name} moved to Deleted Items.`);
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
      coverages: []
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
    };

    setOutbox((prev) => [newItem, ...prev]);
    setComposeOpen(false);
    setRecipient("");
    setSubject("");
    setBody("");
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

      {/* Header and top commands */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text tracking-tight">Documents Inbox & Outbox</h1>
          <p className="text-sm text-text-subtle mt-1">
            Inbound mail packets, faxes, and portal uploads are OCR'd, parsed, and cross-checked.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Action buttons */}
          <button
            type="button"
            onClick={handleScanSimulation}
            disabled={scanning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-raised transition-colors text-xs font-semibold text-text shadow-sm"
          >
            <Upload className="w-3.5 h-3.5" />
            {scanning ? `Scanning (${scanProgress}%)` : "Scan Inbound"}
          </button>
          
          <button
            type="button"
            onClick={() => setTrashOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-raised transition-colors text-xs font-semibold text-text-subtle hover:text-text shadow-sm"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Deleted Items ({deletedItems.length})
          </button>

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
          Outbox ({outbox.length})
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === "inbox" ? (
        <>
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
                const patientId = getPatientId(scan.patientName);
                const isExpanded = expandedOCRId === scan.id;

                return (
                  <Card key={scan.id} tone="raised" className="overflow-hidden">
                    <CardHeader className="pb-3 border-b border-border/50">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <CardTitle className="flex items-center gap-2 text-base">
                            <span className="font-semibold text-text">{scan.patientName}</span>
                            {/* EMR-981 Rename MRN bubble to MLN */}
                            <Badge tone="neutral" className="font-mono bg-surface-muted border-border font-semibold">
                              MLN: {scan.patientMrn.replace("MRN-", "")}
                            </Badge>
                          </CardTitle>
                          <CardDescription className="text-xs text-text-subtle mt-0.5">
                            {SOURCE_LABEL[scan.source]} ·{" "}
                            {DOC_TYPE_LABEL[result.documentType]} · received{" "}
                            {new Date(scan.receivedAt).toLocaleString()}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge tone={tonForConfidence(result.confidence)}>
                            {result.confidence} confidence
                          </Badge>
                          <Badge tone={tonForResult(result)}>
                            {summarizeCrossCheck(result)}
                          </Badge>
                          <button
                            type="button"
                            onClick={() => handleDeleteScan(scan.id, scan.patientName, scan.rawOcr)}
                            title="Move to Deleted Items"
                            className="p-1 rounded text-text-subtle hover:text-danger hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="pt-4">
                      {/* Grid cards for extracted info */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Extracted block with Add Insurance action */}
                        <div className="rounded-xl border border-border bg-surface-muted/50 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-subtle">
                              Extracted Scan Data
                            </p>
                            {/* EMR-983: Add Insurance button on Extracted section */}
                            <Link
                              href={`/clinic/patients/${patientId}`}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline"
                            >
                              <Plus className="w-3 h-3" />
                              Add Insurance to Chart
                            </Link>
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
                          <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            {/* Left Pane: High-fidelity document mock */}
                            <div className="rounded-xl border border-border bg-white p-6 shadow-sm relative min-h-[220px] overflow-hidden flex flex-col justify-between">
                              {/* Page watermarks/decoration */}
                              <div className="absolute top-0 right-0 w-24 h-24 bg-surface-muted/20 rounded-bl-full flex items-center justify-center border-l border-b border-border/10">
                                <span className="font-mono text-[9px] text-text-subtle tracking-wider uppercase rotate-45 select-none opacity-40">SCANNED</span>
                              </div>
                              <div>
                                <div className="flex items-center justify-between border-b pb-3 mb-4">
                                  <div>
                                    <h4 className="font-serif text-sm font-semibold tracking-wider text-slate-800 uppercase">HEALTH INSURANCE CARD</h4>
                                    <p className="text-[9px] text-slate-500 font-mono tracking-widest uppercase">OFFICIAL DOCUMENT</p>
                                  </div>
                                  <FileText className="w-6 h-6 text-slate-400" />
                                </div>
                                <div className="space-y-2.5 font-mono text-[10px] text-slate-700 leading-normal">
                                  <div className="flex justify-between border-b border-slate-100 pb-1">
                                    <span className="text-slate-400 uppercase text-[9px]">Carrier</span>
                                    <span className="font-semibold">{result.extracted.payerName ?? "AETNA HEALTH"}</span>
                                  </div>
                                  <div className="flex justify-between border-b border-slate-100 pb-1">
                                    <span className="text-slate-400 uppercase text-[9px]">Member ID</span>
                                    <span className="font-semibold">{result.extracted.memberId ?? "W123456789"}</span>
                                  </div>
                                  <div className="flex justify-between border-b border-slate-100 pb-1">
                                    <span className="text-slate-400 uppercase text-[9px]">Group #</span>
                                    <span className="font-semibold">{result.extracted.groupNumber ?? "0042-ABC"}</span>
                                  </div>
                                  <div className="flex justify-between border-b border-slate-100 pb-1">
                                    <span className="text-slate-400 uppercase text-[9px]">Subscriber</span>
                                    <span className="font-semibold">{scan.patientName}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="border-t pt-3 mt-4 flex items-center justify-between text-[9px] font-mono text-slate-400">
                                <span>ORIGINAL SCAN: {scan.source.toUpperCase()}</span>
                                <span>REF: {scan.id}</span>
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
                          </div>
                        )}
                      </div>
                    </CardContent>
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
            <span className="text-xs text-text-subtle">{outbox.length} messages sent</span>
          </div>

          {outbox.length === 0 ? (
            <EmptyState
              title="No outbound faxes or emails"
              description="Click 'Compose Outbound' to transmit documents."
            />
          ) : (
            <div className="space-y-3">
              {outbox.map((item) => (
                <Card key={item.id} className="hover:border-accent/40 transition-colors">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-surface-muted flex items-center justify-center shrink-0 border border-border">
                          <Send className="w-4 h-4 text-text-subtle" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-text">{item.subject}</p>
                          <p className="text-xs text-text-subtle mt-0.5">
                            To: <span className="font-medium text-text">{item.recipient}</span> · via {item.method.toUpperCase()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-text-subtle tabular-nums block">
                          {new Date(item.sentAt).toLocaleString()}
                        </span>
                        <Badge 
                          tone={item.status === "delivered" ? "success" : "info"} 
                          className="mt-1.5 text-[9px]"
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
        </div>
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

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-subtle uppercase">Subject / Description</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Medical Records Release form"
              required
            />
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

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-subtle uppercase block">Attachment File</label>
            <div className="border border-dashed border-border rounded-lg p-4 text-center text-xs text-text-subtle bg-surface-muted/50 hover:bg-surface-muted transition-colors cursor-pointer flex flex-col items-center gap-1.5">
              <Upload className="w-4 h-4 text-text-subtle" />
              <span>Select Medical PDF, EOB, or scan card</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <button
              type="button"
              onClick={() => setComposeOpen(false)}
              className="px-3 py-1.5 rounded-lg border hover:bg-surface-raised transition-colors text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-accent text-accent-ink hover:bg-accent/90 transition-colors text-xs font-semibold"
            >
              Send Transmission
            </button>
          </div>
        </form>
      </ModalShell>

      {/* DELETED ITEMS MODAL */}
      <ModalShell
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        title="Deleted Items Drawer"
        description="Items here are temporarily kept for 30 days and can be recovered."
      >
        <div className="px-6 py-5 space-y-3">
          {deletedItems.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-6 italic">Deleted items is currently empty.</p>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {deletedItems.map((item) => (
                <div key={item.id} className="rounded-lg border border-border bg-surface-muted/30 p-3.5 flex flex-col justify-between gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-text">{item.patientName}</p>
                      <p className="text-[10px] text-text-subtle mt-0.5">{item.originalName}</p>
                      <span className="text-[9px] text-text-subtle">Deleted: {new Date(item.deletedAt).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleRecover(item)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-accent-soft text-accent text-[10px] font-semibold hover:bg-accent-soft/80 transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Recover
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePermanentDelete(item.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-50 text-danger text-[10px] font-semibold hover:bg-red-100 transition-colors"
                      >
                        <X className="w-3 h-3" />
                        Purge
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <div className="flex justify-end pt-3 border-t border-border">
            <button
              type="button"
              onClick={() => setTrashOpen(false)}
              className="px-4 py-1.5 rounded-lg bg-text text-background text-xs font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      </ModalShell>
    </div>
  );
}
