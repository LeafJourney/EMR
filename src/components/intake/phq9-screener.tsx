"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const PHQ9_QUESTIONS = [
  "Little interest or pleasure in doing things",
  "Feeling down, depressed, or hopeless",
  "Trouble falling or staying asleep, or sleeping too much",
  "Feeling tired or having little energy",
  "Poor appetite or overeating",
  "Feeling bad about yourself — or that you are a failure or have let yourself or your family down",
  "Trouble concentrating on things, such as reading the newspaper or watching television",
  "Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual",
  "Thoughts that you would be better off dead or of hurting yourself in some way",
];

const OPTIONS = [
  { value: 0, label: "Not at all" },
  { value: 1, label: "Several days" },
  { value: 2, label: "More than half the days" },
  { value: 3, label: "Nearly every day" },
];

export function Phq9Screener() {
  const [answers, setAnswers] = useState<Record<number, number>>({});

  const handleSelect = (qIndex: number, value: number) => {
    setAnswers(prev => ({ ...prev, [qIndex]: value }));
  };

  const totalScore = Object.values(answers).reduce((a, b) => a + b, 0);
  const isComplete = Object.keys(answers).length === PHQ9_QUESTIONS.length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle>Depression Screener (PHQ-9)</CardTitle>
        <CardDescription>Over the last 2 weeks, how often have you been bothered by any of the following problems?</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          <div className="hidden md:grid grid-cols-12 gap-4 pb-2 border-b border-border text-xs font-semibold text-text-muted uppercase tracking-wider text-center">
            <div className="col-span-4 text-left">Question</div>
            <div className="col-span-2">Not at all</div>
            <div className="col-span-2">Several days</div>
            <div className="col-span-2">Over half</div>
            <div className="col-span-2">Nearly everyday</div>
          </div>
          
          {PHQ9_QUESTIONS.map((question, index) => (
            <div key={index} className="flex flex-col md:grid md:grid-cols-12 gap-4 items-center p-4 md:p-0 rounded-xl bg-[var(--surface-muted)]/50 md:bg-transparent border md:border-transparent border-border">
              <div className="col-span-4 text-sm font-medium text-text w-full text-left">
                {index + 1}. {question}
              </div>
              
              <div className="col-span-8 grid grid-cols-2 md:grid-cols-4 gap-2 w-full">
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
                    <span className="md:hidden">{opt.label}</span>
                    <span className="hidden md:inline">{opt.value}</span>
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
            Save PHQ-9
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
