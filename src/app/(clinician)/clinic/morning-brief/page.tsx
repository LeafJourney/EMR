// EMR-708 — /clinic/morning-brief is folded into /clinic/messages as the
// `brief` category. We keep this route alive as a permanent redirect so
// existing bookmarks, agent links, and shortcut surfaces keep working.
//
// The morning-brief content (unsigned notes, no-shows, unanswered messages,
// incomplete intake, worsening patients, high-risk appointments) is being
// folded into the Smart Inbox as a new "brief" category. The standalone
// page is replaced by a redirect so inbound bookmarks, agent outputs, and
// any link in historical notes still land somewhere useful.
import { redirect } from "next/navigation";

export default function MorningBriefRedirectPage(): never {
  redirect("/clinic/messages?filter=brief");
}
