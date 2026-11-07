import { describe, expect, it } from "vitest";
import { sampleInput, sampleInputUnknownTarget, sampleInputNoBreak } from "@/contracts/mock-plan";
import type { SavedPlan } from "@/contracts/types";
import { fixtureDataset } from "@/data/fixtures";
import { candidateIdOf, migrateSavedPlanV1, planInputFromV1 } from "./migrate";
import { simulatePlan, ENGINE_VERSION } from "./simulate";

const ctx = { campus: "서울", department: "정보시스템학과" };
const ids = { ...ctx, planId: "p1", versionId: "v1" };

describe("planInputFromV1", () => {
  it("v1에 없던 항목은 추측하지 않고 미확인으로 둔다", () => {
    const v2 = planInputFromV1(sampleInputNoBreak, ctx);
    expect(v2.curriculum).toEqual({ admissionYear: null, appliedCurriculum: null, status: "unknown" });
    expect(v2.requiredCourses).toBeNull();
    expect(v2.military).toBe("undecided");
    expect(v2.exchange).toBe("none");
  });

  it("목표학점 null은 null로, 숫자는 사용자 목표로 옮긴다", () => {
    expect(planInputFromV1(sampleInputUnknownTarget, ctx).target).toBeNull();
    expect(planInputFromV1(sampleInput, ctx).target).toEqual({ value: 130, source: "user_goal", checkedAt: null });
  });

  it("군 복무 기간은 고정 기간으로, 상한은 고정 페이스로 옮긴다", () => {
    const v2 = planInputFromV1(sampleInput, ctx);
    expect(v2.military).toBe("planned");
    expect(v2.periods).toEqual([
      expect.objectContaining({ kind: "military", timing: "fixed", startDate: "2028-04-01", endDate: "2029-11-01" }),
    ]);
    expect(v2.pace).toEqual({ mode: "fixed", credits: 18 });
    expect(v2.careers).toEqual(["security"]);
  });
});

describe("migrateSavedPlanV1", () => {
  const result = simulatePlan(sampleInput, fixtureDataset);
  const saved: SavedPlan = {
    schemaVersion: 1,
    savedAt: "2026-11-01T00:00:00.000Z",
    input: sampleInput,
    result,
    catalogVersion: result.catalogVersion,
    engineVersion: ENGINE_VERSION,
  };

  it("결과를 재계산하지 않고 스냅샷으로 보존한다", () => {
    const m = migrateSavedPlanV1(saved, ids);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.version.origin).toEqual({ kind: "migrated_v1" });
    expect(m.version.result.expectedCompletion).toEqual(result.expectedCompletion);
    expect(m.version.result.terms.map((t) => t.plannedCredits)).toEqual(result.terms.map((t) => t.plannedCredits));
    expect(m.version.engineVersion).toBe(ENGINE_VERSION);
  });

  it("중단 학기에 기간 ID를, 수강 학기에 유효학기 순번을 붙인다", () => {
    const m = migrateSavedPlanV1(saved, ids);
    if (!m.ok) throw new Error(m.reason);
    const terms = m.version.result.terms;
    const firstBreak = terms.find((t) => t.status === "break");
    expect(firstBreak?.periodIds).toEqual(["mil-v1-1"]);
    expect(firstBreak?.termOrdinal).toBeNull();
    expect(terms[0].termOrdinal).toBe(sampleInput.completedTerms + 1);
  });

  it("형식이 맞지 않으면 실패 이유를 돌려준다", () => {
    expect(migrateSavedPlanV1(null, ids).ok).toBe(false);
    expect(migrateSavedPlanV1({ ...saved, schemaVersion: 2 }, ids).ok).toBe(false);
    expect(migrateSavedPlanV1({ ...saved, input: { ...sampleInput, track: "ai" } }, ids).ok).toBe(false);
  });
});

describe("candidateIdOf", () => {
  it("같은 키는 같은 ID, 병역 미전개는 '-'", () => {
    const key = { career: "data" as const, militaryStartTerm: { year: 2028, season: 1 as const }, paceCredits: 18 };
    expect(candidateIdOf(key)).toBe(candidateIdOf({ ...key, militaryStartTerm: { year: 2028, season: 1 } }));
    expect(candidateIdOf({ ...key, militaryStartTerm: null })).toBe("data|m-|p18");
  });
});
