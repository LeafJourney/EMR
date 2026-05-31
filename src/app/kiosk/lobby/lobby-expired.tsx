/**
 * Safe terminal screen for any lobby session that is invalid, expired, already
 * redeemed, or timed out by inactivity. It exposes NOTHING — no patient data,
 * no retry that could probe a token, just a reassuring "see the front desk."
 * Rendered for both the bad-token case and the no-live-session case.
 */
export function LobbyExpired({
  title = "This check-in link has expired",
  body = "For your privacy, check-in links lock themselves after a short time. Please see the front desk and they'll get you a fresh one.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <div className="text-5xl mb-5" aria-hidden="true">
        🔒
      </div>
      <h1 className="font-display text-2xl text-text tracking-tight leading-tight mb-3">
        {title}
      </h1>
      <p className="text-[15px] text-text-muted leading-relaxed">{body}</p>
    </div>
  );
}
