import { describe, expect, it } from "vitest";
import { fixtureDataset } from "@/data/fixtures";
import { termIndex } from "@/engine";
import { blankDraft, type Draft, draftToInputV2 } from "./plan";
import { QUIZ } from "./recommend";
import { buildTracks, exchangeTermFor } from "./tracks";

const TODAY = "2026-11-07";
const dataAnswers = Object.fromEntries(QUIZ.map((q) => [q.id, q.options[1].id]));
const base: Draft = {
  ...blankDraft(TODAY),
  admissionYear: 2026,
  completedTerms: 2,
  earnedCredits: 36,
  earnedMajorCredits: 18,
  coursesConfirmed: true,
  targetCredits: 130,
  targetSource: "user_goal",
  career: "unsure",
  answers: dataAnswers,
  paceCredits: "compare",
  paceStyle: "balanced",
  military: { ...blankDraft(TODAY).military, status: "none" },
  leave: { mode: "none", ordinal: null },
  exchange: { mode: "none", ordinal: null },
  priority: "fast_completion",
};
const recommendMil = (months: number | null, trackIds: string[] = []): Draft["military"] => ({
  status: "planned",
  trackIds,
  timing: "recommend",
  startDate: null,
  months,
  certificateIds: [],
});

describe("buildTracks", () => {
  it("같은 입력이면 같은 트랙, 진로 적합도 순서로 정렬", () => {
    const a = buildTracks(base, fixtureDataset, TODAY);
    expect(a.tracks.map((t) => t.id)).toEqual(buildTracks(structuredClone(base), fixtureDataset, TODAY).tracks.map((t) => t.id));
    expect(a.tracks[0].career).toBe("data");
    expect(a.tracks.map((t) => t.rank)).toEqual(a.tracks.map((_, i) => i + 1));
  });

  it("직접 고른 진로가 맨 앞", () => {
    expect(buildTracks({ ...base, career: "business" }, fixtureDataset, TODAY).tracks[0].career).toBe("business");
  });

  it("군 복무 시기 비교면 같은 진로에 입대 시기가 다른 트랙이 생긴다", () => {
    const { tracks, rows } = buildTracks({ ...base, military: recommendMil(18) }, fixtureDataset, TODAY);
    const data = tracks.filter((t) => t.career === "data" && !t.exchangeTerm);
    expect(data.length).toBe(3);
    expect(new Set(data.map((t) => t.militaryStart && termIndex(t.militaryStart))).size).toBe(3);
    expect(rows.find((r) => r.id === "military")?.trackIds).toHaveLength(3);
  });

  it("카투사 우선 + 결과 대기: 조건부 카투사 트랙과 대체 트랙이 같은 화면 줄에 함께", () => {
    const d: Draft = { ...base, career: "security", military: recommendMil(null, ["katusa"]), katusa: { priority: true, status: "applied_waiting" } };
    const { tracks, rows } = buildTracks(d, fixtureDataset, TODAY);
    const sec = tracks.filter((t) => t.career === "security");
    expect(sec.some((t) => t.militaryRole === "conditional" && t.militaryTrackId === "katusa")).toBe(true);
    expect(sec.some((t) => t.militaryRole === "fallback" && t.militaryTrackId === "army-general")).toBe(true);
    const row = rows.find((r) => r.id === "katusa")!;
    expect(row.trackIds.some((id) => id.includes("rconditional"))).toBe(true);
    expect(row.trackIds.some((id) => id.includes("rfallback"))).toBe(true);
    // 조건부 카투사는 복무기간이 공식 확인되지 않아 완료 학기를 확정하지 않는다
    for (const t of sec.filter((x) => x.militaryRole === "conditional")) expect(t.candidate.result?.expectedCompletion).toBeNull();
  });

  it("균형형과 후반 여유형을 비교하면 같은 진로라도 별도 트랙", () => {
    const { tracks, rows } = buildTracks({ ...base, career: "data", paceCredits: 18, paceStyle: "compare" }, fixtureDataset, TODAY);
    const data = tracks.filter((t) => t.career === "data");
    expect(new Set(data.map((t) => t.paceStyle))).toEqual(new Set(["balanced", "late_light"]));
    expect(rows.some((r) => r.id === "pace")).toBe(true);
    const late = data.find((t) => t.paceStyle === "late_light")!;
    const bal = data.find((t) => t.paceStyle === "balanced")!;
    expect(late.stats.year4PlusAvg!).toBeLessThan(bal.stats.year4PlusAvg!);
  });

  it("교환학생 트랙은 군 복무와 겹치지 않는 학기에 교환을 넣고 결과에 exchange로 남긴다", () => {
    const d: Draft = { ...base, military: recommendMil(18), exchange: { mode: "recommend", ordinal: null } };
    const { tracks } = buildTracks(d, fixtureDataset, TODAY);
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

describe("기간 미확정 트랙의 순서", () => {
  it("복무기간을 확인하지 못한 조건부 트랙은 같은 진로의 계산 완료 트랙보다 뒤에 온다", () => {
    const d: Draft = { ...base, career: "security", priority: "career_core", military: recommendMil(null, ["katusa"]), katusa: { priority: true, status: "preparing" } };
    const sec = buildTracks(d, fixtureDataset, TODAY).tracks.filter((t) => t.career === "security");
    const firstUnresolved = sec.findIndex((t) => t.militaryRole === "conditional");
    const lastResolved = sec.map((t) => t.militaryRole).lastIndexOf("fallback");
    expect(firstUnresolved).toBeGreaterThan(lastResolved);
  });
});
