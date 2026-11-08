import type { DatasetV2, ExchangeCandidateSet, ExchangePlanningInput, ExchangePriority, Term } from "@/contracts/types";
import { buildExchangeCandidateSet, completedAtDeparture, type MilitaryWindow } from "@/engine";
import { strategiesFor } from "./militaryPrefs";
import { type Draft, needsMilitary } from "./plan";
import type { Track } from "./tracks";

/**
 * 교환학생 최소 질문의 답. 학교별 TO·마감·GPA 기준·과목 제한·인정학점은 묻지 않는다.
 * 기존 학업 정보(마친 학기·시작 학기·군 복무)는 다시 묻지 않고 가져온다.
 */
export interface ExchangePrefs {
  intent: ExchangePlanningInput["intent"] | null;
  when: "next_spring" | "next_fall" | "recommend" | "fixed" | "unknown" | null;
  fixedTerm: Term | null;
  duration: ExchangePlanningInput["duration"] | null;
  priorities: ExchangePriority[];
  languageStatus: ExchangePlanningInput["languageStatus"] | null;
  language: { test: "IELTS_ACADEMIC" | "TOEFL_IBT" | "TOEFL_IBT_2026"; total: number | null; testedAt: string | null } | null;
  /** 누적 평점(4.5 만점). 기존 입력에 없어 여기서만 묻는다. 모르면 null */
  gpa: number | null;
  budget: ExchangePlanningInput["budget"] | null;
  housing: ExchangePlanningInput["housing"] | null;
  /** 해당될 때만 체크(기본: 해당 없음) */
  priorExchange: boolean;
  transfer: boolean;
  doubleMajor: boolean;
}

export const blankExchangePrefs = (): ExchangePrefs => ({
  intent: null,
  when: null,
  fixedTerm: null,
  duration: null,
  priorities: [],
  languageStatus: null,
  language: null,
  gpa: null,
  budget: null,
  housing: null,
  priorExchange: false,
  transfer: false,
  doubleMajor: false,
});

export const exPrefsOf = (d: Draft): ExchangePrefs => ({ ...blankExchangePrefs(), ...(d.exchangePrefs ?? {}) });
export const wantsExchange = (d: Draft) => {
  const i = exPrefsOf(d).intent;
  return i === "committed" || i === "conditional" || i === "considering";
};

export function toExchangeInput(d: Draft): ExchangePlanningInput {
  const p = exPrefsOf(d);
  return {
    intent: p.intent ?? "considering",
    targetTerm: p.when === "fixed" && p.fixedTerm ? { mode: "fixed", term: p.fixedTerm } : { mode: p.when === "fixed" || p.when === null ? "recommend" : p.when },
    duration: p.duration ?? "recommend",
    priorities: p.priorities.slice(0, 2),
    languageStatus: p.languageStatus ?? "unknown",
    languageEvidence: p.language && p.language.total !== null ? [{ test: p.language.test, total: p.language.total, testedAt: p.language.testedAt, evidenceStatus: "user_entered" }] : [],
    budget: p.budget ?? "unknown",
    housing: p.housing ?? "unknown",
    academic: {
      campus: "서울",
      completedTermsNow: d.completedTerms,
      cumulativeGpa: p.gpa,
      majorArrangement: p.doubleMajor ? "double_degree" : "single",
      transferStudent: p.transfer,
      priorExchangeTerms: p.priorExchange ? 1 : 0,
      planStartTerm: d.startTerm,
    },
  };
}

/**
 * 군 복무 분기별 예상 기간. 사용자가 입영일을 정했으면 확정(hard), 아니면 최적 트랙의 입대 학기 + 분기별 공식 복무개월로 조건부.
 * 복무개월을 모르는 분기는 기간을 만들지 않는다.
 */
export function militaryWindowsFor(d: Draft, dataset: DatasetV2 | null, tracks: Track[] | null, today: string): MilitaryWindow[] {
  if (!needsMilitary(d)) return [];
  const addMonths = (iso: string, m: number) => {
    const [y, mo] = iso.split("-").map(Number);
    const t = y * 12 + (mo - 1) + m;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
  };
  const set = strategiesFor(d, dataset, today);
  if (d.military.timing === "fixed" && d.military.startDate) {
    const months = set.strategies.find((s) => s.id === set.bestId)?.branches.find((b) => b.serviceMonths)?.serviceMonths ?? 18;
    return [{ branchId: "fixed", label: "정해진 입영일", start: d.military.startDate, end: addMonths(d.military.startDate, months), fixed: true }];
  }
  const entry = tracks?.find((t) => t.militaryStart)?.militaryStart ?? null;
  if (!entry) return [];
  const start = `${entry.year}-${entry.season === 1 ? "03" : "09"}-01`;
  const best = set.strategies.find((s) => s.id === set.bestId);
  return (best?.branches ?? [])
    .filter((b) => b.selectedProgramId && b.serviceMonths !== null)
    .map((b) => ({ branchId: b.id, label: `군 복무 — ${b.title}`, start, end: addMonths(start, b.serviceMonths!), fixed: false }));
}

export function exchangeSetFor(d: Draft, dataset: DatasetV2 | null, tracks: Track[] | null, today: string): ExchangeCandidateSet | null {
  if (!dataset?.exchange) return null;
  return buildExchangeCandidateSet(toExchangeInput(d), dataset.exchange, { today: today || "1970-01-01", militaryWindows: militaryWindowsFor(d, dataset, tracks, today) });
}

/** 선택한 교환 학기 → 트랙 계산용 ordinal(그 학기 전까지 마친 학기 수) */
export function ordinalForTerm(d: Draft, term: Term): number | null {
  return completedAtDeparture(toExchangeInput(d), term);
}

export const PRIORITY_LABEL: Record<ExchangePriority, string> = {
  major_course_access: "정보시스템·컴퓨터 과목 실제로 듣기",
  prestige: "학교 명성과 국제 경험",
  graduation_fit: "학점 인정·졸업 지연 최소화",
  low_cost: "생활비 부담 줄이기",
  language_fit: "영어 기준 부담 줄이기",
  housing: "기숙사 안정성",
  country_culture: "가고 싶은 국가·문화",
};
