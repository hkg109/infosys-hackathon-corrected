import type {
  CareerTrack,
  Dataset,
  ISODate,
  PlanInput,
  PlanInputV2,
  PriorityKey,
  Term,
  TrackCandidate,
} from "@/contracts/types";
import { addMonths, DEFAULT_PRIORITIES, termIndex, termRange, toEngineInput, validatePlanInputV2 } from "@/engine";
import { isBlocked } from "@/engine/terms";
import { answeredCount } from "./recommend";

/**
 * 정보 입력 화면의 값. 진로와 입대 시기는 사용자가 정하지 않고 다음 화면에서 추천한다.
 * 학교 수치(목표학점·복무기간)는 채우지 않고 사용자가 고른 값만 쓴다.
 */
export interface Draft {
  schemaVersion: 3;
  name: string;
  admissionYear: number | null;
  completedTerms: number;
  earnedCredits: number;
  earnedMajorCredits: number;
  completedCourseCodes: string[];
  targetCredits: number | null;
  startTerm: Term;
  /** 질문 id → 고른 선택지 id */
  answers: Record<string, string>;
  military: {
    /** recommend = 시기 추천받기, fixed = 입영일이 정해짐, none = 해당 없음 */
    mode: "recommend" | "fixed" | "none";
    /** 사용자가 고른 예상 복무 기간(개월) */
    months: number | null;
    /** mode가 fixed일 때 입영일 */
    startDate: ISODate | null;
  };
  exchange: {
    /** none = 생각 없음, recommend = 시기 추천받기, pick = 가고 싶은 학년·학기가 있음 */
    mode: "none" | "recommend" | "pick";
    /** pick일 때: 교환 학기 전까지 마친 학기 수(예: 3학년 1학기 = 4) */
    ordinal: number | null;
  };
  priority: PriorityKey;
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
    schemaVersion: 3,
    name: "",
    admissionYear: null,
    completedTerms: 0,
    earnedCredits: 0,
    earnedMajorCredits: 0,
    completedCourseCodes: [],
    targetCredits: null,
    startTerm: upcomingTerm(today),
    answers: {},
    military: { mode: "none", months: null, startDate: null },
    exchange: { mode: "none", ordinal: null },
    priority: "fast_completion",
  };
}

export const MIN_ANSWERS = 3;

/** 추천 계산에 넘기는 v2 입력. 진로는 넘겨받은 것만, 학점 페이스는 15·18·20 비교로 펼친다. */
export function draftToInputV2(draft: Draft, dataset: Dataset, careers: CareerTrack[]): PlanInputV2 {
  const m = draft.military;
  return {
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
      completedCourseCodes: draft.completedCourseCodes,
      inProgressCourseCodes: [],
      unrecognizedLines: [],
    },
    target: draft.targetCredits === null ? null : { value: draft.targetCredits, source: "user_goal", checkedAt: null },
    requiredCourses: null,
    careers,
    pace: { mode: "compare", options: null },
    military: m.mode === "none" ? "not_applicable" : "planned",
    leave: "none",
    exchange: "none",
    periods:
      m.mode === "none"
        ? []
        : [
            {
              id: "mil-1",
              kind: "military",
              timing: m.mode === "fixed" ? "fixed" : "flexible",
              startDate: m.mode === "fixed" ? m.startDate : null,
              endDate: null,
              durationMonths: m.months,
              returnTerm: null,
              status: "user_assumption",
            },
          ],
    priorities: [draft.priority, ...DEFAULT_PRIORITIES.filter((p) => p !== draft.priority)],
  };
}

/** 입력 단계별로 다음으로 넘어가기 전에 막을 문제. 없으면 null */
export function stepProblem(step: string, draft: Draft): string | null {
  switch (step) {
    case "record":
      if (draft.earnedMajorCredits > draft.earnedCredits) return "전공학점은 총 이수학점 안에 포함되어야 해요.";
      if (draft.earnedCredits < 0 || draft.earnedMajorCredits < 0) return "학점은 0 이상이어야 해요.";
      return null;
    case "interest":
      return answeredCount(draft.answers) < MIN_ANSWERS ? `질문에 ${MIN_ANSWERS}개 이상 답해 주세요.` : null;
    case "military":
      if (draft.military.mode !== "none" && draft.military.months === null) return "예상 복무 기간을 골라 주세요.";
      if (draft.military.mode === "fixed" && !draft.military.startDate) return "입영일을 입력해 주세요.";
      return null;
    case "exchange":
      return draft.exchange.mode === "pick" && draft.exchange.ordinal === null ? "가고 싶은 학기를 골라 주세요." : null;
    default:
      return null;
  }
}

/** 트랙을 만들기 전 전체 검사. 없으면 null */
export function draftProblem(draft: Draft, dataset: Dataset | null): string | null {
  for (const step of ["record", "interest", "military", "exchange"]) {
    const p = stepProblem(step, draft);
    if (p) return p;
  }
  if (!dataset) return "학과 자료를 불러오는 중이에요.";
  const errors = validatePlanInputV2(draftToInputV2(draft, dataset, ["software"])).filter((i) => i.severity === "error");
  return errors[0]?.message ?? null;
}

/** 후보를 로드맵 화면이 쓰는 고정 입력(v1)으로 바꾼다. */
export function candidatePlanInput(c: TrackCandidate): PlanInput | null {
  return toEngineInput(c.input, c.key.career, c.key.paceCredits);
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

/** "2학년 1학기" 같은 학년 표시. 마친 학기 수 + 이번 계획에서 다닌 학기 수 */
export function gradeLabel(ordinal: number): string {
  return `${Math.floor(ordinal / 2) + 1}학년 ${(ordinal % 2) + 1}학기`;
}

/** 학기의 계획용 달 범위 표시 */
export function termMonths(term: Term): string {
  return term.season === 1 ? "3월 – 6월" : "9월 – 12월";
}

export const termStartDate = (t: Term) => termRange(t).start;
