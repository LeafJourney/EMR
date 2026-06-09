import { redirect } from "next/navigation";

// EMR-1079 (Back-Office Operations Audit §6.5) — the Smart Inbox lives at
// /clinic/messages. Older links / bookmarks pointed at /clinic/inbox and
// 404'd; this redirect makes the inbox reachable from that path too.
export default function InboxRedirect() {
  redirect("/clinic/messages");
}
