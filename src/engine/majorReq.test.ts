import { describe, expect, it } from "vitest";
import { sampleInputNoBreak } from "@/contracts/mock-plan";
import type { MajorRequirement, PlanInput } from "@/contracts/types";
import { fixtureDataset } from "@/data/fixtures";
import { courseLevel, majorShortfall } from "./majorReq";
import { schoolMinFor } from "./pace";
import { recommendedCourses, simulatePlan } from "./simulate";

const req: MajorRequirement = { majorCredits: 81, lowerLevelCredits: 69, upperLevelCredits: 12, source: "graduation_check" };
const withReq = (patch: Partial<PlanInput> = {}): PlanInput => ({ ...sampleInputNoBreak, majorRequirement: req, ...patch });
const sumSlots = (r: ReturnType<typeof simulatePlan>, k: "majorSlotCredits" | "upperMajorSlotCredits") => r.terms.reduce((a, t) => a + (t[k] ?? 0), 0);

describe("전공 요건(졸업사정) 반영", () => {
  it("학수번호 첫 숫자로 단위를 나눈다", () => {
    expect(courseLevel("ITE2020")).toBe("lower");
    expect(courseLevel("I-D3018")).toBe("lower");
    expect(courseLevel("ITE4023")).toBe("upper");
    expect(courseLevel("GEN0044")).toBe("unknown");
  });

  it("전공 요건이 없으면 예전과 같은 결과", () => {
    const a = simulatePlan(sampleInputNoBreak, fixtureDataset);
    const b = simulatePlan({ ...sampleInputNoBreak, majorRequirement: null }, fixtureDataset);
    expect(b).toEqual(a);
    expect(a.majorProgress).toBeUndefined();
  });

  it("추천 과목으로 모자란 전공 학점은 전공 선택 자리로 채우고, 합계는 요건과 맞는다", () => {
    const r = simulatePlan(withReq(), fixtureDataset);
    const mp = r.majorProgress!;
    expect(mp.extra.major).toBeGreaterThan(0);
    expect(sumSlots(r, "majorSlotCredits")).toBe(mp.extra.major);
    expect(mp.earned.major + mp.planned.major + mp.extra.major).toBeGreaterThanOrEqual(81);
    expect(mp.earned.upper + mp.planned.upper + mp.extra.upper).toBeGreaterThanOrEqual(12);
    expect(mp.met).toBe(true);
    expect(r.warnings.some((w) => w.code === "MAJOR_EXTRA")).toBe(true);
    // 전공 선택 자리는 미지정 학점의 일부(총학점에 더하지 않는다)
    for (const t of r.terms) expect(t.majorSlotCredits ?? 0).toBeLessThanOrEqual(t.slotCredits);
  });

  it("400단위 자리는 3학년부터 둔다", () => {
    const r = simulatePlan(withReq({ completedTerms: 0, earnedCredits: 0, earnedMajorCredits: 0, completedCourseCodes: [], startTerm: { year: 2027, season: 1 } }), fixtureDataset);
    const study = r.terms.filter((t) => t.status === "study");
    study.slice(0, 4).forEach((t) => expect(t.upperMajorSlotCredits ?? 0).toBe(0));
  });

  it("목표학점을 몰라도 전공 요건을 채울 때까지 계획한다", () => {
    const r = simulatePlan(withReq({ targetCredits: null }), fixtureDataset);
    expect(r.majorProgress!.met).toBe(true);
    expect(r.expectedCompletion).toBeNull();
  });

  it("400단위 이수학점을 모르면 이수 과목으로 추정했다고 알린다", () => {
    const r = simulatePlan(withReq({ completedCourseCodes: [...sampleInputNoBreak.completedCourseCodes, "ITE4023"] }), fixtureDataset);
    expect(r.majorProgress!.earned).toMatchObject({ upper: 3, upperEstimated: true });
    expect(r.warnings.some((w) => w.code === "MAJOR_LEVEL_ESTIMATED")).toBe(true);
    const given = simulatePlan(withReq({ earnedUpperMajorCredits: 6 }), fixtureDataset);
    expect(given.majorProgress!.earned).toMatchObject({ upper: 6, upperEstimated: false });
  });

  it("400단위 이수학점이 전공 이수학점보다 크면 입력 오류", () => {
    expect(simulatePlan(withReq({ earnedUpperMajorCredits: 99 }), fixtureDataset).error).not.toBeNull();
  });

  it("요건은 최소값으로 본다: 400단위만 모자라도 major는 upper+lower 이상", () => {
    const s = majorShortfall({ ...req, majorCredits: 10 }, { major: 0, lower: 0, upper: 0 }, { major: 0, lower: 0, upper: 0, unknownLevel: 0 });
    expect(s).toEqual({ major: 81, lower: 69, upper: 12 });
  });
});

describe("학교 최소 신청학점(S2 17~18쪽)", () => {
  it("1~7번째 학기는 10학점, 8번째부터는 적용하지 않는다", () => {
    expect(schoolMinFor(fixtureDataset.creditCapRules, 2025, 3)?.min).toBe(10);
    expect(schoolMinFor(fixtureDataset.creditCapRules, 2026, 6)?.min).toBe(10);
    expect(schoolMinFor(fixtureDataset.creditCapRules, null, 1)?.min).toBe(10);
    expect(schoolMinFor(fixtureDataset.creditCapRules, 2025, 8)).toBeNull();
  });

  it("남은 과목이 적어도 1~7번째 학기는 10학점까지 미지정 자리로 채운다", () => {
    const r = simulatePlan({ ...sampleInputNoBreak, earnedCredits: 140, targetCredits: 130, completedTerms: 2 }, fixtureDataset);
    const ordinalOf = (i: number) => 2 + i + 1;
    r.terms.filter((t) => t.status === "study").forEach((t, i) => {
      if (ordinalOf(i) <= 7) expect(t.plannedCredits).toBeGreaterThanOrEqual(10);
    });
  });
});

describe("금융 진로", () => {
  it("금융 진로 추천 과목은 공통 + 금융 태그 과목이고, 다른 진로와 겹치는 과목도 금융 그룹으로 표시한다", () => {
    const codes = recommendedCourses(fixtureDataset, "finance").map((c) => c.code);
    expect(codes).toEqual(expect.arrayContaining(["BUS3002", "MAT4015", "ITE4087", "ITE4049", "ITE4031", "CSE1002"]));
    const r = simulatePlan({ ...sampleInputNoBreak, track: "finance" }, fixtureDataset);
    const bus = r.terms.flatMap((t) => t.courses).find((c) => c.code === "BUS3002");
    expect(bus?.group).toBe("finance");
    const biz = simulatePlan({ ...sampleInputNoBreak, track: "business" }, fixtureDataset);
    expect(biz.terms.flatMap((t) => t.courses).find((c) => c.code === "BUS3002")?.group).toBe("business");
  });
});
