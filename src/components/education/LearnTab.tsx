"use client";

import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, ArrowRight, Video, Sparkles, HelpCircle, Activity, ShieldCheck } from "lucide-react";

// Every topic deep-links into the Educational Library (/portal/learn).
// The library page reads ?tab to preselect the right section.
const LEARN_TOPICS = [
  {
    title: "What is CBD?",
    desc: "A beginner's guide to cannabidiol — the non-psychoactive cannabinoid changing medicine.",
    href: "/portal/learn?tab=cannabinoids",
    icon: Sparkles,
    color: "text-leaf",
    bg: "bg-mint",
    border: "border-mint"
  },
  {
    title: "How to dose cannabis",
    desc: "Start low, go slow. Learn the principles of safe, effective cannabis dosing.",
    href: "/portal/learn?tab=conditions",
    icon: Activity,
    color: "text-leaf",
    bg: "bg-sage",
    border: "border-sage"
  },
  {
    title: "Routes of administration",
    desc: "Oral, sublingual, inhaled, topical — which delivery method is right for you?",
    href: "/portal/learn?tab=delivery",
    icon: FileText,
    color: "text-ink",
    bg: "bg-lilac",
    border: "border-lilac"
  },
  {
    title: "Understanding terpenes",
    desc: "The aromatic compounds that shape each strain's unique therapeutic effects.",
    href: "/portal/learn?tab=terpenes",
    icon: Sparkles,
    color: "text-highlight-hover",
    bg: "bg-butter",
    border: "border-butter"
  },
  {
    title: "Cannabis & your medications",
    desc: "Important drug interactions every patient and caregiver should know.",
    href: "/portal/learn?tab=conditions",
    icon: ShieldCheck,
    color: "text-danger",
    bg: "bg-rose",
    border: "border-rose"
  },
  {
    title: "Legal considerations",
    desc: "State laws, federal status, and what it means for your workplace and travel.",
    href: "/portal/learn",
    icon: HelpCircle,
    color: "text-text-muted",
    bg: "bg-peach",
    border: "border-peach"
  },
];

export function LearnTab() {
  return (
    <div className="max-w-5xl mx-auto space-y-10 sm:space-y-12 px-4 sm:px-0">
      <div className="text-center mb-8 sm:mb-10">
        <h2 className="font-display text-3xl sm:text-4xl text-text tracking-tight mb-3">
          Learn About Cannabis
        </h2>
        <p className="text-sm sm:text-base text-text-muted max-w-xl mx-auto leading-relaxed">
          Curated educational resources for patients, caregivers, and curious minds. Explore articles, videos, and guides.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
        {LEARN_TOPICS.map((topic) => {
          const Icon = topic.icon;
          return (
            <Link key={topic.title} href={topic.href} className="group block h-full">
              <Card
                className={cn(
                  "rounded-3xl border-2 transition-all duration-300 h-full bg-white relative overflow-hidden",
                  "hover:-translate-y-2 hover:shadow-xl hover:border-accent/40"
                )}
              >
                {/* Decorative background element */}
                <div className={cn(
                  "absolute -right-8 -top-8 w-24 h-24 rounded-full opacity-20 group-hover:scale-150 transition-transform duration-500",
                  topic.color.replace('text-', 'bg-')
                )}></div>
                
                <CardContent className="p-7 sm:p-8 flex flex-col h-full relative z-10">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 mb-6 border transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3",
                    topic.bg,
                    topic.color,
                    topic.border
                  )}>
                    <Icon className="w-6 h-6" strokeWidth={2} />
                  </div>

                  <h3 className="font-display text-xl text-text tracking-tight mb-3 group-hover:text-accent transition-colors">
                    {topic.title}
                  </h3>

                  <p className="text-sm text-text-muted leading-relaxed font-medium flex-grow mb-6">
                    {topic.desc}
                  </p>

                  <div className="mt-auto h-6 relative overflow-hidden">
                    <span className="absolute inset-0 inline-flex items-center gap-2 text-sm font-bold text-accent opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                      Read article <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card className="rounded-3xl border-0 bg-ink text-white overflow-hidden shadow-2xl mt-8">
        <div className="grid md:grid-cols-2 items-center">
          <div className="p-8 sm:p-10 md:p-12 order-2 md:order-1">
            <Badge className="bg-accent text-white border-0 mb-4 font-bold tracking-widest uppercase">Video Course</Badge>
            <h3 className="font-display text-2xl sm:text-3xl mb-4">Cannabis Basics 101</h3>
            <p className="text-text-subtle mb-6 sm:mb-8 text-base sm:text-lg font-medium leading-relaxed">
              Join Dr. Smith for a 5-part video series breaking down the endocannabinoid system, how products are made, and how to shop for medicine.
            </p>
            <Button className="bg-surface text-ink hover:bg-surface-muted rounded-xl font-bold h-12 px-6 shadow-lg">
              <Video className="w-5 h-5 mr-2" /> Start Watching Free
            </Button>
          </div>
          <div className="h-56 sm:h-64 md:h-full bg-gradient-to-br from-ink via-[#0d1611] to-black relative flex items-center justify-center group cursor-pointer border-t md:border-t-0 md:border-l border-white/10 order-1 md:order-2 overflow-hidden">
            <div className="absolute inset-0 bg-white/[0.02]"></div>
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors"></div>
            <div className="relative">
              <span className="absolute inset-0 rounded-full bg-accent/40 animate-ping opacity-75 group-hover:opacity-100"></span>
              <span className="absolute -inset-3 rounded-full ring-2 ring-white/10 group-hover:ring-white/30 group-hover:scale-110 transition-all duration-500"></span>
              <div className="relative w-20 h-20 bg-accent rounded-full flex items-center justify-center text-white shadow-2xl group-hover:scale-110 group-active:scale-95 transition-transform duration-300">
                <svg className="w-8 h-8 ml-1 drop-shadow-md" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"></path></svg>
              </div>
            </div>
          </div>
        </div>
      </Card>
      
      <div className="text-center pt-8">
        <Link href="/portal/learn">
          <Button variant="secondary" size="lg" className="rounded-xl font-bold border-2 text-text hover:bg-surface-muted">
            Browse Full Library
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
