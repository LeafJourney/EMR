"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const CUDIT_QUESTIONS = [
  {
    q: "How often do you use cannabis?",
    options: [
      { v: 0, l: "Never" },
      { v: 1, l: "Monthly or less" },
      { v: 2, l: "2-4 times a month" },
      { v: 3, l: "2-3 times a week" },
      { v: 4, l: "4 or more times a week" }
    ]
  },
  {
    q: "How many hours were you 'stoned' on a typical day when you had been using cannabis?",
    options: [
      { v: 0, l: "Less than 1" },
      { v: 1, l: "1 or 2" },
      { v: 2, l: "3 or 4" },
      { v: 3, l: "5 or 6" },
      { v: 4, l: "7 or more" }
    ]
  },
  {
    q: "How often during the past 6 months did you find that you were not able to stop using cannabis once you had started?",
    options: [
      { v: 0, l: "Never" },
      { v: 1, l: "Less than monthly" },
      { v: 2, l: "Monthly" },
      { v: 3, l: "Weekly" },
      { v: 4, l: "Daily or almost daily" }
    ]
  }
];

export function CuditScreener() {
  const [answers, setAnswers] = useState<Record<number, number>>({});

  const handleSelect = (qIndex: number, value: number) => {
    setAnswers(prev => ({ ...prev, [qIndex]: value }));
  };

  const totalScore = Object.values(answers).reduce((a, b) => a + b, 0);
  const isComplete = Object.keys(answers).length === CUDIT_QUESTIONS.length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("CUDIT-R Score:", totalScore);
  };

  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle>Cannabis Use Disorder Identification Test (CUDIT-R)</CardTitle>
        <CardDescription>Understanding your current relationship with cannabis to optimize your care plan.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          {CUDIT_QUESTIONS.map((question, index) => (
            <div key={index} className="space-y-3">
              <label className="text-sm font-semibold text-text">
                {index + 1}. {question.q}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                {question.options.map(opt => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => handleSelect(index, opt.v)}
                    className={`p-3 text-xs font-medium rounded-xl transition-all border text-center ${
                      answers[index] === opt.v 
                        ? "bg-[var(--accent)] text-white border-[var(--accent)] shadow-md" 
                        : "bg-[var(--surface-muted)]/50 text-text-muted border-border hover:border-[var(--accent)]/50"
                    }`}
                  >
                    {opt.l}
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
            Save CUDIT-R
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
