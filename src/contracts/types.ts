/**
 * 공통 계약. 화면(planner)·안내(guidance)·계산(engine)·조회(catalog)가 모두 이 타입만 공유한다.
 * 필드 이름을 바꿀 때는 mock·fixture·테스트를 같은 PR에서 함께 고친다.
 */

// ── 기본 단위 ─────────────────────────────────────────────

/** 1 = 1학기(봄), 2 = 2학기(가을) */
export type Season = 1 | 2;

export interface Term {
  year: number;
  season: Season;
}

/** 서비스가 정한 진로 분류. 학교 공식 트랙이 아니다. */
export type CareerTrack = "security" | "data";
export type CourseGroup = CareerTrack | "common";

/** 정보의 확인 상태 */
export type VerifyStatus = "verified" | "assumed" | "unknown";

/** YYYY-MM-DD. 시간대 영향을 받지 않도록 문자열로 비교한다. */
export type ISODate = string;

// ── 자료(Dataset) ─────────────────────────────────────────

export interface Source {
  id: string;
  title: string;
  url: string;
  kind: "api" | "public_page" | "manual";
  checkedAt: ISODate;
}

export interface Course {
  /** 학수번호. 자료 버전 안에서 유일하다. */
  code: string;
  name: string;
  credits: number;
  /** 권장 이수학년. 모르면 null */
  recommendedYear: number | null;
  /** 이수학기. 0 = 학기 공통, null = 미확인 */
  semester: Season | 0 | null;
  /** 개설 종료연도. 모르면 null */
  offeringEndYear: number | null;
  /** 이수 구분(전공필수 등). 모르면 null */
  category: string | null;
  /** 공식 선수과목 학수번호. 확인 못 했으면 빈 배열 + prerequisiteStatus = unknown */
  prerequisites: string[];
  prerequisiteStatus: VerifyStatus;
  sourceId: string;
}

/** 서비스의 진로 추천(학교 공식 정보와 분리) */
export interface CareerTag {
  courseCode: string;
  group: CourseGroup;
  reason: string;
}

export interface AcademicRule {
  key: string;
  value: string | number;
  status: VerifyStatus;
  sourceId: string | null;
  note: string;
}

export interface Dataset {
  catalogVersion: string;
  campus: string;
  department: string;
  /** 적용 교육과정 표기(예: "2024-2027") */
  curriculum: string;
  collectedAt: ISODate;
  publishedAt: ISODate | null;
  courses: Course[];
  careerTags: CareerTag[];
  rules: AcademicRule[];
  sources: Source[];
  /** 아직 확인하지 못한 항목 */
  unknowns: string[];
}

// ── 조회 경계 ─────────────────────────────────────────────

export interface CatalogContext {
  campus: string;
  department: string;
  curriculum: string;
}

export type CatalogStatus = "ready" | "stale" | "empty" | "unavailable";

export interface CatalogResponse {
  status: CatalogStatus;
  dataset: Dataset | null;
  /** fixture = 개발용 검토 자료, db = 게시된 DB 버전 */
  origin: "fixture" | "db" | "cache" | null;
  fetchedAt: string;
  warnings: string[];
}

// ── 계획 입력 ─────────────────────────────────────────────

/** 중단 구간. [startDate, endDate) — 시작 포함, 종료 제외 */
export interface BreakPeriod {
  kind: "military" | "leave";
  startDate: ISODate;
  endDate: ISODate;
}

export interface PlanInput {
  /** 로드맵을 시작할 첫 학기 */
  startTerm: Term;
  /** 이수 완료 과목 학수번호 */
  completedCourseCodes: string[];
  /** 총 이수학점(전공 포함) */
  earnedCredits: number;
  /** 전공 이수학점. 총 이수학점의 일부이며 더하지 않는다. */
  earnedMajorCredits: number;
  /** 이미 인정된 유효학기 수 */
  completedTerms: number;
  /** 사용자가 입력한 목표 총학점. 모르면 null */
  targetCredits: number | null;
  track: CareerTrack;
  /** 학기당 계획 학점 상한(사용자 제약, 학교 승인값 아님) */
  creditCap: number;
  breaks: BreakPeriod[];
}

// ── 계산 결과 ─────────────────────────────────────────────

export type WarningCode =
  | "INVALID_INPUT"
  | "TARGET_UNKNOWN"
  | "OFFERING_ASSUMED"
  | "SEMESTER_UNKNOWN"
  | "PREREQ_UNKNOWN"
  | "UNPLACED_COURSE"
  | "SEARCH_LIMIT";

export interface PlanWarning {
  code: WarningCode;
  message: string;
  term?: Term;
  courseCode?: string;
}

export interface PlacedCourse {
  code: string;
  name: string;
  credits: number;
  group: CourseGroup;
  /** 이 배치에 쓴 가정 */
  assumptions: Array<"offering_after_end_year" | "semester_unknown">;
}

export interface PlannedTerm {
  term: Term;
  status: "study" | "break";
  courses: PlacedCourse[];
  /** 표본 외 미배정 전공·교양 학점 슬롯 */
  slotCredits: number;
  plannedCredits: number;
}

export interface UnplacedCourse {
  code: string;
  name: string;
  reason: string;
}

export interface PlanResult {
  engineVersion: string;
  catalogVersion: string;
  /** 입력 오류가 있으면 메시지, 없으면 null */
  error: string | null;
  terms: PlannedTerm[];
  unplaced: UnplacedCourse[];
  warnings: PlanWarning[];
  /** 계산할 수 있을 때만 값이 있다 */
  expectedCompletion: Term | null;
  estimation: "user_target" | "unavailable";
  remainingCredits: number | null;
}

export interface PlanDiff {
  addedCourses: string[];
  removedCourses: string[];
  /** + 이면 늦어짐, - 이면 앞당김, null 이면 비교 불가 */
  completionDeltaTerms: number | null;
  creditDiffByTerm: Array<{ term: Term; before: number; after: number }>;
  newWarnings: PlanWarning[];
}

// ── 안내 ─────────────────────────────────────────────────

export interface GuidanceItem {
  id: string;
  title: string;
  detail: string;
  sourceIds: string[];
}

export interface GuidanceResult {
  items: GuidanceItem[];
}

// ── 브라우저 저장 ─────────────────────────────────────────

export interface SavedPlan {
  schemaVersion: 1;
  savedAt: string;
  input: PlanInput;
  result: PlanResult;
  catalogVersion: string;
  engineVersion: string;
}

// ═════════════════════════════════════════════════════════
// v2 계약 (BE-1) — PLAN v3 4~8장
// v1 타입(PlanInput·PlanResult·SavedPlan)은 BE-2 전환이 끝날 때까지 유지한다.
// 규칙: 미입력은 null, 0은 실제 0. 미확인을 0·빈 배열·최빠른 값으로 바꾸지 않는다.
// ═════════════════════════════════════════════════════════

// ── 근거와 확인 상태(PLAN 8.3) ───────────────────────────

/** 근거 종류. 확인 상태와 별개다. */
export type EvidenceKind = "official" | "service" | "user" | "senior" | "ai";

/** 확인 / 예정 기준 / 사용자 가정 / 미확인 */
export type ConfirmStatus = "verified" | "planned" | "user_assumption" | "unknown";

/** 제공 자료의 위치. pages는 PDF 페이지 번호 */
export interface SourceRef {
  sourceId: string;
  pages: number[];
  note?: string;
}

/** 자료가 적용되는 범위. null 필드는 "범위 제한 없음"이 아니라 "자료에 표기 없음"이다. */
export interface AppliesTo {
  /** 입학연도 범위(포함). 예: 2025학년도 입학자까지 → { from: null, to: 2025 } */
  admissionYearFrom: number | null;
  admissionYearTo: number | null;
  /** 몇 번째 학기에 적용되는지(포함, 1부터). 표기 없으면 null */
  termOrdinalFrom: number | null;
  termOrdinalTo: number | null;
  /** 적용 교육과정 표기. 예: "2024-2027" */
  curriculum: string | null;
  note?: string;
}

/** 서비스·엔진이 쓴 가정. 결과·버전에 함께 저장한다. */
export interface Assumption {
  id: string;
  kind:
    | "term_calendar" // 1학기 03-01~07-01, 2학기 09-01~01-01 계획용 구간
    | "offering_continues" // 종료연도 이후 개설 유지 가정
    | "semester_unknown" // 이수학기 공란 과목의 임의 학기 배치
    | "credit_cap_planned" // 예정 기준 상한 사용
    | "credit_cap_user_only" // 학교 상한 미확인, 사용자 상한만 사용
    | "period_user_estimate" // 사용자 예상 기간 사용
    | "exchange_unrecognized"; // 교환 인정 미정 → 이후 진행 보류
  message: string;
  status: ConfirmStatus;
  sourceRef?: SourceRef;
}

// ── 자료·규칙(Dataset 확장) ───────────────────────────────

/** 학기당 수강 상한/하한 규칙(PLAN 5.4). 학교 승인값이 아니라 자료 표기 그대로다. */
export interface CreditCapRule {
  id: string;
  appliesTo: AppliesTo;
  maxCredits: number;
  /** 최소 수강학점. 표기 없으면 null */
  minCredits: number | null;
  /** verified = 제공 안내문상 현행, planned = "예정" 안내 */
  status: ConfirmStatus;
  sourceRef: SourceRef;
}

/** 진로별 핵심 과목. 서비스 추천이며 학교 공식 트랙이 아니다. */
export interface CareerCoreCourse {
  courseCode: string;
  reason: string;
}

export interface CareerConfig {
  track: CareerTrack;
  label: string;
  coreCourses: CareerCoreCourse[];
}

/** 추천·후보 생성 설정(PLAN 6.1). 서비스 설정이며 버전을 기록한다. */
export interface RecommendationConfig {
  configVersion: string;
  careers: CareerConfig[];
  /** 학점 페이스 비교값. 초기 제안 15·18·20 — 학교 규정 아님 */
  paceOptions: number[];
  /** 병역 시점 후보 최대 개수(MVP 3) */
  maxMilitaryTimings: number;
  /** 후보 총 상한(MVP 18) */
  maxCandidates: number;
  /** 최초 노출 개수(MVP 3) */
  initialVisible: number;
}

/**
 * v2 자료. v1 Dataset에 필드를 더한 것이다.
 * 새 필드는 DB-2/3 검토본이 들어오기 전까지 비어 있을 수 있으므로 선택 필드로 둔다.
 */
export interface DatasetV2 extends Dataset {
  /** 과목별 원문 위치(학수번호 → 위치) */
  courseSourceRefs?: Record<string, SourceRef>;
  /** 과목별 개설/종료 원문 표기(가공 전) */
  courseOfferingNotes?: Record<string, string>;
  creditCapRules?: CreditCapRule[];
  recommendation?: RecommendationConfig;
  /** 자료 검토일(제공본 기준). 학교 사이트 실시간 조회일이 아니다. */
  reviewedAt?: ISODate;
}

// ── 입력 v2(PLAN 4.1) ────────────────────────────────────

/** 목표 총학점과 그 출처. 공식 졸업학점으로 표시하지 않는다. */
export interface TargetCredits {
  value: number;
  /** graduation_check = 개인 졸업사정 조회로 확인, user_goal = 사용자 목표 */
  source: "graduation_check" | "user_goal";
  checkedAt: ISODate | null;
}

/** 이수 현황. 각 값이 null이면 미입력(0이 아니다). */
export interface ProgressInput {
  completedTerms: number | null;
  /** 총 이수학점(전공 포함) */
  earnedCredits: number | null;
  /** 전공 이수학점. 총 이수학점의 일부이며 더하지 않는다. */
  earnedMajorCredits: number | null;
  /** null = 이수 과목 미입력. [] = 이수 과목 없음으로 확인 */
  completedCourseCodes: string[] | null;
  /** 수강 중 과목. 이수 완료로 자동 인정하지 않는다. */
  inProgressCourseCodes: string[];
  /** 성적표에서 찾지 못한 줄. 버리지 않고 보여준다. */
  unrecognizedLines: string[];
}

/** 개인 적용 교육과정. 입학연도와 적용 교육과정은 다른 값이다. */
export interface CurriculumInput {
  admissionYear: number | null;
  /** 개인이 확인한 적용 교육과정 표기. 모르면 null */
  appliedCurriculum: string | null;
  status: ConfirmStatus;
}

/** 확인한 개인별 미이수 필수과목. null이면 미확인(교육과정표 전체를 필수로 보지 않는다). */
export interface RequiredCoursesInput {
  courseCodes: string[];
  checkedAt: ISODate | null;
}

/** 학점 페이스. fixed는 고정값, compare는 후보로 펼친다. 사용자 희망 상한이며 학교 상한과 별개다. */
export type PaceInput = { mode: "fixed"; credits: number } | { mode: "compare"; options: number[] | null };

export type MilitaryStatus = "done" | "planned" | "not_applicable" | "undecided";

/** 이벤트 포함 여부: none = 계획 없음(자동 추가 금지), included = 유지할 조건, undecided = 선택 가능 */
export type EventPlan = "none" | "included" | "undecided";

export type PeriodKind = "military" | "leave" | "exchange";

/** 교환 인정 정보. null = 미정(0으로 확정하지 않는다) */
export interface ExchangeRecognition {
  /** 예상 인정학점. 실제 이수학점과 분리한다. */
  credits: number | null;
  /** 유효학기로 인정되는지 */
  countsAsTerm: boolean | null;
  status: ConfirmStatus;
}

/**
 * 군 복무·휴학·교환 기간(PLAN 5.2·5.3). 날짜 구간은 [startDate, endDate).
 * - timing "fixed": startDate 필수. 후보 생성에서 바꾸지 않는다.
 * - timing "flexible": 시작 시점을 후보로 펼친다(MVP는 병역만). startDate는 null.
 * - 길이: endDate > durationMonths > returnTerm 순서로 쓴다. 셋 다 없으면 "기간 확인 필요".
 */
export interface PeriodInput {
  /** 입력 안에서 유일. 준비사항·버전 비교가 이 ID로 이벤트를 가리킨다. */
  id: string;
  kind: PeriodKind;
  timing: "fixed" | "flexible";
  startDate: ISODate | null;
  /** 전역 예정일 등 종료일(제외). 모르면 null */
  endDate: ISODate | null;
  /** 사용자 예상 기간(개월). 추측해서 채우지 않는다. */
  durationMonths: number | null;
  /** 희망 복학 학기. 전역 직후보다 늦으면 그때까지 중단 */
  returnTerm: Term | null;
  /** kind === "exchange"일 때만 */
  exchange?: ExchangeRecognition;
  /** 날짜·기간을 어떻게 알았는지 */
  status: ConfirmStatus;
}

/** 순위에 쓰는 우선순위(PLAN 6.3). 배열 순서가 비교 순서다. */
export type PriorityKey = "fast_completion" | "career_core" | "light_terms" | "exchange";

export interface PlanInputV2 {
  schemaVersion: 2;
  /** 화면 표시용. 계산·AI 요청에서 제외 */
  displayName: string | null;
  campus: string;
  department: string;
  curriculum: CurriculumInput;
  /** 계획 시작 학기. null이면 학기 없는 추천·확인사항까지만 제공 */
  startTerm: Term | null;
  progress: ProgressInput;
  target: TargetCredits | null;
  requiredCourses: RequiredCoursesInput | null;
  /** 관심 진로. 빈 배열 = 미정 → 두 진로 모두 탐색, "미정" 표시 */
  careers: CareerTrack[];
  pace: PaceInput;
  military: MilitaryStatus;
  leave: EventPlan;
  exchange: EventPlan;
  periods: PeriodInput[];
  priorities: PriorityKey[];
}

/** 입력 검증 결과. 오류(error)와 정보 부족(missing)을 구분한다(PLAN 4.2). */
export interface InputIssue {
  severity: "error" | "missing";
  /** 화면이 오류 위치를 표시할 경로. 예: "progress.earnedMajorCredits", "periods[0].endDate" */
  field: string;
  message: string;
  /** missing일 때 무엇이 계산되지 않는지 */
  impact?: string;
}

// ── 계산 결과 v2 ─────────────────────────────────────────

export type TermStatus = "study" | "break" | "exchange";

export interface PlannedTermV2 extends Omit<PlannedTerm, "status"> {
  status: TermStatus;
  /** 이 학기를 막은 기간 ID(여러 개 가능) */
  periodIds: string[];
  /** 이 학기에 쓴 배치 상한 = min(사용자 페이스, 적용 가능한 학교 상한) */
  capCredits: number | null;
  /** 상한 근거. 학교 상한 미확인이면 null */
  capRuleId: string | null;
  /** 몇 번째 유효학기인지(학년 진행 표시용). 교환 인정 미정 이후는 null */
  termOrdinal: number | null;
}

export interface PlanResultV2 extends Omit<PlanResult, "terms"> {
  terms: PlannedTermV2[];
  /** 입력 오류와 정보 부족 */
  issues: InputIssue[];
  assumptions: Assumption[];
  /** 배치를 끝까지 못 했거나 일부 정보가 없어 부분 결과인지 */
  partial: boolean;
}

// ── 후보·순위(PLAN 6) ────────────────────────────────────

/** 계산 가능 / 조건부·정보 부족 / 명시적 충돌 / 탐색 한계 */
export type CandidateStatus = "computable" | "conditional" | "conflict" | "search_limit";

/** 후보를 펼친 축. 고정 입력은 여기 들어오지 않는다. */
export interface CandidateKey {
  career: CareerTrack;
  /** 병역 시작 학기 후보. 병역을 펼치지 않았으면 null */
  militaryStartTerm: Term | null;
  paceCredits: number;
}

export type MetricKey = PriorityKey;

export interface MetricValue {
  key: MetricKey;
  /**
   * fast_completion: 예상 계획 완료 학기 인덱스(시작 학기 = 0)
   * career_core: 핵심 과목 평균 미래 학기 인덱스(이수 완료 0, 미배정 25)
   * light_terms: 수강 학기 최대 계획학점
   * exchange: 교환 포함 1, 미포함 0
   * 계산할 수 없으면 null + unavailableReason
   */
  value: number | null;
  /** 동률 보조값. light_terms는 평균 계획학점 */
  secondary: number | null;
  /** 낮을수록 좋은지 */
  lowerIsBetter: boolean;
  unavailableReason: string | null;
}

export interface CandidateConflict {
  code: "INVALID_INPUT" | "PERIOD_OVERLAP" | "REQUIRED_VIOLATION";
  message: string;
  periodIds: string[];
  field?: string;
}

export interface TrackCandidate {
  /** 정규화된 키로 만든 안정적인 ID. 형식: "{career}|m{학기인덱스 또는 -}|p{페이스}" */
  id: string;
  key: CandidateKey;
  status: CandidateStatus;
  /** 이 후보를 계산한 입력(펼친 값이 채워진 스냅샷) */
  input: PlanInputV2;
  /** 충돌이어도 계산 가능한 부분까지는 결과를 둔다. 입력 오류면 null */
  result: PlanResultV2 | null;
  metrics: MetricValue[];
  /** 확인이 필요한 항목(조건부 후보의 이유) */
  missing: InputIssue[];
  conflicts: CandidateConflict[];
  /** 핵심 과목 코드(카드 표시용, 서비스 추천) */
  coreCourseCodes: string[];
}

export interface RankedEntry {
  candidateId: string;
  /** 1부터. 순위를 붙이지 않으면 null */
  rank: number | null;
  /** 모든 사용 지표가 같은 다른 후보 */
  tiedWith: string[];
  /** 실제 비교 지표로 만든 설명 문장. AI가 바꾸지 않는다. */
  reasons: string[];
}

export interface RankingResult {
  rankingVersion: string;
  /** 사용자 우선순위 순서 그대로 */
  priorities: PriorityKey[];
  usedMetrics: MetricKey[];
  /** 한 후보라도 계산 못 한 지표는 비교 전체에서 제외 */
  excludedMetrics: Array<{ key: MetricKey; reason: string }>;
  /** 정상 후보(충돌 제외) 정렬 결과 */
  entries: RankedEntry[];
  /** all_metrics_unknown = 비교 정보 부족 목록으로 표시 */
  unrankedReason: "all_metrics_unknown" | null;
}

export interface CandidateSet {
  /** 사용자 원 입력 */
  input: PlanInputV2;
  catalogVersion: string;
  engineVersion: string;
  configVersion: string;
  candidates: TrackCandidate[];
  ranking: RankingResult;
  /** 중복 제거로 빠진 후보: 제거된 ID → 대표 ID */
  dedupedInto: Record<string, string>;
  /** 펼친 조합 수(중복 제거 전) */
  exploredCount: number;
  /** 후보가 0개일 때 막은 조건과 바꿀 수 있는 입력 */
  emptyReason: { message: string; changeableFields: string[] } | null;
}

// ── 피드백·버전(PLAN 7) ──────────────────────────────────

/** 기본 피드백 4종(PLAN 7.1) */
export type FeedbackChange =
  | { type: "military_start"; periodId: string; startTerm: Term }
  | { type: "return_term"; periodId: string; returnTerm: Term }
  | { type: "pace"; credits: number }
  | { type: "career"; career: CareerTrack };

export type VersionOrigin =
  | { kind: "candidate"; candidateId: string }
  | { kind: "feedback"; change: FeedbackChange }
  | { kind: "migrated_v1" };

/** 버전 스냅샷. 저장 후 재계산하지 않는다. */
export interface PlanVersion {
  planId: string;
  versionId: string;
  parentVersionId: string | null;
  createdAt: string;
  origin: VersionOrigin;
  input: PlanInputV2;
  result: PlanResultV2;
  catalogVersion: string;
  engineVersion: string;
  /** 후보에서 시작하지 않았으면 null */
  rankingVersion: string | null;
  configVersion: string | null;
  assumptions: Assumption[];
}

export interface PlanVersionStore {
  schemaVersion: 2;
  savedAt: string;
  planId: string;
  versions: PlanVersion[];
  /** "맞다!"로 확정한 버전. 정리 대상에서 보호 */
  confirmedVersionId: string | null;
  /** 보관 한도(기본 20). 도달하면 사용자가 정리하도록 안내 */
  maxVersions: number;
}

export interface VersionDiff {
  fromVersionId: string;
  toVersionId: string;
  /** 입력 변화. field는 InputIssue.field와 같은 경로 형식 */
  inputChanges: Array<{ field: string; before: string; after: string }>;
  /** 과목 이동: 같은 과목의 배치 학기 변화(null = 미배치) */
  movedCourses: Array<{ code: string; before: Term | null; after: Term | null }>;
  addedCourses: string[];
  removedCourses: string[];
  creditDiffByTerm: Array<{ term: Term; before: number; after: number }>;
  /** 중단·교환 구간 변화 */
  periodChanges: Array<{ periodId: string; change: "added" | "removed" | "changed" }>;
  completion: {
    before: Term | null;
    after: Term | null;
    /** 한쪽이라도 null이면 null(비교 불가) */
    deltaTerms: number | null;
  };
  newWarnings: PlanWarning[];
  /** 자료·엔진·순위 버전이 다르면 true — 화면에 드러낸다 */
  versionMismatch: { catalog: boolean; engine: boolean; ranking: boolean };
}

// ── 준비사항 v2(PLAN 8.2) ────────────────────────────────

export type GuidanceTiming =
  | { kind: "date"; date: ISODate }
  /** 날짜 미확인: 상대 시점만. 임의 마감일을 만들지 않는다. */
  | {
      kind: "relative";
      anchor: "before_start" | "before_military" | "before_return" | "before_exchange" | "before_term" | "anytime";
      term: Term | null;
      label: string;
    };

export interface GuidanceItemV2 extends GuidanceItem {
  evidence: EvidenceKind;
  status: ConfirmStatus;
  timing: GuidanceTiming;
  /** 관련 PeriodInput.id 또는 학수번호 */
  relatedPeriodIds: string[];
  relatedCourseCodes: string[];
  /** 체크 상태 재사용 판단용. 입력이 바뀌어 관련이 없어지면 키가 달라진다. */
  checkKey: string;
}

export interface GuidanceResultV2 {
  items: GuidanceItemV2[];
}
