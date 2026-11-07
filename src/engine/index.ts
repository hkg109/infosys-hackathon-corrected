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
