import { Suspense } from "react";
import { ContactForm } from "./contact-form";
import { Eyebrow } from "@/components/ui/ornament";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";

export const metadata = {
  title: "Contact — Leafjourney",
  description:
    "Get in touch with Neal Patel and Scott Wayman about Leafjourney.",
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <div className="max-w-[920px] mx-auto px-6 lg:px-12 pt-16 pb-24">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <Eyebrow className="justify-center mb-5">Contact us</Eyebrow>
            <h1 className="font-display text-4xl md:text-5xl tracking-tight text-text leading-[1.05] mb-5">
              Tell us what you&apos;re working on.
            </h1>
            <p className="text-text-muted text-[17px] leading-relaxed">
              Whether you&apos;re applying for a role, exploring a partnership,
              or asking a developer question — your message lands directly with{" "}
              <span className="text-text font-medium">Neal</span> and{" "}
              <span className="text-text font-medium">Scott</span>.
            </p>
          </div>

          {/* sr-only heading keeps the heading order valid (h1 → h2 → the
              footer's h3) on this otherwise heading-sparse page. */}
          <h2 className="sr-only">Send us a message</h2>
          <Suspense fallback={null}>
            <ContactForm />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
