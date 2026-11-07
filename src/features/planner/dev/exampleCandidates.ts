/**
 * 개발용 후보 예시(FE-1). BE-2(후보 생성·정렬)가 연결되기 전 카드 화면을 만들고 확인하는 데만 쓴다.
 * - 모든 수치는 가상 입력(mock-plan의 sampleInputV2)에 맞춘 손으로 쓴 예시다. 엔진 결과가 아니다.
 * - 운영 빌드에서는 불러오지 않는다(PlannerApp의 `?example=` 개발 전용 분기).
 */
import type {
  CandidateSet,
  CareerTrack,
  MetricValue,
  PlacedCourse,
  PlannedTermV2,
  PlanInputV2,
  PlanResultV2,
  RankingResult,
  Term,
  TrackCandidate,
} from "@/contracts/types";
import { sampleInputV2 } from "@/contracts/mock-plan";
import { candidateIdOf } from "@/engine";

const NAMES: Record<string, string> = {
  CSE3004: "오퍼레이팅시스템",
  ENE4019: "컴퓨터네트워크",
  ITE4023: "정보보호",
  MAT4015: "확률및통계",
  ITE4087: "데이터사이언스기반의사결정지원",
};
const CORE: Record<CareerTrack, string[]> = {
  security: ["CSE3004", "ENE4019", "ITE4023"],
  data: ["MAT4015", "ITE4087"],
};

/** 시작 2027-1. 군 복무 2028-04-01 ~ 2029-11-01 → 2028-1 ~ 2029-2 중단, 2030-1 복학. */
const CALENDAR: Array<[number, 1 | 2, "study" | "break"]> = [
  [2027, 1, "study"],
  [2027, 2, "study"],
  [2028, 1, "break"],
  [2028, 2, "break"],
  [2029, 1, "break"],
  [2029, 2, "break"],
  [2030, 1, "study"],
  [2030, 2, "study"],
  [2031, 1, "study"],
  [2031, 2, "study"],
  [2032, 1, "study"],
];
/** 진로 핵심 과목을 넣을 수강 학기(CALENDAR 인덱스) */
const CORE_SLOTS = [1, 6, 7];

function course(code: string, group: CareerTrack): PlacedCourse {
  return { code, name: NAMES[code], credits: 3, group, assumptions: [] };
}

function exampleTerms(career: CareerTrack, pace: number, studyTerms: number): PlannedTermV2[] {
  let ordinal = 2; // sampleInputV2: 2개 학기 이수
  let studied = 0;
  const terms: PlannedTermV2[] = [];
  CALENDAR.forEach(([year, season, status], i) => {
    if (status === "study" && studied >= studyTerms) return;
    const term: Term = { year, season };
    if (status === "break") {
      terms.push({ term, status, courses: [], slotCredits: 0, plannedCredits: 0, periodIds: ["mil-1"], capCredits: null, capRuleId: null, termOrdinal: null });
      return;
    }
    studied += 1;
    ordinal += 1;
    const slot = CORE_SLOTS.indexOf(i);
    const code = slot >= 0 ? CORE[career][slot] : undefined;
    const courses = code ? [course(code, career)] : [];
    const placed = courses.reduce((s, c) => s + c.credits, 0);
    terms.push({ term, status, courses, slotCredits: pace - placed, plannedCredits: pace, periodIds: [], capCredits: pace, capRuleId: null, termOrdinal: ordinal });
  });
  return terms;
}

function metrics(fast: number | null, core: number, maxCredits: number, avgCredits: number): MetricValue[] {
  return [
    {
      key: "fast_completion",
      value: fast,
      secondary: null,
      lowerIsBetter: true,
      unavailableReason: fast === null ? "목표 총학점이 없어 완료 학기를 계산하지 않았어요" : null,
    },
    { key: "career_core", value: core, secondary: null, lowerIsBetter: true, unavailableReason: null },
    { key: "light_terms", value: maxCredits, secondary: avgCredits, lowerIsBetter: true, unavailableReason: null },
  ];
}

const STUDY_TERMS: Record<number, number> = { 20: 5, 18: 6, 15: 7 };
const COMPLETION: Record<number, Term> = {
  20: { year: 2031, season: 1 },
  18: { year: 2031, season: 2 },
  15: { year: 2032, season: 1 },
};
const COMPLETION_INDEX: Record<number, number> = { 20: 8, 18: 9, 15: 10 };
const CORE_AVG: Record<CareerTrack, number> = { security: 4.7, data: 3.5 };

function candidate(input: PlanInputV2, career: CareerTrack, pace: number, withTarget: boolean): TrackCandidate {
  const key = { career, militaryStartTerm: null, paceCredits: pace };
  const terms = exampleTerms(career, pace, STUDY_TERMS[pace]);
  const result: PlanResultV2 = {
    engineVersion: "example",
    catalogVersion: "example",
    error: null,
    terms,
    unplaced: [],
    warnings: [],
    expectedCompletion: withTarget ? COMPLETION[pace] : null,
    estimation: withTarget ? "user_target" : "unavailable",
    remainingCredits: withTarget ? 94 : null,
    issues: withTarget
      ? []
      : [{ severity: "missing", field: "target", message: "목표 총학점이 없어요", impact: "예상 계획 완료 학기를 계산하지 않아요" }],
    assumptions: [
      { id: "cal", kind: "term_calendar", message: "1학기 3~6월, 2학기 9~12월을 계획용 학기 구간으로 가정했어요", status: "user_assumption" },
      { id: "mil", kind: "period_user_estimate", message: "군 복무 기간은 입력한 예상 날짜를 그대로 썼어요", status: "user_assumption" },
    ],
    partial: !withTarget,
  };
  return {
    id: candidateIdOf(key),
    key,
    status: withTarget ? "computable" : "conditional",
    input: { ...input, careers: [career], pace: { mode: "fixed", credits: pace } },
    result,
    metrics: metrics(withTarget ? COMPLETION_INDEX[pace] : null, CORE_AVG[career], pace, pace),
    missing: result.issues,
    conflicts: [],
    coreCourseCodes: CORE[career],
  };
}

const ORDER: Array<[CareerTrack, number]> = [
  ["data", 20],
  ["security", 20],
  ["data", 18],
  ["security", 18],
  ["data", 15],
  ["security", 15],
];

const BASE_INPUT: PlanInputV2 = { ...sampleInputV2, careers: ["security", "data"] };

function baseSet(candidates: TrackCandidate[], ranking: RankingResult): CandidateSet {
  return {
    input: BASE_INPUT,
    catalogVersion: "example",
    engineVersion: "example",
    configVersion: "rec-dev-0",
    candidates,
    ranking,
    dedupedInto: {},
    exploredCount: candidates.length,
    emptyReason: null,
  };
}

/** 정상: 목표 있음, 6개 후보, 빠른 완료 → 진로 과목 → 여유 순 정렬 */
function normal(): CandidateSet {
  const cands = ORDER.map(([c, p]) => candidate(BASE_INPUT, c, p, true));
  const reasons: Record<string, string[]> = {
    "data|m-|p20": ["가장 빠른 2031년 1학기에 계획을 마쳐요", "진로 핵심 과목을 평균 3.5학기째에 들어 같은 완료 시점 후보 중 가장 일러요"],
    "security|m-|p20": ["가장 빠른 2031년 1학기에 계획을 마쳐요", "진로 핵심 과목은 평균 4.7학기째로 1위보다 늦어요"],
    "data|m-|p18": ["2031년 2학기에 마쳐 1위보다 한 학기 늦어요", "학기당 최대 18학점으로 20학점 후보보다 여유 있어요"],
    "security|m-|p18": ["2031년 2학기에 마쳐요", "학기당 최대 18학점"],
    "data|m-|p15": ["2032년 1학기에 마쳐요", "학기당 최대 15학점으로 가장 여유 있어요"],
    "security|m-|p15": ["2032년 1학기에 마쳐요", "학기당 최대 15학점"],
  };
  return baseSet(cands, {
    rankingVersion: "rank-example",
    priorities: ["fast_completion", "career_core", "light_terms"],
    usedMetrics: ["fast_completion", "career_core", "light_terms"],
    excludedMetrics: [],
    entries: cands.map((c, i) => ({ candidateId: c.id, rank: i + 1, tiedWith: [], reasons: reasons[c.id] })),
    unrankedReason: null,
  });
}

/** 목표 미입력: 빠른 완료 지표 제외, 모든 후보 조건부. 진로 과목 → 여유 순 */
function noTarget(): CandidateSet {
  const order: Array<[CareerTrack, number]> = [
    ["data", 15],
    ["data", 18],
    ["data", 20],
    ["security", 15],
    ["security", 18],
    ["security", 20],
  ];
  const input = { ...BASE_INPUT, target: null };
  const cands = order.map(([c, p]) => candidate(input, c, p, false));
  return {
    ...baseSet(cands, {
      rankingVersion: "rank-example",
      priorities: ["fast_completion", "career_core", "light_terms"],
      usedMetrics: ["career_core", "light_terms"],
      excludedMetrics: [{ key: "fast_completion", reason: "목표 총학점이 없어 어느 후보도 완료 학기를 계산하지 않았어요" }],
      entries: cands.map((c, i) => ({
        candidateId: c.id,
        rank: i + 1,
        tiedWith: [],
        reasons: [
          c.key.career === "data" ? "진로 핵심 과목을 평균 3.5학기째에 들어요" : "진로 핵심 과목은 평균 4.7학기째에 들어요",
          `학기당 최대 ${c.key.paceCredits}학점`,
        ],
      })),
      unrankedReason: null,
    }),
    input,
  };
}

/** 후보 없음: 고정한 군 복무·교환 기간이 겹쳐 모든 조합이 충돌 */
function empty(): CandidateSet {
  const conflict: TrackCandidate = {
    ...candidate(BASE_INPUT, "security", 18, true),
    status: "conflict",
    result: null,
    metrics: [],
    conflicts: [
      { code: "PERIOD_OVERLAP", message: "고정한 군 복무(2028-04-01~)와 교환학생(2028-09-01~) 기간이 겹쳐요", periodIds: ["mil-1", "ex-1"] },
    ],
  };
  return {
    ...baseSet([conflict], {
      rankingVersion: "rank-example",
      priorities: ["fast_completion", "career_core", "light_terms"],
      usedMetrics: [],
      excludedMetrics: [],
      entries: [],
      unrankedReason: null,
    }),
    exploredCount: 6,
    emptyReason: {
      message: "고정한 군 복무와 교환학생 기간이 겹쳐 계산할 수 있는 후보가 없어요.",
      changeableFields: ["군 복무 시작일", "교환학생 시작 학기"],
    },
  };
}

export const EXAMPLE_CANDIDATES = { normal, "no-target": noTarget, empty } as const;
export type ExampleName = keyof typeof EXAMPLE_CANDIDATES;

export function exampleCandidates(name: string | null): CandidateSet | null {
  if (!name) return null;
  const make = (EXAMPLE_CANDIDATES as Record<string, (() => CandidateSet) | undefined>)[name];
  return make ? make() : null;
}
