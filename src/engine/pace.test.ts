import { describe, expect, it } from "vitest";
import { sampleCreditCapRules, sampleInput, sampleInputNoBreak } from "@/contracts/mock-plan";
import type { DatasetV2, PlanInput } from "@/contracts/types";
import { fixtureDataset } from "@/data/fixtures";
import { paceBandsFor, schoolCapFor, termCapFor, userCapFor } from "./pace";
import { simulatePlan } from "./simulate";
import { termIndex } from "./terms";

const late = (pace: number): PlanInput => ({ ...sampleInputNoBreak, creditCap: pace, paceStyle: "late_light", paceBands: paceBandsFor("late_light", pace) });

describe("학점 페이스", () => {
  it("균형형은 구간이 없고 모든 학기 같은 상한", () => {
    expect(paceBandsFor("balanced", 18)).toEqual([]);
    const r = simulatePlan(sampleInputNoBreak, fixtureDataset);
    expect(r.terms.filter((t) => t.status === "study").every((t) => t.capCredits === 18)).toBe(true);
  });

  it("후반 여유형: 유효학기 5~6은 pace-3(12 미만 자동 하향 없음), 7 이상은 pace-6(9 미만 없음)", () => {
    expect(paceBandsFor("late_light", 18)).toEqual([
      { fromOrdinal: 1, credits: 18 },
      { fromOrdinal: 5, credits: 15 },
      { fromOrdinal: 7, credits: 12 },
    ]);
    expect(paceBandsFor("late_light", 15).map((b) => b.credits)).toEqual([15, 12, 9]);
    // 원래 pace가 하한보다 작으면 pace를 유지(올리지 않음)
    expect(paceBandsFor("late_light", 10).map((b) => b.credits)).toEqual([10, 10, 9]);
    expect(userCapFor(late(18), 4)).toBe(18);
    expect(userCapFor(late(18), 6)).toBe(15);
    expect(userCapFor(late(18), 8)).toBe(12);
  });

  it("3·4학년 계획 학점이 실제로 줄고, 완료 학기가 늦어질 수 있다(숨기지 않음)", () => {
    const balanced = simulatePlan(sampleInputNoBreak, fixtureDataset);
    const light = simulatePlan(late(18), fixtureDataset);
    const byOrdinal = (r: typeof light) => {
      let n = sampleInputNoBreak.completedTerms;
      return r.terms.filter((t) => t.status === "study").map((t) => ({ ord: ++n, credits: t.plannedCredits, cap: t.capCredits }));
    };
    const rows = byOrdinal(light);
    expect(rows.filter((x) => x.ord >= 7).every((x) => x.cap === 12 && x.credits <= 12)).toBe(true);
    expect(rows.filter((x) => x.ord >= 5 && x.ord <= 6).every((x) => x.cap === 15)).toBe(true);
    expect(termIndex(light.expectedCompletion!)).toBeGreaterThan(termIndex(balanced.expectedCompletion!));
  });

  it("같은 입력이면 같은 결과(결정적)", () => {
    expect(simulatePlan(late(18), fixtureDataset)).toEqual(simulatePlan(late(18), fixtureDataset));
  });

  it("학교 상한(확인된 규칙)과 사용자 상한 중 작은 값을 쓴다", () => {
    const ds: DatasetV2 = { ...fixtureDataset, creditCapRules: sampleCreditCapRules };
    const input: PlanInput = { ...sampleInputNoBreak, creditCap: 24, admissionYear: 2025 };
    expect(termCapFor(input, ds, 3)).toEqual({ cap: 20, ruleId: "cap-upto-2025" });
    expect(termCapFor({ ...input, creditCap: 15 }, ds, 3)).toEqual({ cap: 15, ruleId: null });
    const r = simulatePlan(input, ds);
    expect(r.terms.filter((t) => t.status === "study").every((t) => t.plannedCredits <= 20 && t.capRuleId === "cap-upto-2025")).toBe(true);
  });

  it("예정(planned) 규칙과 입학연도 미입력이면 학교 상한을 적용하지 않는다", () => {
    expect(schoolCapFor(sampleCreditCapRules, 2026, 6)).toBeNull(); // 2026 규칙은 planned
    expect(schoolCapFor(sampleCreditCapRules, null, 3)).toBeNull();
    expect(simulatePlan({ ...sampleInput, creditCap: 24 }, { ...fixtureDataset, creditCapRules: sampleCreditCapRules }).terms.find((t) => t.status === "study")?.capCredits).toBe(24);
  });

  it("학기별 학점 범위 밖이면 입력 오류", () => {
    const r = simulatePlan({ ...sampleInputNoBreak, paceBands: [{ fromOrdinal: 5, credits: 40 }] }, fixtureDataset);
    expect(r.error).not.toBeNull();
  });
});
