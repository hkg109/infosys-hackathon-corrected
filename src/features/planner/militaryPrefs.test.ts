import { describe, expect, it } from "vitest";
import { fixtureDataset } from "@/data/fixtures";
import { militaryPlanFor, parseMilitarySentence, toPlanningInput } from "./militaryPrefs";
import { blankDraft } from "./plan";

const today = "2026-11-08";
const draft = (prefs: Parameters<typeof toPlanningInput>[0]["militaryPrefs"]) => ({
  ...blankDraft(today),
  completedTerms: 2,
  military: { ...blankDraft(today).military, status: "planned" as const },
  militaryPrefs: prefs,
});

describe("parseMilitarySentence", () => {
  it("육군 일반병 + 카투사 고려를 알아듣는다(자동 확정 없이 patch만)", () => {
    const r = parseMilitarySentence("육군 일반병을 생각하고 있고 카투사도 지원해 보고 싶어요.");
    expect(r.patch).toMatchObject({ branch: "army", katusa: "consider", status: "planned" });
    expect(r.understood).toEqual(["육군 선호", "일반 입영을 안전장치로 확보", "카투사 고려"]);
  });
  it("카투사 최우선·IT·공군", () => {
    expect(parseMilitarySentence("공군 IT개발관리병, 카투사는 꼭 1순위").patch).toMatchObject({ branch: "air_force", katusa: "first_priority", it: "high" });
  });
  it("카투사 제외 표현", () => {
    expect(parseMilitarySentence("카투사는 생각없고 빨리 가고 싶어요").patch).toMatchObject({ katusa: "exclude", goal: "fast_stable" });
  });
  it("모르는 문장은 아무것도 정하지 않는다", () => {
    expect(parseMilitarySentence("음 글쎄요").understood).toEqual([]);
  });
});

describe("militaryPlanFor", () => {
  it("최소 답으로 복무개월·입영일 없이 전략의 모집 분야를 트랙 계산에 넘긴다", () => {
    const d = draft({ branch: "army", goal: "katusa", katusa: "first_priority", it: "high", english: "yes", katusaHistory: "none", mustReturnBy: null });
    const plan = militaryPlanFor(d, fixtureDataset, today);
    expect(plan.trackIds).toEqual(expect.arrayContaining(["katusa", "army-technical", "army-general"]));
    expect(plan.katusaPriority).toBe(true);
    expect(plan.katusaStatus).toBe("preparing");
    expect(d.military.months).toBeNull();
  });
  it("카투사를 이미 한 번 지원해 미선발이면 카투사를 빼고 계산", () => {
    const d = draft({ branch: "army", goal: "unknown", katusa: "first_priority", it: null, english: "yes", katusaHistory: "not_selected", mustReturnBy: null });
    expect(militaryPlanFor(d, fixtureDataset, today).trackIds).not.toContain("katusa");
  });
  it("예전 입력(최소 답 없음)은 기존 트랙 선택을 그대로 쓴다", () => {
    const d = { ...blankDraft(today), military: { ...blankDraft(today).military, status: "planned" as const, trackIds: ["army-general"] } };
    expect(militaryPlanFor(d, fixtureDataset, today).trackIds).toEqual(["army-general"]);
  });
});
