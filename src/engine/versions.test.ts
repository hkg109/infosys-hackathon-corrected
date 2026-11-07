import { describe, expect, it } from "vitest";
import { sampleInputV2, sampleRecommendationConfig } from "@/contracts/mock-plan";
import type { PlanVersion } from "@/contracts/types";
import { fixtureDataset } from "@/data/fixtures";
import { generateCandidates } from "./candidates";
import { applyFeedback, diffVersions, reviseVersion, versionFromCandidate } from "./versions";

const ids = (n: number) => ({ planId: "plan", versionId: `v${n}`, createdAt: `2026-11-07T00:00:0${n}.000Z` });
const set = generateCandidates(sampleInputV2, fixtureDataset, sampleRecommendationConfig);
const first = (() => {
  const v = versionFromCandidate(set, "security|m-|p18", ids(1));
  if (!v.ok) throw new Error(v.reason);
  return v.version;
})();
const revise = (prev: PlanVersion, change: Parameters<typeof reviseVersion>[1], n = 2) => {
  const v = reviseVersion(prev, change, fixtureDataset, ids(n), sampleRecommendationConfig);
  if (!v.ok) throw new Error(v.reason);
  return v.version;
};

describe("versionFromCandidate", () => {
  it("후보의 입력·결과·버전 정보를 그대로 스냅샷한다", () => {
    expect(first.origin).toEqual({ kind: "candidate", candidateId: "security|m-|p18" });
    expect(first.parentVersionId).toBeNull();
    expect(first.input.pace).toEqual({ mode: "fixed", credits: 18 });
    expect(first.rankingVersion).toBe(set.ranking.rankingVersion);
  });

  it("없는 후보는 실패 이유를 돌려준다", () => {
    expect(versionFromCandidate(set, "nope", ids(1)).ok).toBe(false);
  });
});

describe("applyFeedback", () => {
  it("입대 시점을 옮기면 복무 길이를 유지한 채 종료일도 함께 옮긴다", () => {
    const r = applyFeedback(sampleInputV2, { type: "military_start", periodId: "mil-1", startTerm: { year: 2029, season: 1 } });
    if ("error" in r) throw new Error(r.error);
    // 2028-04-01 → 2029-03-01 (334일 이동), 종료 2029-11-01 → 2030-10-01
    expect(r.input.periods[0]).toMatchObject({ startDate: "2029-03-01", endDate: "2030-10-01", timing: "fixed" });
  });

  it("다른 조건은 바꾸지 않는다", () => {
    const r = applyFeedback(sampleInputV2, { type: "pace", credits: 15 });
    if ("error" in r) throw new Error(r.error);
    expect({ ...r.input, pace: sampleInputV2.pace }).toEqual(sampleInputV2);
  });

  it("없는 기간을 고치려 하면 오류", () => {
    const r = applyFeedback(sampleInputV2, { type: "military_start", periodId: "x", startTerm: { year: 2029, season: 1 } });
    expect("error" in r).toBe(true);
  });
});

describe("reviseVersion + diffVersions", () => {
  it("학점 페이스를 낮추면 다시 계산하고 완료 학기 차이가 나온다", () => {
    const next = revise(first, { type: "pace", credits: 15 });
    expect(next.parentVersionId).toBe("v1");
    expect(next.origin).toEqual({ kind: "feedback", change: { type: "pace", credits: 15 } });
    const d = diffVersions(first, next);
    expect(d.inputChanges).toContainEqual({ field: "pace", before: "학기당 18학점", after: "학기당 15학점" });
    expect(d.completion.deltaTerms).toBeGreaterThan(0);
    expect(d.creditDiffByTerm.length).toBeGreaterThan(0);
  });

  it("입대 시점을 바꾸면 중단 구간 변경과 과목 이동이 나온다", () => {
    const next = revise(first, { type: "military_start", periodId: "mil-1", startTerm: { year: 2029, season: 1 } });
    const d = diffVersions(first, next);
    expect(d.periodChanges).toEqual([{ periodId: "mil-1", change: "changed" }]);
    expect(d.inputChanges.map((c) => c.field)).toContain("periods[0]");
    expect(d.movedCourses.length).toBeGreaterThan(0);
    for (const m of d.movedCourses) expect(m.before).not.toEqual(m.after);
  });

  it("진로를 바꾸면 추가·제외 과목이 나온다", () => {
    const d = diffVersions(first, revise(first, { type: "career", career: "data" }));
    expect(d.addedCourses.length).toBeGreaterThan(0);
    expect(d.removedCourses.length).toBeGreaterThan(0);
  });

  it("이전 버전은 바뀌지 않는다", () => {
    const before = structuredClone(first);
    revise(first, { type: "pace", credits: 20 });
    expect(first).toEqual(before);
  });

  it("한쪽 완료 학기가 없으면 그 차이만 비교 불가", () => {
    const noTarget: PlanVersion = { ...first, result: { ...first.result, expectedCompletion: null } };
    const d = diffVersions(noTarget, revise(first, { type: "pace", credits: 15 }));
    expect(d.completion.deltaTerms).toBeNull();
    expect(d.completion.after).not.toBeNull();
  });

  it("자료·엔진 버전이 다르면 드러낸다", () => {
    const old: PlanVersion = { ...first, catalogVersion: "old", engineVersion: "0.0.1" };
    expect(diffVersions(old, first).versionMismatch).toEqual({ catalog: true, engine: true, ranking: false });
  });

  it("충돌을 만드는 수정은 실패하고 이전 버전을 유지한다", () => {
    const withExchange: PlanVersion = {
      ...first,
      input: {
        ...first.input,
        exchange: "included",
        periods: [
          ...first.input.periods,
          { id: "exc-1", kind: "exchange", timing: "fixed", startDate: "2031-03-01", endDate: "2031-07-01", durationMonths: null, returnTerm: null, exchange: { credits: null, countsAsTerm: null, status: "unknown" }, status: "user_assumption" },
        ],
      },
    };
    const r = reviseVersion(withExchange, { type: "military_start", periodId: "mil-1", startTerm: { year: 2030, season: 2 } }, fixtureDataset, ids(2));
    expect(r.ok).toBe(false);
  });
});
