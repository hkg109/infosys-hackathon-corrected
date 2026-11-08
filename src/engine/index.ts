export { simulatePlan, recommendedCourses, groupOf, validatePlanInput, ENGINE_VERSION } from "./simulate";
export { diffPlans } from "./diff";
export { formatTerm, termIndex, nextTerm, termRange, termFromIndex, isBlocked } from "./terms";
export { planInputFromV1, planResultFromV1, migrateSavedPlanV1, candidateIdOf, DEFAULT_PRIORITIES } from "./migrate";
export {
  generateCandidates,
  rankCandidates,
  expandableMilitary,
  militaryTimingTerms,
  withMilitaryStart,
  metricOrder,
  RANKING_VERSION,
  DEFAULT_RECOMMENDATION_CONFIG,
  METRIC_LABEL,
  CAREER_LABEL,
} from "./candidates";
export { validatePlanInputV2, toEngineInput, resolvePeriodRange, addMonths } from "./inputV2";
export { versionFromCandidate, applyFeedback, reviseVersion, diffVersions } from "./versions";
export type { VersionIds, VersionAttempt } from "./versions";
export type { DiffablePlan } from "./diff";
export { LATE_LIGHT_CONFIG, PACE_STYLE_LABEL, paceBandsFor, userCapFor, schoolCapFor, termCapFor } from "./pace";
export {
  resolveMilitaryScenarios,
  matchCertificates,
  findCertificate,
  scenarioMonths,
  KATUSA_TRACK_ID,
  DEFAULT_FALLBACK_TRACK_ID,
  KATUSA_STATUS_LABEL,
} from "./military";
export type { CertificateMatch } from "./military";
export {
  GEN_ED_NOTE,
  letterLabel,
  emptyGenEd,
  addGenEd,
  removeGenEd,
  genEdCreditsIn,
  termBreakdown,
  staleGenEd,
} from "./genEd";
export type { GenEdState, AddGenEdResult, TermCreditBreakdown } from "./genEd";
export { planStats } from "./stats";
export type { PlanStats } from "./stats";
export { buildMilitaryStrategies, selectBranchPeriod, nextCycle, concurrencyFor, GOAL_LABEL, BRANCH_LABEL, PROGRAM } from "./militaryStrategy";
