import { describe, expect, it } from "vitest";
import { sampleCreditCapRules, sampleInput, sampleInputNoBreak } from "@/contracts/mock-plan";
import type { DatasetV2, PlanInput } from "@/contracts/types";
import { fixtureDataset } from "@/data/fixtures";
import { isCapExempt, paceBandsFor, schoolCapFor, termCapFor, userCapFor } from "./pace";
import { simulatePlan } from "./simulate";
import { termIndex } from "./terms";

const late = (pace: number): PlanInput => ({ ...sampleInputNoBreak, creditCap: pace, paceStyle: "late_light", paceBands: paceBandsFor("late_light", pace) });

describe("학점 페이스", () => {
  it("균형형은 구간이 없고 모든 학기 같은 계획 한도", () => {
    expect(paceBandsFor("balanced", 18)).toEqual([]);
    const r = simulatePlan(sampleInputNoBreak, fixtureDataset);
    expect(r.terms.filter((t) => t.status === "study").every((t) => t.planLimitCredits === 18)).toBe(true);
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
      return r.terms.filter((t) => t.status === "study").map((t) => ({ ord: ++n, credits: t.plannedCredits, cap: t.capCredits, limit: t.planLimitCredits, exempt: t.capExemptCredits ?? 0 }));
    };
    const rows = byOrdinal(light);
    expect(rows.filter((x) => x.ord >= 7).every((x) => x.limit === 12 && x.credits - x.exempt <= 12)).toBe(true);
    expect(rows.filter((x) => x.ord >= 5 && x.ord <= 6).every((x) => x.limit === 15)).toBe(true);
    // 화면의 “상한”은 학교 기준(3·4학년 18)이라 페이스로 줄어든 12·15가 아니다(사용자 보고 버그)
    expect(rows.filter((x) => x.ord >= 5).every((x) => x.cap === 18 + x.exempt)).toBe(true);
    expect(termIndex(light.expectedCompletion!)).toBeGreaterThan(termIndex(balanced.expectedCompletion!));
  });

  it("같은 입력이면 같은 결과(결정적)", () => {
    expect(simulatePlan(late(18), fixtureDataset)).toEqual(simulatePlan(late(18), fixtureDataset));
  });

  it("서비스 기준 규칙이 없으면: 확인된 학교 상한과 사용자 상한 중 작은 값", () => {
    const ds: DatasetV2 = { ...fixtureDataset, creditCapRules: sampleCreditCapRules };
    const input: PlanInput = { ...sampleInputNoBreak, creditCap: 24, admissionYear: 2025 };
    expect(termCapFor(input, ds, 3)).toEqual({ cap: 20, schoolCap: 20, ruleId: "cap-upto-2025" });
    expect(termCapFor({ ...input, creditCap: 15 }, ds, 3)).toEqual({ cap: 15, schoolCap: 20, ruleId: "cap-upto-2025" });
    const r = simulatePlan(input, ds);
    expect(r.terms.filter((t) => t.status === "study").every((t) => t.plannedCredits - (t.capExemptCredits ?? 0) <= 20 && t.capRuleId === "cap-upto-2025")).toBe(true);
  });

  it("서비스 기준 규칙이 없으면: 예정(planned) 규칙과 입학연도 미입력은 학교 상한을 적용하지 않는다", () => {
    expect(schoolCapFor(sampleCreditCapRules, 2026, 6)).toBeNull(); // 2026 규칙은 planned
    expect(schoolCapFor(sampleCreditCapRules, null, 3)).toBeNull();
    const t = simulatePlan({ ...sampleInput, creditCap: 24 }, { ...fixtureDataset, creditCapRules: sampleCreditCapRules }).terms.find((x) => x.status === "study")!;
    expect(t.planLimitCredits).toBe(24);
    expect(t.baseCapCredits).toBeNull();
  });

  it("학기별 학점 범위 밖이면 입력 오류", () => {
    const r = simulatePlan({ ...sampleInputNoBreak, paceBands: [{ fromOrdinal: 5, credits: 40 }] }, fixtureDataset);
    expect(r.error).not.toBeNull();
  });
});

// docs/prompts/ah-matda-credit-cap-career-dev-prompt.md 6장
describe("학년별 학교 상한(1·2학년 20, 3·4학년 18)과 커리어개발 +1", () => {
  const fresh: PlanInput = {
    ...sampleInputNoBreak,
    startTerm: { year: 2027, season: 1 },
    completedCourseCodes: [],
    earnedCredits: 0,
    earnedMajorCredits: 0,
    completedTerms: 0,
    targetCredits: 130,
    creditCap: 20,
  };
  const rows = (input: PlanInput, ds: DatasetV2 = fixtureDataset) => {
    const r = simulatePlan(input, ds);
    let n = input.completedTerms;
    return { r, rows: r.terms.filter((t) => t.status === "study").map((t) => ({ ord: ++n, t, codes: t.courses.map((c) => c.code) })) };
  };

  it("입학연도와 관계없이 유효학기 1~4는 20, 5부터 18", () => {
    for (const y of [null, 2024, 2026]) {
      expect(schoolCapFor(fixtureDataset.creditCapRules, y, 1)?.maxCredits).toBe(20);
      expect(schoolCapFor(fixtureDataset.creditCapRules, y, 4)?.maxCredits).toBe(20);
      expect(schoolCapFor(fixtureDataset.creditCapRules, y, 5)?.maxCredits).toBe(18);
      expect(schoolCapFor(fixtureDataset.creditCapRules, y, 9)?.maxCredits).toBe(18);
    }
  });

  it("신입생 페이스 20: 1학년 1학기 상한 21, 3학년 2학기 19, 나머지 20/18", () => {
    const { rows: rs } = rows(fresh);
    const at = (o: number) => rs.find((x) => x.ord === o)!;
    expect(at(1).codes).toContain("GEN5029");
    expect(at(1).t).toMatchObject({ capCredits: 21, baseCapCredits: 20, capExemptCredits: 1 });
    expect(at(1).t.plannedCredits).toBeLessThanOrEqual(21);
    expect(at(1).t.plannedCredits - 1).toBeLessThanOrEqual(20);
    for (const o of [2, 3, 4]) expect(at(o).t.capCredits).toBe(20);
    expect(at(5).t.capCredits).toBe(18);
    expect(at(6).codes).toContain("GEN5100");
    expect(at(6).t).toMatchObject({ capCredits: 19, baseCapCredits: 18, capExemptCredits: 1 });
    for (const x of rs.filter((x) => x.ord >= 7)) expect(x.t.capCredits).toBe(18);
    // 커리어개발 외 학점은 학교 기본 상한을 넘지 않는다
    for (const x of rs) expect(x.t.plannedCredits - (x.t.capExemptCredits ?? 0)).toBeLessThanOrEqual(x.t.baseCapCredits!);
  });

  it("페이스 18: 1학년 1학기 계획 19(18+1) / 상한 21, 3학년 1학기 계획 18 이하 / 상한 18", () => {
    const { rows: rs } = rows({ ...fresh, creditCap: 18 });
    expect(rs[0].t.plannedCredits).toBe(19);
    expect(rs[0].t.capCredits).toBe(21);
    expect(rs[4].t.plannedCredits).toBeLessThanOrEqual(18);
    expect(rs[4].t.capCredits).toBe(18);
  });

  it("페이스 20이어도 3·4학년은 18로 제한", () => {
    const { rows: rs } = rows(fresh);
    for (const x of rs.filter((x) => x.ord >= 5)) expect(x.t.planLimitCredits).toBe(18);
  });

  it("후반 여유형 페이스 18: 7번째 학기 계획 12 / 상한 18", () => {
    const { rows: rs } = rows({ ...fresh, creditCap: 18, paceStyle: "late_light", paceBands: paceBandsFor("late_light", 18) });
    const t7 = rs.find((x) => x.ord === 7)!.t;
    expect(t7.planLimitCredits).toBe(12);
    expect(t7.plannedCredits).toBeLessThanOrEqual(12);
    expect(t7.capCredits).toBe(18);
  });

  it("이미 이수했으면 배치·가산 없음", () => {
    const { rows: rs } = rows({ ...fresh, completedCourseCodes: ["GEN5029", "GEN5100"] });
    expect(rs.every((x) => !x.codes.some(isCapExempt) && (x.t.capExemptCredits ?? 0) === 0)).toBe(true);
    expect(rs[0].t.capCredits).toBe(20);
  });

  it("피드백으로 뺐으면 배치·가산 없음", () => {
    const { rows: rs } = rows({ ...fresh, courseRules: [{ code: "GEN5029", action: "exclude" }] });
    expect(rs[0].codes).not.toContain("GEN5029");
    expect(rs[0].t.capCredits).toBe(20);
  });

  it("2학년부터 계획하고 커리어개발Ⅰ 미이수면 처음 1학기에 넣고 경고", () => {
    const { r, rows: rs } = rows({ ...fresh, completedTerms: 2, earnedCredits: 36, earnedMajorCredits: 9 });
    expect(rs[0].ord).toBe(3);
    expect(rs[0].codes).toContain("GEN5029");
    expect(rs[0].t.capCredits).toBe(21);
    expect(r.warnings.filter((w) => w.code === "CAP_EXEMPT_LATE" && w.courseCode === "GEN5029")).toHaveLength(1);
  });

  it("군 복무 학기는 유효학기에 세지 않는다", () => {
    const input: PlanInput = { ...fresh, breaks: [{ kind: "military", startDate: "2029-01-01", endDate: "2030-08-31" }] };
    const { r, rows: rs } = rows(input);
    expect(r.terms.some((t) => t.status === "break")).toBe(true);
    for (const x of rs) expect(x.t.baseCapCredits).toBe(x.ord <= 4 ? 20 : 18);
  });

  it("2025학번 이전이면 3·4학년 18 상한 경고 1건, 2026학번·미입력은 없음", () => {
    const count = (y: number | null) => simulatePlan({ ...fresh, admissionYear: y }, fixtureDataset).warnings.filter((w) => w.code === "CAP_RULE_ASSUMED").length;
    expect(count(2024)).toBe(1);
    expect(count(2026)).toBe(0);
    expect(count(null)).toBe(0);
  });

  it("사용자 학기 제한 22(1학년)는 학교 상한 20까지만, 커리어개발은 그 위 +1", () => {
    const { rows: rs } = rows({ ...fresh, creditCap: 24, termCaps: [{ term: { year: 2027, season: 1 }, credits: 22 }] });
    expect(rs[0].t.planLimitCredits).toBe(20);
    expect(rs[0].t.plannedCredits).toBe(21);
  });

  it("커리어개발은 전공학점에 들어가지 않고 총학점에는 들어간다", () => {
    const input: PlanInput = { ...fresh, majorRequirement: { majorCredits: 72, lowerLevelCredits: null, upperLevelCredits: null, source: "graduation_check" } };
    const r = simulatePlan(input, fixtureDataset);
    const majorPlaced = r.terms.flatMap((t) => t.courses).filter((c) => isCapExempt(c.code));
    expect(majorPlaced).toHaveLength(2);
    // 전공 계획 학점에는 커리어개발이 들어가지 않는다(전공으로 세지 않음)
    const majorOnly = r.terms.flatMap((t) => t.courses).filter((c) => !isCapExempt(c.code) && fixtureDataset.courses.find((x) => x.code === c.code)?.category?.includes("전공"));
    expect(r.majorProgress!.planned.major).toBe(majorOnly.reduce((a, c) => a + c.credits, 0));
    // 학기 합계 = 배치 과목(커리어개발 포함) + 미지정 자리, 목표학점도 커리어개발 학점까지 세어 채운다
    for (const t of r.terms) expect(t.plannedCredits).toBe(t.courses.reduce((a, c) => a + c.credits, 0) + t.slotCredits);
    expect(input.earnedCredits + r.terms.reduce((a, t) => a + t.plannedCredits, 0)).toBeGreaterThanOrEqual(130);
  });
});
