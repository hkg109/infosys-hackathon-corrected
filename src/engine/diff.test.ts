import { describe, expect, it } from "vitest";
import { sampleInput, sampleInputNoBreak, sampleInputUnknownTarget } from "@/contracts/mock-plan";
import type { PlannedTerm, PlanResult, PlanWarning, Term } from "@/contracts/types";
import { fixtureDataset } from "@/data/fixtures";
import { diffPlans } from "./diff";
import { simulatePlan } from "./simulate";

const study = (term: Term, codes: string[], plannedCredits: number): PlannedTerm => ({
  term,
  status: "study",
  courses: codes.map((code) => ({ code, name: code, credits: 3, group: "common", assumptions: [] })),
  slotCredits: plannedCredits - codes.length * 3,
  plannedCredits,
});

const result = (over: Partial<PlanResult>): PlanResult => ({
  engineVersion: "test",
  catalogVersion: "test",
  error: null,
  terms: [],
  unplaced: [],
  warnings: [],
  expectedCompletion: null,
  estimation: "unavailable",
  remainingCredits: null,
  ...over,
});

const t = (year: number, season: 1 | 2): Term => ({ year, season });

describe("diffPlans", () => {
  it("같은 결과끼리는 차이가 없다", () => {
    const r = simulatePlan(sampleInput, fixtureDataset);
    expect(diffPlans(r, r)).toEqual({
      addedCourses: [],
      removedCourses: [],
      completionDeltaTerms: 0,
      creditDiffByTerm: [],
      newWarnings: [],
    });
  });

  it("추가·삭제 과목을 정렬해서 돌려준다", () => {
    const a = result({ terms: [study(t(2027, 1), ["B", "A", "C"], 9)] });
    const b = result({ terms: [study(t(2027, 1), ["C", "E", "D"], 9)] });
    const d = diffPlans(a, b);
    expect(d.addedCourses).toEqual(["D", "E"]);
    expect(d.removedCourses).toEqual(["A", "B"]);
  });

  it("배치 → 미배치로 옮겨진 과목은 삭제로 보지 않는다", () => {
    const a = result({ terms: [study(t(2027, 1), ["A"], 3)] });
    const b = result({ unplaced: [{ code: "A", name: "A", reason: "x" }] });
    const d = diffPlans(a, b);
    expect(d.addedCourses).toEqual([]);
    expect(d.removedCourses).toEqual([]);
  });

  it("완료 학기 차이를 학기 수로 계산한다(+ 늦어짐, - 앞당김)", () => {
    const a = result({ expectedCompletion: t(2028, 2) });
    const later = result({ expectedCompletion: t(2030, 1) });
    expect(diffPlans(a, later).completionDeltaTerms).toBe(3);
    expect(diffPlans(later, a).completionDeltaTerms).toBe(-3);
  });

  it("한쪽이라도 완료 학기가 없으면 비교하지 않는다(null)", () => {
    const known = simulatePlan(sampleInputNoBreak, fixtureDataset);
    const unknown = simulatePlan(sampleInputUnknownTarget, fixtureDataset);
    expect(diffPlans(known, unknown).completionDeltaTerms).toBeNull();
    expect(diffPlans(unknown, known).completionDeltaTerms).toBeNull();
  });

  it("학기별 학점 차이는 바뀐 학기만, 학기 순서대로 담는다", () => {
    const a = result({ terms: [study(t(2027, 2), [], 15), study(t(2027, 1), [], 18), study(t(2028, 1), [], 12)] });
    const b = result({ terms: [study(t(2027, 1), [], 18), study(t(2027, 2), [], 12), study(t(2028, 2), [], 6)] });
    expect(diffPlans(a, b).creditDiffByTerm).toEqual([
      { term: t(2027, 2), before: 15, after: 12 },
      { term: t(2028, 1), before: 12, after: 0 },
      { term: t(2028, 2), before: 0, after: 6 },
    ]);
  });

  it("새 경고만 돌려주고, 같은 코드라도 과목·학기가 다르면 새 경고로 본다", () => {
    const w = (code: PlanWarning["code"], courseCode?: string, term?: Term): PlanWarning => ({
      code,
      message: "msg",
      courseCode,
      term,
    });
    const a = result({ warnings: [w("TARGET_UNKNOWN"), w("SEMESTER_UNKNOWN", "A", t(2027, 1))] });
    const b = result({
      warnings: [
        { ...w("TARGET_UNKNOWN"), message: "문구만 다름" },
        w("SEMESTER_UNKNOWN", "A", t(2027, 2)),
        w("SEMESTER_UNKNOWN", "B", t(2027, 1)),
      ],
    });
    expect(diffPlans(a, b).newWarnings).toEqual([
      w("SEMESTER_UNKNOWN", "A", t(2027, 2)),
      w("SEMESTER_UNKNOWN", "B", t(2027, 1)),
    ]);
  });

  it("입력 오류 결과와도 비교할 수 있다", () => {
    const ok = simulatePlan(sampleInputNoBreak, fixtureDataset);
    const err = result({ error: "오류", warnings: [{ code: "INVALID_INPUT", message: "오류" }] });
    const d = diffPlans(ok, err);
    expect(d.addedCourses).toEqual([]);
    expect(d.removedCourses.length).toBeGreaterThan(0);
    expect(d.completionDeltaTerms).toBeNull();
    expect(d.newWarnings.map((x) => x.code)).toEqual(["INVALID_INPUT"]);
  });
});
