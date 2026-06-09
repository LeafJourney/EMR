import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { MailFaxClient } from "./mail-fax-client";
import { type DocumentSource } from "@/lib/billing/mail-fax-ocr";
import { SAMPLE_DOCS } from "./sample-docs";

export const metadata = { title: "Documents Processing Center" };

interface ScanRow {
  id: string;
  receivedAt: string;
  source: DocumentSource;
  patientName: string;
  patientMrn: string;
  rawOcr: string;
  coverages: Array<{ payerName: string; memberId: string; groupNumber: string | null }>;
  /** EMR-986: URL/data-URI of the actual scanned document for full-size preview. */
  documentUrl: string;
  /** EMR-986: file format of the actual document, drives the preview renderer. */
  documentType: "pdf" | "jpg" | "docx";
}

// Initial preview scans
const PREVIEW_SCANS: ScanRow[] = [
  {
    id: "scan-001",
    receivedAt: "2026-04-29T08:14:00Z",
    source: "fax",
    patientName: "Maya Castillo",
    patientMrn: "MLN-A0042",
    rawOcr:
      "AETNA HEALTHCARE\nMember ID: W123456789\nGroup #: 0042-ABC\nPlan Type: PPO\nEffective: 01/01/2026\nSubscriber: Maya Castillo\nRxBIN: 610502  RxPCN: ADV",
    coverages: [
      {
        payerName: "Aetna",
        memberId: "W123456789",
        groupNumber: "0042-ABC",
      },
    ],
    documentUrl: SAMPLE_DOCS.aetnaCard,
    documentType: "jpg",
  },
  {
    id: "scan-002",
    receivedAt: "2026-04-29T07:58:00Z",
    source: "mail",
    patientName: "Jonas Reiter",
    patientMrn: "MLN-B0119",
    rawOcr:
      "BLUE CROSS BLUE SHIELD OF NEW YORK\nExplanation of Benefits\nMember ID: XJZ-44210-22\nGroup Number: NY-ENT-118\nPlan Type: HMO\nEffective Date: 2026-02-15",
    coverages: [
      {
        payerName: "Blue Cross Blue Shield",
        memberId: "XJZ-44210-21",
        groupNumber: "NY-ENT-118",
      },
    ],
    documentUrl: SAMPLE_DOCS.bcbsEob,
    documentType: "pdf",
  },
  {
    id: "scan-003",
    receivedAt: "2026-04-29T06:32:00Z",
    source: "fax",
    patientName: "Carla Wei",
    patientMrn: "MLN-C0207",
    rawOcr:
      "UNITED HEALTHCARE\nINSURANCE CARD\nMember #: UHC-77891234\nGroup: GRP-44-OPT\nHDHP Plan",
    coverages: [],
    documentUrl: SAMPLE_DOCS.uhcCard,
    documentType: "jpg",
  },
  {
    id: "scan-004",
    receivedAt: "2026-04-29T05:11:00Z",
    source: "portal-upload",
    patientName: "Dion Kelly",
    patientMrn: "MLN-D0301",
    rawOcr:
      "Generic letter — patient name only, no payer or member id visible after OCR.",
    coverages: [
      {
        payerName: "Cigna",
        memberId: "C-201-330-9912",
        groupNumber: null,
      },
    ],
    documentUrl: SAMPLE_DOCS.cignaLetter,
    documentType: "pdf",
  },
];

export default async function MailFaxPage() {
  const user = await requireUser();
  const organizationId = user.organizationId!;
  
  // Fetch real database patients to map their IDs
  const dbPatients = await prisma.patient.findMany({
    where: { organizationId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  });

  return (
    <PageShell maxWidth="max-w-[1280px]">
      <MailFaxClient 
        dbPatients={dbPatients}
        initialScans={PREVIEW_SCANS}
      />
    </PageShell>
  );
}
