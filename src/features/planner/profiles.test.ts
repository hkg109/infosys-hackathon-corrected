import { describe, expect, it } from "vitest";
import { fixtureDataset } from "@/data/fixtures";
import { simulatePlan, staleGenEd } from "@/engine";
import { demoGenEd } from "./evidence";
import { candidatePlanInput, draftProblem } from "./plan";
import { migrateDraftV3 } from "./storage";
import { TEST_PROFILES } from "./testProfiles";
import { buildTracks } from "./tracks";

const TODAY = "2026-11-07";

describe("테스트 프로필", () => {
  it("네 프로필 모두 입력 오류 없이 트랙을 만든다(D는 목표학점 확인 전이라도 계산)", () => {
    for (const p of TEST_PROFILES) {
      const d = p.draft(TODAY);
      expect(draftProblem(d, fixtureDataset, TODAY), p.id).toBeNull();
      const set = buildTracks(d, fixtureDataset, TODAY);
      expect(set.tracks.length, p.id).toBeGreaterThan(0);
      expect(d.demo?.label).toMatch(/가상/);
    }
  });

  it("프로필 간 상태가 섞이지 않는다(매번 새 객체, 서로 다른 값)", () => {
    const a1 = TEST_PROFILES[0].draft(TODAY);
    a1.completedCourseCodes.push("XXX0000");
    a1.military.trackIds.push("army-general");
    const a2 = TEST_PROFILES[0].draft(TODAY);
    expect(a2.completedCourseCodes).not.toContain("XXX0000");
    expect(a2.military.trackIds).toEqual(["katusa"]);
    const c = TEST_PROFILES[2].draft(TODAY);
    expect(c.katusa.priority).toBe(false);
    expect(c.military.status).toBe("done");
  });

  it("A: 카투사 조건부·대체 트랙, 균형형·후반 여유형, 교양 2·3학점 자리가 실제로 들어간다", () => {
    const d = TEST_PROFILES[0].draft(TODAY);
    const { tracks } = buildTracks(d, fixtureDataset, TODAY);
    const sec = tracks.filter((t) => t.career === "security");
    expect(sec.some((t) => t.militaryRole === "conditional")).toBe(true);
    expect(sec.some((t) => t.militaryRole === "fallback")).toBe(true);
    expect(new Set(sec.map((t) => t.paceStyle))).toEqual(new Set(["balanced", "late_light"]));
    const t = sec.find((x) => x.militaryRole === "fallback")!;
    const result = simulatePlan(candidatePlanInput(t.candidate)!, fixtureDataset);
    const ge = demoGenEd(result, d.demo);
    expect(ge.items.map((g) => g.credits).sort()).toEqual([2, 3]);
    expect(ge.items.every((g) => g.origin === "demo")).toBe(true);
    expect(staleGenEd(ge, result.terms)).toEqual([]);
  });

  it("C: 3학년부터 시작, 이수 과목 재배치 없음, 4학년이 가볍고 목표학점을 채우도록 완료 학기 연장", () => {
    const d = TEST_PROFILES[2].draft(TODAY);
    const { tracks } = buildTracks(d, fixtureDataset, TODAY);
    const t = tracks.find((x) => x.career === "consulting")!;
    const res = t.candidate.result!;
    expect(res.terms[0].termOrdinal).toBe(7);
    for (const term of res.terms) for (const x of term.courses) expect(d.completedCourseCodes).not.toContain(x.code);
    expect(res.terms.every((x) => x.status !== "study" || (x.planLimitCredits ?? 99) <= 12)).toBe(true);
    // 학교 상한은 3·4학년 18(계획 한도 12와 별개)
    expect(res.terms.filter((x) => x.status === "study").every((x) => x.capCredits === 18)).toBe(true);
    // 남은 30학점을 학기당 12학점 이하로 → 3학기
    expect(res.terms.filter((x) => x.status === "study").length).toBe(3);
    expect(res.expectedCompletion).toEqual({ year: 2028, season: 1 });
  });
});

describe("졸업 기준", () => {
  it("개인 졸업사정 값을 학교 공통 규칙으로 쓰지 않는다(fixture 규칙은 미확인 그대로)", () => {
    const rule = fixtureDataset.rules.find((r) => r.key === "graduation.totalCredits")!;
    expect(rule.status).toBe("unknown");
    expect(rule.value).toBe("unknown");
    expect(JSON.stringify(fixtureDataset.rules)).not.toMatch(/\b81\b/);
  });
});

describe("저장 형식 이전", () => {
  it("스키마 3 입력을 4로 옮기고, 확인되지 않은 복무기간(18·20·21 선택지)은 가져오지 않는다", () => {
    const d = migrateDraftV3(
      { schemaVersion: 3, name: "x", admissionYear: 2026, completedTerms: 2, earnedCredits: 36, earnedMajorCredits: 9, completedCourseCodes: ["CSE1002"], targetCredits: 130, startTerm: { year: 2027, season: 1 }, answers: { a: "b" }, military: { mode: "recommend", months: 18, startDate: null }, exchange: { mode: "none", ordinal: null }, priority: "career_core" },
      TODAY,
    );
    expect(d.schemaVersion).toBe(4);
    expect(d.completedTerms).toBe(2);
    expect(d.military).toMatchObject({ status: "planned", months: null, timing: "recommend" });
    expect(d.career).toBe("unsure");
  });
});
