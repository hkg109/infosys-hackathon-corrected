import { describe, expect, it } from "vitest";
import { fixtureDataset } from "@/data/fixtures";
import { termIndex } from "@/engine";
import { blankDraft, type Draft } from "./plan";
import { QUIZ } from "./recommend";
import { buildTracks, exchangeTermFor } from "./tracks";
import { draftToInputV2 } from "./plan";

const dataAnswers = Object.fromEntries(QUIZ.map((q) => [q.id, q.options[1].id]));
const base: Draft = {
  ...blankDraft("2026-11-07"),
  completedTerms: 2,
  earnedCredits: 36,
  earnedMajorCredits: 18,
  targetCredits: 130,
  answers: dataAnswers,
};

describe("buildTracks", () => {
  it("같은 입력이면 같은 트랙, 진로 적합도 순서로 정렬", () => {
    const a = buildTracks(base, fixtureDataset);
    expect(a.tracks.map((t) => t.id)).toEqual(buildTracks(structuredClone(base), fixtureDataset).tracks.map((t) => t.id));
    expect(a.tracks[0].career).toBe("data");
    expect(a.tracks.map((t) => t.rank)).toEqual(a.tracks.map((_, i) => i + 1));
  });

  it("군 복무 시기 추천이면 같은 진로에 입대 시기가 다른 트랙이 생긴다", () => {
    const { tracks, rows } = buildTracks({ ...base, military: { mode: "recommend", months: 18, startDate: null } }, fixtureDataset);
    const data = tracks.filter((t) => t.career === "data" && !t.exchangeTerm);
    expect(data.length).toBe(3);
    expect(new Set(data.map((t) => t.militaryStart && termIndex(t.militaryStart))).size).toBe(3);
    expect(rows.find((r) => r.id === "military")?.trackIds).toHaveLength(3);
  });

  it("교환학생 트랙은 군 복무와 겹치지 않는 학기에 교환을 넣고 결과에 exchange로 남긴다", () => {
    const d: Draft = { ...base, military: { mode: "recommend", months: 18, startDate: null }, exchange: { mode: "recommend", ordinal: null } };
    const { tracks } = buildTracks(d, fixtureDataset);
    const ex = tracks.filter((t) => t.exchangeTerm);
    expect(ex.length).toBeGreaterThan(0);
    for (const t of ex) {
      const term = t.candidate.result!.terms.find((x) => termIndex(x.term) === termIndex(t.exchangeTerm!));
      expect(term?.status).toBe("exchange");
      expect(t.candidate.conflicts).toEqual([]);
    }
  });

  it("교환 학기 찾기: 마친 학기 수가 목표가 되는 첫 학기", () => {
    const input = draftToInputV2(base, fixtureDataset, ["data"]);
    // 2학기 마친 상태, 2027-1 시작 → 4학기 마친 뒤 = 2028-1
    expect(exchangeTermFor(input, 4)).toEqual({ year: 2028, season: 1 });
  });
});
