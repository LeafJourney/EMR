// Statement notification copy (Dr. Patel directive — billing: send statements
// via email/text). PHI-safe by construction: the body carries only the
// statement *number* and a link to the bare patient portal — never the
// balance, line items, or any clinical detail. Specifics live behind portal
// login (mirrors the pre-visit reminder pattern in send-reminders.ts).
//
// Pure + dependency-free so it is unit-testable.

export type StatementNoticeChannel = "email" | "sms";

export interface StatementNoticeInput {
  statementNumber: string;
  /** Bare portal origin (no PHI). Empty string when unconfigured. */
  portalUrl: string;
  practiceName: string;
}

export interface StatementNotice {
  /** Email subject (undefined for SMS). */
  subject?: string;
  body: string;
}

function portalDestination(portalUrl: string): string {
  if (!portalUrl) return "your patient portal";
  const trimmed = portalUrl.endsWith("/") ? portalUrl.slice(0, -1) : portalUrl;
  return `${trimmed}/portal/billing/statements`;
}

export function buildStatementNotice(
  channel: StatementNoticeChannel,
  input: StatementNoticeInput,
): StatementNotice {
  const dest = portalDestination(input.portalUrl);

  if (channel === "sms") {
    return {
      body: `${input.practiceName}: a new billing statement (${input.statementNumber}) is ready. Sign in to view and pay securely: ${dest}`,
    };
  }

  return {
    subject: `New statement ${input.statementNumber} from ${input.practiceName}`,
    body: [
      "Hello,",
      "",
      `You have a new billing statement (${input.statementNumber}) from ${input.practiceName}.`,
      "For your security, the details are available in your patient portal. Sign in to review and pay:",
      dest,
      "",
      "If you have questions about your bill, reply to this message or contact our billing office.",
    ].join("\n"),
  };
}

export interface TaxSummaryNoticeInput {
  /** Tax year the summary covers, e.g. 2025. */
  year: number;
  /** Bare portal origin (no PHI). Empty string when unconfigured. */
  portalUrl: string;
  practiceName: string;
}

function taxSummaryDestination(portalUrl: string): string {
  if (!portalUrl) return "your patient portal";
  const trimmed = portalUrl.endsWith("/") ? portalUrl.slice(0, -1) : portalUrl;
  return `${trimmed}/portal/billing/tax-summary`;
}

/**
 * Notify a patient that their year-end tax summary is available. PHI-safe:
 * only the tax year + a bare-portal link — never amounts or clinical detail.
 */
export function buildTaxSummaryNotice(
  channel: StatementNoticeChannel,
  input: TaxSummaryNoticeInput,
): StatementNotice {
  const dest = taxSummaryDestination(input.portalUrl);

  if (channel === "sms") {
    return {
      body: `${input.practiceName}: your ${input.year} year-end tax summary is ready. Sign in to view or print it: ${dest}`,
    };
  }

  return {
    subject: `Your ${input.year} year-end tax summary from ${input.practiceName}`,
    body: [
      "Hello,",
      "",
      `Your ${input.year} year-end tax summary — a record of your out-of-pocket healthcare expenses — is ready in your patient portal.`,
      "Sign in to view, print, or save it as a PDF for your tax records:",
      dest,
      "",
      "This summary is informational and is not tax advice.",
    ].join("\n"),
  };
}
