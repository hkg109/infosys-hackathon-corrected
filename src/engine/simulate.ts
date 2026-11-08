import type {
  CareerTrack,
  Course,
  CourseGroup,
  Dataset,
  DatasetV2,
  PlacedCourse,
  PlanInput,
  PlannedTerm,
  PlanResult,
  PlanWarning,
  UnplacedCourse,
} from "@/contracts/types";
import { estimateUpperEarned, hasMajorRequirement, majorShortfall, sumMajorLevels } from "./majorReq";
import { isCapExempt, maxUserCap, schoolMinFor, termCapFor, usesServiceCap } from "./pace";
import { formatTerm, isBlocked, isValidDate, nextTerm, termIndex } from "./terms";

export const ENGINE_VERSION = "0.2.0";
export const MAX_FUTURE_TERMS = 24;

/** 과목이 여러 진로에 걸치면(예: 재무관리 = 비즈니스·금융) 고른 진로 → 공통 → 첫 태그 순으로 고른다. */
export function groupOf(code: string, dataset: Dataset, track?: CareerTrack): CourseGroup | null {
  const tags = dataset.careerTags.filter((t) => t.courseCode === code);
  return (tags.find((t) => t.group === track) ?? tags.find((t) => t.group === "common") ?? tags[0])?.group ?? null;
}

const semesterOrder = (s: Course["semester"]) => (s === 1 ? 1 : s === 2 ? 2 : 3);

/** 공통 기반 + 선택한 진로의 추천 과목. 결정적인 순서로 정렬한다. */
export function recommendedCourses(dataset: Dataset, track: CareerTrack): Course[] {
  return dataset.courses
    .filter((c) => dataset.careerTags.some((t) => t.courseCode === c.code && (t.group === "common" || t.group === track)))
    .sort(
      (a, b) =>
        (a.recommendedYear ?? 99) - (b.recommendedYear ?? 99) ||
        semesterOrder(a.semester) - semesterOrder(b.semester) ||
        a.code.localeCompare(b.code),
    );
}

export function validatePlanInput(input: PlanInput): string | null {
  const { startTerm } = input;
  if (!startTerm || !Number.isInteger(startTerm.year) || (startTerm.season !== 1 && startTerm.season !== 2))
    return "시작 학기를 확인해 주세요.";
  if (!Number.isInteger(input.creditCap) || input.creditCap < 1 || input.creditCap > 30)
    return "학기당 학점 상한은 1~30 사이로 입력해 주세요.";
  for (const b of input.paceBands ?? [])
    if (!Number.isInteger(b.credits) || b.credits < 1 || b.credits > 30 || !Number.isInteger(b.fromOrdinal) || b.fromOrdinal < 1)
      return "학기별 계획 학점은 1~30 사이로 입력해 주세요.";
  for (const t of input.termCaps ?? [])
    if (!Number.isInteger(t.credits) || t.credits < 0 || t.credits > 30) return "학기별 학점 제한은 0~30 사이로 입력해 주세요.";
  // NaN·Infinity는 비교식을 모두 통과하므로 먼저 거른다.
  if (!Number.isFinite(input.earnedCredits) || input.earnedCredits < 0)
    return "이수학점은 0 이상이어야 합니다.";
  if (
    !Number.isFinite(input.earnedMajorCredits) ||
    input.earnedMajorCredits < 0 ||
    input.earnedMajorCredits > input.earnedCredits
  )
    return "전공 이수학점은 총 이수학점 안에 포함되어야 합니다.";
  if (!Number.isInteger(input.completedTerms) || input.completedTerms < 0)
    return "인정 유효학기는 0 이상의 정수여야 합니다.";
  if (input.targetCredits !== null && (!Number.isFinite(input.targetCredits) || input.targetCredits <= 0))
    return "목표학점은 0보다 커야 합니다.";
  const r = input.majorRequirement;
  if (r)
    for (const v of [r.majorCredits, r.lowerLevelCredits, r.upperLevelCredits])
      if (v !== null && (!Number.isFinite(v) || v < 0)) return "전공 요건 학점은 0 이상이어야 합니다.";
  const up = input.earnedUpperMajorCredits;
  if (up !== undefined && up !== null && (!Number.isFinite(up) || up < 0 || up > input.earnedMajorCredits))
    return "전공 400단위 이수학점은 전공 이수학점 안에 포함되어야 합니다.";
  for (const b of input.breaks) {
    if (!isValidDate(b.startDate) || !isValidDate(b.endDate))
      return "중단 기간의 날짜 형식을 확인해 주세요.";
    if (b.endDate <= b.startDate) return "중단 종료일은 시작일 이후여야 합니다.";
  }
  return null;
}

/**
 * 어떤 학기에도 놓을 수 없는 과목을 미리 걸러낸다.
 * - 학점이 학기당 상한보다 큰 과목
 * - 선수과목이 이수 완료도, 이번 계획 대상도 아닌 과목(연쇄로 막히는 과목 포함)
 * 걸러내지 않으면 빈 학기를 최대 학기 수까지 쌓다가 SEARCH_LIMIT로 끝난다.
 */
function pruneUnplaceable(
  queue: Course[],
  done: ReadonlySet<string>,
  creditCap: number,
): { queue: Course[]; unplaced: UnplacedCourse[] } {
  const unplaced: UnplacedCourse[] = [];
  let rest = queue;
  for (let changed = true; changed; ) {
    changed = false;
    const reachable = new Set([...done, ...rest.map((c) => c.code)]);
    const keep: Course[] = [];
    for (const c of rest) {
      const missing = c.prerequisites.filter((p) => !reachable.has(p));
      const reason =
        c.credits > creditCap && !isCapExempt(c.code)
          ? `학점(${c.credits})이 학기당 상한(${creditCap})보다 큽니다.`
          : missing.length > 0
            ? `선수과목(${missing.join(", ")})이 이수 완료나 계획 대상에 없습니다.`
            : null;
      if (reason) {
        unplaced.push({ code: c.code, name: c.name, reason });
        changed = true;
      } else keep.push(c);
    }
    rest = keep;
  }
  return { queue: rest, unplaced };
}

/**
 * 확인된 필수과목 → 진로 추천 과목 순서의 결정적 단순 배치.
 * 최적 시간표나 공식 졸업 판정이 아니다.
 */
export function simulatePlan(input: PlanInput, dataset: DatasetV2): PlanResult {
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
  // 진로 추천 과목 + 모든 학생 공통 교양필수인 상한 제외 과목(커리어개발Ⅰ·Ⅱ). careerTags(서비스 진로 분류)는 건드리지 않는다
  const tagged = recommendedCourses(dataset, input.track);
  const recommended = [...tagged, ...dataset.courses.filter((c) => isCapExempt(c.code) && !tagged.some((t) => t.code === c.code))].sort(
    (a, b) => (a.recommendedYear ?? 99) - (b.recommendedYear ?? 99) || semesterOrder(a.semester) - semesterOrder(b.semester) || a.code.localeCompare(b.code),
  );
  const excluded = new Set((input.courseRules ?? []).filter((r) => r.action === "exclude").map((r) => r.code));
  const notBefore = new Map((input.courseRules ?? []).filter((r) => r.action === "not_before" && r.term).map((r) => [r.code, termIndex(r.term!)]));
  const pruned = pruneUnplaceable(
    recommended.filter((c) => !done.has(c.code) && !excluded.has(c.code)),
    done,
    maxUserCap(input),
  );
  let queue = pruned.queue;
  let remaining =
    input.targetCredits === null ? null : Math.max(0, input.targetCredits - input.earnedCredits);
  const terms: PlannedTerm[] = [];
  const warnings: PlanWarning[] = [];

  // 전공 요건: 추천 과목으로 못 채우는 전공 학점은 '전공 선택 자리'로 잡는다(400단위는 3학년부터).
  const req = hasMajorRequirement(input.majorRequirement) ? input.majorRequirement : null;
  const upperGiven = input.earnedUpperMajorCredits ?? null;
  const earnedUpper = Math.min(input.earnedMajorCredits, upperGiven ?? estimateUpperEarned(input.completedCourseCodes, dataset));
  const majorEarned = { major: input.earnedMajorCredits, lower: input.earnedMajorCredits - earnedUpper, upper: earnedUpper };
  const queueLevels = sumMajorLevels(queue);
  const need = req ? majorShortfall(req, majorEarned, queueLevels) : { major: 0, lower: 0, upper: 0 };
  let majorLeft = need.major;
  let upperLeft = need.upper;

  let activeTerms = 0;
  let finished = queue.length === 0 && (remaining === null || remaining === 0) && majorLeft === 0;
  let lastStudyTerm = null as PlannedTerm["term"] | null;
  let term = input.startTerm;

  for (let i = 0; i < MAX_FUTURE_TERMS && !finished; i++, term = nextTerm(term)) {
    if (isBlocked(term, input.breaks)) {
      terms.push({ term, status: "break", courses: [], slotCredits: 0, plannedCredits: 0 });
      continue;
    }

    const studentYear = Math.floor((input.completedTerms + activeTerms) / 2) + 1;
    // 유효학기 순번(1부터). 학교 상한(1·2학년 20, 3·4학년 18)과 계획 한도(페이스·사용자 학기 제한)를 나눈다
    const base = termCapFor(input, dataset, input.completedTerms + activeTerms + 1);
    const userTermCap = (input.termCaps ?? []).find((t) => t.term.year === term.year && t.term.season === term.season)?.credits ?? null;
    const cap = userTermCap === null ? base.cap : Math.min(base.cap, userTermCap);
    const ruleId = base.ruleId;
    const placed: PlacedCourse[] = [];
    let used = 0;
    // 상한 제외 과목(커리어개발) 학점: 상한 비교에 넣지 않고, 다른 과목·자리가 쓰지 못한다
    let exemptUsed = 0;

    for (const c of queue) {
      if ((c.recommendedYear ?? 1) > studentYear) continue;
      if ((c.semester === 1 || c.semester === 2) && c.semester !== term.season) continue;
      if (!c.prerequisites.every((p) => done.has(p))) continue;
      if ((notBefore.get(c.code) ?? -Infinity) > termIndex(term)) continue;
      const exempt = isCapExempt(c.code);
      if (!exempt && used + c.credits > cap) continue;

      const assumptions: PlacedCourse["assumptions"] = [];
      if (c.semester === null) assumptions.push("semester_unknown");
      if (c.offeringEndYear !== null && term.year > c.offeringEndYear)
        assumptions.push("offering_after_end_year");
      placed.push({
        code: c.code,
        name: c.name,
        credits: c.credits,
        group: groupOf(c.code, dataset, input.track) ?? "common",
        assumptions,
      });
      if (exempt) {
        exemptUsed += c.credits;
        const expected = ((c.recommendedYear ?? 1) - 1) * 2 + (c.semester === 2 ? 2 : 1);
        const ord = input.completedTerms + activeTerms + 1;
        if (ord > expected)
          warnings.push({
            code: "CAP_EXEMPT_LATE",
            message: `${c.name}은 ${c.recommendedYear ?? 1}학년 ${c.semester ?? 1}학기 과목인데 아직 이수 기록이 없어 ${formatTerm(term)}에 넣었어요. 이수했다면 이수 현황에서 체크하세요.`,
            term,
            courseCode: c.code,
          });
      } else used += c.credits;
    }

    const placedCodes = new Set(placed.map((p) => p.code));
    queue = queue.filter((c) => !placedCodes.has(c.code));
    // 선수과목은 다음 학기부터 충족된 것으로 본다.
    placedCodes.forEach((code) => done.add(code));

    // 남은 자리에 전공 선택 자리를 먼저 둔다. 400단위 자리는 3학년부터.
    const free = Math.max(0, cap - used);
    const upperSlot = studentYear >= 3 ? Math.min(free, upperLeft) : 0;
    const otherSlot = Math.min(free - upperSlot, majorLeft - upperLeft);
    const majorSlot = upperSlot + otherSlot;
    upperLeft -= upperSlot;
    majorLeft -= majorSlot;

    const fixed = used + majorSlot;
    // planned = 상한 제외 과목을 뺀 이 학기 학점. 남은 학점에서 커리어개발 학점은 먼저 뺀다
    let planned = remaining === null ? fixed : Math.min(cap, Math.max(fixed, remaining - exemptUsed));
    // 학교 최소 신청학점(1~7번째 학기 10학점, S2 17~18쪽)보다 적으면 미지정 자리로 채운다. 학기 상한·사용자 학기 제한이 더 작으면 그 값까지만.
    const ordinal = input.completedTerms + activeTerms + 1;
    const minRule = schoolMinFor(dataset.creditCapRules, input.admissionYear, ordinal);
    if (minRule && planned + exemptUsed < minRule.min) {
      const filled = Math.min(cap, minRule.min - exemptUsed);
      if (filled > planned) {
        warnings.push({
          code: "MIN_CREDITS_FILLED",
          message: `${formatTerm(term)}은 ${ordinal}번째 학기라 최소 신청학점 ${minRule.min}학점(수강신청 안내 17~18쪽)을 맞추려고 미지정 자리 ${filled - planned}학점을 더했어요.`,
          term,
        });
        planned = filled;
      }
      if (filled + exemptUsed < minRule.min)
        warnings.push({
          code: "MIN_CREDITS_FILLED",
          message: `${formatTerm(term)} 계획 학점(${filled + exemptUsed})이 최소 신청학점 ${minRule.min}학점보다 적어요. 학기 학점 제한을 확인하세요.`,
          term,
        });
    }
    if (remaining !== null) remaining = Math.max(0, remaining - planned - exemptUsed);

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

    terms.push({
      term,
      status: "study",
      courses: placed,
      slotCredits: planned - used,
      ...(req ? { majorSlotCredits: majorSlot, upperMajorSlotCredits: upperSlot } : {}),
      plannedCredits: planned + exemptUsed,
      capCredits: (base.schoolCap ?? cap) + exemptUsed,
      baseCapCredits: base.schoolCap,
      capExemptCredits: exemptUsed,
      planLimitCredits: cap,
      capRuleId: ruleId,
    });
    activeTerms++;
    lastStudyTerm = term;
    finished = queue.length === 0 && (remaining === null || remaining === 0) && majorLeft === 0;
  }

  // 학년별 서비스 기준 상한(3·4학년 18)은 2026학년도 신입생 안내를 전 학생에 적용한 것 → 이전 입학자는 현행표와 다를 수 있다
  if (usesServiceCap(dataset.creditCapRules) && input.admissionYear != null && input.admissionYear <= 2025 && input.completedTerms + activeTerms >= 5)
    warnings.push({
      code: "CAP_RULE_ASSUMED",
      message: `3·4학년 18학점 상한은 2026학년도 신입생 기준 안내를 적용했어요. ${input.admissionYear}학번은 수강신청 안내문 17쪽 현행 기준(20학점)일 수 있어요.`,
    });
  const unplaced: UnplacedCourse[] = [
    ...pruned.unplaced,
    ...queue.map((c) => ({
    code: c.code,
    name: c.name,
    reason: c.prerequisites.some((p) => !done.has(p))
      ? "공식 선수과목이 충족되지 않았습니다."
      : `${MAX_FUTURE_TERMS}개 학기 안에 배치하지 못했습니다.`,
    })),
  ];
  for (const u of unplaced)
    warnings.push({ code: "UNPLACED_COURSE", message: `${u.name}: ${u.reason}`, courseCode: u.code });
  for (const code of excluded) {
    const c = recommended.find((x) => x.code === code);
    if (c && !done.has(code))
      warnings.push({
        code: "USER_EXCLUDED",
        message: `${c.name}을(를) 요청에 따라 계획에서 뺐어요.${c.category?.includes("필수") ? " 이수구분이 필수라 졸업요건을 포털에서 꼭 확인하세요." : ""}`,
        courseCode: code,
      });
  }
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
  // 이 계획에 쓰는 과목만 본다(다른 진로 과목은 영향을 주지 않는다).
  if (recommended.some((c) => c.prerequisiteStatus !== "verified"))
    warnings.push({
      code: "PREREQ_UNKNOWN",
      message: "일부 과목의 공식 선수요건을 확인하지 못했습니다.",
    });

  let majorProgress: PlanResult["majorProgress"] = null;
  if (req) {
    const placedAll = terms.flatMap((t) => t.courses).map((p) => recommended.find((c) => c.code === p.code)!).filter(Boolean);
    const planned = sumMajorLevels(placedAll);
    const slotted = {
      major: need.major - majorLeft,
      upper: need.upper - upperLeft,
    };
    const lowerSlotted = Math.min(need.lower, slotted.major - slotted.upper);
    majorProgress = {
      required: { major: req.majorCredits, lower: req.lowerLevelCredits, upper: req.upperLevelCredits },
      earned: { ...majorEarned, upperEstimated: upperGiven === null },
      planned,
      extra: { major: slotted.major, lower: lowerSlotted, upper: slotted.upper },
      met: majorLeft === 0 && unplaced.length === 0,
    };
    if (need.major > 0)
      warnings.push({
        code: "MAJOR_EXTRA",
        message: `전공 요건까지 ${need.major}학점${need.upper > 0 ? `(400단위 ${need.upper}학점 포함)` : ""}이 이 진로 추천 과목만으로는 모자라 '전공 선택 자리'로 넣었어요. 수강신청 때 전공 과목을 직접 골라야 해요.`,
      });
    if (upperGiven === null && req.upperLevelCredits !== null)
      warnings.push({
        code: "MAJOR_LEVEL_ESTIMATED",
        message: `전공 400단위 이수학점을 입력하지 않아 이수 과목 중 자료에 있는 400단위 과목(${earnedUpper}학점)으로 추정했어요.`,
      });
  }

  // 배치하지 못한 과목이 있으면 완료 시점을 추정하지 않는다.
  const canEstimate = finished && unplaced.length === 0 && input.targetCredits !== null;
  return {
    ...base,
    error: null,
    terms,
    unplaced,
    warnings,
    expectedCompletion: canEstimate ? (lastStudyTerm ?? input.startTerm) : null,
    estimation: canEstimate ? "user_target" : "unavailable",
    remainingCredits: remaining,
    ...(req ? { majorProgress } : {}),
  };
}
