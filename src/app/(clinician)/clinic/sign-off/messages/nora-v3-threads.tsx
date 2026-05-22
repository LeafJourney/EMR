"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

type ConversationStep = "gathering_symptoms" | "checking_history" | "drafting_response";

interface NoraThread {
  id: string;
  patientName: string;
  subject: string;
  currentStep: ConversationStep;
  startedAt: string;
  patientId: string;
  threadId: string;
}

const STEP_CONFIG: Record<ConversationStep, { label: string; index: number }> = {
  gathering_symptoms: { label: "Gathering symptoms", index: 0 },
  checking_history: { label: "Checking medication history", index: 1 },
  drafting_response: { label: "Drafting response", index: 2 },
};

const DEMO_THREADS: NoraThread[] = [
  {
    id: "nv3-1",
    patientName: "Maria Santos",
    subject: "New onset insomnia after dosage change",
    currentStep: "gathering_symptoms",
    startedAt: "2 min ago",
    patientId: "p-001",
    threadId: "t-001",
  },
  {
    id: "nv3-2",
    patientName: "James Chen",
    subject: "Question about CBD:THC ratio adjustment",
    currentStep: "checking_history",
    startedAt: "8 min ago",
    patientId: "p-002",
    threadId: "t-002",
  },
  {
    id: "nv3-3",
    patientName: "Aisha Williams",
    subject: "Reporting new side effect — dry mouth and dizziness",
    currentStep: "drafting_response",
    startedAt: "14 min ago",
    patientId: "p-003",
    threadId: "t-003",
  },
  {
    id: "nv3-4",
    patientName: "Robert Kim",
    subject: "Refill request with updated symptom journal",
    currentStep: "gathering_symptoms",
    startedAt: "21 min ago",
    patientId: "p-004",
    threadId: "t-004",
  },
];

function StepIndicator({ currentStep }: { currentStep: ConversationStep }) {
  const currentIndex = STEP_CONFIG[currentStep].index;

  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((stepIndex) => (
        <div
          key={stepIndex}
          className={cn(
            "h-2 w-2 rounded-full transition-all duration-300",
            stepIndex < currentIndex
              ? "bg-accent"
              : stepIndex === currentIndex
                ? "bg-accent animate-pulse"
                : "bg-border-strong/40"
          )}
        />
      ))}
    </div>
  );
}

export function NoraV3Threads() {
  const [threads] = useState<NoraThread[]>(DEMO_THREADS);
  const [collapsed, setCollapsed] = useState(false);

  if (threads.length === 0) return null;

  return (
    <Card tone="raised" className="mb-8 border-l-4 border-l-accent">
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <span className="text-sm font-bold text-accent">N3</span>
            </div>
            <div>
              <CardTitle className="text-base">
                Nora V3 Conversation Threads
              </CardTitle>
              <p className="text-xs text-text-muted mt-0.5">
                {threads.length} active multi-step conversation{threads.length !== 1 ? "s" : ""} in progress
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? "Show" : "Hide"}
          </Button>
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent className="pt-3">
          <div className="space-y-3">
            {threads.map((thread) => {
              const stepConfig = STEP_CONFIG[thread.currentStep];
              return (
                <div
                  key={thread.id}
                  className="flex items-center gap-4 p-3 rounded-lg bg-surface-muted/50 border border-border/60 hover:border-accent/30 transition-colors"
                >
                  {/* Patient + Subject */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-text truncate">
                        {thread.patientName}
                      </span>
                      <span className="text-xs text-text-subtle shrink-0">
                        {thread.startedAt}
                      </span>
                    </div>
                    <p className="text-sm text-text-muted truncate">
                      {thread.subject}
                    </p>
                  </div>

                  {/* Step indicator */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <Badge
                      tone={
                        thread.currentStep === "drafting_response"
                          ? "accent"
                          : thread.currentStep === "checking_history"
                            ? "info"
                            : "warning"
                      }
                    >
                      {stepConfig.label}
                    </Badge>
                    <StepIndicator currentStep={thread.currentStep} />
                  </div>

                  {/* View thread link */}
                  <Link
                    href={`/clinic/messages?thread=${thread.threadId}`}
                    className="text-sm font-medium text-accent hover:underline shrink-0"
                  >
                    View thread
                  </Link>
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
