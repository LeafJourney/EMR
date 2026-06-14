import type { Agent } from "@/lib/orchestration/types";
import { intakeAgent } from "./intake-agent";
import { documentOrganizerAgent } from "./document-organizer-agent";
import { outcomeTrackerAgent } from "./outcome-tracker-agent";
import { scribeAgent } from "./scribe-agent";
import { researchAgent } from "./research-agent";
import { messagingAssistantAgent } from "./messaging-assistant-agent";
import { codingReadinessAgent } from "./coding-readiness-agent";
import { practiceLaunchAgent } from "./practice-launch-agent";
import { registryAgent } from "./registry-agent";
import { schedulingAgent } from "./scheduling-agent";
import { physicianNudgeAgent } from "./physician-nudge-agent";
import { patientOutreachAgent } from "./patient-outreach-agent";
import { preVisitIntelligenceAgent } from "./pre-visit-intelligence-agent";
import { fairytaleSummaryAgent } from "./fairytale-summary-agent";
import { correspondenceNurseAgent } from "./correspondence-nurse-agent";
import { patientSimplifierAgent, patientEducationAgent } from "./patient-education-agent";
import { dosingRecommendationAgent } from "./dosing-recommendation-agent";
import { trendAlertAgent } from "./trend-alert-agent";
import { titrationAgent } from "./titration-agent";
import { prescriptionSafetyAgent } from "./prescription-safety-agent";
import { diagnosisSafetyAgent } from "./diagnosis-safety-agent";
import { adherenceDriftDetectorAgent } from "./adherence-drift-detector-agent";
import { messageUrgencyObserverAgent } from "./message-urgency-observer-agent";
// EMR-1145 — urgent 911/ED safety auto-reply on inbound messages
import { safetyAutoResponderAgent } from "./safety-auto-responder-agent";
import { visitDiscoveryWhispererAgent } from "./visit-discovery-whisperer-agent";
// EMR-1149 — plain-language after-visit summary generation on chart-sign
import { avsGeneratorAgent } from "./avs-generator-agent";
// Billing agents — Phase 3 of the Revenue Cycle PRD
import { chargeIntegrityAgent } from "./billing/charge-integrity-agent";
import { denialTriageAgent } from "./billing/denial-triage-agent";
import { patientExplanationAgent } from "./billing/patient-explanation-agent";
import { patientCollectionsAgent } from "./billing/patient-collections-agent";
import { reconciliationAgent } from "./billing/reconciliation-agent";
import { agingAgent } from "./billing/aging-agent";
import { underpaymentDetectionAgent } from "./billing/underpayment-detection-agent";
// Phase 4
import { refundCreditAgent } from "./billing/refund-credit-agent";
import { revenueCommandAgent } from "./billing/revenue-command-agent";
// RCM Fleet — Phase 5 (pre-submission pipeline)
import { encounterIntelligenceAgent } from "./billing/encounter-intelligence-agent";
import { codingOptimizationAgent } from "./billing/coding-optimization-agent";
import { claimConstructionAgent } from "./billing/claim-construction-agent";
// RCM Fleet — Phase 7 (post-adjudication loop)
import { adjudicationInterpretationAgent } from "./billing/adjudication-interpretation-agent";
import { appealsGenerationAgent } from "./billing/appeals-generation-agent";
import { denialResolutionAgent } from "./billing/denial-resolution-agent";
import { eligibilityBenefitsAgent } from "./billing/eligibility-benefits-agent";
import { complianceAuditAgent } from "./billing/compliance-audit-agent";
import { priorAuthAgent } from "./billing/prior-auth-agent";
import { clearinghouseSubmissionAgent } from "./billing/clearinghouse-submission-agent";
import { staleClaimMonitorAgent } from "./billing/stale-claim-monitor-agent";
// Operations & patient experience agents
import { wellnessCoachAgent } from "./wellness-coach-agent";
import { refillReminderAgent } from "./refill-reminder-agent";
import { appointmentReminderAgent } from "./appointment-reminder-agent";
// EMR-1115 (PJ-3) — appointment lifecycle comms (confirmations + cancellations)
import { appointmentLifecycleAgent } from "./appointment-lifecycle-agent";
import { labFollowupAgent } from "./lab-followup-agent";
import { retentionRiskAgent } from "./retention-risk-agent";
import { contentCreationAgent } from "./content-creation-agent";
import { satisfactionAnalysisAgent } from "./satisfaction-analysis-agent";
import { inventoryAlertAgent } from "./inventory-alert-agent";
// EMR-787 — Practice Manager Agent v1
import { supplyReorderAgent } from "./supply-reorder-agent";
import { practiceManagerAgent } from "./practice-manager-agent";
import { billingReconEnhancementAgent } from "./billing-recon-enhancement-agent";
import { qualityImprovementAgent } from "./quality-improvement-agent";
// Mission Control — Phase 1 (MALLIK-006 + MALLIK-007)
import { labSummarizerAgent } from "./lab-summarizer-agent";
import { refillCopilotAgent } from "./refill-copilot-agent";
// Commerce Fleet — EMR-17 (20 agents, stub-shipped 2026-04-23)
import { productRecommenderAgent } from "./commerce/product-recommender-agent";
import { bundleSuggesterAgent } from "./commerce/bundle-suggester-agent";
import { crossSellRankerAgent } from "./commerce/cross-sell-ranker-agent";
import { searchPersonalizerAgent } from "./commerce/search-personalizer-agent";
import { reviewModeratorAgent } from "./commerce/review-moderator-agent";
import { productQCAgent } from "./commerce/product-qc-agent";
import { seoMetadataAgent } from "./commerce/seo-metadata-agent";
import { categoryCuratorAgent } from "./commerce/category-curator-agent";
import { pricingAnomalyAgent } from "./commerce/pricing-anomaly-agent";
import { restockPredictorAgent } from "./commerce/restock-predictor-agent";
import { waitlistNotifierAgent } from "./commerce/waitlist-notifier-agent";
import { abandonedCartRescuerAgent } from "./commerce/abandoned-cart-rescuer-agent";
import { orderFraudDetectorAgent } from "./commerce/order-fraud-detector-agent";
import { returnRiskScorerAgent } from "./commerce/return-risk-scorer-agent";
import { pricingOptimizerAgent } from "./commerce/pricing-optimizer-agent";
import { promoGeneratorAgent } from "./commerce/promo-generator-agent";
import { cannabisComplianceGateAgent } from "./commerce/cannabis-compliance-gate-agent";
import { cannabisTaxCalculatorAgent } from "./commerce/cannabis-tax-calculator-agent";
import { shippingRouterAgent } from "./commerce/shipping-router-agent";
import { vendorPerformanceScorerAgent } from "./commerce/vendor-performance-scorer-agent";
// Research & Insights Fleet — EMR-269 (10 agents, 2026-04-23)
import { cohortBuilderAgent } from "./research/cohort-builder-agent";
import { efficacyComparatorAgent } from "./research/efficacy-comparator-agent";
import { outcomeDigesterAgent } from "./research/outcome-digester-agent";
import { rweBundlerAgent } from "./research/rwe-bundler-agent";
import { deidentifierAgent } from "./research/deidentifier-agent";
import { adverseEventScannerAgent } from "./research/adverse-event-scanner-agent";
import { protocolRecommenderAgent } from "./research/protocol-recommender-agent";
import { insuranceEvidenceBundlerAgent } from "./research/insurance-evidence-bundler-agent";
import { publicationReadinessScorerAgent } from "./research/publication-readiness-scorer-agent";
import { researchPartnerMatcherAgent } from "./research/research-partner-matcher-agent";
// Cannabis Pharmacology Fleet — EMR-272 (12 agents, 2026-04-23)
import { terpeneProfileMatcherAgent } from "./pharmacology/terpene-profile-matcher-agent";
import { cannabinoidInteractionCheckerAgent } from "./pharmacology/cannabinoid-interaction-checker-agent";
import { routeOfAdministrationAdvisorAgent } from "./pharmacology/route-of-administration-advisor-agent";
import { pkPdCalculatorAgent } from "./pharmacology/pk-pd-calculator-agent";
import { titrationSchedulerAgent } from "./pharmacology/titration-scheduler-agent";
import { entourageAnalystAgent } from "./pharmacology/entourage-analyst-agent";
import { drugCannabisInteractionCheckerAgent } from "./pharmacology/drug-cannabis-interaction-checker-agent";
import { toleranceTrackerAgent } from "./pharmacology/tolerance-tracker-agent";
import { washoutPlannerAgent } from "./pharmacology/washout-planner-agent";
import { contraindicationSweeperAgent } from "./pharmacology/contraindication-sweeper-agent";
import { bioequivalenceMapperAgent } from "./pharmacology/bioequivalence-mapper-agent";
import { pregnancyLactationAdvisorAgent } from "./pharmacology/pregnancy-lactation-advisor-agent";
// CFO / Controller — autonomous financial reporting
import { cfoAgent } from "./cfo-agent";
// Platform Licensing & MIPS — Track 8 Phase 8
import { mipsExtrapolatorAgent } from "./platform/mips-extrapolator-agent";
import { insuranceBillingOrchestratorAgent } from "./platform/billing-orchestrator-agent";

/**
 * Registry of all agents. Adding an agent = new file + one line here +
 * a workflow definition in src/lib/orchestration/workflows.ts.
 */
export const agentRegistry = {
  // Clinical agents
  intake: intakeAgent,
  documentOrganizer: documentOrganizerAgent,
  outcomeTracker: outcomeTrackerAgent,
  scribe: scribeAgent,
  researchSynthesizer: researchAgent,
  messagingAssistant: messagingAssistantAgent,
  codingReadiness: codingReadinessAgent,
  practiceLaunch: practiceLaunchAgent,
  registry: registryAgent,
  scheduling: schedulingAgent,
  physicianNudge: physicianNudgeAgent,
  patientOutreach: patientOutreachAgent,
  preVisitIntelligence: preVisitIntelligenceAgent,
  fairytaleSummary: fairytaleSummaryAgent,
  correspondenceNurse: correspondenceNurseAgent,
  patientSimplifier: patientSimplifierAgent,
  patientEducation: patientEducationAgent,
  dosingRecommendation: dosingRecommendationAgent,
  trendAlert: trendAlertAgent,
  titration: titrationAgent,
  prescriptionSafety: prescriptionSafetyAgent,
  diagnosisSafety: diagnosisSafetyAgent,
  adherenceDriftDetector: adherenceDriftDetectorAgent,
  messageUrgencyObserver: messageUrgencyObserverAgent,
  safetyAutoResponder: safetyAutoResponderAgent,
  visitDiscoveryWhisperer: visitDiscoveryWhispererAgent,
  avsGenerator: avsGeneratorAgent,
  // Billing agents (Phase 3)
  chargeIntegrity: chargeIntegrityAgent,
  denialTriage: denialTriageAgent,
  patientExplanation: patientExplanationAgent,
  patientCollections: patientCollectionsAgent,
  reconciliation: reconciliationAgent,
  aging: agingAgent,
  underpaymentDetection: underpaymentDetectionAgent,
  // Billing agents (Phase 4)
  refundCredit: refundCreditAgent,
  revenueCommand: revenueCommandAgent,
  // RCM Fleet — Phase 5 (pre-submission pipeline)
  encounterIntelligence: encounterIntelligenceAgent,
  codingOptimization: codingOptimizationAgent,
  claimConstruction: claimConstructionAgent,
  // RCM Fleet — Phase 7 (post-adjudication loop)
  adjudicationInterpretation: adjudicationInterpretationAgent,
  appealsGeneration: appealsGenerationAgent,
  denialResolution: denialResolutionAgent,
  eligibilityBenefits: eligibilityBenefitsAgent,
  complianceAudit: complianceAuditAgent,
  priorAuthVerification: priorAuthAgent,
  clearinghouseSubmission: clearinghouseSubmissionAgent,
  staleClaimMonitor: staleClaimMonitorAgent,
  // Operations & patient experience agents
  wellnessCoach: wellnessCoachAgent,
  refillReminder: refillReminderAgent,
  appointmentReminder: appointmentReminderAgent,
  appointmentLifecycle: appointmentLifecycleAgent,
  labFollowup: labFollowupAgent,
  retentionRisk: retentionRiskAgent,
  contentCreation: contentCreationAgent,
  satisfactionAnalysis: satisfactionAnalysisAgent,
  inventoryAlert: inventoryAlertAgent,
  // EMR-787 — Practice Manager Agent v1
  supplyReorder: supplyReorderAgent,
  practiceManager: practiceManagerAgent,
  billingReconEnhancement: billingReconEnhancementAgent,
  qualityImprovement: qualityImprovementAgent,
  // Mission Control — Phase 1 (MALLIK-006 + MALLIK-007)
  labSummarizer: labSummarizerAgent,
  refillCopilot: refillCopilotAgent,
  // Commerce Fleet — EMR-17 (20 agents stub-shipped 2026-04-23)
  productRecommender: productRecommenderAgent,
  bundleSuggester: bundleSuggesterAgent,
  crossSellRanker: crossSellRankerAgent,
  searchPersonalizer: searchPersonalizerAgent,
  reviewModerator: reviewModeratorAgent,
  productQC: productQCAgent,
  seoMetadata: seoMetadataAgent,
  categoryCurator: categoryCuratorAgent,
  pricingAnomaly: pricingAnomalyAgent,
  restockPredictor: restockPredictorAgent,
  waitlistNotifier: waitlistNotifierAgent,
  abandonedCartRescuer: abandonedCartRescuerAgent,
  orderFraudDetector: orderFraudDetectorAgent,
  returnRiskScorer: returnRiskScorerAgent,
  pricingOptimizer: pricingOptimizerAgent,
  promoGenerator: promoGeneratorAgent,
  cannabisComplianceGate: cannabisComplianceGateAgent,
  cannabisTaxCalculator: cannabisTaxCalculatorAgent,
  shippingRouter: shippingRouterAgent,
  vendorPerformanceScorer: vendorPerformanceScorerAgent,
  // Research & Insights Fleet — EMR-269 (10 agents, 2026-04-23)
  cohortBuilder: cohortBuilderAgent,
  efficacyComparator: efficacyComparatorAgent,
  outcomeDigester: outcomeDigesterAgent,
  rweBundler: rweBundlerAgent,
  deidentifier: deidentifierAgent,
  adverseEventScanner: adverseEventScannerAgent,
  protocolRecommender: protocolRecommenderAgent,
  insuranceEvidenceBundler: insuranceEvidenceBundlerAgent,
  publicationReadinessScorer: publicationReadinessScorerAgent,
  researchPartnerMatcher: researchPartnerMatcherAgent,
  // Cannabis Pharmacology Fleet — EMR-272 (12 agents, 2026-04-23)
  terpeneProfileMatcher: terpeneProfileMatcherAgent,
  cannabinoidInteractionChecker: cannabinoidInteractionCheckerAgent,
  routeOfAdministrationAdvisor: routeOfAdministrationAdvisorAgent,
  pkPdCalculator: pkPdCalculatorAgent,
  titrationScheduler: titrationSchedulerAgent,
  entourageAnalyst: entourageAnalystAgent,
  drugCannabisInteractionChecker: drugCannabisInteractionCheckerAgent,
  toleranceTracker: toleranceTrackerAgent,
  washoutPlanner: washoutPlannerAgent,
  contraindicationSweeper: contraindicationSweeperAgent,
  bioequivalenceMapper: bioequivalenceMapperAgent,
  pregnancyLactationAdvisor: pregnancyLactationAdvisorAgent,
  // CFO / Controller — autonomous financial reporting
  cfo: cfoAgent,
  // Platform Licensing & MIPS — Track 8 Phase 8
  mipsExtrapolator: mipsExtrapolatorAgent,
  insuranceBillingOrchestrator: insuranceBillingOrchestratorAgent,
} satisfies Record<string, Agent<any, any>>;

/** Agents tagged as "commerce" — used by the marketplace ops console. */
export const COMMERCE_AGENT_NAMES: AgentName[] = [
  "productRecommender",
  "bundleSuggester",
  "crossSellRanker",
  "searchPersonalizer",
  "reviewModerator",
  "productQC",
  "seoMetadata",
  "categoryCurator",
  "pricingAnomaly",
  "restockPredictor",
  "waitlistNotifier",
  "abandonedCartRescuer",
  "orderFraudDetector",
  "returnRiskScorer",
  "pricingOptimizer",
  "promoGenerator",
  "cannabisComplianceGate",
  "cannabisTaxCalculator",
  "shippingRouter",
  "vendorPerformanceScorer",
];

/** Agents tagged as "research" — used by the research portal + insights console. */
export const RESEARCH_AGENT_NAMES: AgentName[] = [
  "cohortBuilder",
  "efficacyComparator",
  "outcomeDigester",
  "rweBundler",
  "deidentifier",
  "adverseEventScanner",
  "protocolRecommender",
  "insuranceEvidenceBundler",
  "publicationReadinessScorer",
  "researchPartnerMatcher",
];

/** Agents tagged as "pharmacology" — used by the prescribe / titrate surfaces. */
export const PHARMACOLOGY_AGENT_NAMES: AgentName[] = [
  "terpeneProfileMatcher",
  "cannabinoidInteractionChecker",
  "routeOfAdministrationAdvisor",
  "pkPdCalculator",
  "titrationScheduler",
  "entourageAnalyst",
  "drugCannabisInteractionChecker",
  "toleranceTracker",
  "washoutPlanner",
  "contraindicationSweeper",
  "bioequivalenceMapper",
  "pregnancyLactationAdvisor",
];

export type AgentName = keyof typeof agentRegistry;

export const agentList = Object.values(agentRegistry);

/** Agents tagged as "billing" — used by the billing oversight console. */
export const BILLING_AGENT_NAMES: AgentName[] = [
  "encounterIntelligence",
  "codingOptimization",
  "claimConstruction",
  "adjudicationInterpretation",
  "appealsGeneration",
  "denialResolution",
  "eligibilityBenefits",
  "complianceAudit",
  "priorAuthVerification",
  "clearinghouseSubmission",
  "chargeIntegrity",
  "denialTriage",
  "patientExplanation",
  "patientCollections",
  "reconciliation",
  "aging",
  "underpaymentDetection",
  "refundCredit",
  "revenueCommand",
];
