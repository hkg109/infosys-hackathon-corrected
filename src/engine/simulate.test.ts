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
import { MAX_FUTURE_TERMS, simulatePlan } from "./simulate";
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

describe("simulatePlan 경계 상황", () => {
  const studyTerms = (r: ReturnType<typeof simulatePlan>) => r.terms.filter((t) => t.status === "study");
  const withCourse = (patch: (c: Dataset["courses"][number]) => Dataset["courses"][number]): Dataset => ({
    ...fixtureDataset,
    courses: fixtureDataset.courses.map(patch),
  });

  it("중단 기간이 여러 개면 각각의 학기를 모두 막는다", () => {
    const r = simulatePlan(
      {
        ...sampleInputNoBreak,
        breaks: [
          { kind: "leave", startDate: "2027-09-01", endDate: "2028-01-01" },
          { kind: "leave", startDate: "2029-03-01", endDate: "2029-07-01" },
        ],
      },
      fixtureDataset,
    );
    const blocked = r.terms.filter((t) => t.status === "break").map((t) => t.term);
    expect(blocked).toEqual([
      { year: 2027, season: 2 },
      { year: 2029, season: 1 },
    ]);
  });

  it("겹치는 중단 기간도 학기를 한 번만 막는다", () => {
    const r = simulatePlan(
      {
        ...sampleInputNoBreak,
        breaks: [
          { kind: "military", startDate: "2027-05-01", endDate: "2028-05-01" },
          { kind: "leave", startDate: "2027-10-01", endDate: "2027-12-01" },
        ],
      },
      fixtureDataset,
    );
    const breakTerms = r.terms.filter((t) => t.status === "break");
    expect(breakTerms).toHaveLength(3);
    expect(new Set(breakTerms.map((t) => `${t.term.year}-${t.term.season}`)).size).toBe(3);
  });

  it("방학(1–2월·7–8월)에만 걸친 중단은 어떤 학기도 막지 않는다", () => {
    const base = simulatePlan(sampleInputNoBreak, fixtureDataset);
    const vacation = simulatePlan(
      {
        ...sampleInputNoBreak,
        breaks: [
          { kind: "leave", startDate: "2027-07-01", endDate: "2027-09-01" },
          { kind: "leave", startDate: "2028-01-01", endDate: "2028-03-01" },
        ],
      },
      fixtureDataset,
    );
    expect(vacation.terms.every((t) => t.status === "study")).toBe(true);
    expect(vacation.terms).toEqual(base.terms);
    expect(vacation.expectedCompletion).toEqual(base.expectedCompletion);
  });

  it("학기 마지막 날 하루만 걸쳐도 그 학기는 막는다", () => {
    const r = simulatePlan(
      { ...sampleInputNoBreak, breaks: [{ kind: "leave", startDate: "2027-06-30", endDate: "2027-07-01" }] },
      fixtureDataset,
    );
    expect(r.terms[0]).toMatchObject({ term: { year: 2027, season: 1 }, status: "break" });
  });

  it("중단 학기는 학년 진행에 세지 않는다", () => {
    // 2학년 과목(ELE3019, 1학기)은 휴학한 학기가 끝난 뒤에야 놓인다.
    const r = simulatePlan(
      {
        ...sampleInputNoBreak,
        completedTerms: 0,
        completedCourseCodes: [],
        breaks: [{ kind: "leave", startDate: "2027-03-01", endDate: "2028-01-01" }],
      },
      fixtureDataset,
    );
    const first = r.terms.findIndex((t) => t.courses.some((c) => c.code === "ELE3019"));
    expect(r.terms[first].term).toEqual({ year: 2029, season: 1 });
  });

  it("목표학점을 이미 채웠으면 빈 학점 슬롯 없이 남은 추천 과목만 배치한다", () => {
    const r = simulatePlan({ ...sampleInputNoBreak, earnedCredits: 140, targetCredits: 130 }, fixtureDataset);
    expect(r.error).toBeNull();
    expect(r.remainingCredits).toBe(0);
    for (const t of r.terms) expect(t.slotCredits).toBe(0);
    const last = studyTerms(r).filter((t) => t.courses.length > 0).at(-1);
    expect(r.expectedCompletion).toEqual(last?.term);
  });

  it("목표학점을 채웠고 남은 과목도 없으면 빈 계획에서 바로 끝난다", () => {
    const all = fixtureDataset.courses.map((c) => c.code);
    const r = simulatePlan(
      { ...sampleInputNoBreak, completedCourseCodes: all, earnedCredits: 130, targetCredits: 130 },
      fixtureDataset,
    );
    expect(r.terms).toHaveLength(0);
    expect(r.unplaced).toHaveLength(0);
    expect(r.remainingCredits).toBe(0);
    expect(r.warnings.map((w) => w.code)).not.toContain("SEARCH_LIMIT");
  });

  it("남은 학점이 상한보다 작으면 마지막 학기는 남은 만큼만 계획한다", () => {
    const all = fixtureDataset.courses.map((c) => c.code);
    const r = simulatePlan(
      { ...sampleInputNoBreak, completedCourseCodes: all, earnedCredits: 120, targetCredits: 130, creditCap: 18 },
      fixtureDataset,
    );
    expect(r.terms.map((t) => t.plannedCredits)).toEqual([10]);
    expect(r.expectedCompletion).toEqual(sampleInputNoBreak.startTerm);
  });

  it("다른 진로에만 있는 선수과목을 요구하면 빈 학기를 쌓지 않고 바로 미배치로 둔다", () => {
    // 보안 과목 ITE4023이 데이터 진로 과목 ITE4086을 선수로 요구한다고 가정
    const ds = withCourse((c) =>
      c.code === "ITE4023" ? { ...c, prerequisites: ["ITE4086"], prerequisiteStatus: "verified" } : c,
    );
    const r = simulatePlan(sampleInputNoBreak, ds);
    expect(r.unplaced.map((u) => u.code)).toEqual(["ITE4023"]);
    expect(r.unplaced[0].reason).toContain("ITE4086");
    expect(r.warnings.map((w) => w.code)).not.toContain("SEARCH_LIMIT");
    expect(r.terms.length).toBeLessThan(MAX_FUTURE_TERMS);
    expect(r.expectedCompletion).toBeNull();
    expect(r.estimation).toBe("unavailable");
  });

  it("막힌 선수과목에 연쇄로 걸린 과목도 함께 미배치로 둔다", () => {
    const ds = withCourse((c) =>
      c.code === "ITE4023"
        ? { ...c, prerequisites: ["NOPE999"] }
        : c.code === "ITE4049"
          ? { ...c, prerequisites: ["ITE4023"] }
          : c,
    );
    const r = simulatePlan(sampleInputNoBreak, ds);
    expect(r.unplaced.map((u) => u.code).sort()).toEqual(["ITE4023", "ITE4049"]);
    expect(r.warnings.map((w) => w.code)).not.toContain("SEARCH_LIMIT");
  });

  it("이미 이수한 선수과목은 다른 진로 과목이어도 충족으로 본다", () => {
    const ds = withCourse((c) => (c.code === "ITE4023" ? { ...c, prerequisites: ["ITE4086"] } : c));
    const r = simulatePlan(
      { ...sampleInputNoBreak, completedCourseCodes: [...sampleInputNoBreak.completedCourseCodes, "ITE4086"] },
      ds,
    );
    expect(r.unplaced).toHaveLength(0);
    expect(codesOf(r)).toContain("ITE4023");
  });

  it("학기당 상한보다 학점이 큰 과목은 이유와 함께 미배치로 둔다", () => {
    // 목표학점을 빼서 학점 슬롯 때문에 생기는 SEARCH_LIMIT와 구분한다.
    const r = simulatePlan({ ...sampleInputNoBreak, creditCap: 2, targetCredits: null }, fixtureDataset);
    expect(codesOf(r)).toEqual(["ITE4088"]);
    expect(r.unplaced.length).toBeGreaterThan(0);
    expect(r.unplaced.every((u) => u.reason.includes("상한"))).toBe(true);
    expect(r.warnings.map((w) => w.code)).not.toContain("SEARCH_LIMIT");
  });

  it("숫자가 아닌 입력(NaN)은 입력 오류로 돌려준다", () => {
    for (const patch of [
      { earnedCredits: Number.NaN },
      { earnedMajorCredits: Number.NaN },
      { targetCredits: Number.NaN },
      { completedTerms: 1.5 },
      { startTerm: { year: 2027, season: 3 as 1 } },
    ]) {
      const r = simulatePlan({ ...sampleInputNoBreak, ...patch }, fixtureDataset);
      expect(r.error).not.toBeNull();
      expect(r.warnings.map((w) => w.code)).toEqual(["INVALID_INPUT"]);
    }
  });

  it("선수요건 미확인 경고는 이 진로의 계획 과목만 보고 판단한다", () => {
    const ds = withCourse((c) =>
      c.code === "ITE4086" ? c : { ...c, prerequisiteStatus: "verified" as const },
    );
    expect(simulatePlan(sampleInputNoBreak, ds).warnings.map((w) => w.code)).not.toContain("PREREQ_UNKNOWN");
    expect(
      simulatePlan({ ...sampleInputNoBreak, track: "data" }, ds).warnings.map((w) => w.code),
    ).toContain("PREREQ_UNKNOWN");
  });
});
