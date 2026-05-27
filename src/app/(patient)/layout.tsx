import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AppShell, type NavSection } from "@/components/shell/AppShell";
import { homeForRoles } from "@/lib/rbac/roles";
import { QuoteWelcomeModal } from "@/components/ui/quote-of-the-day";
import { CommandPalette } from "@/components/ui/command-palette";
import { ChatCBInterface } from "@/components/ask-cindy/ChatCBInterface";
import { PortalCustomizationProvider } from "@/components/portal/portal-customization-provider";
import { ConfettiCanvas } from "@/components/portal/confetti-canvas";
import { ServiceWorkerRegister } from "@/components/portal/service-worker-register";
import { InstallPrompt } from "@/components/pwa/install-prompt";


const PATIENT_SECTIONS: NavSection[] = [
  {
    label: "Home",
    pillar: "home",
    icon: "home",
    items: [{ label: "Home", href: "/portal" }],
  },
  {
    label: "Today",
    pillar: "today",
    icon: "clipboard-check",
    items: [
      { label: "Log Dose", href: "/portal/log-dose" },
      { label: "Log Check-in", href: "/portal/outcomes" },
      { label: "Goals", href: "/portal/goals" },
      { label: "Streaks", href: "/portal/streaks" },
      { label: "Weekly Recap", href: "/portal/weekly-recap" },
    ],
  },
  {
    label: "Care",
    pillar: "care",
    icon: "heart",
    items: [
      { label: "My Records", href: "/portal/records" },
      { label: "Care Plan", href: "/portal/care-plan" },
      { label: "Medications", href: "/portal/medications" },
      { label: "Dosing Plan", href: "/portal/dosing" },
      { label: "Dose Calendar", href: "/portal/dose-calendar" },
      { label: "Labs", href: "/portal/labs" },
      { label: "Assessments", href: "/portal/assessments" },
      { label: "Imaging", href: "/portal/imaging" },
      { label: "Emergency Card", href: "/portal/emergency" },
    ],
  },
  {
    label: "Schedule",
    pillar: "schedule",
    icon: "calendar",
    items: [{ label: "Schedule", href: "/portal/schedule" }],
  },
  {
    label: "Messages",
    pillar: "messages",
    icon: "message",
    items: [
      { label: "Messages", href: "/portal/messages" },
      { label: "Q&A", href: "/portal/qa" },
    ],
  },
  {
    label: "Journey",
    pillar: "journey",
    icon: "layout-grid",
    items: [
      { label: "My Garden", href: "/portal/garden" },
      { label: "Journal", href: "/portal/journal" },
      { label: "Lifestyle", href: "/portal/lifestyle" },
      { label: "Nutrition", href: "/portal/nutrition" },
      { label: "Fitness", href: "/portal/fitness" },
      { label: "Storybook", href: "/portal/storybook" },
      { label: "Roadmap", href: "/portal/roadmap" },
      { label: "Product Efficacy", href: "/portal/efficacy" },
    ],
  },
  {
    label: "Learn",
    pillar: "learn",
    icon: "book-open",
    items: [
      { label: "Care Guide", href: "/portal/education" },
      { label: "Research", href: "/portal/learn" },
      { label: "Community", href: "/portal/community" },
      { label: "ChatCB", href: "/portal/chatcb" },
      { label: "Cannabis Wheel", href: "/portal/combo-wheel" },
      { label: "Strain Finder", href: "/portal/strains" },
      { label: "Dispensaries", href: "/portal/dispensaries" },
      { label: "Shop", href: "/portal/shop" },
    ],
  },
  {
    label: "Account",
    pillar: "account",
    icon: "user",
    items: [
      { label: "Profile", href: "/portal/profile" },
      { label: "Billing", href: "/portal/billing" },
      { label: "Intake", href: "/portal/intake" },
      { label: "Notifications", href: "/portal/notifications" },
      { label: "Caregivers", href: "/portal/caregivers" },
      { label: "Consent", href: "/portal/consent" },
      { label: "Connected Apps", href: "/portal/integrations" },
      { label: "Settings", href: "/portal/settings" },
    ],
  },
];

export default async function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!user.roles.includes("patient")) {
    redirect(homeForRoles(user.roles));
  }

  return (
    <PortalCustomizationProvider patientId={user.id}>
      <ServiceWorkerRegister />
      <AppShell
        user={user}
        activeRole="patient"
        sections={PATIENT_SECTIONS}
        roleLabel="Patient portal"
        showNavPrefs={false}
      >
        <QuoteWelcomeModal userName={user.firstName} />
        <CommandPalette role="patient" userId={user.id} />
        <ChatCBInterface />
        <ConfettiCanvas />
        <InstallPrompt />
        {children}
      </AppShell>
    </PortalCustomizationProvider>
  );
}
