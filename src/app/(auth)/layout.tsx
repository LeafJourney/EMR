import Link from "next/link";
import { Wordmark } from "@/components/ui/logo";
import { LeafSprig } from "@/components/ui/ornament";
import { SandboxLogins } from "@/components/auth/SandboxLogins";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <div className="min-h-screen bg-bg relative overflow-hidden flex flex-col">
      {/* Ambient wash - slowly drifting gradient */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-70 dark:opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 55% 45% at 80% 15%, var(--highlight-soft), transparent 65%)," +
            "radial-gradient(ellipse 45% 50% at 15% 85%, var(--accent-soft), transparent 60%)",
          backgroundSize: "200% 200%",
          animation: "ambient-drift 24s ease-in-out infinite alternate",
        }}
      />

      <nav className="max-w-[1280px] mx-auto w-full flex items-center justify-between px-6 lg:px-12 h-20 shrink-0">
        <Link href="/">
          <Wordmark size="md" />
        </Link>
        <Link
          href="/"
          className="text-sm text-text-muted hover:text-text transition-colors"
        >
          ← Back home
        </Link>
      </nav>

      <main id="main-content" className="flex-1 flex items-center justify-center px-6 pt-8 pb-24">
        <div className={`w-full flex ${isDev ? 'max-w-[860px] flex-col md:flex-row gap-8 items-stretch justify-center' : 'max-w-[440px] flex-col'}`}>
          <div className="w-full max-w-[440px] flex flex-col justify-between">
            <div className="bg-surface-raised border border-border rounded-2xl shadow-md px-8 py-10 relative overflow-hidden h-full flex flex-col justify-between lm-fade-in">
              {/* corner leaf garnish */}
              <LeafSprig
                size={48}
                className="absolute -top-4 -right-4 text-accent/10 rotate-12"
              />
              <div className="relative">{children}</div>
            </div>
            {!isDev && (
              <p className="text-xs text-text-subtle text-center mt-6">
                Private and secure. Sessions encrypted end-to-end.
              </p>
            )}
          </div>

          {isDev && <SandboxLogins />}
        </div>
      </main>
    </div>
  );
}
