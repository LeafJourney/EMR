"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const PCL5_QUESTIONS = [
  "Repeated, disturbing, and unwanted memories of the stressful experience?",
  "Repeated, disturbing dreams of the stressful experience?",
  "Suddenly feeling or acting as if the stressful experience were actually happening again?",
  "Feeling very upset when something reminded you of the stressful experience?",
  "Having strong physical reactions when something reminded you of the stressful experience?",
];

const OPTIONS = [
  { value: 0, label: "Not at all" },
  { value: 1, label: "A little bit" },
  { value: 2, label: "Moderately" },
  { value: 3, label: "Quite a bit" },
  { value: 4, label: "Extremely" },
];

export function Pcl5Screener() {
  const [answers, setAnswers] = useState<Record<number, number>>({});

  const handleSelect = (qIndex: number, value: number) => {
    setAnswers(prev => ({ ...prev, [qIndex]: value }));
  };

  const totalScore = Object.values(answers).reduce((a, b) => a + b, 0);
  const isComplete = Object.keys(answers).length === PCL5_QUESTIONS.length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("PCL-5 Score:", totalScore);
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>PTSD Screener (PCL-5)</CardTitle>
        <CardDescription>Below is a list of problems that people sometimes have in response to a very stressful experience.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          <div className="hidden lg:grid grid-cols-12 gap-4 pb-2 border-b border-border text-xs font-semibold text-text-muted uppercase tracking-wider text-center">
            <div className="col-span-5 text-left">Question</div>
            <div className="col-span-7 grid grid-cols-5 gap-2">
              <div>Not at all</div>
              <div>A little</div>
              <div>Moderately</div>
              <div>Quite a bit</div>
              <div>Extremely</div>
            </div>
          </div>
          
          {PCL5_QUESTIONS.map((question, index) => (
            <div key={index} className="flex flex-col lg:grid lg:grid-cols-12 gap-4 items-center p-4 lg:p-0 rounded-xl bg-[var(--surface-muted)]/50 lg:bg-transparent border lg:border-transparent border-border">
              <div className="col-span-5 text-sm font-medium text-text w-full text-left">
                {index + 1}. {question}
              </div>
              
              <div className="col-span-7 grid grid-cols-2 lg:grid-cols-5 gap-2 w-full">
                {OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(index, opt.value)}
                    className={`p-2 text-xs font-medium rounded-lg transition-colors border ${
                      answers[index] === opt.value 
                        ? "bg-[var(--accent)] text-white border-[var(--accent)]" 
                        : "bg-white text-text-muted border-border hover:border-[var(--accent)]/50"
                    }`}
                  >
                    <span className="lg:hidden">{opt.label}</span>
                    <span className="hidden lg:inline">{opt.value}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {isComplete && (
            <div className="mt-6 p-4 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-center">
              <p className="text-sm font-medium text-text-muted uppercase tracking-wider mb-1">Total Score</p>
              <p className="text-3xl font-bold text-[var(--accent)]">{totalScore}</p>
            </div>
          )}
        </CardContent>
        <CardFooter className="pt-6 border-t border-[var(--border)] flex justify-end">
          <Button type="submit" variant="primary" disabled={!isComplete}>
            Save PCL-5
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
