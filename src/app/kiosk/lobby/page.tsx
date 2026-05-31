import Link from "next/link";
import { getCurrentKioskLobby } from "@/lib/check-in/kiosk-lobby-session";
import { getLobbyReadinessView } from "@/lib/check-in/lobby-scope";
import { LobbyExpired } from "./lobby-expired";

// The lobby "room" home — the scoped task list. No token in the URL: the
// path-scoped cookie is the only authorization. Force dynamic; never cached.
export const dynamic = "force-dynamic";

export default async function LobbyHomePage() {
  const identity = await getCurrentKioskLobby();
  if (!identity) {
    // No live session (expired, timed out, or never minted) — safe terminal.
    return <LobbyExpired />;
  }

  const view = await getLobbyReadinessView(identity.patientId, identity.organizationId);

  // "All set" with no tasks at all is a pure terminal screen; "all set" WITH
  // tasks means everything's been submitted and is awaiting review (still
  // editable). Anything outstanding-and-unsubmitted is the working to-do state.
  const headline = view.allDone ? "You're all set" : "A couple things before your visit";
  const subtext = !view.allDone
    ? "Finish these from your seat. Each one takes a minute, and your care team reviews everything before your visit."
    : view.tasks.length === 0
      ? "Thanks — there's nothing else to do here. Please have a seat and we'll call you shortly."
      : "Everything's submitted and with your care team for review. Have a seat — and if you need to change an answer, you still can below.";

  return (
    <div className="flex-1 flex flex-col">
      <p className="text-[11px] uppercase tracking-[0.2em] text-accent font-medium mb-2">
        You&rsquo;re in
      </p>
      <h1 className="font-display text-3xl text-text tracking-tight leading-tight mb-2">
        {headline}
      </h1>
      <p className="text-[15px] text-text-muted mb-8 leading-relaxed">{subtext}</p>

      {view.tasks.length > 0 && (
        <ul className="space-y-3">
          {view.tasks.map((task) => (
            <li key={task.workflow}>
              <Link
                href={task.href}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-surface px-5 py-5 hover:border-accent hover:bg-accent/5 transition-all"
              >
                <span className="flex flex-col">
                  <span className="text-lg font-medium text-text">{task.label}</span>
                  {task.submitted && (
                    <span className="text-[13px] text-accent font-medium mt-0.5">
                      ✓ Submitted · tap to edit
                    </span>
                  )}
                </span>
                <span aria-hidden="true" className="text-text-subtle text-xl">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8 text-xs text-text-subtle">
        This session is just for getting ready for today&rsquo;s visit. To see your records,
        messages, or other details, sign in to your patient portal.
      </p>
    </div>
  );
}
