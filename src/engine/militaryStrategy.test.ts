import { describe, expect, it } from "vitest";
import type { MilitaryCatalog, MilitaryPlanningInput } from "@/contracts/types";
import { militaryFixture } from "@/data/fixtures";
import { buildMilitaryStrategies, concurrencyFor, nextCycle, selectBranchPeriod } from "./militaryStrategy";

const ctx = { today: "2026-11-08", completedTerms: 2 };
const base: MilitaryPlanningInput = {
  serviceNeeded: "yes",
  preferredBranches: ["army"],
  generalArmyAcceptedAsFallback: "yes",
  itRolePriority: "none",
  katusaPreference: "exclude",
  goal: "unknown",
  mustReturnBy: null,
  katusaEvidence: null,
  qualificationCodes: [],
};
const run = (p: Partial<MilitaryPlanningInput>, cat: MilitaryCatalog = militaryFixture, c = ctx) => buildMilitaryStrategies({ ...base, ...p }, cat, c);
const best = (p: Partial<MilitaryPlanningInput>, cat?: MilitaryCatalog) => {
  const r = run(p, cat);
  return r.strategies.find((s) => s.id === r.bestId)!;
};

describe("buildMilitaryStrategies", () => {
  it("군 복무가 필요 없으면 전략이 없다", () => {
    expect(run({ serviceNeeded: "no" }).strategies).toEqual([]);
  });

  it("1. 육군 일반 입영 선호 + 카투사 제외 → 일반 입영 하나, 18개월(공식)", () => {
    const r = run({ goal: "fast_stable" });
    expect(r.strategies.every((s) => s.scenario === "katusa_excluded")).toBe(true);
    const b = best({ goal: "fast_stable" });
    expect(b.applications[0].programId).toBe("army-general");
    expect(b.branches[0].serviceMonths).toBe(18);
  });

  it("2. 카투사 최우선 + 일반 입영 fallback → 카투사 전략이 1순위, 실패 시 일반 입영 분기", () => {
    const b = best({ katusaPreference: "first_priority", katusaEvidence: { priorApplication: "none", hasLanguageScore: "yes" } });
    expect(b.applications[0].programId).toBe("katusa");
    expect(b.branches.map((x) => x.condition)).toEqual(expect.arrayContaining(["katusa_selected", "katusa_not_selected", "none_selected"]));
    expect(b.branches.find((x) => x.condition === "none_selected")!.selectedProgramId).toBe("army-general");
  });

  it("3. 동시지원 허용 회차면 동시지원 전략이 가능", () => {
    const cat: MilitaryCatalog = {
      ...militaryFixture,
      concurrentRules: [
        ...(militaryFixture.concurrentRules ?? []),
        { ...militaryFixture.concurrentRules![0], id: "test-allowed", rightProgramId: "army-technical", relation: "allowed", appliesToCycleIds: ["katusa-2027"] },
      ],
    };
    const r = run({ katusaPreference: "first_priority", itRolePriority: "high", katusaEvidence: { priorApplication: "none", hasLanguageScore: "yes" } }, cat);
    const p = r.strategies.find((s) => s.scenario === "katusa_parallel")!;
    expect(p.concurrency!.relation).toBe("allowed");
    expect(p.status).not.toBe("conflict");
  });

  it("4. 동시지원 불허 회차면 동시지원 전략은 충돌, 순차지원은 유지", () => {
    const cat: MilitaryCatalog = {
      ...militaryFixture,
      concurrentRules: [{ ...militaryFixture.concurrentRules![0], id: "test-forbid", appliesToCycleIds: ["katusa-2027"] }],
    };
    const r = run({ katusaPreference: "first_priority", itRolePriority: "high", katusaEvidence: { priorApplication: "none", hasLanguageScore: "yes" } }, cat);
    expect(r.strategies.find((s) => s.scenario === "katusa_parallel")!.status).toBe("conflict");
    expect(r.strategies.find((s) => s.scenario === "katusa_sequential")!.status).not.toBe("conflict");
    expect(r.bestId).not.toMatch(/parallel/);
  });

  it("5. 영어성적을 모르면 카투사 전략을 지우지 않고 조건부 + 질문 하나", () => {
    const r = run({ katusaPreference: "first_priority" });
    const k = r.strategies.find((s) => s.id === r.bestId)!;
    expect(k.applications[0].programId).toBe("katusa");
    expect(k.status).toBe("conditional");
    expect(r.followUpQuestion).toContain("영어");
  });

  it("6·7·8·9. 카투사 선발·미선발·fallback 선발·전체 실패 분기를 모두 만든다", () => {
    const r = run({ katusaPreference: "first_priority", itRolePriority: "high", katusaEvidence: { priorApplication: "none", hasLanguageScore: "yes" } });
    const seq = r.strategies.find((s) => s.scenario === "katusa_sequential")!;
    expect(seq.branches.map((b) => b.condition).sort()).toEqual(["fallback_selected", "katusa_not_selected", "katusa_selected", "none_selected"]);
  });

  it("10. 추가모집은 공고 확인 행동이며 특정 IT 특기를 보장하지 않는다", () => {
    const b = best({ itRolePriority: "high", goal: "it_experience" });
    const supp = b.applications.find((a) => a.role === "supplemental")!;
    expect(supp.note).toContain("보장하지 않아요");
    expect(militaryFixture.supplementalRules!.every((r) => r.guaranteeSpecificProgram === false)).toBe(true);
  });

  it("11. 과거 연도 중복지원 허용 규칙을 다음 회차에 쓰지 않는다", () => {
    // '25 회차의 허용 규칙이 있어도 2027 카투사 회차에는 규칙 없음 → unknown
    expect(concurrencyFor(militaryFixture, "katusa", "army-technical", "katusa-2027")).toBeNull();
    expect(concurrencyFor(militaryFixture, "katusa", "army-technical", "katusa-2025")!.relation).toBe("allowed");
    const r = run({ katusaPreference: "first_priority", itRolePriority: "high" });
    expect(r.strategies.find((s) => s.scenario === "katusa_parallel")!.concurrency!.relation).toBe("unknown");
  });

  it("중복지원 규칙이 공고 전이면 허용·불허 어느 쪽이든 되는 순차지원을 먼저 추천", () => {
    const r = run({ katusaPreference: "first_priority", itRolePriority: "high", katusaEvidence: { priorApplication: "none", hasLanguageScore: "yes" } });
    expect(r.bestId).toMatch(/sequential/);
    expect(r.strategies.find((s) => s.scenario === "katusa_parallel")!.warnings.join(" ")).toContain("순차지원");
  });

  it("12. 공식 회차가 미발표면 날짜 없이 공고 확인 필요", () => {
    const c = nextCycle(militaryFixture, "katusa", "2026-11-08")!;
    expect(c.id).toBe("katusa-2027");
    expect(c.applicationStart).toBeNull();
    const b = best({ katusaPreference: "first_priority" });
    expect(b.branches.find((x) => x.condition === "katusa_selected")!.nextActions[0]).toContain("미발표");
  });

  it("13. 복무기간 미확인 분기는 조건부(카투사·육군 기술행정병 기간은 원문 미확인)", () => {
    const b = best({ itRolePriority: "high", goal: "it_experience" });
    expect(b.branches.find((x) => x.selectedProgramId === "army-technical")!.serviceMonths).toBeNull();
    expect(b.status).toBe("conditional");
    expect(b.metrics.worstServiceMonths).toBeNull();
  });

  it("공군만 고르면 공군 기술병(21개월, 공식)으로 IT 도전", () => {
    const b = best({ preferredBranches: ["air_force"], itRolePriority: "high", goal: "it_experience" });
    expect(b.applications[0].programId).toBe("air-force-technical");
    expect(b.branches.find((x) => x.selectedProgramId === "air-force-technical")!.serviceMonths).toBe(21);
  });

  it("1년 이수 전이면 공군 IT개발관리병 자격은 확인 필요", () => {
    const r = buildMilitaryStrategies({ ...base, preferredBranches: ["air_force"], itRolePriority: "high" }, militaryFixture, { ...ctx, completedTerms: 1 });
    expect(r.strategies[0].eligibility.find((e) => e.programId === "air-force-technical")!.status).toBe("unknown");
  });

  it("카투사를 이미 한 번 지원했으면 카투사 전략은 자격 없음", () => {
    const r = run({ katusaPreference: "first_priority", katusaEvidence: { priorApplication: "other_application", hasLanguageScore: "yes" } });
    expect(r.strategies.filter((s) => s.applications[0].programId === "katusa").every((s) => s.status === "ineligible")).toBe(true);
    expect(r.strategies.find((s) => s.id === r.bestId)!.applications[0].programId).not.toBe("katusa");
  });

  it("모집병 최종 선발 시 일반 입영일자 취소(원문 규칙)가 분기에 반영된다", () => {
    const b = best({ itRolePriority: "high", goal: "it_experience" });
    expect(b.branches.find((x) => x.condition === "fallback_selected")!.cancelledApplicationIds).toContain("a-general");
  });

  it("15. 같은 입력·같은 카탈로그 → 같은 결과", () => {
    const p = { katusaPreference: "consider" as const, itRolePriority: "medium" as const };
    expect(JSON.stringify(run(p))).toBe(JSON.stringify(run(p)));
  });

  it("16. 군종이 다르면 후보 ID가 다르다", () => {
    const a = run({ preferredBranches: ["army"], itRolePriority: "high" }).strategies.map((s) => s.id);
    const f = run({ preferredBranches: ["air_force"], itRolePriority: "high" }).strategies.map((s) => s.id);
    expect(a.some((id) => f.includes(id) && id.startsWith("it-"))).toBe(false);
  });

  it("17·18. 결과 전 분기는 확정 기간으로 바꾸지 않고, 선발 결과 후에만 기간이 된다", () => {
    const b = best({ katusaPreference: "first_priority" });
    const k = b.branches.find((x) => x.condition === "katusa_selected")!;
    expect(k.label).toBe("awaiting_result");
    expect(selectBranchPeriod(k, { selected: false, enlistmentDate: null })).toBeNull();
    expect(selectBranchPeriod(k, { selected: true, enlistmentDate: null })).toBeNull();
    const g = b.branches.find((x) => x.condition === "none_selected")!;
    expect(selectBranchPeriod(g, { selected: true, enlistmentDate: "2027-07-12" })).toEqual({ startDate: "2027-07-12", durationMonths: 18, status: "verified" });
  });

  it("합격 확률·인기 같은 값은 지표에 없다", () => {
    const b = best({ katusaPreference: "first_priority" });
    expect(Object.keys(b.metrics).sort()).toEqual(["goalMet", "hasFallback", "itMatch", "uncertainty", "worstServiceMonths"]);
  });
});
