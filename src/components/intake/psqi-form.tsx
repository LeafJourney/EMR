"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function PsqiForm() {
  const [formData, setFormData] = useState({
    bedTime: "",
    sleepLatency: "",
    wakeTime: "",
    hoursSlept: "",
    quality: "3", // 1-4 scale
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("PSQI Submission:", formData);
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Sleep Quality Index (PSQI)</CardTitle>
        <CardDescription>Over the past month, evaluate your sleep habits to help identify nighttime relief needs.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-text">Usual Bed Time</label>
              <input 
                type="time" 
                name="bedTime"
                value={formData.bedTime}
                onChange={handleChange}
                required
                className="w-full p-3 bg-white border border-[var(--border)] rounded-xl outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-text">Usual Wake Time</label>
              <input 
                type="time" 
                name="wakeTime"
                value={formData.wakeTime}
                onChange={handleChange}
                required
                className="w-full p-3 bg-white border border-[var(--border)] rounded-xl outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-text">Minutes to fall asleep</label>
            <input 
              type="number" 
              name="sleepLatency"
              placeholder="e.g. 45"
              value={formData.sleepLatency}
              onChange={handleChange}
              required
              min="0"
              className="w-full p-3 bg-white border border-[var(--border)] rounded-xl outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-text">Hours of actual sleep per night</label>
            <input 
              type="number" 
              name="hoursSlept"
              placeholder="e.g. 6.5"
              step="0.5"
              value={formData.hoursSlept}
              onChange={handleChange}
              required
              min="0"
              max="24"
              className="w-full p-3 bg-white border border-[var(--border)] rounded-xl outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-text">Overall Sleep Quality</label>
            <select 
              name="quality"
              value={formData.quality}
              onChange={handleChange}
              className="w-full p-3 bg-white border border-[var(--border)] rounded-xl outline-none focus:border-[var(--accent)]"
            >
              <option value="4">Very Good</option>
              <option value="3">Fairly Good</option>
              <option value="2">Fairly Bad</option>
              <option value="1">Very Bad</option>
            </select>
          </div>

        </CardContent>
        <CardFooter className="pt-6 border-t border-[var(--border)] flex justify-end">
          <Button type="submit" variant="primary">
            Save Sleep Profile
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
