# Patient Portal Hardening & Delight (Agent Storm)
**Date**: 2026-05-15
**Goal**: Launch an overnight "agent storm" to squash technical debt, optimize performance, and inject high-end UX delight into the Patient Portal.

## Linear Ticket Backlog (The Storm Targets)

### 🚀 Track 1: Performance & Tech Debt

**[EMR-081] Dashboard Query Unbundling (React Suspense)**
- **Problem:** Currently, `src/app/(patient)/portal/page.tsx` runs one massive blocking Prisma query that fetches `outcomeLogs`, `encounters`, `tasks`, `messageThreads`, and `dosingRegimens` all at once. If any join is slow, the whole page hangs (which is why there's a 5s timeout hack).
- **Solution:** Break the dashboard down into granular React Server Components (e.g., `<NextVisitWidget>`, `<LifestyleBarsWidget>`) and wrap them in `<Suspense>`. The page shell will load instantly, and widgets will stream in as their targeted queries resolve.

**[EMR-082] High-Fidelity Skeleton Loading States**
- **Problem:** The current `portal/loading.tsx` is basic. When a patient navigates, it doesn't feel premium.
- **Solution:** Build 1:1 matching skeleton loaders for the Metric Tiles, Sparklines, and the Cannabis Module using Tailwind's `animate-pulse` mixed with soft gradients.

**[EMR-083] Mobile Service Worker / PWA Resilience**
- **Problem:** If a patient loses cellular connection (e.g., in a waiting room or subway), the portal dies.
- **Solution:** Implement a Next.js offline fallback and service worker caching for the dashboard payload, ensuring the patient can always view their latest care plan and appointment times offline.

### ✨ Track 2: The "Delight Factor" (UX & Animations)

**[EMR-084] Micro-Animations (Framer Motion Integration)**
- **Problem:** The dashboard widgets currently "pop" into view instantly, feeling harsh.
- **Solution:** Now that we have `framer-motion` installed (from the Storybook work!), add staggered fade-ups and scale-ins to the Lifestyle Bars, the Health Grade circle, and the AI tip lists. When the user logs an outcome, the progress bars should animate to their new values fluidly.

**[EMR-080] Portal Customization Engine (Personalization)**
- **Problem:** The portal feels static and doesn't adapt to user preferences.
- **Solution:** Add a "Display & Accessibility" settings modal allowing patients to:
  - Toggle True Dark Mode vs. Ambient Light Mode
  - Adjust typography scale (High legibility)
  - Toggle "Reduce Motion" (for vestibular accessibility)

**[EMR-085] Accessibility (a11y) & Focus Ring Audit**
- **Problem:** Premium apps feel premium because they are perfectly accessible to screen readers and keyboard navigation.
- **Solution:** Audit all portal `button` and `a` tags. Ensure rigorous `aria-labels` are present, and implement the custom `focus-visible:ring-accent/40` Tailwind class cleanly across the entire portal interface.

---

## Execution Strategy

Since these tickets are highly isolated, they are perfect for a parallel **Subagent-Driven Development** workflow. 
1. We will use the `dispatching-parallel-agents` skill to dispatch one subagent for the Query Unbundling (EMR-081), one for the Micro-Animations (EMR-084), and one for the Customization Engine (EMR-080).
2. I will oversee the PRs as they complete their specific tasks overnight.
