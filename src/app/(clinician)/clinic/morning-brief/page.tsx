// EMR-708 — /clinic/morning-brief is folded into /clinic/messages as the
// `brief` category. We keep this route alive as a permanent redirect so
// existing bookmarks, agent links, and shortcut surfaces keep working.

import { redirect } from "next/navigation";

export default function MorningBriefRedirectPage(): never {
  redirect("/clinic/messages?filter=brief");
}
