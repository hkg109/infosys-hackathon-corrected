import { describe, expect, it } from "vitest";
import type { CareerTrack } from "@/contracts/types";
import { fixtureDataset } from "@/data/fixtures";
import { generateCandidates, termIndex } from "@/engine";
import { blankDraft, type Draft, draftProblem, draftToInputV2 } from "./plan";
import { curriculumCovers } from "./profile";

const TODAY = "2026-11-07";
const draft = (p: Partial<Draft>): Draft => ({
  ...blankDraft(TODAY),
  admissionYear: 2024,
  completedTerms: 0,
  earnedCredits: 0,
  earnedMajorCredits: 0,
  coursesConfirmed: true,
  targetCredits: 130,
  career: "data",
  paceCredits: 18,
  paceStyle: "balanced",
  military: { ...blankDraft(TODAY).military, status: "none" },
  leave: { mode: "none", ordinal: null },
  exchange: { mode: "none", ordinal: null },
  priority: "fast_completion",
  ...p,
});
const run = (d: Draft, career: CareerTrack = "data") => generateCandidates(draftToInputV2(d, fixtureDataset, [career]), fixtureDataset, undefined, { today: TODAY });

describe("계획 시작 학기와 유효학기", () => {
  it.each([
    [0, 2026, 0],
    [2, 2026, 2],
    [4, 2025, 4],
    [6, 2024, 6],
  ])("완료 학기 %i(입학 %i): 첫 계획 학기는 %i+1번째 유효학기", (done, adm) => {
    const set = run(draft({ completedTerms: done, admissionYear: adm, earnedCredits: done * 17, earnedMajorCredits: done * 6 }));
    const first = set.candidates[0].result!.terms.find((t) => t.status === "study")!;
    expect(first.termOrdinal).toBe(done + 1);
    expect(first.term).toEqual({ year: 2027, season: 1 });
  });

  it("이미 이수한 과목은 미래 계획에 다시 배치하지 않는다", () => {
    const done = ["CSE1002", "ITE1012", "ITE1009", "ITE3016", "MAT4015", "ITE3025"];
    const set = run(draft({ completedTerms: 4, admissionYear: 2025, earnedCredits: 70, earnedMajorCredits: 30, completedCourseCodes: done }));
    for (const c of set.candidates) for (const t of c.result!.terms) for (const x of t.courses) expect(done).not.toContain(x.code);
  });

  it("2학년·3학년부터 시작하면 그 학년 과목부터 배치된다", () => {
    const third = run(draft({ completedTerms: 4, admissionYear: 2025, earnedCredits: 70, earnedMajorCredits: 30 }));
    const firstTerm = third.candidates[0].result!.terms[0];
    expect(firstTerm.termOrdinal).toBe(5);
    const fourth = run(draft({ completedTerms: 6, admissionYear: 2024, earnedCredits: 100, earnedMajorCredits: 50 }));
    expect(fourth.candidates[0].result!.terms[0].termOrdinal).toBe(7);
  });

  it("군휴학으로 달력 학년과 유효학기가 다르면 유효학기 기준(입학 2023, 달력상 8학기 지났지만 4학기 완료)", () => {
    const set = run(draft({ admissionYear: 2023, completedTerms: 4, earnedCredits: 70, earnedMajorCredits: 30 }));
    expect(set.emptyReason).toBeNull();
    expect(set.candidates[0].result!.terms.find((t) => t.status === "study")!.termOrdinal).toBe(5);
  });

  it("입학 후 지난 학기보다 많은 완료 학기는 입력 오류", () => {
    const p = draftProblem(draft({ admissionYear: 2026, completedTerms: 4, earnedCredits: 70, earnedMajorCredits: 20 }), fixtureDataset, TODAY);
    expect(p?.step).toBe("completed");
  });

  it("이미 지난 학기를 시작 학기로 고르면 입력 오류(그 질문으로 이동)", () => {
    const p = draftProblem(draft({ startTerm: { year: 2026, season: 1 } }), fixtureDataset, TODAY);
    expect(p).toMatchObject({ step: "start" });
    expect(run(draft({ startTerm: { year: 2026, season: 1 } })).candidates).toHaveLength(0);
  });

  it("시작 학기·완료 학기 미입력은 0으로 바꾸지 않고 해당 질문으로 안내", () => {
    expect(draftProblem(draft({ startTerm: null }), fixtureDataset, TODAY)?.step).toBe("start");
    expect(draftProblem(draft({ completedTerms: null }), fixtureDataset, TODAY)?.step).toBe("completed");
  });

  it("적용 교육과정 범위 밖 입학연도는 자료 범위 확인 필요", () => {
    expect(curriculumCovers(fixtureDataset.curriculum, 2023)).toBe(false);
    expect(curriculumCovers(fixtureDataset.curriculum, null)).toBeNull();
  });

  it("휴학 한 학기를 고르면 그 학기는 중단으로 두고 다음 학기에 이어간다", () => {
    const set = run(draft({ completedTerms: 2, admissionYear: 2026, earnedCredits: 36, earnedMajorCredits: 9, leave: { mode: "pick", ordinal: 4 } }));
    const terms = set.candidates[0].result!.terms;
    const leave = terms.find((t) => t.status === "break")!;
    expect(termIndex(leave.term)).toBe(termIndex({ year: 2028, season: 1 }));
    expect(terms.find((t) => termIndex(t.term) === termIndex(leave.term) + 1)?.termOrdinal).toBe(5);
  });
});
