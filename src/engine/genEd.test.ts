import { describe, expect, it } from "vitest";
import type { PlannedTerm } from "@/contracts/types";
import { fixtureDataset } from "@/data/fixtures";
import { addGenEd, emptyGenEd, fillGenEd, type GenEdState, letterLabel, removeGenEd, splitGenEdCredits, staleGenEd, termBreakdown } from "./genEd";

const term = (slot: number, planned = 18): PlannedTerm => ({
  term: { year: 2027, season: 1 },
  status: "study",
  courses: [{ code: "CSE1002", name: "전산학개론", credits: 3, group: "common", assumptions: [] }],
  slotCredits: slot,
  plannedCredits: planned,
});

function add(state: GenEdState, t: PlannedTerm, c: 2 | 3) {
  const r = addGenEd(state, t, c);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

describe("교양 자리", () => {
  it("라벨: A~Z 다음은 AA, AB", () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(letterLabel)).toEqual(["A", "B", "Z", "AA", "AB", "AZ", "BA"]);
  });

  it("5학점 slot에 2+3 → 미지정 0, 총학점 그대로(이중 합산 없음)", () => {
    const t = term(5, 8);
    const s = add(add(emptyGenEd(), t, 2), t, 3);
    const b = termBreakdown(t, s, fixtureDataset);
    expect(s.items.map((g) => `${g.label}·${g.credits}`)).toEqual(["교양 A·2", "교양 B·3"]);
    expect(b.unassigned).toBe(0);
    expect(b.total).toBe(8);
    expect(b.major + b.generalEducation + b.unassigned).toBe(b.total);
  });

  it("6학점 slot에 3+3", () => {
    const t = term(6, 9);
    const s = add(add(emptyGenEd(), t, 3), t, 3);
    expect(termBreakdown(t, s, fixtureDataset)).toMatchObject({ unassigned: 0, total: 9, overflow: 0 });
  });

  it("남은 slot보다 큰 교양은 막는다(학기 상한 초과 방지)", () => {
    const t = term(4);
    const s = add(add(emptyGenEd(), t, 2), t, 2);
    const r = addGenEd(s, t, 2);
    expect(r.ok).toBe(false);
    expect(addGenEd(add(emptyGenEd(), term(4), 2), term(4), 3).ok).toBe(false);
    expect(addGenEd(emptyGenEd(), { ...term(5), status: "break" }, 2).ok).toBe(false);
  });

  it("삭제하면 학점과 미지정 slot이 돌아오고, 다른 항목 ID·라벨은 그대로", () => {
    const t = term(8);
    let s = add(add(add(emptyGenEd(), t, 2), t, 3), t, 3);
    s = removeGenEd(s, "ge-2");
    expect(s.items.map((g) => [g.id, g.label])).toEqual([
      ["ge-1", "교양 A"],
      ["ge-3", "교양 C"],
    ]);
    expect(termBreakdown(t, s, fixtureDataset).unassigned).toBe(3);
    // 새로 추가해도 지운 라벨을 다시 쓰지 않는다(한 계획 안 중복 라벨 방지)
    s = add(s, t, 2);
    expect(s.items.at(-1)?.label).toBe("교양 D");
  });

  it("같은 추가 순서면 같은 라벨, JSON 저장 후 복원해도 같다", () => {
    const t = term(5);
    const a = add(add(emptyGenEd(), t, 2), t, 3);
    const b = add(add(emptyGenEd(), t, 2), t, 3);
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it("계획이 바뀌어 slot이 줄면 맞지 않는 자리를 찾아낸다", () => {
    const s = add(add(emptyGenEd(), term(5), 2), term(5), 3);
    expect(staleGenEd(s, [term(2)]).map((g) => g.id)).toEqual(["ge-2"]);
  });

  it("교양 자리는 과목 자료(fixture)에 넣지 않는다", () => {
    expect(fixtureDataset.courses.some((c) => /^교양 [A-Z]+$/.test(c.name))).toBe(false);
  });
});

describe("임시 교양 자리(fillGenEd)", () => {
  it("남은 학점을 3·2학점 조각으로 나눈다(1학점은 남긴다)", () => {
    expect(splitGenEdCredits(0)).toEqual([]);
    expect(splitGenEdCredits(1)).toEqual([]);
    expect(splitGenEdCredits(4)).toEqual([2, 2]);
    expect(splitGenEdCredits(5)).toEqual([3, 2]);
    expect(splitGenEdCredits(6)).toEqual([3, 3]);
    expect(splitGenEdCredits(7)).toEqual([3, 2, 2]);
  });

  it("사용자 자리 다음 글자부터 학기 순서로 교양 A·B…를 붙이고, 원래 상태는 바꾸지 않는다", () => {
    const t1 = term(5);
    const t2: PlannedTerm = { ...term(4), term: { year: 2027, season: 2 } };
    const user = addGenEd(emptyGenEd(), t1, 2);
    if (!user.ok) throw new Error(user.reason);
    const shown = fillGenEd(user.state, [t2, t1]);
    expect(shown.items.map((g) => [g.label, g.credits, g.origin, g.term.season])).toEqual([
      ["교양 A", 2, "user", 1],
      ["교양 B", 3, "engine", 1],
      ["교양 C", 2, "engine", 2],
      ["교양 D", 2, "engine", 2],
    ]);
    expect(user.state.items).toHaveLength(1);
    expect(staleGenEd(shown, [t1, t2])).toEqual([]);
    // 학기 합계는 그대로, 미지정 학점만 교양 자리가 된다
    expect(termBreakdown(t1, shown, fixtureDataset)).toMatchObject({ unassigned: 0, total: 18 });
  });
});
