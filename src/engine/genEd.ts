import type { Dataset, GeneralEducationPlaceholder, PlacedCourse, Term } from "@/contracts/types";

/** v1·v2 학기 결과 공통 모양 */
export interface TermLike {
  term: Term;
  status: string;
  courses: PlacedCourse[];
  slotCredits: number;
  /** slotCredits 중 전공 선택 자리(교양 자리로 쓰지 않는다) */
  majorSlotCredits?: number;
  plannedCredits: number;
}

/** 교양 자리로 쓸 수 있는 미지정 학점 = slot − 전공 선택 자리 */
export const freeSlotCredits = (t: TermLike) => Math.max(0, t.slotCredits - (t.majorSlotCredits ?? 0));
import { sameTerm, termIndex } from "./terms";

/**
 * 교양 자리(placeholder). 학기의 미지정 학점(slotCredits)을 2·3학점 교양 자리로 구체화한다.
 * 구체화한 교양 학점 + 남은 slot = 원래 slotCredits. 학기 총학점(plannedCredits)은 바뀌지 않는다.
 */

export const GEN_ED_NOTE = "실제 수강신청 때 과목을 선택해야 하는 교양 자리입니다.";

/** 0 → A, 25 → Z, 26 → AA, 27 → AB … */
export function letterLabel(seq: number): string {
  let n = seq;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** 한 계획의 교양 자리 목록. nextSeq는 지금까지 만든 개수(삭제해도 줄지 않아 라벨이 겹치지 않는다). */
export interface GenEdState {
  items: GeneralEducationPlaceholder[];
  nextSeq: number;
}

export const emptyGenEd = (): GenEdState => ({ items: [], nextSeq: 0 });

/** 학기에 이미 구체화한 교양 학점 */
export function genEdCreditsIn(state: GenEdState, term: Term): number {
  return state.items.filter((g) => sameTerm(g.term, term)).reduce((a, g) => a + g.credits, 0);
}

export type AddGenEdResult = { ok: true; state: GenEdState; item: GeneralEducationPlaceholder } | { ok: false; reason: string };

/**
 * 교양 자리 추가. 남은 미지정 학점보다 크면 막는다(학기 상한을 조용히 넘기지 않는다).
 * 수강 학기가 아니면 막는다.
 */
export function addGenEd(
  state: GenEdState,
  planned: TermLike | undefined,
  credits: 2 | 3,
  origin: GeneralEducationPlaceholder["origin"] = "user",
): AddGenEdResult {
  if (!planned || planned.status !== "study") return { ok: false, reason: "수강 학기에만 교양 자리를 넣을 수 있어요." };
  const left = freeSlotCredits(planned) - genEdCreditsIn(state, planned.term);
  if (credits > left)
    return {
      ok: false,
      reason: left <= 0 ? "이 학기에는 남은 미지정 학점이 없어요." : `이 학기에 남은 미지정 학점은 ${left}학점이에요.`,
    };
  const seq = state.nextSeq;
  const item: GeneralEducationPlaceholder = {
    id: `ge-${seq + 1}`,
    label: `교양 ${letterLabel(seq)}`,
    credits,
    term: { ...planned.term },
    origin,
    status: "placeholder",
  };
  return { ok: true, item, state: { items: [...state.items, item], nextSeq: seq + 1 } };
}

/** 삭제. 다른 항목의 ID·라벨은 그대로 둔다. */
export function removeGenEd(state: GenEdState, id: string): GenEdState {
  return { ...state, items: state.items.filter((g) => g.id !== id) };
}

export interface TermCreditBreakdown {
  /** 배치된 전공 과목 학점(이수구분에 "전공"이 들어간 과목) */
  major: number;
  /** 배치된 교양 과목 학점 + 교양 자리 학점 */
  generalEducation: number;
  /** 교양 자리 */
  placeholders: GeneralEducationPlaceholder[];
  /** 전공 요건을 채우려고 잡은 전공 선택 자리 학점 */
  majorSlot: number;
  /** 아직 구체화하지 않은 미지정 학점 */
  unassigned: number;
  /** 학기 총학점(엔진 결과 그대로. 다시 더하지 않는다) */
  total: number;
  /** 이 학기 교양 자리가 미지정 학점을 넘은 경우(계획이 바뀐 뒤 등) */
  overflow: number;
}

/**
 * 학기 학점 구성. total은 엔진의 plannedCredits를 그대로 쓰고,
 * major + majorSlot + generalEducation + 그 밖의 배치 과목 + unassigned = total 이 되도록 나눈다.
 */
export function termBreakdown(t: TermLike, state: GenEdState, dataset: Dataset): TermCreditBreakdown {
  const category = (code: string) => dataset.courses.find((c) => c.code === code)?.category ?? "";
  const major = t.courses.filter((c) => category(c.code).includes("전공")).reduce((a, c) => a + c.credits, 0);
  const geCourses = t.courses.filter((c) => category(c.code).includes("교양")).reduce((a, c) => a + c.credits, 0);
  const placeholders = t.status === "study" ? state.items.filter((g) => sameTerm(g.term, t.term)) : [];
  const ph = placeholders.reduce((a, g) => a + g.credits, 0);
  const free = freeSlotCredits(t);
  return {
    major,
    majorSlot: t.slotCredits - free,
    generalEducation: geCourses + Math.min(ph, free),
    placeholders,
    unassigned: Math.max(0, free - ph),
    total: t.plannedCredits,
    overflow: Math.max(0, ph - free),
  };
}

/** 계획이 바뀐 뒤 더 이상 맞지 않는 교양 자리(수강 학기가 아니거나 slot을 넘음) */
export function staleGenEd(state: GenEdState, terms: TermLike[]): GeneralEducationPlaceholder[] {
  const out: GeneralEducationPlaceholder[] = [];
  const byTerm = new Map(terms.map((t) => [termIndex(t.term), t]));
  const used = new Map<number, number>();
  for (const g of state.items) {
    const t = byTerm.get(termIndex(g.term));
    const u = used.get(termIndex(g.term)) ?? 0;
    if (!t || t.status !== "study" || u + g.credits > freeSlotCredits(t)) out.push(g);
    else used.set(termIndex(g.term), u + g.credits);
  }
  return out;
}
