import type { ExchangePrefs } from "./exchangePrefs";
import { militaryPlanFor, type MilitaryPrefs } from "./militaryPrefs";
import type {
  CareerTrack,
  Dataset,
  ISODate,
  KatusaStatus,
  PaceBand,
  PaceStyle,
  PeriodInput,
  PlanInput,
  PlanInputV2,
  PriorityKey,
  Term,
  TrackCandidate,
} from "@/contracts/types";
import { addMonths, DEFAULT_PRIORITIES, termIndex, termRange, toEngineInput, validatePlanInputV2 } from "@/engine";
import { isBlocked, nextTerm, overlaps } from "@/engine/terms";
import { resolvePeriodRange } from "@/engine/inputV2";
import { answeredCount } from "./recommend";

/**
 * 01 아(내 정보) 질문형 입력 값. 질문 하나에 값 하나.
 * null = 아직 답하지 않음(0과 구분한다). 학교 수치(목표학점·복무기간)는 사용자가 적은 값만 쓴다.
 */
export interface Draft {
  schemaVersion: 4;
  name: string;
  admissionYear: number | null;
  /** 실제로 마친 유효학기 수(휴학·군 복무 학기 제외) */
  completedTerms: number | null;
  startTerm: Term | null;
  earnedCredits: number | null;
  earnedMajorCredits: number | null;
  completedCourseCodes: string[];
  /** 이수 과목 질문에 답했는지(빈 배열 = 들은 학과 과목 없음으로 확인) */
  coursesConfirmed: boolean;
  /** 이수 현황을 채운 방법. import = 성적표 가져오기 후 확인, manual = 직접 입력. 없으면 아직 고르지 않음 */
  progressMode?: "import" | "manual" | null;
  targetCredits: number | null;
  /** 목표학점 출처. graduation_check = 개인 졸업사정 조회 결과(공식 졸업학점으로 일반화하지 않음) */
  targetSource: "graduation_check" | "user_goal" | null;
  /** 관심 진로. unsure = 질문으로 추천받기 */
  career: CareerTrack | "unsure" | null;
  /** 진로 추천 질문 id → 고른 선택지 id */
  answers: Record<string, string>;
  /** 학기당 희망 학점. compare = 15·18·20 비교 */
  paceCredits: number | "compare" | null;
  /** compare = 균형형과 후반 여유형 비교 */
  paceStyle: PaceStyle | "compare" | null;
  /** 직접 설정: 1·2학년 / 3학년 / 4학년 이후 학기당 학점 */
  customPace: { early: number; year3: number; year4: number } | null;
  /** 군 복무 최소 질문의 답(선호 군·중요한 것·카투사). 있으면 군 전략 엔진으로 모집 분야를 정한다 */
  militaryPrefs?: MilitaryPrefs | null;
  /** 교환학생 최소 질문의 답 */
  exchangePrefs?: ExchangePrefs | null;
  /** 고른 교환 전략(선택 당시 스냅샷). 인정학점·유효학기는 미정 그대로 보존한다 */
  exchangeChoice?: ExchangeChoice | null;
  military: {
    /** done = 마침, planned = 다녀올 예정, undecided = 고민 중, none = 해당 없음 */
    status: "done" | "planned" | "undecided" | "none" | null;
    /** 관심 군 복무 트랙 ID(검토 자료). 빈 배열 = 아직 모름 */
    trackIds: string[];
    /** 입대 시점: recommend = 학년 마친 시점별 비교, fixed = 입영일 확정 */
    timing: "recommend" | "fixed";
    startDate: ISODate | null;
    /** 사용자가 직접 확인한 예상 복무기간(개월). 공식 확인값이 있으면 그 값을 우선한다 */
    months: number | null;
    /** 보유 자격증 ID */
    certificateIds: string[];
  };
  katusa: {
    /** "카투사에 선발된다면 다른 군 복무 트랙보다 카투사를 우선" */
    priority: boolean | null;
    status: KatusaStatus;
  };
  leave: {
    mode: "none" | "pick" | null;
    /** 휴학 학기 전까지 마친 학기 수 */
    ordinal: number | null;
  };
  exchange: {
    mode: "none" | "recommend" | "pick" | null;
    ordinal: number | null;
  };
  priority: PriorityKey | null;
  /** 테스트 프로필로 불러온 경우(가상 데이터) */
  demo: { profileId: string; label: string; genEd: Array<{ studyIndex: number; credits: 2 | 3 }> } | null;
}

/** 교환학생 결과에서 고른 전략. 다시 계산하지 않고 이 값을 로드맵·출력이 함께 쓴다 */
export interface ExchangeChoice {
  candidateId: string;
  offeringId: string;
  universityName: string;
  country: string;
  term: Term;
  duration: "one_term" | "one_year";
  status: string;
  staleCycle: boolean;
  backupNames: string[];
  catalogVersion: string;
  inputFingerprint: string;
  recognition: { credits: null; countsAsTerm: null; status: "unknown" };
  selectedAt: string;
}

/** 오늘 기준으로 처음 계획할 학기(사용자가 바꿀 수 있는 기본값). */
export function upcomingTerm(today: ISODate): Term {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (month <= 2) return { year, season: 1 };
  if (month <= 8) return { year, season: 2 };
  return { year: year + 1, season: 1 };
}

export function todayISO(): ISODate {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function blankDraft(today: ISODate): Draft {
  return {
    schemaVersion: 4,
    name: "",
    admissionYear: null,
    completedTerms: null,
    startTerm: today ? upcomingTerm(today) : null,
    earnedCredits: null,
    earnedMajorCredits: null,
    completedCourseCodes: [],
    coursesConfirmed: false,
    progressMode: null,
    targetCredits: null,
    targetSource: null,
    career: null,
    answers: {},
    paceCredits: null,
    paceStyle: null,
    customPace: null,
    military: { status: null, trackIds: [], timing: "recommend", startDate: null, months: null, certificateIds: [] },
    katusa: { priority: null, status: "undecided" },
    leave: { mode: null, ordinal: null },
    exchange: { mode: null, ordinal: null },
    priority: null,
    demo: null,
  };
}

export const MIN_ANSWERS = 3;

/** 군 복무 기간을 계획에 넣는지 */
export const needsMilitary = (d: Draft) => d.military.status === "planned" || d.military.status === "undecided";

/** 마친 학기 수가 ordinal이 되는 첫 학기(군 복무·교환 구간은 건너뜀) */
export function termAfterOrdinal(input: PlanInputV2, ordinal: number, skipKinds: PeriodInput["kind"][] = ["military"]): Term | null {
  if (!input.startTerm) return null;
  const ranges = input.periods.flatMap((p) => {
    const r = resolvePeriodRange(p);
    return r && skipKinds.includes(p.kind) ? [r] : [];
  });
  let done = input.progress.completedTerms ?? 0;
  let t = input.startTerm;
  for (let i = 0; i < 24; i++, t = nextTerm(t)) {
    if (ranges.some((r) => overlaps(termRange(t), r))) continue;
    if (done >= ordinal) return t;
    done++;
  }
  return null;
}

function paceBandsOf(d: Draft): PaceBand[] | null {
  if (!d.customPace) return null;
  return [
    { fromOrdinal: 1, credits: d.customPace.early },
    { fromOrdinal: 5, credits: d.customPace.year3 },
    { fromOrdinal: 7, credits: d.customPace.year4 },
  ];
}

/** 추천 계산에 넘기는 v2 입력. 진로는 넘겨받은 것만, 학점 페이스는 고른 값(또는 비교값)으로 펼친다. */
export function draftToInputV2(draft: Draft, dataset: Dataset, careers: CareerTrack[]): PlanInputV2 {
  const m = draft.military;
  const withMil = needsMilitary(draft);
  const paceStyles: PaceStyle[] =
    draft.paceStyle === "compare" ? ["balanced", "late_light"] : draft.paceStyle ? [draft.paceStyle] : ["balanced"];
  const priority = draft.priority ?? "fast_completion";
  const base: PlanInputV2 = {
    schemaVersion: 2,
    displayName: draft.name || null,
    campus: dataset.campus,
    department: dataset.department,
    curriculum: { admissionYear: draft.admissionYear, appliedCurriculum: null, status: "unknown" },
    startTerm: draft.startTerm,
    progress: {
      completedTerms: draft.completedTerms,
      earnedCredits: draft.earnedCredits,
      earnedMajorCredits: draft.earnedMajorCredits,
      completedCourseCodes: draft.coursesConfirmed || draft.completedCourseCodes.length > 0 ? draft.completedCourseCodes : null,
      inProgressCourseCodes: [],
      unrecognizedLines: [],
    },
    target:
      draft.targetCredits === null
        ? null
        : { value: draft.targetCredits, source: draft.targetSource ?? "user_goal", checkedAt: null },
    requiredCourses: null,
    careers,
    pace:
      draft.paceCredits === null || draft.paceCredits === "compare"
        ? { mode: "compare", options: null }
        : { mode: "fixed", credits: draft.paceCredits },
    military: withMil ? (m.status === "planned" ? "planned" : "undecided") : m.status === "done" ? "done" : "not_applicable",
    leave: draft.leave.mode === "pick" ? "included" : "none",
    exchange: "none",
    periods: withMil
      ? [
          {
            id: "mil-1",
            kind: "military",
            timing: m.timing === "fixed" ? "fixed" : "flexible",
            startDate: m.timing === "fixed" ? m.startDate : null,
            endDate: null,
            durationMonths: m.months,
            returnTerm: null,
            status: "user_assumption",
          },
        ]
      : [],
    priorities: [priority, ...DEFAULT_PRIORITIES.filter((p) => p !== priority)],
    paceStyles,
    customPaceBands: draft.paceStyle === "custom" ? paceBandsOf(draft) : null,
    militaryPlan: withMil ? militaryPlanFor(draft, dataset as Parameters<typeof militaryPlanFor>[1]) : null,
  };
  // 휴학: 마친 학기 수가 ordinal이 되는 첫 학기 한 학기(군 복무 구간은 피함)
  if (draft.leave.mode === "pick" && draft.leave.ordinal !== null) {
    const t = termAfterOrdinal(base, draft.leave.ordinal);
    if (t) {
      const r = termRange(t);
      base.periods = [
        ...base.periods,
        { id: "leave-1", kind: "leave", timing: "fixed", startDate: r.start, endDate: r.end, durationMonths: null, returnTerm: null, status: "user_assumption" },
      ];
    }
  }
  return base;
}

/** 후보를 로드맵 화면이 쓰는 고정 입력(v1)으로 바꾼다. */
export function candidatePlanInput(c: TrackCandidate): PlanInput | null {
  return toEngineInput(c.input, c.key.career, c.key.paceCredits, c.key.paceStyle ?? "balanced");
}

/** 트랙을 만들기 전 전체 검사. 없으면 null */
export function draftProblem(draft: Draft, dataset: Dataset | null, today: ISODate = ""): { step: string; message: string } | null {
  if (draft.completedTerms === null) return { step: "completed", message: "마친 학기 수를 알려 주세요." };
  if (!draft.startTerm) return { step: "start", message: "계획을 시작할 학기를 골라 주세요." };
  const manual = draft.progressMode === "manual";
  if (draft.earnedCredits === null) return { step: manual ? "credits" : "transcript", message: "지금까지 이수한 총학점을 알려 주세요." };
  if (draft.earnedMajorCredits === null) return { step: manual ? "major" : "transcript", message: "그중 전공학점을 알려 주세요." };
  if (draft.career === "unsure" && answeredCount(draft.answers) < MIN_ANSWERS)
    return { step: "quiz", message: `진로 추천 질문에 ${MIN_ANSWERS}개 이상 답해 주세요.` };
  if (draft.military.timing === "fixed" && needsMilitary(draft) && !draft.military.startDate)
    return { step: "military-goal", message: "이미 정해진 입영일을 입력해 주세요." };
  if (draft.exchange.mode === "pick" && draft.exchange.ordinal === null) return { step: "exchange", message: "가고 싶은 학기를 골라 주세요." };
  if (draft.leave.mode === "pick" && draft.leave.ordinal === null) return { step: "leave", message: "휴학할 시점을 골라 주세요." };
  if (draft.paceStyle === "custom" && !draft.customPace) return { step: "late", message: "학년별 학점을 정해 주세요." };
  if (!dataset) return { step: "", message: "학과 자료를 불러오는 중이에요." };
  const errors = validatePlanInputV2(draftToInputV2(draft, dataset, ["software"]), { today: today || undefined }).filter(
    (i) => i.severity === "error",
  );
  if (errors[0]) {
    const step = fieldStep(errors[0].field);
    return { step: !manual && (step === "credits" || step === "major") ? "transcript" : step, message: errors[0].message };
  }
  return null;
}

/** 입력 오류 경로 → 그 값을 묻는 질문 */
function fieldStep(field: string): string {
  if (field.startsWith("startTerm")) return "start";
  if (field === "progress.completedTerms") return "completed";
  if (field === "progress.earnedMajorCredits") return "major";
  if (field.startsWith("progress.earned")) return "credits";
  if (field === "target") return "target";
  if (field.startsWith("periods")) return "military-goal";
  if (field === "customPaceBands") return "late";
  return "review";
}

/** 군 복무 구간을 학기 단위(6개월)로 당기거나 미룬다. */
export function shiftMilitary(input: PlanInput, terms: number): PlanInput {
  if (terms === 0) return input;
  return {
    ...input,
    breaks: input.breaks.map((b) =>
      b.kind === "military"
        ? { ...b, startDate: addMonths(b.startDate, terms * 6), endDate: addMonths(b.endDate, terms * 6) }
        : b,
    ),
  };
}

/** 로드맵에 보여 줄 군 복무 요약: 결과의 학기 배치에서 읽는다(다시 계산하지 않는다). */
export function militarySummary(
  input: PlanInput,
  result: { terms: Array<{ term: Term; status: string }> },
): { first: Term; back: Term | null; count: number } | null {
  const mil = input.breaks.filter((b) => b.kind === "military");
  if (mil.length === 0) return null;
  const blocked = result.terms.filter((t) => t.status === "break" && isBlocked(t.term, mil));
  if (blocked.length === 0) return null;
  const last = blocked[blocked.length - 1];
  const back = result.terms.find((t) => t.status === "study" && termIndex(t.term) > termIndex(last.term))?.term ?? null;
  return { first: blocked[0].term, back, count: blocked.length };
}

/** "2학년 1학기" 같은 학년 표시. 마친 학기 수 기준(0부터) */
export function gradeLabel(ordinal: number): string {
  return `${Math.floor(ordinal / 2) + 1}학년 ${(ordinal % 2) + 1}학기`;
}

/** 학기의 계획용 달 범위 표시 */
export function termMonths(term: Term): string {
  return term.season === 1 ? "3월 – 6월" : "9월 – 12월";
}

export const termStartDate = (t: Term) => termRange(t).start;
