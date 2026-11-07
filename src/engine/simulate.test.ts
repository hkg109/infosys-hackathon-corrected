import { describe, expect, it } from "vitest";
import {
  sampleInput,
  sampleInputInvalid,
  sampleInputNoBreak,
  sampleInputUnknownTarget,
} from "@/contracts/mock-plan";
import type { Dataset } from "@/contracts/types";
import { fixtureDataset } from "@/data/fixtures";
import { diffPlans } from "./diff";
import { simulatePlan } from "./simulate";
import { isBlocked } from "./terms";

const codesOf = (r: ReturnType<typeof simulatePlan>) =>
  r.terms.flatMap((t) => t.courses.map((c) => c.code));

describe("simulatePlan", () => {
  it("같은 입력·자료면 같은 결과", () => {
    expect(simulatePlan(sampleInput, fixtureDataset)).toEqual(simulatePlan(sampleInput, fixtureDataset));
  });

  it("이수 완료 과목을 다시 배치하지 않는다", () => {
    const placed = codesOf(simulatePlan(sampleInput, fixtureDataset));
    for (const code of sampleInput.completedCourseCodes) expect(placed).not.toContain(code);
  });

  it("학기당 상한을 넘지 않는다", () => {
    const r = simulatePlan({ ...sampleInputNoBreak, creditCap: 9 }, fixtureDataset);
    for (const t of r.terms) expect(t.plannedCredits).toBeLessThanOrEqual(9);
  });

  it("중단 기간과 겹치는 학기는 배치하지 않는다", () => {
    const r = simulatePlan(sampleInput, fixtureDataset);
    const blocked = r.terms.filter((t) => t.status === "break");
    expect(blocked.length).toBeGreaterThan(0);
    for (const t of blocked) expect(t.courses).toHaveLength(0);
  });

  it("종료일과 학기 시작일이 같으면 그 학기는 막지 않는다 [start, end)", () => {
    const breaks = [{ kind: "leave" as const, startDate: "2028-01-01", endDate: "2028-03-01" }];
    expect(isBlocked({ year: 2028, season: 1 }, breaks)).toBe(false);
    expect(isBlocked({ year: 2028, season: 1 }, [{ ...breaks[0], endDate: "2028-03-02" }])).toBe(true);
  });

  it("중단 기간이 있으면 완료 시점이 늦어진다", () => {
    const a = simulatePlan(sampleInputNoBreak, fixtureDataset);
    const b = simulatePlan(sampleInput, fixtureDataset);
    expect(diffPlans(a, b).completionDeltaTerms).toBeGreaterThan(0);
  });

  it("목표학점을 모르면 완료 학기를 만들지 않는다", () => {
    const r = simulatePlan(sampleInputUnknownTarget, fixtureDataset);
    expect(r.expectedCompletion).toBeNull();
    expect(r.warnings.map((w) => w.code)).toContain("TARGET_UNKNOWN");
  });

  it("입력 오류는 결과처럼 꾸미지 않고 이유를 반환한다", () => {
    const r = simulatePlan(sampleInputInvalid, fixtureDataset);
    expect(r.error).not.toBeNull();
    expect(r.terms).toHaveLength(0);
  });

  it("공식 선수과목이 끝나기 전에는 후속 과목을 배치하지 않는다", () => {
    const ds: Dataset = {
      ...fixtureDataset,
      courses: fixtureDataset.courses.map((c) =>
        c.code === "ITE2023" ? { ...c, prerequisites: ["APA2054"], prerequisiteStatus: "verified" } : c,
      ),
    };
    const r = simulatePlan(sampleInputNoBreak, ds);
    const termOf = (code: string) => r.terms.findIndex((t) => t.courses.some((c) => c.code === code));
    expect(termOf("ITE2023")).toBeGreaterThan(termOf("APA2054"));
  });

  it("진로를 바꾸면 추천 과목이 달라진다", () => {
    const sec = simulatePlan(sampleInputNoBreak, fixtureDataset);
    const data = simulatePlan({ ...sampleInputNoBreak, track: "data" }, fixtureDataset);
    const d = diffPlans(sec, data);
    expect(d.addedCourses.length).toBeGreaterThan(0);
    expect(d.removedCourses.length).toBeGreaterThan(0);
  });
});
