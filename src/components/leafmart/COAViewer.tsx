"use client";

import React, { useState } from "react";
import { FileText, Download, CheckCircle, Shield, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type COAViewerProps = {
  pdfUrl: string;
  productName: string;
  batchNumber: string;
  labName?: string;
  testDate?: string;
  passedTests?: boolean;
};

export function COAViewer({
  pdfUrl,
  productName,
  batchNumber,
  labName = "Independent Third-Party Lab",
  testDate,
  passedTests = true,
}: COAViewerProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card tone="raised" className="w-full max-w-3xl mx-auto overflow-hidden">
      <CardHeader className="border-b border-[var(--border)] bg-[var(--surface-muted)]/50 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Shield className="w-4 h-4 text-accent" />
              <CardTitle className="text-lg">Certificate of Analysis (COA)</CardTitle>
            </div>
            <CardDescription className="text-sm">
              Lab testing results for <span className="font-medium text-text">{productName}</span>
            </CardDescription>
          </div>
          
          <Badge tone={passedTests ? "success" : "danger"} className="self-start sm:self-center shrink-0">
            {passedTests ? (
              <span className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" /> All Tests Passed</span>
            ) : (
              <span className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Issues Detected</span>
            )}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-5 sm:p-6 bg-[var(--surface)] text-sm">
          <div>
            <p className="text-text-muted text-xs uppercase tracking-wider mb-1 font-semibold">Batch Number</p>
            <p className="font-medium text-text font-mono bg-[var(--surface-muted)] inline-block px-2 py-0.5 rounded">{batchNumber}</p>
          </div>
          <div>
            <p className="text-text-muted text-xs uppercase tracking-wider mb-1 font-semibold">Testing Lab</p>
            <p className="font-medium text-text">{labName}</p>
          </div>
          <div>
            <p className="text-text-muted text-xs uppercase tracking-wider mb-1 font-semibold">Test Date</p>
            <p className="font-medium text-text">{testDate || "Recent"}</p>
          </div>
          <div>
            <p className="text-text-muted text-xs uppercase tracking-wider mb-1 font-semibold">Verification</p>
            <p className="font-medium text-success flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" /> Verified Authentic
            </p>
          </div>
        </div>

        <div className="border-t border-[var(--border)] p-5 sm:p-6 flex flex-col items-center justify-center bg-[var(--bg)] min-h-[200px]">
          {isExpanded ? (
            <div className="w-full aspect-[1/1.4] sm:aspect-[1/1.2] max-h-[800px] border border-[var(--border)] rounded overflow-hidden shadow-inner">
              <iframe 
                src={`${pdfUrl}#toolbar=0&navpanes=0`} 
                className="w-full h-full border-0"
                title={`COA for ${productName}`}
              />
            </div>
          ) : (
            <div className="text-center max-w-md">
              <div className="w-16 h-16 bg-accent/10 text-accent rounded-full flex items-center justify-center mx-auto mb-4 border border-accent/20">
                <FileText className="w-8 h-8" strokeWidth={1.5} />
              </div>
              <h3 className="text-lg font-medium text-text mb-2">View Full Lab Report</h3>
              <p className="text-sm text-text-muted mb-6 leading-relaxed">
                This document contains the complete chemical profile, including cannabinoid potency, terpene analysis, and safety tests for pesticides, heavy metals, and residual solvents.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button onClick={() => setIsExpanded(true)} className="min-w-[140px]">
                  <FileText className="w-4 h-4 mr-2" /> View PDF
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.open(pdfUrl, "_blank", "noopener,noreferrer");
                    }
                  }}
                >
                  <Download className="w-4 h-4 mr-2" /> Download
                </Button>
              </div>
            </div>
          )}
        </div>
        
        {isExpanded && (
          <div className="border-t border-[var(--border)] p-4 bg-[var(--surface-muted)]/30 flex justify-end">
             <Button
                variant="secondary"
                className="mr-3"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.open(pdfUrl, "_blank", "noopener,noreferrer");
                  }
                }}
              >
                <Download className="w-4 h-4 mr-2" /> Download Original
              </Button>
             <Button variant="secondary" onClick={() => setIsExpanded(false)}>
               Collapse Document
             </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
