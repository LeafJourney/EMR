"use client";

import React, { useState } from "react";
import { Printer, Mail, Share2, FileText, Check, Download } from "lucide-react";

export interface DocumentActionsProps {
  documentId: string;
  documentName: string;
  patientEmail?: string;
}

/**
 * Document Actions (EMR-032)
 * Provides options to print, email, or download patient documents/labs.
 */
export function DocumentActions({
  documentId,
  documentName,
  patientEmail,
}: DocumentActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [actionStatus, setActionStatus] = useState<"idle" | "sending" | "success">("idle");

  const handlePrint = () => {
    // In a real app, this would trigger a window.print() or generate a printable PDF view
    window.print();
    setIsOpen(false);
  };

  const handleEmail = () => {
    setActionStatus("sending");
    // Mock API call
    setTimeout(() => {
      setActionStatus("success");
      setTimeout(() => {
        setActionStatus("idle");
        setIsOpen(false);
      }, 2000);
    }, 800);
  };

  const handleDownload = () => {
    // Mock download action
    console.log(`Downloading document: ${documentId}`);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block text-left">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 rounded-md border border-emerald-200 dark:border-emerald-800/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
      >
        <Share2 className="w-4 h-4" />
        Share / Export
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white dark:bg-neutral-800 ring-1 ring-black ring-opacity-5 border border-neutral-200 dark:border-neutral-700 z-10">
          <div className="py-1" role="menu" aria-orientation="vertical">
            <div className="px-4 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider border-b border-neutral-100 dark:border-neutral-700">
              <span className="truncate block max-w-full">{documentName}</span>
            </div>

            <button
              onClick={handlePrint}
              className="w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-3"
              role="menuitem"
            >
              <Printer className="w-4 h-4 text-neutral-400" />
              Print Document
            </button>

            <button
              onClick={handleDownload}
              className="w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-3"
              role="menuitem"
            >
              <Download className="w-4 h-4 text-neutral-400" />
              Download PDF
            </button>

            <button
              onClick={handleEmail}
              disabled={actionStatus !== "idle" || !patientEmail}
              className="w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
              role="menuitem"
            >
              {actionStatus === "success" ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Mail className="w-4 h-4 text-neutral-400" />
              )}
              {actionStatus === "sending"
                ? "Sending..."
                : actionStatus === "success"
                ? "Sent!"
                : patientEmail
                ? `Email to Patient`
                : "No Email on File"}
            </button>

            <button
              onClick={() => setIsOpen(false)}
              className="w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-3 border-t border-neutral-100 dark:border-neutral-700"
              role="menuitem"
            >
              <FileText className="w-4 h-4 text-neutral-400" />
              Attach to Message
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
