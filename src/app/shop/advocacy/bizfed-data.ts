// EMR-328 — BizFed Advocacy surface data.
//
// ⚠️ ILLUSTRATIVE CONTENT — PENDING DATA-FEED PARTNERSHIP.
// Every alert, event, and position statement below is *sample / illustrative*
// copy written to demonstrate the surface. It is NOT a live mirror of BizFed
// publications. The official BizFed organizations are the authoritative source;
// outbound links point back to their public sites. Once a data-feed / content
// partnership is in place, this mock module should be replaced with a real
// adapter that fetches and attributes live BizFed content.
//
// Date fields are intentionally plain STRING LABELS (e.g. "June 12, 2026") so
// the surface never calls Date.now()/new Date() during render.

export type BizFedOrgId = "institute" | "la-county" | "central-valley";

export interface BizFedOrg {
  id: BizFedOrgId;
  name: string;
  shortName: string;
  /** Authoritative public site — outbound, opens in a new tab. */
  url: string;
  blurb: string;
}

export interface AdvocacyAlert {
  id: string;
  orgId: BizFedOrgId;
  title: string;
  /** Display-only date label string. */
  dateLabel: string;
  urgency: "action" | "update" | "watch";
  body: string;
  /** Outbound "Take action" link back to the source org. */
  actionUrl: string;
}

export interface MemberEvent {
  id: string;
  orgId: BizFedOrgId;
  title: string;
  /** Display-only date label string. */
  dateLabel: string;
  location: string;
  body: string;
  /** Outbound event / RSVP link. */
  url: string;
}

export interface PositionStatement {
  id: string;
  orgId: BizFedOrgId;
  title: string;
  /** Display-only date label string. */
  dateLabel: string;
  stance: "support" | "oppose" | "neutral";
  summary: string;
  /** Outbound source link. */
  sourceUrl: string;
}

// ── Partner organizations ────────────────────────────────────────────────────

export const BIZFED_ORGS: BizFedOrg[] = [
  {
    id: "institute",
    name: "BizFed Institute",
    shortName: "Institute",
    url: "https://bizfedinstitute.org",
    blurb:
      "The research, education, and leadership arm of the BizFed family — convening business, civic, and policy leaders around long-term regional prosperity, workforce development, and evidence-based policy.",
  },
  {
    id: "la-county",
    name: "BizFed LA County",
    shortName: "LA County",
    url: "https://bizfedlacounty.org",
    blurb:
      "The Los Angeles County Business Federation — a grassroots alliance of more than 200 business organizations representing hundreds of thousands of employers and millions of employees across the region's economy.",
  },
  {
    id: "central-valley",
    name: "BizFed Central Valley",
    shortName: "Central Valley",
    url: "https://bizfedcentralvalley.org",
    blurb:
      "A coalition of business organizations advocating for the Central Valley — championing agriculture, water reliability, infrastructure, and small-business growth across the heart of California.",
  },
];

const ORG_INDEX: Record<BizFedOrgId, BizFedOrg> = BIZFED_ORGS.reduce(
  (acc, org) => {
    acc[org.id] = org;
    return acc;
  },
  {} as Record<BizFedOrgId, BizFedOrg>
);

export function getOrg(id: BizFedOrgId): BizFedOrg {
  return ORG_INDEX[id];
}

// ── Advocacy alerts (illustrative) ───────────────────────────────────────────

export const ADVOCACY_ALERTS: AdvocacyAlert[] = [
  {
    id: "alert-cv-water",
    orgId: "central-valley",
    title: "Comment period open on regional water reliability rules",
    dateLabel: "June 3, 2026",
    urgency: "action",
    body: "Regulators are taking public comment on Central Valley water allocation rules that affect agricultural and small-business operators. BizFed Central Valley urges members to submit comments before the deadline.",
    actionUrl: "https://bizfedcentralvalley.org",
  },
  {
    id: "alert-la-permit",
    orgId: "la-county",
    title: "Streamline LA County business permitting — sign the coalition letter",
    dateLabel: "May 28, 2026",
    urgency: "action",
    body: "BizFed LA County is gathering signatures on a coalition letter calling for faster, more predictable permitting for licensed businesses, including the cannabis and wellness sector.",
    actionUrl: "https://bizfedlacounty.org",
  },
  {
    id: "alert-inst-workforce",
    orgId: "institute",
    title: "Workforce development survey: tell us about your hiring needs",
    dateLabel: "May 20, 2026",
    urgency: "update",
    body: "The BizFed Institute is collecting regional employer input to shape its next workforce and economic-mobility research brief. Wellness and cannabis-adjacent employers are encouraged to participate.",
    actionUrl: "https://bizfedinstitute.org",
  },
  {
    id: "alert-la-tax-watch",
    orgId: "la-county",
    title: "Watch: proposed local gross-receipts tax changes",
    dateLabel: "May 12, 2026",
    urgency: "watch",
    body: "BizFed LA County is monitoring proposed changes to local gross-receipts taxes that could affect retailers and small businesses. No action is required yet — members will be alerted if a comment window opens.",
    actionUrl: "https://bizfedlacounty.org",
  },
];

// ── Member events (illustrative) ─────────────────────────────────────────────

export const MEMBER_EVENTS: MemberEvent[] = [
  {
    id: "event-la-summit",
    orgId: "la-county",
    title: "BizFed LA County Annual Business Summit",
    dateLabel: "June 12, 2026",
    location: "Los Angeles, CA",
    body: "A day of policy briefings, regional economic outlooks, and networking with hundreds of LA County business leaders.",
    url: "https://bizfedlacounty.org",
  },
  {
    id: "event-cv-roundtable",
    orgId: "central-valley",
    title: "Central Valley Agriculture & Small Business Roundtable",
    dateLabel: "June 26, 2026",
    location: "Fresno, CA",
    body: "An open roundtable on water, infrastructure, and the small-business climate across the Central Valley.",
    url: "https://bizfedcentralvalley.org",
  },
  {
    id: "event-inst-forum",
    orgId: "institute",
    title: "BizFed Institute Leadership & Policy Forum",
    dateLabel: "July 9, 2026",
    location: "Pasadena, CA",
    body: "A leadership forum pairing emerging civic leaders with regional policymakers around evidence-based economic policy.",
    url: "https://bizfedinstitute.org",
  },
];

// ── Position statements / news (illustrative) ────────────────────────────────

export const POSITION_STATEMENTS: PositionStatement[] = [
  {
    id: "pos-la-smallbiz",
    orgId: "la-county",
    title: "Supporting predictable, fair regulation for licensed small businesses",
    dateLabel: "May 30, 2026",
    stance: "support",
    summary: "BizFed LA County backs clear, predictable rules and reasonable timelines for permitted businesses so operators — including the licensed cannabis and wellness sector — can plan, hire, and invest with confidence.",
    sourceUrl: "https://bizfedlacounty.org",
  },
  {
    id: "pos-cv-water",
    orgId: "central-valley",
    title: "Water reliability is economic reliability for the Valley",
    dateLabel: "May 22, 2026",
    stance: "support",
    summary: "BizFed Central Valley advocates for durable, science-based water-reliability investments that sustain agriculture, jobs, and the broader regional economy.",
    sourceUrl: "https://bizfedcentralvalley.org",
  },
  {
    id: "pos-inst-mobility",
    orgId: "institute",
    title: "Investing in workforce mobility across the region",
    dateLabel: "May 8, 2026",
    stance: "support",
    summary: "The BizFed Institute publishes research and convenes leaders around economic mobility, workforce training, and the policies that help regional employers and workers thrive together.",
    sourceUrl: "https://bizfedinstitute.org",
  },
  {
    id: "pos-la-redtape",
    orgId: "la-county",
    title: "Opposing duplicative red tape on regional employers",
    dateLabel: "April 29, 2026",
    stance: "oppose",
    summary: "BizFed LA County opposes layered, duplicative mandates that raise costs without clear benefit, advocating instead for streamlined, outcome-focused regulation.",
    sourceUrl: "https://bizfedlacounty.org",
  },
];
