// Sentinel used by resolveThread to mark a thread as clinically
// dispositioned. Lives outside actions.ts because Next.js "use server"
// modules can only export async functions, and isResolvedMarker is a
// synchronous predicate used by the inbox renderer.

export const RESOLVED_SENTINEL = "[[RESOLVED]]";

export function isResolvedMarker(body: string): boolean {
  return body.trim().startsWith(RESOLVED_SENTINEL);
}
