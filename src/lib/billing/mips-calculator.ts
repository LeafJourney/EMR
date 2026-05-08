/**
 * MIPS (Merit-based Incentive Payment System) Calculator (EMR-042)
 * 
 * Computes estimated MIPS adjustments based on clinician performance data,
 * integrating cannabis-specific quality measures where applicable.
 */

export interface MipsData {
  qualityScore: number;       // 0-100
  promotingInteroperability: number; // 0-100
  improvementActivities: number;     // 0-40
  costScore: number;          // 0-100 (often N/A for pure cash-pay, but included for completeness)
}

export interface MipsResult {
  finalScore: number;
  paymentAdjustmentPercent: number;
  isPenalty: boolean;
  isExceptional: boolean;
}

export class MipsCalculator {
  // 2024 Category Weights
  private readonly weights = {
    quality: 0.30,
    pi: 0.25,
    ia: 0.15,
    cost: 0.30,
  };

  // Performance thresholds
  private readonly penaltyThreshold = 75;
  private readonly exceptionalThreshold = 89;

  /**
   * Calculates the final MIPS score and estimated payment adjustment.
   */
  calculateAdjustment(data: MipsData): MipsResult {
    // 1. Calculate weighted scores
    const qualityWeighted = data.qualityScore * this.weights.quality;
    const piWeighted = data.promotingInteroperability * this.weights.pi;
    const iaWeighted = (data.improvementActivities / 40) * 100 * this.weights.ia;
    const costWeighted = data.costScore * this.weights.cost;

    // 2. Sum for final score
    const finalScore = Math.round((qualityWeighted + piWeighted + iaWeighted + costWeighted) * 100) / 100;

    // 3. Determine adjustment (Simulated linear scale for demo purposes)
    let adjustment = 0;
    let isPenalty = false;
    let isExceptional = false;

    if (finalScore < this.penaltyThreshold) {
      // Penalty: up to -9%
      adjustment = -9.0 * ((this.penaltyThreshold - finalScore) / this.penaltyThreshold);
      isPenalty = true;
    } else {
      // Positive adjustment: up to +9% (multiplied by scaling factor, simulated here)
      adjustment = 9.0 * ((finalScore - this.penaltyThreshold) / (100 - this.penaltyThreshold));
      if (finalScore >= this.exceptionalThreshold) {
        isExceptional = true;
        // Exceptional performance bonus
        adjustment += 1.5; 
      }
    }

    return {
      finalScore,
      paymentAdjustmentPercent: Number(adjustment.toFixed(2)),
      isPenalty,
      isExceptional
    };
  }
}

export const mipsCalculator = new MipsCalculator();
