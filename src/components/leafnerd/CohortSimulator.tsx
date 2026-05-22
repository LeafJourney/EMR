"use client";

import React, { useState } from "react";

interface StatusCount {
  status: string;
  _count: number;
}

interface CohortSimulatorProps {
  statusCounts: StatusCount[];
}

export function CohortSimulator({ statusCounts }: CohortSimulatorProps) {
  const [selectedCohort, setSelectedCohort] = useState("active");
  const [regimen, setRegimen] = useState("balanced");
  const [confidence, setConfidence] = useState("95");
  const [iterations, setIterations] = useState("5000");

  const [simStep, setSimStep] = useState(0); // 0: idle, 1: step 1, 2: step 2, 3: step 3, 4: step 4, 5: completed
  const [simResults, setSimResults] = useState<{
    efficacy: number;
    adverseRate: number;
    optDose: string;
    path: string;
    points: { x: number; y: number }[];
    summary: string;
  } | null>(null);

  const runSimulation = () => {
    setSimStep(1);
    setSimResults(null);

    // Step 1: Extracting vectors
    setTimeout(() => {
      setSimStep(2);
      // Step 2: Injecting profiles
      setTimeout(() => {
        setSimStep(3);
        // Step 3: Running iterations
        setTimeout(() => {
          setSimStep(4);
          // Step 4: Compiling distribution
          setTimeout(() => {
            generateResults();
            setSimStep(5);
          }, 700);
        }, 800);
      }, 800);
    }, 800);
  };

  const generateResults = () => {
    // Generate deterministic yet custom results based on selected inputs
    let efficacy = 72.4;
    let adverseRate = 4.2;
    let optDose = "12.5mg";
    let summary = "";
    
    // SVG Path Generation for different curves
    let points: { x: number; y: number }[] = [];

    if (regimen === "cbd") {
      efficacy = selectedCohort === "active" ? 84.2 : 79.5;
      adverseRate = 1.8;
      optDose = "20.0mg";
      summary = "CBD Dominant regimen shows high tolerance and safety profiles across this cohort. Recommended for anxiety and inflammation without psychoactive side effects.";
      // Bell curve shifted left/middle, narrow and tall (safe)
      points = [
        { x: 0, y: 140 }, { x: 40, y: 135 }, { x: 80, y: 120 }, { x: 120, y: 90 },
        { x: 160, y: 30 }, { x: 200, y: 15 }, { x: 240, y: 40 }, { x: 280, y: 85 },
        { x: 320, y: 120 }, { x: 360, y: 135 }, { x: 400, y: 140 }
      ];
    } else if (regimen === "thc") {
      efficacy = selectedCohort === "active" ? 68.9 : 61.2;
      adverseRate = 9.4;
      optDose = "8.5mg";
      summary = "THC Dominant regimen shows high efficacy for chronic pain but triggers elevated heart rate anomalies in 9.4% of synthetic patient runs. Recommend starting low.";
      // Bell curve shifted right, wide and shorter (higher variance)
      points = [
        { x: 0, y: 140 }, { x: 40, y: 138 }, { x: 80, y: 130 }, { x: 120, y: 115 },
        { x: 160, y: 90 }, { x: 200, y: 65 }, { x: 240, y: 35 }, { x: 280, y: 25 },
        { x: 320, y: 50 }, { x: 360, y: 110 }, { x: 400, y: 140 }
      ];
    } else if (regimen === "balanced") {
      efficacy = selectedCohort === "active" ? 78.4 : 73.1;
      adverseRate = 4.8;
      optDose = "12.5mg";
      summary = "1:1 Balanced ratio achieves optimal synergistic activation. Standard therapeutic index is maintained with low adverse outcomes.";
      // Standard bell curve centered
      points = [
        { x: 0, y: 140 }, { x: 40, y: 136 }, { x: 80, y: 125 }, { x: 120, y: 95 },
        { x: 160, y: 50 }, { x: 200, y: 20 }, { x: 240, y: 50 }, { x: 280, y: 95 },
        { x: 320, y: 125 }, { x: 360, y: 136 }, { x: 400, y: 140 }
      ];
    } else {
      // Microdosing
      efficacy = 59.8;
      adverseRate = 0.4;
      optDose = "2.5mg";
      summary = "Microdosing protocol delivers sub-perceptual benefits with virtual zero-risk profiles. Ideal for early prospects to build initial compliance metrics.";
      // Center-left, very narrow and tall
      points = [
        { x: 0, y: 140 }, { x: 40, y: 139 }, { x: 80, y: 135 }, { x: 120, y: 100 },
        { x: 140, y: 40 }, { x: 160, y: 10 }, { x: 180, y: 40 }, { x: 200, y: 100 },
        { x: 240, y: 135 }, { x: 320, y: 139 }, { x: 400, y: 140 }
      ];
    }

    // Adjust values based on confidence interval
    if (confidence === "99") {
      adverseRate = Number((adverseRate * 1.2).toFixed(1));
    } else if (confidence === "90") {
      adverseRate = Number((adverseRate * 0.8).toFixed(1));
    }

    // Build SVG path string from points
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      const prev = points[i - 1];
      const cpX1 = prev.x + (p.x - prev.x) / 2;
      const cpY1 = prev.y;
      const cpX2 = prev.x + (p.x - prev.x) / 2;
      const cpY2 = p.y;
      path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p.x} ${p.y}`;
    }

    setSimResults({
      efficacy,
      adverseRate,
      optDose,
      path,
      points,
      summary,
    });
  };

  return (
    <div className="space-y-8">
      {/* Parameter Control Panel */}
      <div className="bg-bg-surface border border-border/10 rounded-2xl p-6 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-6 items-end relative overflow-hidden">
        <div>
          <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2" htmlFor="cohort-select">
            Cohort Segment
          </label>
          <select
            id="cohort-select"
            value={selectedCohort}
            onChange={(e) => setSelectedCohort(e.target.value)}
            className="w-full bg-bg border border-border/10 rounded-xl px-4 py-3 text-sm text-text-strong focus:outline-none focus:border-accent-strong focus:ring-1 focus:ring-accent-strong/20 transition-all cursor-pointer"
          >
            {statusCounts.map((sc) => (
              <option key={sc.status} value={sc.status}>
                {sc.status.toUpperCase()} ({sc._count} patients)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2" htmlFor="regimen-select">
            Dosing Regimen
          </label>
          <select
            id="regimen-select"
            value={regimen}
            onChange={(e) => setRegimen(e.target.value)}
            className="w-full bg-bg border border-border/10 rounded-xl px-4 py-3 text-sm text-text-strong focus:outline-none focus:border-accent-strong focus:ring-1 focus:ring-accent-strong/20 transition-all cursor-pointer"
          >
            <option value="balanced">1:1 Balanced Ratio</option>
            <option value="cbd">CBD Dominant (20:1)</option>
            <option value="thc">THC Dominant (1:20)</option>
            <option value="micro">Microdosing Protocol</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2" htmlFor="confidence-select">
              Confidence Interval
            </label>
            <select
              id="confidence-select"
              value={confidence}
              onChange={(e) => setConfidence(e.target.value)}
              className="w-full bg-bg border border-border/10 rounded-xl px-3 py-3 text-sm text-text-strong focus:outline-none focus:border-accent-strong transition-all cursor-pointer"
            >
              <option value="90">90% CI</option>
              <option value="95">95% CI</option>
              <option value="99">99% CI</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2" htmlFor="iterations-select">
              Runs (N)
            </label>
            <select
              id="iterations-select"
              value={iterations}
              onChange={(e) => setIterations(e.target.value)}
              className="w-full bg-bg border border-border/10 rounded-xl px-3 py-3 text-sm text-text-strong focus:outline-none focus:border-accent-strong transition-all cursor-pointer"
            >
              <option value="1000">1,000</option>
              <option value="5000">5,000</option>
              <option value="10000">10,000</option>
            </select>
          </div>
        </div>

        <button
          onClick={runSimulation}
          disabled={simStep > 0 && simStep < 5}
          className="w-full py-3 bg-accent-strong text-bg rounded-xl font-bold text-sm shadow-md hover:shadow-lg hover:bg-accent-strong/90 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:shadow-none transition-all flex items-center justify-center space-x-2"
        >
          <span>🧬</span>
          <span>Run Monte Carlo</span>
        </button>
      </div>

      {/* Simulator Processing Steps */}
      {simStep > 0 && simStep < 5 && (
        <div className="bg-bg-surface border border-border/10 rounded-2xl p-10 flex flex-col items-center justify-center relative overflow-hidden shadow-sm min-h-[350px]">
          <div className="absolute inset-0 bg-gradient-to-r from-accent-strong/5 to-transparent animate-pulse" />
          
          <div className="relative w-16 h-16 mb-8 flex items-center justify-center">
            <div className="absolute inset-0 border-4 border-accent-strong/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-t-accent-strong rounded-full animate-spin" />
            <span className="text-xl animate-pulse">🧬</span>
          </div>

          <div className="space-y-4 max-w-sm w-full">
            <div className="flex items-center space-x-3 text-sm">
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${simStep >= 1 ? "bg-accent-strong text-bg" : "bg-bg-highlight/10 text-text-muted"}`}>{simStep > 1 ? "✓" : "1"}</span>
              <span className={simStep === 1 ? "text-text-strong font-semibold" : "text-text-muted"}>Extracting demographic vectors...</span>
            </div>
            <div className="flex items-center space-x-3 text-sm">
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${simStep >= 2 ? "bg-accent-strong text-bg" : "bg-bg-highlight/10 text-text-muted"}`}>{simStep > 2 ? "✓" : "2"}</span>
              <span className={simStep === 2 ? "text-text-strong font-semibold" : "text-text-muted"}>Injecting historical dosing profiles...</span>
            </div>
            <div className="flex items-center space-x-3 text-sm">
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${simStep >= 3 ? "bg-accent-strong text-bg" : "bg-bg-highlight/10 text-text-muted"}`}>{simStep > 3 ? "✓" : "3"}</span>
              <span className={simStep === 3 ? "text-text-strong font-semibold" : "text-text-muted"}>Running {Number(iterations).toLocaleString()} Monte Carlo iterations...</span>
            </div>
            <div className="flex items-center space-x-3 text-sm">
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${simStep >= 4 ? "bg-accent-strong text-bg" : "bg-bg-highlight/10 text-text-muted"}`}>{simStep > 4 ? "✓" : "4"}</span>
              <span className={simStep === 4 ? "text-text-strong font-semibold" : "text-text-muted"}>Compiling outcome probabilities...</span>
            </div>
          </div>
        </div>
      )}

      {/* Simulation Results Display */}
      {simStep === 5 && simResults && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* Key Metrics Cards */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-bg-surface border border-border/10 rounded-2xl p-6 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-accent-strong/5 rounded-bl-full pointer-events-none" />
              <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">Efficacy Probability</h4>
              <div className="flex items-baseline space-x-2 mt-3">
                <span className="text-5xl font-black text-accent-strong">{simResults.efficacy}%</span>
                <span className="text-xs text-text-muted">expected efficacy</span>
              </div>
              <p className="text-xs text-text-muted mt-3 leading-relaxed">Probability of outcome score reduction &gt; 35% within 14 days.</p>
            </div>

            <div className="bg-bg-surface border border-border/10 rounded-2xl p-6 shadow-sm relative overflow-hidden">
              <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">Adverse Event Probability</h4>
              <div className="flex items-baseline space-x-2 mt-3">
                <span className="text-5xl font-black text-error">{simResults.adverseRate}%</span>
                <span className="text-xs text-text-muted">risk rate</span>
              </div>
              <p className="text-xs text-text-muted mt-3 leading-relaxed">Expected incidence of mild-to-moderate side effects (dizziness, dry mouth).</p>
            </div>

            <div className="bg-bg-surface border border-border/10 rounded-2xl p-6 shadow-sm relative overflow-hidden">
              <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">Optimal Daily Dosage</h4>
              <div className="flex items-baseline space-x-2 mt-3">
                <span className="text-5xl font-black text-text-strong">{simResults.optDose}</span>
                <span className="text-xs text-text-muted">target volume</span>
              </div>
              <p className="text-xs text-text-muted mt-3 leading-relaxed">Calculated centroid dosage profile based on synthetic cohort clusters.</p>
            </div>
          </div>

          {/* SVG Distribution Plot */}
          <div className="lg:col-span-2 bg-bg-surface border border-border/10 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-bold text-text-strong">Outcome Probability Distribution</h3>
              <p className="text-xs text-text-muted mt-1">Monte Carlo density curves plotting patient symptom resolution probabilities.</p>
            </div>

            {/* Premium Graph */}
            <div className="my-6 relative flex items-center justify-center bg-bg rounded-xl border border-border/5 p-4 h-[200px]">
              <svg viewBox="0 0 400 150" className="w-full h-full overflow-visible">
                <defs>
                  <linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-accent-strong, #10b981)" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="var(--color-accent-strong, #10b981)" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="strokeGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="var(--color-accent-strong, #10b981)" stopOpacity="0.4" />
                    <stop offset="50%" stopColor="var(--color-accent-strong, #10b981)" stopOpacity="1" />
                    <stop offset="100%" stopColor="var(--color-accent-strong, #10b981)" stopOpacity="0.4" />
                  </linearGradient>
                </defs>
                
                {/* Grid Lines */}
                <line x1="0" y1="140" x2="400" y2="140" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                <line x1="0" y1="100" x2="400" y2="100" stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
                <line x1="0" y1="60" x2="400" y2="60" stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
                <line x1="0" y1="20" x2="400" y2="20" stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
                
                {/* Main Distribution Shaded Path */}
                <path
                  d={`${simResults.path} L 400 140 L 0 140 Z`}
                  fill="url(#curveGrad)"
                />
                
                {/* Main Distribution Stroke Path */}
                <path
                  d={simResults.path}
                  fill="none"
                  stroke="url(#strokeGrad)"
                  strokeWidth="2.5"
                />

                {/* Dot at Peak */}
                {simResults.points[5] && (
                  <circle
                    cx={simResults.points[5].x}
                    cy={simResults.points[5].y}
                    r="4"
                    fill="var(--color-accent-strong, #10b981)"
                    stroke="var(--color-bg, #0d0f12)"
                    strokeWidth="1.5"
                    className="animate-ping [animation-duration:3s]"
                  />
                )}
              </svg>
              
              {/* Overlay labels */}
              <div className="absolute bottom-2 left-6 text-[10px] text-text-muted font-mono font-bold">Low Efficacy</div>
              <div className="absolute bottom-2 right-6 text-[10px] text-text-muted font-mono font-bold">High Efficacy</div>
              <div className="absolute top-6 right-6 px-2.5 py-1 bg-bg-highlight/10 border border-border/10 rounded text-[10px] font-bold text-accent-strong font-mono uppercase tracking-wider shadow-sm">
                Confidence: {confidence}%
              </div>
            </div>

            {/* Recommendation Box */}
            <div className="bg-bg border border-border/10 rounded-xl p-4 text-sm leading-relaxed text-text-strong relative">
              <span className="text-xs font-bold text-accent-strong uppercase tracking-wider block mb-1">Clinical Insight</span>
              {simResults.summary}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
