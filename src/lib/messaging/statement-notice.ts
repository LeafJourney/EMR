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
