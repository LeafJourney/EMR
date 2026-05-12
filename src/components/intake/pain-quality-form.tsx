"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const PAIN_ADJECTIVES = [
  "Aching", "Burning", "Shooting", "Stabbing", "Throbbing", 
  "Cramping", "Dull", "Sharp", "Tender", "Numbness", 
  "Radiating", "Tingling", "Heavy", "Exhausting", "Sickening"
];

export function PainQualityForm() {
  const [intensity, setIntensity] = useState<number>(5);
  const [selectedAdjectives, setSelectedAdjectives] = useState<string[]>([]);
  const [duration, setDuration] = useState<string>("");

  const toggleAdjective = (adj: string) => {
    setSelectedAdjectives(prev => 
      prev.includes(adj) ? prev.filter(a => a !== adj) : [...prev, adj]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log({ intensity, selectedAdjectives, duration });
    // TODO: Connect to intake flow
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Pain Quality Assessment</CardTitle>
        <CardDescription>Help us understand what your pain feels like to tailor the right cannabis profile.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-8">
          
          {/* Intensity Slider */}
          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <label className="text-sm font-semibold text-text">Current Pain Intensity</label>
              <span className="text-2xl font-bold text-[var(--accent)]">{intensity}/10</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="10" 
              value={intensity} 
              onChange={(e) => setIntensity(Number(e.target.value))}
              className="w-full h-2 bg-[var(--surface-muted)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
            />
            <div className="flex justify-between text-xs text-text-muted">
              <span>0 - No Pain</span>
              <span>10 - Worst Possible</span>
            </div>
          </div>

          {/* Adjectives Grid */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-text">How would you describe the pain? (Select all that apply)</label>
            <div className="flex flex-wrap gap-2">
              {PAIN_ADJECTIVES.map(adj => {
                const isSelected = selectedAdjectives.includes(adj);
                return (
                  <button
                    key={adj}
                    type="button"
                    onClick={() => toggleAdjective(adj)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      isSelected 
                        ? "bg-[var(--accent)] text-white" 
                        : "bg-[var(--surface-muted)] text-text-muted hover:bg-[var(--accent)]/10 hover:text-text"
                    }`}
                  >
                    {adj}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duration */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-text">How long does the pain usually last?</label>
            <select 
              value={duration} 
              onChange={(e) => setDuration(e.target.value)}
              className="w-full p-3 bg-white border border-[var(--border)] rounded-xl outline-none focus:border-[var(--accent)]"
            >
              <option value="" disabled>Select duration...</option>
              <option value="brief">Brief flashes (seconds to minutes)</option>
              <option value="hours">Several hours</option>
              <option value="constant">Constant, unyielding</option>
              <option value="variable">Highly variable</option>
            </select>
          </div>

        </CardContent>
        <CardFooter className="pt-6 border-t border-[var(--border)] flex justify-end">
          <Button type="submit" variant="primary" disabled={!duration || selectedAdjectives.length === 0}>
            Save Assessment
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
