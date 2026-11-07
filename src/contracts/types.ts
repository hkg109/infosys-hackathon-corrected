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
