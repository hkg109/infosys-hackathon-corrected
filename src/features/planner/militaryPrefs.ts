import type { DatasetV2, KatusaStatus, MilitaryBranch, MilitaryGoal, MilitaryPlanInput, MilitaryPlanningInput, MilitaryStrategySet, Term, TriState } from "@/contracts/types";
import { buildMilitaryStrategies, PROGRAM } from "@/engine";
import type { Draft } from "./plan";

/**
 * 군 복무 최소 질문의 답. 복무개월·입영일·중복지원 규칙은 묻지 않는다.
 * 서비스가 검토 자료로 전략·분기·fallback을 계산한다(engine/militaryStrategy).
 */
export interface MilitaryPrefs {
  branch: MilitaryBranch | "any" | "unknown" | null;
  goal: MilitaryGoal | null;
  katusa: MilitaryPlanningInput["katusaPreference"] | null;
  /** IT·개발 관련 모집 분야 우선 */
  it: "high" | "none" | "unknown" | null;
  english: TriState | null;
  katusaHistory: "none" | "waiting" | "selected" | "not_selected" | "cancelled" | "medical" | null;
  /** 반드시 복학해야 하는 학기(선택) */
  mustReturnBy: Term | null;
}

export const blankMilitaryPrefs = (): MilitaryPrefs => ({ branch: null, goal: null, katusa: null, it: null, english: null, katusaHistory: null, mustReturnBy: null });

export const prefsOf = (d: Draft): MilitaryPrefs => ({ ...blankMilitaryPrefs(), ...(d.militaryPrefs ?? {}) });

export const katusaOn = (p: MilitaryPrefs) => p.katusa === "first_priority" || p.katusa === "consider" || (p.katusa === null && p.goal === "katusa");

export function toPlanningInput(d: Draft): MilitaryPlanningInput {
  const p = prefsOf(d);
  const s = d.military.status;
  return {
    serviceNeeded: s === "planned" ? "yes" : s === "undecided" ? "unknown" : s === null ? "unknown" : "no",
    preferredBranches: p.branch && p.branch !== "any" && p.branch !== "unknown" ? [p.branch] : [],
    generalArmyAcceptedAsFallback: p.branch === "air_force" || p.branch === "navy" || p.branch === "marine" ? "unknown" : "yes",
    itRolePriority: p.it === "high" || p.goal === "it_experience" ? "high" : p.it === "none" ? "none" : "unknown",
    katusaPreference: p.katusa ?? (p.goal === "katusa" ? "first_priority" : "unknown"),
    goal: p.goal ?? "unknown",
    mustReturnBy: p.mustReturnBy,
    katusaEvidence: katusaOn(p)
      ? {
          priorApplication:
            p.katusaHistory === "cancelled" ? "cancelled" : p.katusaHistory === "medical" ? "medical_disqualified" : p.katusaHistory === "not_selected" ? "other_application" : p.katusaHistory === "none" || p.katusaHistory === "waiting" || p.katusaHistory === "selected" ? "none" : "unknown",
          hasLanguageScore: p.english ?? "unknown",
        }
      : null,
    qualificationCodes: d.military.certificateIds,
  };
}

export function strategiesFor(d: Draft, dataset: DatasetV2 | null, today: string): MilitaryStrategySet {
  return buildMilitaryStrategies(toPlanningInput(d), dataset?.military, { today: today || "1970-01-01", completedTerms: d.completedTerms });
}

const KATUSA_STATUS: Record<NonNullable<MilitaryPrefs["katusaHistory"]>, KatusaStatus> = {
  none: "preparing",
  waiting: "applied_waiting",
  selected: "selected",
  not_selected: "not_selected",
  cancelled: "preparing",
  medical: "preparing",
};

/**
 * 트랙 계산(학업 로드맵)에 넘길 군 복무 입력. 최적 전략에 들어 있는 모집 분야마다 로드맵을 계산하고,
 * 카투사가 들어 있으면 "선발 시(조건부)"와 "미선발 시(대체)" 로드맵을 따로 만든다.
 * 최소 질문에 답하지 않은 예전 입력은 기존 값을 그대로 쓴다.
 */
export function militaryPlanFor(d: Draft, dataset: DatasetV2 | null, today = ""): MilitaryPlanInput {
  if (!d.militaryPrefs) return { trackIds: d.military.trackIds, katusaPriority: d.katusa.priority === true, katusaStatus: d.katusa.status, certificateIds: d.military.certificateIds };
  const set = strategiesFor(d, dataset, today);
  const best = set.strategies.find((s) => s.id === set.bestId);
  const programs = [...new Set((best?.applications ?? []).filter((a) => a.role !== "supplemental").map((a) => a.programId))];
  const p = prefsOf(d);
  const withKatusa = programs.includes(PROGRAM.katusa);
  return {
    trackIds: programs.length > 0 ? programs : [PROGRAM.general],
    katusaPriority: withKatusa,
    katusaStatus: withKatusa ? KATUSA_STATUS[p.katusaHistory ?? "none"] : "not_applying",
    certificateIds: d.military.certificateIds,
  };
}

// ── 짧은 문장 → 선택지(규칙 기반, 생성형 AI 아님) ─────────

export interface SentenceParse {
  patch: Partial<MilitaryPrefs> & { status?: Draft["military"]["status"] };
  understood: string[];
}

/** "육군 일반병을 생각하고 있고 카투사도 지원해 보고 싶어요" 같은 문장에서 알려진 선택지만 찾는다. 자동 확정하지 않는다. */
export function parseMilitarySentence(text: string): SentenceParse {
  const t = text.replace(/\s+/g, "");
  const patch: SentenceParse["patch"] = {};
  const understood: string[] = [];
  if (/(다녀왔|전역했|군필|마쳤)/.test(t)) {
    patch.status = "done";
    understood.push("군 복무 마침");
    return { patch, understood };
  }
  if (/(면제|해당없)/.test(t)) {
    patch.status = "none";
    understood.push("해당 없음");
    return { patch, understood };
  }
  const branch: Array<[RegExp, MilitaryPrefs["branch"], string]> = [
    [/공군/, "air_force", "공군 선호"],
    [/해병/, "marine", "해병대 선호"],
    [/해군/, "navy", "해군 선호"],
    [/육군|일반병|현역병/, "army", "육군 선호"],
  ];
  const b = branch.find(([re]) => re.test(t));
  if (b) {
    patch.branch = b[1];
    understood.push(b[2]);
  }
  if (/(일반병|일반입영|입영일자|현역병)/.test(t)) understood.push("일반 입영을 안전장치로 확보");
  if (/카투사|KATUSA/i.test(t)) {
    const neg = /카투사(는|도)?(안|생각없|관심없|빼)/i.test(t);
    patch.katusa = neg ? "exclude" : /(최우선|꼭|무조건|1순위)/.test(t) ? "first_priority" : "consider";
    understood.push(neg ? "카투사 제외" : patch.katusa === "first_priority" ? "카투사 최우선" : "카투사 고려");
  }
  if (/(IT|개발|정보보호|보안|데이터|SW|소프트웨어|전산|기술행정병|정보체계)/i.test(t)) {
    patch.it = "high";
    understood.push("IT·개발 모집 분야 우선");
  }
  if (/(빨리|빠르게|최대한일찍|바로)/.test(t)) {
    patch.goal = "fast_stable";
    understood.push("빠르고 안정적인 입대");
  } else if (/(복학|학업복귀|학기맞춰)/.test(t)) {
    patch.goal = "return_predictable";
    understood.push("학업 복귀 시점 우선");
  }
  if (understood.length > 0 && patch.status === undefined) patch.status = "planned";
  return { patch, understood };
}
