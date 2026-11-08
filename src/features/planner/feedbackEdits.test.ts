import { describe, expect, it } from "vitest";
import { sampleInputNoBreak } from "@/contracts/mock-plan";
import { fixtureDataset } from "@/data/fixtures";
import { simulatePlan } from "@/engine";
import { requestTrackFeedback } from "./feedbackAgent";
import { applyEdits, findTerm, parseFeedbackRules, planContext } from "./feedbackEdits";
import type { PlanState } from "./storage";

const input = sampleInputNoBreak;
const ctx = planContext(input, simulatePlan(input, fixtureDataset), fixtureDataset);
const plan = { input, genEd: { items: [] }, lastChanges: [], previous: null } as unknown as PlanState;
const rules = (m: string) => parseFeedbackRules(m, ctx, fixtureDataset).edits;

describe("applyEdits", () => {
  it("학기별 상한·휴학·과목 빼기·미루기를 반영하고 엔진이 다시 계산한다", () => {
    const t1 = ctx.terms[1].term;
    const { next, changes } = applyEdits(input, [{ type: "set_term_cap", term: t1, credits: 9 }, { type: "add_leave", term: ctx.terms[3].term }, { type: "exclude_course", code: "ITE4086" }], fixtureDataset);
    expect(changes).toHaveLength(3);
    const r = simulatePlan(next, fixtureDataset);
    expect(r.terms[1].plannedCredits).toBeLessThanOrEqual(9);
    expect(r.terms.find((t) => t.term.year === ctx.terms[3].term.year && t.term.season === ctx.terms[3].term.season)!.status).toBe("break");
    expect(r.terms.flatMap((t) => t.courses).some((c) => c.code === "ITE4086")).toBe(false);
  });
  it("없는 과목·범위 밖 값·시작 전 학기는 거절하고 이유를 남긴다", () => {
    const { changes, rejected } = applyEdits(input, [{ type: "exclude_course", code: "XXX9999" }, { type: "set_credit_cap", credits: 40 }, { type: "add_leave", term: { year: 2000, season: 1 } }], fixtureDataset);
    expect(changes).toEqual([]);
    expect(rejected).toHaveLength(3);
  });
});

describe("규칙 해석", () => {
  it("학년·학기 표현을 계획 학기로 찾는다", () => {
    const g = ctx.terms.find((t) => t.gradeLabel)!;
    expect(findTerm(g.gradeLabel!, ctx)).toEqual(g.term);
    expect(findTerm("2028년 2학기", ctx)).toEqual({ year: 2028, season: 2 });
  });
  it("자주 쓰는 요청을 편집으로", () => {
    const g = ctx.terms.find((t) => t.gradeLabel)!;
    expect(rules(`${g.gradeLabel}는 12학점만 듣고 싶어요`)).toEqual([{ type: "set_term_cap", term: g.term, credits: 12 }]);
    expect(rules("인공지능실무응용은 빼 주세요")).toEqual([{ type: "exclude_course", code: "ITE4086" }]);
    expect(rules("조금 더 빨리 끝내고 싶어요")[0].type).toBe("set_credit_cap");
    expect(rules("3·4학년은 가볍게")).toEqual([{ type: "set_pace_style", style: "late_light" }]);
  });
  it("계절학기·교수 요청은 할 수 없다고 알리고 계획을 바꾸지 않는다", () => {
    const r = parseFeedbackRules("계절학기를 활용하고 싶어요", ctx, fixtureDataset);
    expect(r.edits).toEqual([]);
    expect(r.notSupported[0]).toContain("계절학기");
  });
});

describe("requestTrackFeedback", () => {
  it("Claude 응답이 없으면 규칙 해석으로 실제 계획을 바꾼다", async () => {
    const r = await requestTrackFeedback({ message: "인공지능실무응용은 빼 주세요", history: [], plan, dataset: fixtureDataset }, async () => null);
    expect(r.origin).toBe("rules");
    expect(r.nextInput?.courseRules).toEqual([{ code: "ITE4086", action: "exclude" }]);
  });
  it("Claude 편집도 검증을 거쳐 반영한다", async () => {
    const r = await requestTrackFeedback(
      { message: "x", history: [], plan, dataset: fixtureDataset },
      async () => ({ reply: "가볍게 바꿨어요.", edits: [{ type: "set_pace_style", style: "late_light" }, { type: "exclude_course", code: "NOPE0000" }], notSupported: [] }),
    );
    expect(r.origin).toBe("agent");
    expect(r.nextInput?.paceStyle).toBe("late_light");
    expect(r.message).toContain("없는 과목");
  });
});
