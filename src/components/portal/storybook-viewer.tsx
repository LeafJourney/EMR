"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

interface Chapter {
  id: string;
  title: string;
  content: React.ReactNode;
}

interface StorybookViewerProps {
  chapters: Chapter[];
}

export function StorybookViewer({ chapters }: StorybookViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);

  const paginate = (newDirection: number) => {
    setDirection(newDirection);
    setCurrentIndex((prev) => {
      const next = prev + newDirection;
      if (next < 0) return 0;
      if (next >= chapters.length) return chapters.length - 1;
      return next;
    });
  };

  const currentChapter = chapters[currentIndex];

  const variants = {
    enter: (direction: number) => ({
      rotateY: direction > 0 ? 90 : -90,
      opacity: 0,
      z: -100,
      transformOrigin: direction > 0 ? "right" : "left",
    }),
    center: {
      rotateY: 0,
      opacity: 1,
      z: 0,
      transformOrigin: direction > 0 ? "right" : "left",
    },
    exit: (direction: number) => ({
      rotateY: direction < 0 ? 90 : -90,
      opacity: 0,
      z: -100,
      transformOrigin: direction < 0 ? "right" : "left",
    }),
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto h-[70vh] min-h-[500px] perspective-1000">
      <div className="absolute inset-0 bg-amber-50/30 rounded-3xl border border-amber-100 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-amber-200/50 bg-amber-100/30 backdrop-blur-sm z-10">
          <div className="flex items-center gap-2 text-amber-800">
            <BookOpen size={18} />
            <span className="font-display font-medium text-sm">My Storybook</span>
          </div>
          <div className="text-xs font-medium text-amber-700/60 uppercase tracking-widest">
            Chapter {currentIndex + 1} of {chapters.length}
          </div>
        </div>

        {/* 3D Page Container */}
        <div className="relative flex-1 overflow-hidden">
          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.div
              key={currentIndex}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                rotateY: { type: "spring", stiffness: 100, damping: 20 },
                opacity: { duration: 0.3 },
                z: { duration: 0.4 },
              }}
              className="absolute inset-0 p-8 md:p-12 overflow-y-auto"
              style={{ transformStyle: "preserve-3d" }}
            >
              <div className="max-w-2xl mx-auto">
                <h1 className="font-display text-3xl md:text-5xl font-bold text-amber-950 mb-8 leading-tight">
                  {currentChapter.title}
                </h1>
                <div className="prose prose-amber prose-lg max-w-none text-amber-900/80 leading-relaxed">
                  {currentChapter.content}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation Controls */}
        <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-4 z-10 pointer-events-none">
          <div className="flex gap-2 pointer-events-auto">
            <Button
              variant="secondary"
              size="lg"
              className="rounded-full w-12 h-12 p-0 bg-white/80 backdrop-blur-md shadow-lg border border-amber-100 text-amber-900 hover:bg-white hover:text-amber-950"
              onClick={() => paginate(-1)}
              disabled={currentIndex === 0}
            >
              <ChevronLeft size={20} />
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className="rounded-full w-12 h-12 p-0 bg-white/80 backdrop-blur-md shadow-lg border border-amber-100 text-amber-900 hover:bg-white hover:text-amber-950"
              onClick={() => paginate(1)}
              disabled={currentIndex === chapters.length - 1}
            >
              <ChevronRight size={20} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
