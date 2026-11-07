import type {
  CandidateSet,
  DatasetV2,
  FeedbackChange,
  PeriodInput,
  PlanInputV2,
  PlanVersion,
  RecommendationConfig,
  Term,
  VersionDiff,
} from "@/contracts/types";
import { CAREER_LABEL } from "@/contracts/careers";
import { generateCandidates } from "./candidates";
import { diffPlans } from "./diff";
import { resolvePeriodRange } from "./inputV2";
import { formatTerm, termIndex, termRange } from "./terms";

/** 수정 전후 비교·버전 생성(BE-3). 저장된 버전은 다시 계산하지 않는다. */

export interface VersionIds {
  planId: string;
  versionId: string;
  createdAt: string;
}

export type VersionAttempt =
  | { ok: true; version: PlanVersion }
  | { ok: false; reason: string; fields: string[] };

/** 후보 집합에서 고른 후보로 첫 버전을 만든다. */
export function versionFromCandidate(set: CandidateSet, candidateId: string, ids: VersionIds): VersionAttempt {
  const c = set.candidates.find((x) => x.id === candidateId);
  if (!c || !c.result) return { ok: false, reason: "선택한 후보를 찾을 수 없습니다.", fields: [] };
  if (c.status === "conflict")
    return { ok: false, reason: c.conflicts.map((x) => x.message).join(" "), fields: c.conflicts.flatMap((x) => x.periodIds) };
  return {
    ok: true,
    version: {
      ...ids,
      parentVersionId: null,
      origin: { kind: "candidate", candidateId },
      input: c.input,
      result: c.result,
      catalogVersion: set.catalogVersion,
      engineVersion: set.engineVersion,
      rankingVersion: set.ranking.rankingVersion,
      configVersion: set.configVersion,
      assumptions: c.result.assumptions,
    },
  };
}

// ── 날짜 이동 ────────────────────────────────────────────

const toDay = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, dd) / 86_400_000;
};
const fromDay = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);

/**
 * 입대 시점 이동: 시작일을 그 학기 첫날(계획용 가정)로 옮기고, 종료일은 같은 길이만큼 함께 옮긴다.
 * 개월 수·복학 학기로 길이를 정한 경우 그 값을 그대로 둔다(독립적으로 정한 날짜를 몰래 바꾸지 않는다).
 */
function moveStart(p: PeriodInput, startTerm: Term): PeriodInput {
  const start = termRange(startTerm).start;
  const shift = p.startDate && p.endDate ? toDay(start) - toDay(p.startDate) : 0;
  return {
    ...p,
    timing: "fixed",
    startDate: start,
    endDate: p.endDate ? fromDay(toDay(p.endDate) + shift) : null,
    status: "user_assumption",
  };
}

/** 지원하는 수정 4종을 입력에 적용한다. 고정 조건은 사용자가 고른 그 항목만 바뀐다. */
export function applyFeedback(input: PlanInputV2, change: FeedbackChange): { input: PlanInputV2 } | { error: string; field: string } {
  switch (change.type) {
    case "pace":
      return { input: { ...input, pace: { mode: "fixed", credits: change.credits } } };
    case "career":
      return { input: { ...input, careers: [change.career] } };
    case "military_start":
    case "return_term": {
      const i = input.periods.findIndex((p) => p.id === change.periodId);
      if (i < 0) return { error: "수정할 기간을 찾을 수 없습니다.", field: "periods" };
      const p = input.periods[i];
      if (change.type === "military_start" && p.kind !== "military")
        return { error: "입대 시점은 군 복무 기간에서만 바꿀 수 있습니다.", field: `periods[${i}]` };
      const next =
        change.type === "military_start"
          ? moveStart(p, change.startTerm)
          : { ...p, returnTerm: change.returnTerm, endDate: termRange(change.returnTerm).start, durationMonths: null };
      const periods = input.periods.map((x, j) => (j === i ? next : x));
      return { input: { ...input, periods, military: p.kind === "military" ? "planned" : input.military } };
    }
  }
}

/**
 * 이전 버전에 수정을 적용해 다시 계산하고 새 버전을 만든다.
 * 실패하면 이전 버전을 그대로 두고 이유를 돌려준다.
 */
export function reviseVersion(
  prev: PlanVersion,
  change: FeedbackChange,
  dataset: DatasetV2,
  ids: VersionIds,
  config?: RecommendationConfig,
): VersionAttempt {
  const applied = applyFeedback(prev.input, change);
  if ("error" in applied) return { ok: false, reason: applied.error, fields: [applied.field] };
  // 버전의 입력은 진로 1개·고정 페이스이므로 후보가 정확히 하나 나온다.
  const set = generateCandidates(applied.input, dataset, config);
  if (set.candidates.length === 0)
    return { ok: false, reason: set.emptyReason?.message ?? "다시 계산하지 못했습니다.", fields: set.emptyReason?.changeableFields ?? [] };
  const c = set.candidates[0];
  if (c.status === "conflict")
    return { ok: false, reason: c.conflicts.map((x) => x.message).join(" "), fields: set.emptyReason?.changeableFields ?? [] };
  return {
    ok: true,
    version: {
      ...ids,
      planId: prev.planId,
      parentVersionId: prev.versionId,
      origin: { kind: "feedback", change },
      input: c.input,
      result: c.result!,
      catalogVersion: set.catalogVersion,
      engineVersion: set.engineVersion,
      rankingVersion: prev.rankingVersion,
      configVersion: set.configVersion,
      assumptions: c.result!.assumptions,
    },
  };
}

// ── 버전 비교 ────────────────────────────────────────────

const CAREER = CAREER_LABEL;

function periodText(p: PeriodInput | undefined): string {
  if (!p) return "없음";
  const r = resolvePeriodRange(p);
  return r ? `${r.start} ~ ${r.end}` : "기간 확인 필요";
}

function inputChanges(a: PlanInputV2, b: PlanInputV2): VersionDiff["inputChanges"] {
  const out: VersionDiff["inputChanges"] = [];
  const add = (field: string, before: string, after: string) => {
    if (before !== after) out.push({ field, before, after });
  };
  const pace = (x: PlanInputV2) => (x.pace.mode === "fixed" ? `학기당 ${x.pace.credits}학점` : "비교");
  add("pace", pace(a), pace(b));
  add("careers", a.careers.map((c) => CAREER[c]).join(", ") || "미정", b.careers.map((c) => CAREER[c]).join(", ") || "미정");
  add("startTerm", formatTerm(a.startTerm), formatTerm(b.startTerm));
  add("target", a.target ? `${a.target.value}학점` : "미입력", b.target ? `${b.target.value}학점` : "미입력");
  const ids = [...new Set([...a.periods, ...b.periods].map((p) => p.id))];
  for (const id of ids) {
    const i = b.periods.findIndex((p) => p.id === id);
    const field = i >= 0 ? `periods[${i}]` : `periods(${id})`;
    add(field, periodText(a.periods.find((p) => p.id === id)), periodText(b.periods.find((p) => p.id === id)));
  }
  return out;
}

function placements(v: PlanVersion): Map<string, Term> {
  const m = new Map<string, Term>();
  for (const t of v.result.terms) for (const c of t.courses) m.set(c.code, t.term);
  return m;
}

/** 두 버전의 스냅샷을 그대로 비교한다. 완료 학기가 한쪽이라도 없으면 그 차이만 비교 불가(null). */
export function diffVersions(before: PlanVersion, after: PlanVersion): VersionDiff {
  const base = diffPlans(before.result, after.result);
  const pa = placements(before);
  const pb = placements(after);
  const movedCourses: VersionDiff["movedCourses"] = [];
  for (const code of [...new Set([...pa.keys(), ...pb.keys()])].sort()) {
    const x = pa.get(code) ?? null;
    const y = pb.get(code) ?? null;
    if (x && y && termIndex(x) !== termIndex(y)) movedCourses.push({ code, before: x, after: y });
    else if ((x === null) !== (y === null)) movedCourses.push({ code, before: x, after: y });
  }

  const periodChanges: VersionDiff["periodChanges"] = [];
  const pIds = [...new Set([...before.input.periods, ...after.input.periods].map((p) => p.id))];
  for (const id of pIds) {
    const x = before.input.periods.find((p) => p.id === id);
    const y = after.input.periods.find((p) => p.id === id);
    if (!x) periodChanges.push({ periodId: id, change: "added" });
    else if (!y) periodChanges.push({ periodId: id, change: "removed" });
    else if (JSON.stringify(x) !== JSON.stringify(y)) periodChanges.push({ periodId: id, change: "changed" });
  }

  return {
    fromVersionId: before.versionId,
    toVersionId: after.versionId,
    inputChanges: inputChanges(before.input, after.input),
    movedCourses,
    addedCourses: base.addedCourses,
    removedCourses: base.removedCourses,
    creditDiffByTerm: base.creditDiffByTerm,
    periodChanges,
    completion: {
      before: before.result.expectedCompletion,
      after: after.result.expectedCompletion,
      deltaTerms: base.completionDeltaTerms,
    },
    newWarnings: base.newWarnings,
    versionMismatch: {
      catalog: before.catalogVersion !== after.catalogVersion,
      engine: before.engineVersion !== after.engineVersion,
      ranking: before.rankingVersion !== after.rankingVersion,
    },
  };
}
