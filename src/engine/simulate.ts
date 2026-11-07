import type {
  CareerTrack,
  Course,
  CourseGroup,
  Dataset,
  PlacedCourse,
  PlanInput,
  PlannedTerm,
  PlanResult,
  PlanWarning,
} from "@/contracts/types";
import { formatTerm, isBlocked, isValidDate, nextTerm } from "./terms";

export const ENGINE_VERSION = "0.1.0";
export const MAX_FUTURE_TERMS = 24;

export function groupOf(code: string, dataset: Dataset): CourseGroup | null {
  return dataset.careerTags.find((t) => t.courseCode === code)?.group ?? null;
}

const semesterOrder = (s: Course["semester"]) => (s === 1 ? 1 : s === 2 ? 2 : 3);

/** 공통 기반 + 선택한 진로의 추천 과목. 결정적인 순서로 정렬한다. */
export function recommendedCourses(dataset: Dataset, track: CareerTrack): Course[] {
  return dataset.courses
    .filter((c) => {
      const g = groupOf(c.code, dataset);
      return g === "common" || g === track;
    })
    .sort(
      (a, b) =>
        (a.recommendedYear ?? 99) - (b.recommendedYear ?? 99) ||
        semesterOrder(a.semester) - semesterOrder(b.semester) ||
        a.code.localeCompare(b.code),
    );
}

export function validatePlanInput(input: PlanInput): string | null {
  if (!Number.isInteger(input.creditCap) || input.creditCap < 1 || input.creditCap > 30)
    return "학기당 학점 상한은 1~30 사이로 입력해 주세요.";
  if (input.earnedCredits < 0) return "이수학점은 0 이상이어야 합니다.";
  if (input.earnedMajorCredits < 0 || input.earnedMajorCredits > input.earnedCredits)
    return "전공 이수학점은 총 이수학점 안에 포함되어야 합니다.";
  if (input.completedTerms < 0) return "인정 유효학기는 0 이상이어야 합니다.";
  if (input.targetCredits !== null && input.targetCredits <= 0)
    return "목표학점은 0보다 커야 합니다.";
  for (const b of input.breaks) {
    if (!isValidDate(b.startDate) || !isValidDate(b.endDate))
      return "중단 기간의 날짜 형식을 확인해 주세요.";
    if (b.endDate <= b.startDate) return "중단 종료일은 시작일 이후여야 합니다.";
  }
  return null;
}

/**
 * 확인된 필수과목 → 진로 추천 과목 순서의 결정적 단순 배치.
 * 최적 시간표나 공식 졸업 판정이 아니다.
 */
export function simulatePlan(input: PlanInput, dataset: Dataset): PlanResult {
  const base = { engineVersion: ENGINE_VERSION, catalogVersion: dataset.catalogVersion };
  const error = validatePlanInput(input);
  if (error) {
    return {
      ...base,
      error,
      terms: [],
      unplaced: [],
      warnings: [{ code: "INVALID_INPUT", message: error }],
      expectedCompletion: null,
      estimation: "unavailable",
      remainingCredits: null,
    };
  }

  const done = new Set(input.completedCourseCodes);
  let queue = recommendedCourses(dataset, input.track).filter((c) => !done.has(c.code));
  let remaining =
    input.targetCredits === null ? null : Math.max(0, input.targetCredits - input.earnedCredits);
  const terms: PlannedTerm[] = [];
  const warnings: PlanWarning[] = [];
  let activeTerms = 0;
  let finished = queue.length === 0 && (remaining === null || remaining === 0);
  let lastStudyTerm = null as PlannedTerm["term"] | null;
  let term = input.startTerm;

  for (let i = 0; i < MAX_FUTURE_TERMS && !finished; i++, term = nextTerm(term)) {
    if (isBlocked(term, input.breaks)) {
      terms.push({ term, status: "break", courses: [], slotCredits: 0, plannedCredits: 0 });
      continue;
    }

    const studentYear = Math.floor((input.completedTerms + activeTerms) / 2) + 1;
    const placed: PlacedCourse[] = [];
    let used = 0;

    for (const c of queue) {
      if ((c.recommendedYear ?? 1) > studentYear) continue;
      if ((c.semester === 1 || c.semester === 2) && c.semester !== term.season) continue;
      if (!c.prerequisites.every((p) => done.has(p))) continue;
      if (used + c.credits > input.creditCap) continue;

      const assumptions: PlacedCourse["assumptions"] = [];
      if (c.semester === null) assumptions.push("semester_unknown");
      if (c.offeringEndYear !== null && term.year > c.offeringEndYear)
        assumptions.push("offering_after_end_year");
      placed.push({
        code: c.code,
        name: c.name,
        credits: c.credits,
        group: groupOf(c.code, dataset) ?? "common",
        assumptions,
      });
      used += c.credits;
    }

    const placedCodes = new Set(placed.map((p) => p.code));
    queue = queue.filter((c) => !placedCodes.has(c.code));
    // 선수과목은 다음 학기부터 충족된 것으로 본다.
    placedCodes.forEach((code) => done.add(code));

    const planned = remaining === null ? used : Math.min(input.creditCap, Math.max(used, remaining));
    if (remaining !== null) remaining = Math.max(0, remaining - planned);

    for (const p of placed) {
      if (p.assumptions.includes("semester_unknown"))
        warnings.push({
          code: "SEMESTER_UNKNOWN",
          message: `${p.name}의 이수학기가 확인되지 않아 ${formatTerm(term)}에 가정 배치했습니다.`,
          term,
          courseCode: p.code,
        });
      if (p.assumptions.includes("offering_after_end_year"))
        warnings.push({
          code: "OFFERING_ASSUMED",
          message: `${p.name}은 자료상 종료연도 이후라 개설 유지를 가정했습니다.`,
          term,
          courseCode: p.code,
        });
    }

    terms.push({ term, status: "study", courses: placed, slotCredits: planned - used, plannedCredits: planned });
    activeTerms++;
    lastStudyTerm = term;
    finished = queue.length === 0 && (remaining === null || remaining === 0);
  }

  const unplaced = queue.map((c) => ({
    code: c.code,
    name: c.name,
    reason: c.prerequisites.some((p) => !done.has(p))
      ? "공식 선수과목이 충족되지 않았습니다."
      : `${MAX_FUTURE_TERMS}개 학기 안에 배치하지 못했습니다.`,
  }));
  for (const u of unplaced)
    warnings.push({ code: "UNPLACED_COURSE", message: `${u.name}: ${u.reason}`, courseCode: u.code });
  if (!finished)
    warnings.push({
      code: "SEARCH_LIMIT",
      message: `최대 ${MAX_FUTURE_TERMS}개 학기 안에 계획을 끝내지 못했습니다.`,
    });
  if (input.targetCredits === null)
    warnings.push({
      code: "TARGET_UNKNOWN",
      message: "목표 총학점이 없어 예상 완료 학기를 계산하지 않았습니다.",
    });
  if (dataset.courses.some((c) => c.prerequisiteStatus !== "verified"))
    warnings.push({
      code: "PREREQ_UNKNOWN",
      message: "일부 과목의 공식 선수요건을 확인하지 못했습니다.",
    });

  const canEstimate = finished && input.targetCredits !== null;
  return {
    ...base,
    error: null,
    terms,
    unplaced,
    warnings,
    expectedCompletion: canEstimate ? (lastStudyTerm ?? input.startTerm) : null,
    estimation: canEstimate ? "user_target" : "unavailable",
    remainingCredits: remaining,
  };
}
