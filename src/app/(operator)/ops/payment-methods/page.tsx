import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate } from "@/lib/utils/format";
import { PaymentMethodsTable, type PaymentMethodRow } from "./payment-methods-table";

export const metadata = { title: "Stored Payment Methods" };

export default async function PaymentMethodsPage() {
  const user = await requireUser();
  const organizationId = user.organizationId!;

  const methods = await prisma.storedPaymentMethod.findMany({
    where: {
      active: true,
      patient: { organizationId },
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  const cardCount = methods.filter((m) => m.type === "card").length;
  const achCount = methods.filter((m) => m.type === "ach").length;
  const defaultCount = methods.filter((m) => m.isDefault).length;
  const uniquePatients = new Set(methods.map((m) => m.patientId)).size;

  const rows: PaymentMethodRow[] = methods.map((m) => ({
    id: m.id,
    patientId: m.patient.id,
    patientFirstName: m.patient.firstName,
    patientLastName: m.patient.lastName,
    type: m.type,
    brand: m.brand ?? null,
    last4: m.last4 ?? null,
    expiresDisplay:
      m.expiryMonth && m.expiryYear
        ? `${String(m.expiryMonth).padStart(2, "0")}/${String(m.expiryYear).slice(-2)}`
        : "—",
    expiresOrdinal:
      m.expiryMonth && m.expiryYear
        ? m.expiryYear * 100 + m.expiryMonth
        : 0,
    savedDisplay: formatDate(m.createdAt),
    savedMs: m.createdAt.getTime(),
    isDefault: m.isDefault,
  }));

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow="Patient finance"
        title="Stored payment methods"
        description="Tokenized card + ACH on file across the practice. Tokens are processor-side (Payabli) — only last 4 + brand are stored locally."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active methods" value={String(methods.length)} size="md" />
        <StatCard label="Patients on file" value={String(uniquePatients)} size="md" />
        <StatCard label="Cards" value={String(cardCount)} tone="accent" size="md" />
        <StatCard label="ACH" value={String(achCount)} tone="info" size="md" />
      </div>

      {/* Payment methods list — sortable columns + CSV/print export (MASTER prompt G5/G6) */}
      <PaymentMethodsTable rows={rows} />

      <p className="text-xs text-text-subtle mt-6">
        {defaultCount} patient(s) have a default method set. Charges flow through{" "}
        <code className="bg-surface-muted px-1 py-0.5 rounded">chargeStoredMethod()</code> in{" "}
        <code className="bg-surface-muted px-1 py-0.5 rounded">src/lib/billing/payment-methods.ts</code>{" "}
        and book to the FinancialEvent ledger before the receipt is generated.
      </p>
    </PageShell>
  );
}
