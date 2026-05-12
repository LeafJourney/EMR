"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface Chemovar {
  id: string;
  name: string;
  phenotype: "Sativa" | "Indica" | "Hybrid" | "CBD-Dominant";
  prescriptions: number;
  efficacyScore: number; // 0-10
  topSymptom: string;
}

interface ChemovarLeaderboardProps {
  data: Chemovar[];
  title?: string;
  description?: string;
}

export function ChemovarLeaderboard({
  data,
  title = "Top Performing Chemovars",
  description = "Most prescribed and highest efficacy profiles across your patient base.",
}: ChemovarLeaderboardProps) {

  // Sort by efficacy score descending
  const sortedData = [...data].sort((a, b) => b.efficacyScore - a.efficacyScore);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sortedData.map((chemovar, index) => (
            <div 
              key={chemovar.id} 
              className="flex items-center justify-between p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/30 hover:bg-[var(--accent)]/5 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${index < 3 ? 'bg-[var(--accent)] text-white' : 'bg-[var(--border)] text-text-muted'}`}>
                  {index + 1}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-text">{chemovar.name}</span>
                    <Badge tone={
                      chemovar.phenotype === "Sativa" ? "warning" :
                      chemovar.phenotype === "Indica" ? "info" :
                      chemovar.phenotype === "Hybrid" ? "success" : "neutral"
                    }>
                      {chemovar.phenotype}
                    </Badge>
                  </div>
                  <div className="text-xs text-text-muted mt-1">
                    Best for: <span className="font-medium text-text">{chemovar.topSymptom}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-6 text-right">
                <div className="hidden sm:block">
                  <div className="text-xs text-text-muted uppercase tracking-wider">Volume</div>
                  <div className="font-medium text-text">{chemovar.prescriptions.toLocaleString()} Rx</div>
                </div>
                <div>
                  <div className="text-xs text-text-muted uppercase tracking-wider">Efficacy</div>
                  <div className="font-semibold text-[var(--accent)] text-lg">{chemovar.efficacyScore.toFixed(1)}/10</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
