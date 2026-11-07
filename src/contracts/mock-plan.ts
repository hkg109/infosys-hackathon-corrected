import type { CreditCapRule, PeriodInput, PlanInput, PlanInputV2, RecommendationConfig } from "./types";

/** 샘플 프로필: 1학년을 마치고 2027년 1학기부터 계획, 군 복무 포함 */
export const sampleInput: PlanInput = {
  startTerm: { year: 2027, season: 1 },
  completedCourseCodes: ["CSE1002", "ITE1012", "ITE1009"],
  earnedCredits: 36,
  earnedMajorCredits: 9,
  completedTerms: 2,
  targetCredits: 130,
  track: "security",
  creditCap: 18,
  breaks: [{ kind: "military", startDate: "2028-04-01", endDate: "2029-11-01" }],
};

/** 중단 기간이 없는 기준 플랜 */
export const sampleInputNoBreak: PlanInput = { ...sampleInput, breaks: [] };

/** 목표학점을 모르는 경우: 예상 완료 학기를 계산하지 않아야 한다 */
export const sampleInputUnknownTarget: PlanInput = { ...sampleInput, targetCredits: null };

/** 입력 오류 사례 */
export const sampleInputInvalid: PlanInput = {
  ...sampleInput,
  breaks: [{ kind: "leave", startDate: "2028-09-01", endDate: "2028-03-01" }],
};

// ═════════════════════════════════════════════════════════
// v2 예제(BE-1). 모든 수치는 가상 입력이다 — 학교 공식 수치로 쓰지 않는다.
// FE/DB/엔진 테스트가 같은 예제를 쓰도록 여기 한 곳에 둔다.
// ═════════════════════════════════════════════════════════


const militaryFixed: PeriodInput = {
  id: "mil-1",
  kind: "military",
  timing: "fixed",
  startDate: "2028-04-01",
  endDate: "2029-11-01",
  durationMonths: null,
  returnTerm: null,
  status: "user_assumption",
};

/** 정상: 시작 학기·이수 현황·목표·고정 병역이 모두 있다 → 계산 가능 후보 */
export const sampleInputV2: PlanInputV2 = {
  schemaVersion: 2,
  displayName: null,
  campus: "서울",
  department: "정보시스템학과",
  curriculum: { admissionYear: 2026, appliedCurriculum: "2024-2027", status: "user_assumption" },
  startTerm: { year: 2027, season: 1 },
  progress: {
    completedTerms: 2,
    earnedCredits: 36,
    earnedMajorCredits: 9,
    completedCourseCodes: ["CSE1002", "ITE1012", "ITE1009"],
    inProgressCourseCodes: [],
    unrecognizedLines: [],
  },
  target: { value: 130, source: "user_goal", checkedAt: null },
  requiredCourses: null,
  careers: ["security"],
  pace: { mode: "compare", options: null },
  military: "planned",
  leave: "none",
  exchange: "none",
  periods: [militaryFixed],
  priorities: ["fast_completion", "career_core", "light_terms"],
};

/** 목표 미입력: 배치는 하되 완료 학기·fast_completion 지표는 null → 조건부 */
export const sampleInputV2NoTarget: PlanInputV2 = { ...sampleInputV2, target: null };

/** 진로·이수 과목 미정: careers [] → 두 진로 탐색, completedCourseCodes null → 재수강 확정 배치 금지 */
export const sampleInputV2Undecided: PlanInputV2 = {
  ...sampleInputV2,
  careers: [],
  progress: { ...sampleInputV2.progress, completedCourseCodes: null },
};

/** 기간 미정: 병역 시점은 후보로 펼치되(flexible), 길이가 없어 "기간 확인 필요" */
export const sampleInputV2PeriodUnknown: PlanInputV2 = {
  ...sampleInputV2,
  military: "undecided",
  periods: [
    {
      id: "mil-1",
      kind: "military",
      timing: "flexible",
      startDate: null,
      endDate: null,
      durationMonths: null,
      returnTerm: null,
      status: "unknown",
    },
  ],
};

/** 병역 시점 펼치기: 길이(사용자 예상 18개월)는 있고 시작만 미정 → 시점 후보 최대 3개 */
export const sampleInputV2MilitaryFlexible: PlanInputV2 = {
  ...sampleInputV2,
  military: "undecided",
  periods: [{ ...sampleInputV2PeriodUnknown.periods[0], durationMonths: 18, status: "user_assumption" }],
};

/** 교환 인정 미정: 교환 학기에 국내 과목 미배치, 이후 학년 진행·완료 추정 보류 */
export const sampleInputV2ExchangeUnknown: PlanInputV2 = {
  ...sampleInputV2,
  exchange: "included",
  periods: [
    militaryFixed,
    {
      id: "exc-1",
      kind: "exchange",
      timing: "fixed",
      startDate: "2030-03-01",
      endDate: "2030-07-01",
      durationMonths: null,
      returnTerm: null,
      exchange: { credits: null, countsAsTerm: null, status: "unknown" },
      status: "user_assumption",
    },
  ],
  priorities: ["fast_completion", "exchange", "career_core", "light_terms"],
};

/** 충돌: 고정 군 복무와 고정 교환 기간이 겹친다 → conflict, 정상 후보에서 제외 */
export const sampleInputV2Conflict: PlanInputV2 = {
  ...sampleInputV2ExchangeUnknown,
  periods: [
    militaryFixed,
    { ...sampleInputV2ExchangeUnknown.periods[1], startDate: "2029-03-01", endDate: "2029-07-01" },
  ],
};

/** 입력 오류: 전공학점 > 총학점, 종료일 < 시작일 */
export const sampleInputV2Invalid: PlanInputV2 = {
  ...sampleInputV2,
  progress: { ...sampleInputV2.progress, earnedMajorCredits: 40 },
  periods: [{ ...militaryFixed, startDate: "2028-09-01", endDate: "2028-03-01" }],
};

/**
 * 상한 규칙 예제. 값은 PLAN 2.2에 정리된 S2 17~18쪽 대조 결과를 옮긴 것이며
 * 실제 게시 자료는 DB-3 검토본이 기준이다.
 */
export const sampleCreditCapRules: CreditCapRule[] = [
  {
    id: "cap-upto-2025",
    appliesTo: { admissionYearFrom: null, admissionYearTo: 2025, termOrdinalFrom: null, termOrdinalTo: null, curriculum: null },
    maxCredits: 20,
    minCredits: null,
    status: "verified",
    sourceRef: { sourceId: "S2", pages: [17] },
  },
  {
    id: "cap-2026-early",
    appliesTo: { admissionYearFrom: 2026, admissionYearTo: null, termOrdinalFrom: 1, termOrdinalTo: 4, curriculum: null },
    maxCredits: 20,
    minCredits: null,
    status: "planned",
    sourceRef: { sourceId: "S2", pages: [17, 18] },
  },
  {
    id: "cap-2026-upper",
    appliesTo: { admissionYearFrom: 2026, admissionYearTo: null, termOrdinalFrom: 5, termOrdinalTo: null, curriculum: null },
    maxCredits: 18,
    minCredits: null,
    status: "planned",
    sourceRef: { sourceId: "S2", pages: [17, 18], note: "3학년 이상 18학점 조정 예정" },
  },
];

/** 추천 설정 예제(서비스 설정). 핵심 과목은 fixture careerTags의 진로 과목에서 고른 개발용 값 */
export const sampleRecommendationConfig: RecommendationConfig = {
  configVersion: "rec-dev-0",
  careers: [
    {
      track: "security",
      label: "정보보안",
      coreCourses: [
        { courseCode: "CSE3004", reason: "운영체제 보안·권한 구조 이해와 연결됩니다." },
        { courseCode: "ENE4019", reason: "네트워크 보안의 기반이 되는 통신 구조를 다룹니다." },
        { courseCode: "ITE4023", reason: "정보보호의 핵심 개념을 직접 다룹니다." },
      ],
    },
    {
      track: "data",
      label: "데이터 분석",
      coreCourses: [
        { courseCode: "MAT4015", reason: "데이터 분석의 통계 기초입니다." },
        { courseCode: "ITE4087", reason: "데이터 기반 의사결정을 직접 다룹니다." },
      ],
    },
  ],
  paceOptions: [15, 18, 20],
  maxMilitaryTimings: 3,
  maxCandidates: 18,
  initialVisible: 3,
};
