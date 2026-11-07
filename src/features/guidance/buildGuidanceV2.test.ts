import { describe, expect, it } from "vitest";
import { sampleInputV2, sampleInputV2ExchangeUnknown, sampleInputV2NoTarget, sampleRecommendationConfig } from "@/contracts/mock-plan";
import type { PlanInputV2 } from "@/contracts/types";
import { fixtureDataset } from "@/data/fixtures";
import { generateCandidates } from "@/engine";
import { buildGuidanceV2 } from "./buildGuidanceV2";

const guide = (input: PlanInputV2) => {
  const c = generateCandidates(input, fixtureDataset, sampleRecommendationConfig).candidates[0];
  return buildGuidanceV2(c.input, c.result!, fixtureDataset, sampleRecommendationConfig).items;
};

describe("buildGuidanceV2", () => {
  it("군 복무 뒤 첫 수강 학기에 '복학 전 교육과정 재확인'을 단다", () => {
    const item = guide(sampleInputV2).find((i) => i.id === "return-curriculum:mil-1");
    expect(item?.timing).toEqual({ kind: "relative", anchor: "before_return", term: { year: 2030, season: 1 }, label: "복학 전" });
    expect(item?.evidence).toBe("official");
  });

  it("입대 시점이 바뀌면 복학 재확인 시점과 체크 키가 바뀐다", () => {
    const a = guide(sampleInputV2).find((i) => i.id === "return-curriculum:mil-1")!;
    const moved = { ...sampleInputV2, periods: [{ ...sampleInputV2.periods[0], startDate: "2029-03-01", endDate: "2030-10-01" }] };
    const b = guide(moved).find((i) => i.id === "return-curriculum:mil-1")!;
    expect(b.timing).not.toEqual(a.timing);
    expect(b.checkKey).not.toBe(a.checkKey);
  });

  it("중단이 없으면 복학 재확인을 만들지 않는다", () => {
    const items = guide({ ...sampleInputV2, periods: [], military: "not_applicable" });
    expect(items.some((i) => i.id.startsWith("return-curriculum"))).toBe(false);
    expect(items[0].id).toBe("next-term");
  });

  it("교환 인정 미정이면 인정 확인을 안내한다", () => {
    expect(guide(sampleInputV2ExchangeUnknown).map((i) => i.id)).toContain("exchange:exc-1");
  });

  it("목표학점이 없으면 졸업사정조회 확인을 안내한다", () => {
    expect(guide(sampleInputV2NoTarget).find((i) => i.id === "requirements")?.detail).toContain("목표 총학점이 없어");
  });

  it("날짜를 만들지 않고, 자료에 없는 출처를 달지 않는다", () => {
    const known = new Set(fixtureDataset.sources.map((s) => s.id));
    for (const i of guide(sampleInputV2ExchangeUnknown)) {
      expect(i.timing.kind).toBe("relative");
      expect(i.sourceIds.every((s) => known.has(s))).toBe(true);
    }
  });

  it("id가 겹치지 않는다", () => {
    const items = guide({ ...sampleInputV2, careers: ["security", "data"] });
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });
});
