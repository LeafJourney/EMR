import Link from "next/link";
import { Wordmark } from "@/components/ui/logo";
import { LeafSprig } from "@/components/ui/ornament";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg relative overflow-hidden">
      {/* Ambient wash */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 50% 40% at 80% 15%, var(--highlight-soft), transparent 65%)," +
            "radial-gradient(ellipse 45% 50% at 15% 85%, var(--accent-soft), transparent 60%)",
        }}
      />

      <nav className="max-w-[1280px] mx-auto w-full flex items-center justify-between px-6 lg:px-12 h-20">
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

      <main id="main-content" className="flex-1 flex items-start justify-center px-6 pt-8 pb-24">
        <div className="w-full max-w-[440px]">
          <div className="bg-surface-raised border border-border rounded-2xl shadow-md px-8 py-10 relative overflow-hidden">
            {/* corner leaf garnish */}
            <LeafSprig
              size={48}
              className="absolute -top-4 -right-4 text-accent/10 rotate-12"
            />
            <div className="relative">{children}</div>
          </div>
          <p className="text-xs text-text-subtle text-center mt-6">
            Private and secure. Sessions encrypted end-to-end.
          </p>
        </div>
      </main>
    </div>
  );
}
