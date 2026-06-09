"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LeafSprig } from "@/components/ui/ornament";

export function RelaxPopup() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center justify-center h-6 px-2.5 rounded-full bg-accent-soft text-[9px] font-bold uppercase tracking-wider text-accent hover:bg-accent hover:text-white transition-colors cursor-pointer select-none">
          Relax
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px] text-center">
        <DialogHeader>
          <DialogTitle className="text-center font-display text-2xl text-accent">
            Take a Breath
          </DialogTitle>
        </DialogHeader>
        <div className="py-8 flex flex-col items-center">
          <div className="relative w-32 h-32 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-4 border-accent/20 animate-ping duration-[4000ms]" />
            <div className="absolute inset-4 rounded-full border-4 border-accent/40 animate-ping duration-[4000ms] delay-700" />
            <div className="relative z-10 w-16 h-16 rounded-full bg-accent text-white flex items-center justify-center shadow-lg">
              <LeafSprig size={24} />
            </div>
          </div>
          <p className="mt-8 text-text-muted text-sm leading-relaxed max-w-[280px]">
            You&apos;ve been working hard. Take a guided breathing break before
            your next patient.
          </p>
        </div>
        <div className="flex flex-col gap-2 pb-2">
          <Link href="/clinic/mindful/breathe" onClick={() => setOpen(false)}>
            <Button size="md" className="w-full">
              🌬️ Start breathing session
            </Button>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm text-text-subtle hover:text-text transition-colors py-2"
          >
            Maybe later
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
