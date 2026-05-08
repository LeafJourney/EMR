import React from "react";
import { BookOpen, ExternalLink, Download, PlayCircle } from "lucide-react";

/**
 * Kander Resources Component (EMR-036)
 * Displays educational resources provided by Justin Kander.
 */
export function KanderResources() {
  const resources = [
    {
      id: "book-1",
      title: "The Comprehensive Guide to Cannabis Therapeutics",
      type: "E-Book",
      author: "Justin Kander",
      description: "A deep dive into clinical applications and dosing protocols.",
      link: "#",
      icon: <BookOpen className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
    },
    {
      id: "video-1",
      title: "Understanding Endocannabinoid Tone",
      type: "Video Lecture",
      author: "Justin Kander",
      description: "A 45-minute clinical overview for practitioners and patients.",
      link: "#",
      icon: <PlayCircle className="w-5 h-5 text-rose-500 dark:text-rose-400" />
    },
    {
      id: "pdf-1",
      title: "Quick-Start Dosing Guide",
      type: "PDF Reference",
      author: "Justin Kander",
      description: "A printable 2-page reference for initial titration.",
      link: "#",
      icon: <Download className="w-5 h-5 text-blue-500 dark:text-blue-400" />
    }
  ];

  return (
    <div className="bg-white dark:bg-neutral-900 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl overflow-hidden shadow-sm">
      <div className="bg-emerald-50 dark:bg-emerald-900/20 px-6 py-5 border-b border-emerald-100 dark:border-emerald-900/30">
        <h2 className="text-xl font-bold text-emerald-900 dark:text-emerald-100">
          Justin Kander's Educational Resources
        </h2>
        <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-1">
          Curated clinical guides and patient literature.
        </p>
      </div>
      
      <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {resources.map((resource) => (
          <div key={resource.id} className="p-6 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex gap-4">
              <div className="mt-1 bg-white dark:bg-neutral-800 p-2 rounded-lg border border-neutral-100 dark:border-neutral-700 shadow-sm shrink-0">
                {resource.icon}
              </div>
              <div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                  {resource.title}
                </h3>
                <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 mt-1 mb-2">
                  <span className="bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded-md font-medium">
                    {resource.type}
                  </span>
                  <span>By {resource.author}</span>
                </div>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  {resource.description}
                </p>
              </div>
            </div>
            
            <a
              href={resource.link}
              className="shrink-0 flex items-center justify-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-800/60 border border-emerald-200 dark:border-emerald-800/50 px-4 py-2 rounded-lg transition-colors"
            >
              Access Resource
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
