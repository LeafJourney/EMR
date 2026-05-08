/**
 * Medicare CBD Billing Rules Engine (EMR-047)
 * 
 * Centralizes the logic for determining which services involving cannabinoids
 * are eligible for Medicare/Medicaid reimbursement (e.g., FDA-approved Epidiolex)
 * versus state-legal medical cannabis (cash-pay).
 */

export interface ClaimLineItem {
  hcpcsCode: string;
  ndcCode?: string;
  modifier?: string;
  diagnosisCodes: string[];
}

export interface RuleEvaluationResult {
  isCovered: boolean;
  requiredModifiers: string[];
  denialReason?: string;
  patientResponsibility: boolean;
}

export class MedicareCbdRulesEngine {
  // Epidiolex (Cannabidiol) specific NDC/HCPCS (simulated)
  private readonly fdaApprovedNdcs = ["70165-0105-20"]; 
  private readonly fdaApprovedHcpcs = ["J0222"];
  
  // Qualifying diagnoses for FDA-approved CBD (e.g., Lennox-Gastaut, Dravet)
  private readonly qualifyingIcd10 = ["G40.811", "G40.812", "G40.833", "G40.834"];

  evaluateLineItem(item: ClaimLineItem): RuleEvaluationResult {
    // Check if this is an FDA-approved CBD product
    const isFdaProduct = 
      (item.hcpcsCode && this.fdaApprovedHcpcs.includes(item.hcpcsCode)) ||
      (item.ndcCode && this.fdaApprovedNdcs.includes(item.ndcCode));

    if (isFdaProduct) {
      // Check for qualifying diagnosis
      const hasQualifyingDx = item.diagnosisCodes.some(dx => this.qualifyingIcd10.includes(dx));
      
      if (hasQualifyingDx) {
        return {
          isCovered: true,
          requiredModifiers: ["KX"], // Indicates specific medical necessity criteria met
          patientResponsibility: false
        };
      } else {
        return {
          isCovered: false,
          requiredModifiers: ["GA"], // Waiver of liability on file
          denialReason: "Diagnosis does not meet LCD/NCD criteria for Epidiolex.",
          patientResponsibility: true
        };
      }
    }

    // Default for all other cannabinoid therapies (state-legal, non-FDA)
    // S0339 (simulated code for medical cannabis consultation/certification)
    if (item.hcpcsCode === "S0339" || item.modifier === "GY") {
      return {
        isCovered: false,
        requiredModifiers: ["GY"], // Item or service statutorily excluded
        denialReason: "Medical cannabis is a Schedule I substance at the federal level and statutorily excluded from Medicare/Medicaid coverage.",
        patientResponsibility: true
      };
    }

    // Standard E&M codes might be covered if the primary purpose is general evaluation
    return {
      isCovered: true,
      requiredModifiers: [],
      patientResponsibility: false
    };
  }
}

export const medicareCbdRules = new MedicareCbdRulesEngine();
