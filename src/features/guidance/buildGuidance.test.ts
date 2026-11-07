import { describe, expect, it } from "vitest";
import { sampleInput, sampleInputNoBreak, sampleInputUnknownTarget } from "@/contracts/mock-plan";
import type { Dataset, PlanInput, PlanResult } from "@/contracts/types";
import { fixtureDataset } from "@/data/fixtures";
import { simulatePlan } from "@/engine";
import { buildGuidance } from "./buildGuidance";

const verifiedDataset: Dataset = {
  ...fixtureDataset,
  rules: fixtureDataset.rules.map((r) => ({ ...r, status: "verified" as const })),
};

const ids = (input: PlanInput, dataset: Dataset = fixtureDataset, result?: PlanResult) =>
  buildGuidance(input, result ?? simulatePlan(input, dataset), dataset).items.map((i) => i.id);

describe("buildGuidance", () => {
  it("군 복무가 있으면 복학 일정 확인을 맨 앞에 둔다", () => {
    expect(ids(sampleInput)[0]).toBe("military");
  });

  it("군 복무가 아닌 중단은 휴학·복학 절차로 안내한다", () => {
    const input: PlanInput = {
      ...sampleInputNoBreak,
      breaks: [{ kind: "leave", startDate: "2028-03-01", endDate: "2028-07-01" }],
    };
    const got = ids(input);
    expect(got[0]).toBe("leave");
    expect(got).not.toContain("military");
  });

  it("군 복무와 휴학이 함께 있으면 군 복무 안내 하나만 낸다", () => {
    const input: PlanInput = {
      ...sampleInput,
      breaks: [...sampleInput.breaks, { kind: "leave", startDate: "2030-03-01", endDate: "2030-07-01" }],
    };
    const got = ids(input);
    expect(got).toContain("military");
    expect(got).not.toContain("leave");
  });

  it("중단이 없으면 다음 학기 수강편람 확인을 안내하고 출처를 단다", () => {
    const g = buildGuidance(sampleInputNoBreak, simulatePlan(sampleInputNoBreak, fixtureDataset), fixtureDataset);
    expect(g.items[0].id).toBe("next-term");
    expect(g.items[0].sourceIds).toEqual(fixtureDataset.sources.map((s) => s.id));
  });

  it("개설 가정(종료연도 이후·학기 미확인) 경고가 있으면 개설 확인을 안내한다", () => {
    const r = simulatePlan(sampleInputNoBreak, fixtureDataset);
    expect(r.warnings.some((w) => w.code === "OFFERING_ASSUMED" || w.code === "SEMESTER_UNKNOWN")).toBe(true);
    expect(ids(sampleInputNoBreak, fixtureDataset, r)).toContain("offering");

    const clean: PlanResult = { ...r, warnings: [] };
    expect(ids(sampleInputNoBreak, verifiedDataset, clean)).not.toContain("offering");
  });

  it("미배치 과목이 있으면 개수를 제목에 넣는다", () => {
    const r = simulatePlan(sampleInputNoBreak, fixtureDataset);
    const withUnplaced: PlanResult = {
      ...r,
      unplaced: [
        { code: "X1", name: "X1", reason: "r" },
        { code: "X2", name: "X2", reason: "r" },
      ],
    };
    const g = buildGuidance(sampleInputNoBreak, withUnplaced, fixtureDataset);
    expect(g.items.find((i) => i.id === "unplaced")?.title).toContain("2개");
  });

  it("목표학점 미입력이거나 졸업요건이 확인 전이면 요건 확인을 안내한다", () => {
    expect(ids(sampleInputUnknownTarget, verifiedDataset)).toContain("requirements");
    expect(ids(sampleInputNoBreak, fixtureDataset)).toContain("requirements");
    const r = simulatePlan(sampleInputNoBreak, verifiedDataset);
    expect(ids(sampleInputNoBreak, verifiedDataset, { ...r, warnings: [] })).not.toContain("requirements");
  });

  it("진로 안내는 선택한 진로 이름을 쓴다", () => {
    const sec = buildGuidance(sampleInputNoBreak, simulatePlan(sampleInputNoBreak, verifiedDataset), verifiedDataset);
    const dataInput: PlanInput = { ...sampleInputNoBreak, track: "data" };
    const data = buildGuidance(dataInput, simulatePlan(dataInput, verifiedDataset), verifiedDataset);
    expect(sec.items.find((i) => i.id === "career")?.title).toContain("정보보안");
    expect(data.items.find((i) => i.id === "career")?.title).toContain("데이터 분석");
  });

  it("항목은 최대 5개이고 id는 겹치지 않는다", () => {
    const r = simulatePlan(sampleInput, fixtureDataset);
    const crowded: PlanResult = { ...r, unplaced: [{ code: "X", name: "X", reason: "r" }] };
    const g = buildGuidance(sampleInputUnknownTarget, crowded, fixtureDataset);
    expect(g.items.length).toBeLessThanOrEqual(5);
    expect(new Set(g.items.map((i) => i.id)).size).toBe(g.items.length);
  });

  it("자료에 없는 출처를 달지 않는다", () => {
    const known = new Set(fixtureDataset.sources.map((s) => s.id));
    const g = buildGuidance(sampleInput, simulatePlan(sampleInput, fixtureDataset), fixtureDataset);
    for (const item of g.items) for (const id of item.sourceIds) expect(known.has(id)).toBe(true);
  });

  it("확인하지 않은 날짜를 만들어 안내하지 않는다", () => {
    for (const input of [sampleInput, sampleInputNoBreak, sampleInputUnknownTarget]) {
      const g = buildGuidance(input, simulatePlan(input, fixtureDataset), fixtureDataset);
      for (const item of g.items) expect(`${item.title} ${item.detail}`).not.toMatch(/\d{4}-\d{2}|\d+월\s*\d+일/);
    }
  });
});
