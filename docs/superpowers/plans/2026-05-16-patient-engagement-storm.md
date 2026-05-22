# Patient Engagement Storm (30-Ticket Sprint)
**Date**: 2026-05-16
**Focus**: Deepening patient retention and delight via gamification, the "My Storybook" interactive narrative, and the ChatCB AI Coach.

This implementation plan outlines 30 distinct Linear tickets divided into four parallel-executable epics. This is designed to be fed directly into the `dispatching-parallel-agents` workflow.

---

## 🎮 Epic 1: The Gamification Engine (Streaks & Health Rings)
*Goal: Build daily habits by introducing Apple-style health rings and streak mechanics for symptom tracking and dosing adherence.*

*   **[EMR-086] Prisma Schema:** Implement `DailyCheckInStreak` model and backend increment/reset logic.
*   **[EMR-087] Top-Nav Streak UI:** Build an animated `<StreakFlame>` component that rests persistently in the portal top navigation bar.
*   **[EMR-088] Health Rings Widget:** Build an Apple-Fitness-style `<HealthRings>` dashboard SVG component.
*   **[EMR-089] Ring Data Hydration:** Connect the three rings to: (1) Check-ins, (2) Medication adherence, and (3) Daily intake forms.
*   **[EMR-090] Streak Forgiveness:** Add "Streak Lost" grace period logic (weekend leniency).
*   **[EMR-091] Freeze Token Economy:** Implement "Freeze Tokens" earned by achieving 7-day perfect weeks.
*   **[EMR-092] Freeze Token Store:** Build the `<FreezeTokenStore>` modal for patients to view and manually apply freezes to missed days.
*   **[EMR-093] Timezone Resiliency:** Write a robust Vitest suite verifying streak calculation logic across all US timezones and edge-case boundaries.

---

## 📖 Epic 2: "My Storybook" Interactive Chapters
*Goal: Transform the patient's medical history into a highly visual, emotionally resonant, and interactive narrative.*

*   **[EMR-094] "The Origin" Chapter:** Create a dynamic layout for the "Origin Story" chapter, summarizing the patient's intake narrative in rich typography.
*   **[EMR-095] "The Shift" Chapter:** Implement "The Shift" chapter featuring gorgeous, animated 30-day pain/sleep improvement graphs.
*   **[EMR-096] Page Turn Physics:** Add 3D Page Turn micro-animations between Storybook chapters using Framer Motion.
*   **[EMR-097] "The Apothecary" Chapter:** Build a chapter detailing the user's specific prescribed cannabis strains, highlighting terpene profiles as trading-card stats.
*   **[EMR-098] Audio Narration Toggle:** Utilize the browser's Web Speech API to add an ambient "Read to me" narration feature.
*   **[EMR-099] Secure Sharing:** Add a "Share My Story" feature that generates a secure, anonymized public URL link for family members.
*   **[EMR-100] Print-to-PDF:** Build a high-fidelity Print-to-PDF pipeline for the Storybook using browser-native print stylesheets.
*   **[EMR-101] Chapter Soundtracks:** Integrate custom ambient soundtrack choices per chapter (e.g., Focus, Rest, Uplift).

---

## 🤖 Epic 3: ChatCB AI Coach
*Goal: Launch the ChatCB sidecar to give patients an interactive, empathetic, 24/7 companion.*

*   **[EMR-102] ChatCB Scaffold:** Build the `<ChatCBInterface>` sliding side-pane overlay in the portal layout shell.
*   **[EMR-103] RAG Integration:** Implement the backend `ChatCBService` connecting to the LLM with a RAG pipeline scoped strictly to the patient's care plan.
*   **[EMR-104] Context Injection:** Feed the patient's active `dosingRegimens` and recent `outcomeLogs` into the ChatCB system prompt securely.
*   **[EMR-105] Fluid Typing UI:** Build a `<TypingIndicator>` component with fluid, staggered Framer Motion dots.
*   **[EMR-106] Quick Prompts:** Add predictive "Quick Prompts" chips (e.g., "I'm feeling anxious right now", "When should I take my dose?").
*   **[EMR-107] Thread Persistence:** Implement Chat History persistence via a new Prisma `AICoachThread` model.
*   **[EMR-108] Action Invocations:** Give ChatCB the ability to return functional UI components in-chat (e.g., rendering a "Log Dose" button directly in the message stream).

---

## 🏆 Epic 4: Achievement Badges & Milestones
*Goal: Introduce collectible badges that reward long-term engagement and detailed outcome logging.*

*   **[EMR-109] Badge Showcase:** Design and implement the `<BadgeShowcase>` grid component inside the patient profile screen.
*   **[EMR-110] Tiered SVGs:** Add "First Dose Logged" bronze, silver, and gold tier vector graphics.
*   **[EMR-111] "The Botanist" Badge:** Implement logic to award "The Botanist" badge for maintaining 30 consecutive days of plant health > 80%.
*   **[EMR-112] Confetti Overlay:** Build a real-time confetti canvas overlay (`TriggerConfetti`) that fires the moment a badge is unlocked.
*   **[EMR-113] "Symptom Detective" Badge:** Add logic to award the "Symptom Detective" badge for logging > 5 detailed text descriptions in outcome logs.
*   **[EMR-114] Retroactive Awards:** Create a backend script (`scripts/award-badges.ts`) to retroactively calculate and award badges to existing seeded demo users.
*   **[EMR-115] Unlock Notifications:** Implement push notifications/in-app toast alerts when a patient hits a milestone threshold.
