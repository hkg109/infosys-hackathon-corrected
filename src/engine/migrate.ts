import type {
  BreakPeriod,
  CandidateKey,
  PeriodInput,
  PlanInput,
  PlanInputV2,
  PlannedTermV2,
  PlanResult,
  PlanResultV2,
  PlanVersion,
  SavedPlan,
} from "@/contracts/types";
import { termIndex, termRange, overlaps } from "./terms";

/** v1 → v2 변환 기준(BE-1). 변환 결과도 사용자에게 "가져온 값"으로 보여 준다. */

export const DEFAULT_PRIORITIES: PlanInputV2["priorities"] = ["fast_completion", "career_core", "light_terms"];

/** 후보 ID 형식: "{career}|m{병역 시작 학기 인덱스 또는 -}|p{페이스}" — 같은 키면 같은 ID */
export function candidateIdOf(key: CandidateKey): string {
  const m = key.militaryStartTerm ? String(termIndex(key.militaryStartTerm)) : "-";
  return `${key.career}|m${m}|p${key.paceCredits}`;
}

function periodFromBreak(b: BreakPeriod, i: number): PeriodInput {
  return {
    id: `${b.kind === "military" ? "mil" : "leave"}-v1-${i + 1}`,
    kind: b.kind,
    timing: "fixed",
    startDate: b.startDate,
    endDate: b.endDate,
    durationMonths: null,
    returnTerm: null,
    status: "user_assumption",
  };
}

/**
 * v1 입력은 미입력/0을 구분하지 않았으므로 숫자는 사용자가 입력한 값으로 그대로 가져온다.
 * v1에 없던 항목(입학연도·적용 교육과정·개인 필수과목·병역 상태)은 추측하지 않고 미확인으로 둔다.
 * - 병역 기간이 있으면 "planned", 없으면 "undecided"(해당 없음으로 단정하지 않는다)
 * - 학기당 상한은 고정 페이스로 옮긴다.
 */
export function planInputFromV1(
  v1: PlanInput,
  ctx: { campus: string; department: string },
): PlanInputV2 {
  const periods = v1.breaks.map(periodFromBreak);
  return {
    schemaVersion: 2,
    displayName: null,
    campus: ctx.campus,
    department: ctx.department,
    curriculum: { admissionYear: null, appliedCurriculum: null, status: "unknown" },
    startTerm: { ...v1.startTerm },
    progress: {
      completedTerms: v1.completedTerms,
      earnedCredits: v1.earnedCredits,
      earnedMajorCredits: v1.earnedMajorCredits,
      completedCourseCodes: [...v1.completedCourseCodes],
      inProgressCourseCodes: [],
      unrecognizedLines: [],
    },
    target: v1.targetCredits === null ? null : { value: v1.targetCredits, source: "user_goal", checkedAt: null },
    requiredCourses: null,
    careers: [v1.track],
    pace: { mode: "fixed", credits: v1.creditCap },
    military: periods.some((p) => p.kind === "military") ? "planned" : "undecided",
    leave: periods.some((p) => p.kind === "leave") ? "included" : "none",
    exchange: "none",
    periods,
    priorities: [...DEFAULT_PRIORITIES],
  };
}

/** v1 결과에 v2 학기 정보를 붙인다. 재계산하지 않는다(스냅샷 보존). */
export function planResultFromV1(result: PlanResult, input: PlanInputV2, completedTerms: number): PlanResultV2 {
  let ordinal = completedTerms;
  const cap = input.pace.mode === "fixed" ? input.pace.credits : null;
  const terms: PlannedTermV2[] = result.terms.map((t) => {
    const range = termRange(t.term);
    const periodIds = input.periods
      .filter((p) => p.startDate && p.endDate && overlaps(range, { start: p.startDate, end: p.endDate }))
      .map((p) => p.id);
    if (t.status === "study") ordinal++;
    return {
      ...t,
      periodIds,
      capCredits: t.status === "study" ? cap : null,
      capRuleId: null,
      termOrdinal: t.status === "study" ? ordinal : null,
    };
  });
  return {
    ...result,
    terms,
    issues: result.error ? [{ severity: "error", field: "", message: result.error }] : [],
    assumptions: [
      {
        id: "term_calendar",
        kind: "term_calendar",
        message: "1학기 3~6월, 2학기 9~12월을 계획용 학기 구간으로 가정했습니다.",
        status: "user_assumption",
      },
    ],
    partial: result.error !== null || result.unplaced.length > 0 || result.warnings.some((w) => w.code === "SEARCH_LIMIT"),
  };
}

export type MigrationResult = { ok: true; version: PlanVersion } | { ok: false; reason: string };

function looksLikeV1Input(x: unknown): x is PlanInput {
  if (!x || typeof x !== "object") return false;
  const i = x as Record<string, unknown>;
  const term = i.startTerm as Record<string, unknown> | undefined;
  return (
    !!term &&
    typeof term.year === "number" &&
    (term.season === 1 || term.season === 2) &&
    Array.isArray(i.completedCourseCodes) &&
    typeof i.earnedCredits === "number" &&
    typeof i.earnedMajorCredits === "number" &&
    typeof i.completedTerms === "number" &&
    (i.targetCredits === null || typeof i.targetCredits === "number") &&
    (i.track === "security" || i.track === "data") &&
    typeof i.creditCap === "number" &&
    Array.isArray(i.breaks)
  );
}

/**
 * 저장된 v1 플랜 A를 v2 버전 하나로 옮긴다. 형식이 맞지 않으면 실패 이유를 돌려주고
 * 화면은 "이전 계획을 가져오지 못했습니다"를 안내한다.
 */
export function migrateSavedPlanV1(
  saved: unknown,
  ids: { planId: string; versionId: string; campus: string; department: string },
): MigrationResult {
  const s = saved as Partial<SavedPlan> | null;
  if (!s || s.schemaVersion !== 1) return { ok: false, reason: "저장 형식 버전이 1이 아닙니다." };
  if (!looksLikeV1Input(s.input)) return { ok: false, reason: "저장된 입력 형식이 올바르지 않습니다." };
  if (!s.result || !Array.isArray(s.result.terms)) return { ok: false, reason: "저장된 계산 결과가 없습니다." };

  const input = planInputFromV1(s.input, ids);
  const result = planResultFromV1(s.result, input, s.input.completedTerms);
  return {
    ok: true,
    version: {
      planId: ids.planId,
      versionId: ids.versionId,
      parentVersionId: null,
      createdAt: s.savedAt ?? new Date(0).toISOString(),
      origin: { kind: "migrated_v1" },
      input,
      result,
      catalogVersion: s.catalogVersion ?? s.result.catalogVersion,
      engineVersion: s.engineVersion ?? s.result.engineVersion,
      rankingVersion: null,
      configVersion: null,
      assumptions: result.assumptions,
    },
  };
}
