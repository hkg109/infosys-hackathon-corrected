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
export type CareerTrack = "software" | "data" | "security" | "consulting" | "business" | "finance";
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
  /**
   * 유효학기 순번별 계획 학점(후반 여유형·직접 설정). 없으면 모든 학기 creditCap.
   * 서비스 계획 방식이며 학교 공식 권장 학점이 아니다.
   */
  paceBands?: PaceBand[];
  /** 학점 페이스 방식(표시·후보 구분용). 없으면 balanced */
  paceStyle?: PaceStyle;
  /** 입학연도. 확인된 학교 상한(CreditCapRule) 적용 범위를 고를 때만 쓴다. 모르면 null(학교 상한 미적용) */
  admissionYear?: number | null;
  /** 특정 학기만 계획 학점을 낮춘다(사용자 요청). 다른 상한과 함께 가장 작은 값을 쓴다 */
  termCaps?: Array<{ term: Term; credits: number }>;
  /** 과목별 사용자 요청: exclude = 이 계획에서 빼기, not_before = 그 학기 전에는 배치하지 않기 */
  courseRules?: Array<{ code: string; action: "exclude" | "not_before"; term?: Term }>;
  /** 개인 졸업사정의 전공 요건. 없으면 전공 요건을 따지지 않는다 */
  majorRequirement?: MajorRequirement | null;
  /** 전공 400단위 이수학점(전공 이수학점의 일부). 모르면 null → 이수 과목 학수번호로 추정 */
  earnedUpperMajorCredits?: number | null;
}

// ── 전공 요건(개인 졸업사정) ─────────────────────────────

/**
 * 개인 졸업사정 조회에서 확인한 전공 요건. 학교 공통 졸업요건으로 일반화하지 않는다.
 * 각 값 null = 모름(그 요건은 따지지 않는다). 모두 최소 이수학점으로 본다.
 */
export interface MajorRequirement {
  /** 전공학점 요건(총학점에 포함) */
  majorCredits: number | null;
  /** 전공 100~300단위 요건 */
  lowerLevelCredits: number | null;
  /** 전공 400단위 요건 */
  upperLevelCredits: number | null;
  source: "graduation_check" | "user_goal";
}

/** 전공 요건 대비 진행. 단위는 학수번호 첫 숫자로 판단한다(1~3 = 100~300단위, 4 = 400단위, 그 밖 = 단위 미상). */
export interface MajorProgress {
  required: { major: number | null; lower: number | null; upper: number | null };
  /** 이미 이수. upper가 추정값이면 upperEstimated */
  earned: { major: number; lower: number; upper: number; upperEstimated: boolean };
  /** 이 계획에 배치한 추천 전공 과목 학점 */
  planned: { major: number; lower: number; upper: number; unknownLevel: number };
  /** 추천 과목 밖에서 더 골라야 해 '전공 선택 자리'로 넣은 학점(upper·lower는 major의 일부) */
  extra: { major: number; lower: number; upper: number };
  /** 계획대로면 알려진 전공 요건을 모두 채우는지 */
  met: boolean;
}

// ── 학점 페이스(후반 여유형) ─────────────────────────────

/** balanced = 매 학기 같은 상한, late_light = 3·4학년에 줄임(서비스 휴리스틱), custom = 사용자가 학년대별로 지정 */
export type PaceStyle = "balanced" | "late_light" | "custom";

/** fromOrdinal번째 유효학기(1부터)부터 다음 구간 전까지 credits를 계획 상한으로 쓴다. */
export interface PaceBand {
  fromOrdinal: number;
  credits: number;
}

// ── 계산 결과 ─────────────────────────────────────────────

export type WarningCode =
  | "INVALID_INPUT"
  | "TARGET_UNKNOWN"
  | "OFFERING_ASSUMED"
  | "SEMESTER_UNKNOWN"
  | "PREREQ_UNKNOWN"
  | "UNPLACED_COURSE"
  | "SEARCH_LIMIT"
  | "USER_EXCLUDED"
  | "MAJOR_EXTRA"
  | "MAJOR_FILLED"
  | "MAJOR_LEVEL_ESTIMATED"
  | "MIN_CREDITS_FILLED"
  | "CAP_RULE_ASSUMED"
  | "CAP_EXEMPT_LATE";

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
  /** 진로 추천 밖 교육과정표 전공 과목으로 남는 자리를 채운 경우 true */
  filler?: true;
}

export interface PlannedTerm {
  term: Term;
  status: "study" | "break";
  courses: PlacedCourse[];
  /** 표본 외 미배정 전공·교양 학점 슬롯 */
  slotCredits: number;
  /** slotCredits 중 전공 요건을 채우려고 잡은 '전공 선택 자리'(교양 자리로 쓰지 않는다) */
  majorSlotCredits?: number;
  /** majorSlotCredits 중 400단위 자리 */
  upperMajorSlotCredits?: number;
  plannedCredits: number;
  /**
   * 학기 상한(학교 기준 최대 신청학점 + 상한 제외 과목 학점). 화면 “/ 상한 N”은 이 값만 쓴다.
   * 학교 기준 규칙이 없으면 계획 한도(planLimitCredits + 상한 제외 학점). 중단 학기는 없음
   */
  capCredits?: number;
  /** 상한 제외(커리어개발) 가산 전 학교 기본 상한(1·2학년 20, 3·4학년 18). 규칙이 없으면 null */
  baseCapCredits?: number | null;
  /** 상한 밖으로 더한 커리어개발 학점(0 또는 1) */
  capExemptCredits?: number;
  /** 이 학기 계획 한도 = min(학점 페이스, 사용자 학기 제한, 학교 기본 상한). 상한 제외 학점 미포함 */
  planLimitCredits?: number;
  /** 상한에 쓴 학교 기준 규칙 ID */
  capRuleId?: string | null;
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
  /** 전공 요건을 입력했을 때만 */
  majorProgress?: MajorProgress | null;
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
  /** 군 복무 트랙·자격증 검토 자료. 없으면 군대 트랙 비교를 하지 않는다. */
  military?: MilitaryCatalog;
  /** 교환학생 회차·파견교 검토 자료. 없으면 교환 후보를 만들지 않는다. */
  exchange?: ExchangeCatalog;
}

// ── 군 복무 트랙·자격증(검토 자료) ───────────────────────

/** 공식 원문 위치. 화면은 이 링크만 보여 주고 원문 사이트를 직접 호출하지 않는다. */
export interface OfficialSource {
  title: string;
  url: string;
  /** 직접 열어 확인한 날짜 */
  checkedAt: ISODate;
  /** 원문에서 주장을 확인할 수 있는 위치(표·항목 이름) */
  locator: string;
  /** 적용 모집연도·시험연도·회차 표기. 없으면 null */
  appliesTo: string | null;
}

export type MilitaryBranch = "army" | "navy" | "air_force" | "marine";
export type MilitaryRecruitType = "general_enlistment" | "technical_admin" | "katusa" | "air_technical";

export interface MilitaryTrackInfo {
  /** 안정적인 ID(예: "army-general", "katusa") */
  id: string;
  /** 공식 표시 이름 */
  officialName: string;
  branch: MilitaryBranch;
  recruitType: MilitaryRecruitType;
  description: string;
  /** 이런 사람에게(서비스 안내) */
  fitsFor: string[];
  /** 지원자격(공식 원문 요약) */
  eligibility: string[];
  /** 선발 방식(공식 원문 요약) */
  selection: string[];
  relatedMajors: string[];
  /** 선발에 자격증을 반영하는지. 원문에 없으면 unknown */
  certificatesConsidered: "yes" | "no" | "unknown";
  /** 복무기간(개월). 공식 원문에서 확인하지 못하면 null — 추측하지 않는다 */
  serviceMonths: number | null;
  serviceMonthsStatus: ConfirmStatus;
  serviceMonthsNote: string;
  /** 적용 모집연도·회차 */
  appliesTo: string | null;
  sources: OfficialSource[];
  /** 마지막으로 원문을 확인한 날짜. 확인 전이면 null */
  checkedAt: ISODate | null;
  status: ConfirmStatus;
  /** 준비할 것(공식 원문 근거가 있는 것만) */
  prepare: string[];
  cautions: string[];
}

export type CertificateKind = "national_technical" | "national_certified_private" | "private" | "international" | "unknown";

export interface CertificateInfo {
  id: string;
  /** 현재 공식 명칭 */
  officialName: string;
  /** 구 명칭·별칭. 공식 자료로 연결을 확인하지 못했으면 status unknown(같은 자격으로 단정하지 않음) */
  aliases: Array<{ name: string; relation: "former_name" | "alias"; status: ConfirmStatus; sourceUrl: string | null }>;
  /** 등급(1급, 기사 등). 해당 없거나 모르면 null */
  grade: string | null;
  issuer: string | null;
  kind: CertificateKind;
  officialUrl: string | null;
  checkedAt: ISODate | null;
  status: ConfirmStatus;
}

/**
 * 군 트랙 ↔ 자격증의 공식 관계(지원자격·배점·우대). 공식 출처 필수.
 * 진로 준비용 추천(CareerCertificateRecommendation)과 섞지 않는다.
 */
export interface MilitaryCertificateRelation {
  militaryTrackId: string;
  certificateId: string;
  relation: "eligibility" | "score" | "preferred";
  /** 원문의 기준 문장 */
  criterion: string;
  /** 원문에서 확인한 점수. 없으면 null(0으로 바꾸지 않는다) */
  points: number | null;
  appliesTo: string | null;
  sourceUrl: string;
  checkedAt: ISODate | null;
  status: ConfirmStatus;
  note: string;
}

/** 모집 분야의 공식 배점 기준(자격 등급별 등). 개별 자격증 인정과는 별개다. */
export interface MilitaryScoringRule {
  id: string;
  militaryTrackId: string;
  title: string;
  rows: Array<{ label: string; value: string }>;
  note: string;
  appliesTo: string | null;
  source: OfficialSource;
  status: ConfirmStatus;
}

/** 진로 준비용 자격증 추천. 서비스 추천이며 공식 필수 자격이 아니다. */
export interface CareerCertificateRecommendation {
  career: CareerTrack;
  certificateId: string;
  reason: string;
}

export interface MilitaryCatalog {
  catalogVersion: string;
  reviewedAt: ISODate;
  tracks: MilitaryTrackInfo[];
  certificates: CertificateInfo[];
  relations: MilitaryCertificateRelation[];
  scoringRules: MilitaryScoringRule[];
  careerCertificates: CareerCertificateRecommendation[];
  /** 모집회차. 공고가 없는 미래 회차는 날짜 없이 publicationStatus "unknown"으로 둔다 */
  recruitmentCycles?: RecruitmentCycle[];
  /** 같은 회차 중복지원 규칙. 회차를 명시하지 않은 규칙을 다른 연도에 쓰지 않는다 */
  concurrentRules?: ConcurrentApplicationRule[];
  /** 한 곳에 선발되면 다른 지원·입영일자를 어떻게 처리하는지 */
  selectionRules?: SelectionResolutionRule[];
  supplementalRules?: SupplementalRecruitmentRule[];
}

// ── 군 복무 모집 규칙(검토 자료) ─────────────────────────

/** 모집 프로그램 ID. MilitaryTrackInfo.id와 같은 값을 쓴다(예: "katusa", "army-technical") */
export type MilitaryProgramId = string;

export interface RecruitmentCycle {
  id: string;
  programId: MilitaryProgramId;
  /** 사람이 읽는 회차 이름. 예: "2026년 카투사 모집(2027년 입영)" */
  label: string;
  applicationStart: ISODate | null;
  applicationEnd: ISODate | null;
  resultDate: ISODate | null;
  /** 입영일 또는 입영월(YYYY-MM-01). 모르면 null */
  enlistment: ISODate | null;
  /** official = 공고 확인, expected = 과거 일정 등으로 추정(확정 아님), unknown = 공고 미발표 */
  publicationStatus: "official" | "expected" | "unknown";
  /** expected일 때 추정 근거, unknown일 때 확인할 곳 */
  note: string;
  source: OfficialSource | null;
}

export interface ConcurrentApplicationRule {
  id: string;
  leftProgramId: MilitaryProgramId;
  /** "*"는 다른 모든 현역 모집병 */
  rightProgramId: MilitaryProgramId | "*";
  relation: "allowed" | "forbidden" | "conditional" | "unknown";
  /** 이 규칙이 적용되는 회차 ID. 비어 있으면 어떤 회차에도 적용하지 않는다(일반화 금지) */
  appliesToCycleIds: string[];
  conditions: string[];
  source: OfficialSource;
}

export interface SelectionResolutionRule {
  id: string;
  whenSelectedProgramId: MilitaryProgramId;
  affectedProgramId: MilitaryProgramId;
  action: "cancel" | "keep" | "user_priority_order" | "unknown";
  /** 비어 있으면 회차와 무관한 상시 규칙(원문이 회차를 정하지 않은 경우만) */
  appliesToCycleIds: string[];
  note: string;
  source: OfficialSource;
}

export interface SupplementalRecruitmentRule {
  id: string;
  programId: MilitaryProgramId;
  applicationMethod: "first_come" | "scored" | "lottery" | "unknown";
  /** 추가모집에 나오는 특기. 원문에서 확인하지 못하면 null */
  availablePrograms: string[] | null;
  /** 특정 특기가 나온다고 보장하지 않는다 */
  guaranteeSpecificProgram: false;
  conditions: string[];
  /** 확인한 공고의 적용 범위(예: "2026년 11~12월 입영") */
  observedIn: string;
  source: OfficialSource;
}

// ── 군 복무 전략(최소 입력 → 분기형 전략) ───────────────

export type TriState = "yes" | "no" | "unknown";
export type MilitaryGoal = "fast_stable" | "it_experience" | "katusa" | "return_predictable" | "unknown";

/** 사용자가 알려주는 최소 정보. 복무개월·입영일·중복지원 규칙은 묻지 않는다 */
export interface MilitaryPlanningInput {
  serviceNeeded: TriState;
  /** 빈 배열 = 상관없음/모름 */
  preferredBranches: MilitaryBranch[];
  generalArmyAcceptedAsFallback: TriState;
  itRolePriority: "high" | "medium" | "none" | "unknown";
  katusaPreference: "first_priority" | "consider" | "exclude" | "unknown";
  goal: MilitaryGoal;
  /** 반드시 복학해야 하는 학기. 없으면 null */
  mustReturnBy: Term | null;
  katusaEvidence: {
    priorApplication: "none" | "cancelled" | "medical_disqualified" | "other_application" | "unknown";
    /** 인정 가능한 영어 정기시험 성적 보유 여부(점수·응시일은 선택) */
    hasLanguageScore: TriState;
  } | null;
  qualificationCodes: string[];
}

export interface PlannedApplication {
  id: string;
  programId: MilitaryProgramId;
  /** 지원 순서(1부터) */
  order: number;
  /** 이 지원이 겨냥하는 회차. 공고가 없으면 null */
  cycleId: string | null;
  role: "primary" | "parallel_fallback" | "sequential_fallback" | "safety_net" | "supplemental";
  note: string;
}

export interface EligibilityResult {
  programId: MilitaryProgramId;
  status: "eligible" | "ineligible" | "unknown";
  reasons: string[];
  /** unknown일 때 물어볼 한 가지 */
  question: string | null;
}

export type MilitaryBranchCondition = "katusa_selected" | "katusa_not_selected" | "fallback_selected" | "none_selected";
export type MilitaryBranchLabel = "confirmed" | "official_schedule" | "user_assumption" | "awaiting_result" | "check_notice" | "not_computable";

export interface MilitaryOutcomeBranch {
  id: string;
  condition: MilitaryBranchCondition;
  title: string;
  selectedProgramId: MilitaryProgramId | null;
  cancelledApplicationIds: string[];
  /** 이 분기의 복무기간(공식 확인값만). 모르면 null */
  serviceMonths: number | null;
  label: MilitaryBranchLabel;
  nextActions: string[];
}

export interface MilitaryStrategyCandidate {
  /** 결정적 ID(입력·카탈로그가 같으면 같음) */
  id: string;
  title: string;
  summary: string;
  /** 비교표 열: 카투사 제외 / 카투사 우선·동시지원 / 카투사 우선·순차 */
  scenario: "katusa_excluded" | "katusa_parallel" | "katusa_sequential";
  applications: PlannedApplication[];
  eligibility: EligibilityResult[];
  /** 대상 카투사 회차의 중복지원 규칙 평가 */
  concurrency: { relation: ConcurrentApplicationRule["relation"]; cycleId: string | null; ruleId: string | null; note: string } | null;
  branches: MilitaryOutcomeBranch[];
  status: "computable" | "conditional" | "ineligible" | "conflict";
  /** 정렬에 쓴 실제 지표 */
  metrics: {
    goalMet: boolean;
    hasFallback: boolean;
    itMatch: boolean;
    /** 확인 필요 항목 수 */
    uncertainty: number;
    /** 가장 긴 분기의 복무개월. 모르면 null */
    worstServiceMonths: number | null;
  };
  reasons: string[];
  /** 사용자가 바로 알아듣는 위험 문장(중요한 것부터) */
  risks: string[];
  warnings: string[];
  sources: OfficialSource[];
}

export interface MilitaryStrategySet {
  strategies: MilitaryStrategyCandidate[];
  /** 개인 최적 전략 ID. 군 복무 계획이 필요 없으면 null */
  bestId: string | null;
  /** 정보가 부족할 때 물어볼 질문 한 개 */
  followUpQuestion: string | null;
  catalogVersion: string | null;
}

// ── 인기 순위(개인화와 분리) ─────────────────────────────

export interface PopularitySnapshot {
  available: boolean;
  metric: "service_user_selection" | "official_applications";
  scope: string;
  from: ISODate | null;
  to: ISODate | null;
  sampleSize: number | null;
  source: OfficialSource | null;
  /** 시연용 예시면 true(화면에 배지, production 비노출) */
  demo: boolean;
  entries: Array<{ trackKey: string; label: string; rank: 1 | 2 | 3; value: number }>;
  unavailableReason: string | null;
}

/** 카투사 지원·선발 상태 */
export type KatusaStatus = "not_applying" | "preparing" | "applied_waiting" | "selected" | "not_selected" | "undecided";

/** 사용자가 고른 군 복무 트랙과 카투사 우선 희망. 입력에 없으면 기존 병역 후보 생성 그대로 */
export interface MilitaryPlanInput {
  /** 관심 군 복무 트랙 ID(MilitaryTrackInfo.id). 빈 배열 = 트랙 미지정 */
  trackIds: string[];
  /** "카투사에 선발된다면 다른 군 복무 트랙보다 카투사를 우선" */
  katusaPriority: boolean;
  katusaStatus: KatusaStatus;
  /** 보유 자격증 ID */
  certificateIds: string[];
}

/** 후보로 펼칠 군 복무 시나리오 하나 */
export interface MilitaryScenario {
  /** null = 트랙 미지정(기존 병역 기간 그대로) */
  trackId: string | null;
  /** primary = 확정 사용, conditional = 선발 결과에 따른 조건부, fallback = 선발되지 않을 경우, normal = 일반 비교 */
  role: "normal" | "primary" | "conditional" | "fallback";
  label: string;
  /** 복무기간: 공식 확인값 > 사용자 가정 > null */
  months: number | null;
  monthsStatus: ConfirmStatus;
}

export interface MilitaryScenarioResolution {
  scenarios: MilitaryScenario[];
  /** 기본 후보에서 뺀 트랙과 이유 */
  excluded: Array<{ trackId: string; reason: string }>;
  /** 기본 계획에는 쓰지 않고 접어서 보여 줄 대안 */
  alternatives: string[];
}

// ── 교양 자리(placeholder) ──────────────────────────────

/**
 * 학기의 미지정 학점(slotCredits)을 구체화한 교양 자리. 실제 과목이 아니며 과목 자료에 넣지 않는다.
 * 구체화한 교양 학점 + 남은 slot = 원래 slotCredits (총학점에 다시 더하지 않는다)
 */
export interface GeneralEducationPlaceholder {
  /** 안정적인 ID. 삭제해도 다른 항목의 ID·라벨은 바뀌지 않는다 */
  id: string;
  /** "교양 A" 형식 */
  label: string;
  credits: 2 | 3;
  term: Term;
  origin: "user" | "demo" | "engine";
  status: "placeholder";
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
  /** 전공 400단위 이수학점(전공 이수학점의 일부). 없거나 null이면 이수 과목으로 추정 */
  earnedUpperMajorCredits?: number | null;
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
  /** 개인 졸업사정의 전공 요건(전공학점·100~300단위·400단위). 없으면 전공 요건을 따지지 않는다 */
  majorRequirement?: MajorRequirement | null;
  requiredCourses: RequiredCoursesInput | null;
  /** 관심 진로. 빈 배열 = 미정 → 두 진로 모두 탐색, "미정" 표시 */
  careers: CareerTrack[];
  pace: PaceInput;
  military: MilitaryStatus;
  leave: EventPlan;
  exchange: EventPlan;
  periods: PeriodInput[];
  priorities: PriorityKey[];
  /** 비교할 학점 페이스 방식. 없으면 ["balanced"] */
  paceStyles?: PaceStyle[];
  /** paceStyles에 custom이 있을 때 쓰는 사용자 지정 구간 */
  customPaceBands?: PaceBand[] | null;
  /** 군 복무 트랙·카투사 우선 희망. 없으면 기존 병역 후보 생성 그대로 */
  militaryPlan?: MilitaryPlanInput | null;
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

export interface PlannedTermV2 extends Omit<PlannedTerm, "status" | "capCredits" | "capRuleId"> {
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
  /** 학점 페이스 방식. 없으면 balanced */
  paceStyle?: PaceStyle;
  /** 군 복무 트랙. 트랙을 펼치지 않았으면 null/없음 */
  militaryTrackId?: string | null;
  /** 군 복무 시나리오 역할(조건부 카투사·대체 트랙) */
  militaryRole?: MilitaryScenario["role"];
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
  /** 군 복무 트랙을 펼쳤을 때: 시나리오·제외 이유·대안 */
  military?: MilitaryScenarioResolution | null;
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

// ── 교환학생(파견교환) 계획 ─────────────────────────────
// 명세: ah-matda-exchange-student-planner-prompt.md, 범위: docs/PLAN.md 10장.
// 공식 사실·공식 값 계산·서비스 분석·예상·사용자 입력·이전 회차·충돌·미정을 구분한다.

export type TruthState =
  | "verified_official"
  | "derived"
  | "service_analysis"
  | "forecast"
  | "user_provided"
  | "stale"
  | "source_conflict"
  | "unknown";

export type ExchangeEvidenceKind =
  | "hanyang_notice"
  | "hanyang_attachment_pdf"
  | "hanyang_partner_xlsx"
  | "hanyang_credit_policy"
  | "host_official_page"
  | "host_course_catalog"
  | "host_fact_sheet"
  | "test_provider_official"
  | "ranking_provider"
  | "user_document"
  | "service_rule";

export interface ExchangeSourceRef {
  id: string;
  title: string;
  url: string | null;
  evidenceKind: ExchangeEvidenceKind;
  publishedAt: ISODate | null;
  updatedAt: ISODate | null;
  checkedAt: ISODate;
  fileName?: string;
  page?: number;
  sheet?: string;
  cellRange?: string;
  excerptSummary: string;
  /** 사람 검토자. 자동 추출만 했으면 null(검토 전) */
  reviewer: string | null;
}

export interface ValidityScope {
  applicationCycleId: string | null;
  exchangeTermId: string | null;
  hostAcademicPeriod: string | null;
  effectiveFrom: ISODate | null;
  effectiveUntil: ISODate | null;
}

export interface SourcedValue<T> {
  value: T | null;
  truth: TruthState;
  sourceRefs: string[];
  validity: ValidityScope;
  derivation?: string;
  note?: string;
}

export type ExchangeRuleKind =
  | "campus"
  | "enrollment"
  | "completed_terms_min"
  | "completed_terms_max"
  | "gpa_min"
  | "language"
  | "major_restriction"
  | "prior_exchange"
  | "consecutive_exchange"
  | "final_regular_term"
  | "transfer_terms"
  | "citizenship"
  | "other";

export interface ExchangeEligibilityRule {
  id: string;
  owner: "hanyang" | "host";
  kind: ExchangeRuleKind;
  operator: "gte" | "lte" | "eq" | "in" | "not_in" | "custom";
  /** 비교 값(예: 2, 2.5). 사람이 읽는 조건은 source.value */
  operand: number | string | string[] | null;
  /** 만점 체계 등 비교 단위(예: GPA 4.5) */
  scale?: number | null;
  source: SourcedValue<string>;
  blocking: boolean;
}

export interface HanyangExchangeCycle {
  id: string;
  label: string;
  /** 파견 학기(한양대 학기 기준) */
  targetHomeTerm: Term;
  /** announced = 공고 중, closed = 마감, forecast = 과거 패턴 예상(학교 확정 불가), unknown */
  officialStatus: "announced" | "closed" | "forecast" | "unknown";
  postedAt: SourcedValue<ISODate>;
  applicationWindow: SourcedValue<{ start: ISODate; end: ISODate }>;
  resultDate: SourcedValue<ISODate>;
  selectionMethod: SourcedValue<string>;
  commonEligibilityRules: ExchangeEligibilityRule[];
  cancellationRules: SourcedValue<string[]>;
  tuition: SourcedValue<string>;
  creditRecognition: SourcedValue<string[]>;
  sourceRefs: string[];
}

export interface ExchangeLanguageRequirement {
  test: "TOEFL_IBT" | "TOEFL_IBT_2026" | "IELTS_ACADEMIC" | "TOEIC" | "OTHER";
  /** 점수 체계 버전(예: "120점 만점", "6점 만점(2026-01 이후)") */
  scaleVersion: string;
  /** 숫자로 확인된 총점 하한. 원문이 숫자가 아니면 null */
  total: number | null;
  /** 영역별 최소점수 요구가 있는지(원문 문장 기준) */
  subscoresRequired: boolean | null;
  raw: string;
}

export interface CourseAccessRule {
  id: string;
  scope: "faculty" | "department" | "subject" | "course";
  target: string;
  access: "open" | "limited" | "closed" | "unknown";
  appliesTo: string;
  effectiveTerm: string | null;
  conditions: string[];
  source: SourcedValue<string>;
}

export interface PartnerOffering {
  id: string;
  universityName: string;
  country: string;
  /** 엑셀 언어권(영미·유럽·아시아 등) */
  region: string;
  applicationCycleId: string;
  hostAcademicPeriod: string;
  academicSystem: SourcedValue<string>;
  durationOptions: SourcedValue<Array<"one_term" | "one_year">>;
  quota: SourcedValue<number>;
  gpa: SourcedValue<{ min: number; scale: number } | null>;
  gpaRaw: string;
  language: ExchangeLanguageRequirement[];
  nationalityRestriction: SourcedValue<string>;
  closedDepartments: SourcedValue<string>;
  courseAccess: CourseAccessRule[];
  creditLoad: SourcedValue<{ min: string; max: string }>;
  housing: { onCampus: "available_not_guaranteed" | "unavailable" | "unknown"; source: SourcedValue<string> };
  calendar: SourcedValue<{ start: ISODate; end: ISODate }>;
  deadlines: { nomination: SourcedValue<ISODate>; application: SourcedValue<ISODate> };
  links: { exchange: string | null; courses: string | null };
  /** 엑셀 비고·특이사항 원문 */
  notes: string[];
  sourceRefs: string[];
  reviewStatus: "candidate" | "reviewed" | "rejected" | "stale";
}

export interface ExchangeCatalog {
  catalogVersion: string;
  reviewedAt: ISODate;
  sources: ExchangeSourceRef[];
  cycles: HanyangExchangeCycle[];
  offerings: PartnerOffering[];
  /** 한양대가 파견교 엑셀에 넣은 GPA 변환식(4.5 → 다른 만점). 파견교가 이 값을 받는다는 보장은 아니다 */
  gpaConversions: SourcedValue<Array<{ scale: number; formula: string }>>;
}

export type ExchangePriority = "major_course_access" | "prestige" | "graduation_fit" | "low_cost" | "language_fit" | "housing" | "country_culture";

export interface ExchangeLanguageEvidence {
  test: "IELTS_ACADEMIC" | "TOEFL_IBT" | "TOEFL_IBT_2026" | "TOEIC" | "OTHER";
  total: number | null;
  testedAt: ISODate | null;
  evidenceStatus: "user_entered" | "planned" | "unknown";
}

/** 사용자가 알려주는 최소 정보. 학교별 TO·마감·GPA 기준·과목 제한은 묻지 않는다 */
export interface ExchangePlanningInput {
  intent: "committed" | "conditional" | "considering" | "none";
  targetTerm: { mode: "fixed"; term: Term } | { mode: "next_spring" | "next_fall" | "recommend" | "unknown" };
  duration: "one_term" | "one_year" | "either" | "recommend";
  /** 첫 번째가 최우선. 최대 2개 */
  priorities: ExchangePriority[];
  languageStatus: "has_score" | "preparing" | "none" | "unknown";
  languageEvidence: ExchangeLanguageEvidence[];
  budget: "save" | "moderate" | "flexible" | "unknown";
  housing: "guaranteed_required" | "preferred" | "off_campus_ok" | "unknown";
  academic: {
    campus: string | null;
    completedTermsNow: number | null;
    /** 4.5 만점 누적 GPA. 모르면 null */
    cumulativeGpa: number | null;
    majorArrangement: "single" | "multiple_major" | "minor" | "double_degree" | "unknown";
    transferStudent: boolean | null;
    priorExchangeTerms: number | null;
    /** 계획 시작 학기 */
    planStartTerm: Term | null;
  };
}

export interface EligibilityEvaluation {
  ruleId: string;
  owner: "hanyang" | "host";
  label: string;
  result: "pass" | "fail" | "unknown";
  reason: string;
  /** 판정에 더 필요한 입력 */
  missingInputIds: string[];
  truth: TruthState;
  sourceRefs: string[];
}

export interface ExchangePeriodConflict {
  /** 군 전략 분기 ID(없으면 고정 기간) */
  branchId: string | null;
  label: string;
  kind: "hard" | "conditional";
  detail: string;
}

export interface ExchangeMatchCandidate {
  /** 결정적 ID: offering + 파견 학기 + 기간 + 인정 상태 */
  id: string;
  offeringId: string;
  inputFingerprint: string;
  exchangeTerm: Term;
  duration: "one_term" | "one_year";
  status: "eligible" | "conditional" | "ineligible" | "deadline_passed" | "schedule_conflict";
  /** 후보 자료가 목표 회차 자료가 아니면 true(이전 회차 기준) */
  staleCycle: boolean;
  eligibility: EligibilityEvaluation[];
  courseAccess: { status: "limited" | "unknown" | "closed"; reasons: string[] };
  recognitionSummary: { confirmedCredits: number | null; countsAsTerm: boolean | null; status: "unknown" };
  militaryConflicts: ExchangePeriodConflict[];
  /** 정렬·백업 다양화에 쓰는 핵심 위험 키 */
  riskKeys: Array<"course_access" | "language" | "housing" | "gpa" | "stale" | "quota_small" | "schedule">;
  reasons: string[];
  risks: string[];
  sourceRefs: string[];
}

export interface ExchangeAction {
  id: string;
  checkKey: string;
  title: string;
  detail: string;
  timing: "before_application" | "after_home_selection" | "before_exchange" | "during_exchange" | "after_exchange";
  dueAt: SourcedValue<ISODate>;
  status: "todo" | "blocked" | "done" | "not_applicable";
  blockingReason: string | null;
  sourceRefs: string[];
}

export interface ExchangeOutcomeBranch {
  id: string;
  parentId: string | null;
  event:
    | "hanyang_selected"
    | "hanyang_not_selected"
    | "host_accepted"
    | "host_rejected"
    | "primary_courses_approved"
    | "backup_courses_required"
    | "housing_secured"
    | "housing_not_secured"
    | "credit_fully_recognized"
    | "credit_partially_recognized"
    | "credit_pending"
    | "policy_changed"
    | "user_cancelled";
  title: string;
  /** 확률 근거가 없으므로 항상 null */
  probability: null;
  nextActions: string[];
}

export interface ExchangeCandidateSet {
  catalogVersion: string;
  inputFingerprint: string;
  /** 목표로 본 회차와 그 상태 */
  targetCycle: { id: string; label: string; officialStatus: HanyangExchangeCycle["officialStatus"] } | null;
  /** 학교 자료를 가져온 회차(목표 회차가 forecast면 이전 회차) */
  dataCycleId: string | null;
  common: { status: "eligible" | "conditional" | "ineligible"; evaluations: EligibilityEvaluation[] };
  primary: ExchangeMatchCandidate | null;
  backups: ExchangeMatchCandidate[];
  /** 정렬된 전체 후보(학교 탐색 화면용) */
  all: ExchangeMatchCandidate[];
  /** 세 후보가 같은 미확인 자료에 의존하면 true */
  wholeSetConditional: boolean;
  emptyReason: string | null;
  branches: ExchangeOutcomeBranch[];
  actions: ExchangeAction[];
}

// ── 피드백 채팅 → 계획 수정 ─────────────────────────────
// 채팅(Claude 또는 규칙)은 이 편집만 제안하고, 학점·학기는 엔진이 다시 계산한다.

export type PlanEdit =
  | { type: "set_credit_cap"; credits: number }
  | { type: "set_pace_style"; style: "balanced" | "late_light" }
  | { type: "set_term_cap"; term: Term; credits: number }
  | { type: "clear_term_cap"; term: Term }
  | { type: "add_leave"; term: Term }
  | { type: "remove_leave"; term: Term }
  | { type: "exclude_course"; code: string }
  | { type: "restore_course"; code: string }
  | { type: "defer_course"; code: string; term: Term }
  | { type: "set_target_credits"; credits: number };

/** /api/feedback 응답 */
export interface FeedbackApiReply {
  reply: string;
  edits: PlanEdit[];
  /** 지금 계획 모델로는 할 수 없는 요청(계절학기, 교수 선택 등) */
  notSupported: string[];
}

// ── 성적표 스크린샷 읽기(Claude 이미지 인식) ─────────────
/** /api/transcript-image 응답. 화면은 이 값을 바로 반영하지 않고 검토 창을 거친다 */
export interface TranscriptImageReply {
  rows: Array<{ term: string | null; category: string | null; code: string | null; name: string | null; credits: number | null; grade: string | null }>;
  summary: {
    earnedCredits: number | null;
    majorCredits: number | null;
    targetCredits: number | null;
    /** 졸업사정 요건 열의 전공학점·100~300단위·400단위 기준, 400단위 취득학점. 화면에 분명할 때만 */
    majorRequiredCredits?: number | null;
    majorLowerRequiredCredits?: number | null;
    majorUpperRequiredCredits?: number | null;
    majorUpperEarnedCredits?: number | null;
  };
  /** 성적표로 보이지 않거나 글자를 읽을 수 없으면 true */
  unreadable: boolean;
}
