import { describe, expect, it } from "vitest";
import {
  sampleInputV2,
  sampleInputV2Conflict,
  sampleInputV2ExchangeUnknown,
  sampleInputV2Invalid,
  sampleInputV2NoTarget,
  sampleInputV2PeriodUnknown,
  sampleInputV2Undecided,
  sampleRecommendationConfig,
} from "@/contracts/mock-plan";
import type { MetricValue, PlanInputV2, TrackCandidate } from "@/contracts/types";
import { fixtureDataset } from "@/data/fixtures";
import { generateCandidates, metricOrder, rankCandidates } from "./candidates";
import { addMonths, validatePlanInputV2 } from "./inputV2";

const gen = (input: PlanInputV2) => generateCandidates(input, fixtureDataset, sampleRecommendationConfig);

describe("generateCandidates", () => {
  it("같은 입력이면 같은 결과", () => {
    expect(gen(sampleInputV2)).toEqual(gen(structuredClone(sampleInputV2)));
  });

  it("진로 × 학점 페이스(15·18·20) 조합을 각각 계산한다", () => {
    const set = gen({ ...sampleInputV2, careers: [] });
    expect(set.exploredCount).toBe(6);
    const ids = [...set.candidates.map((c) => c.id), ...Object.keys(set.dedupedInto)].sort();
    expect(ids).toEqual(["data|m-|p15", "data|m-|p18", "data|m-|p20", "security|m-|p15", "security|m-|p18", "security|m-|p20"]);
    // 각 후보는 펼친 값으로 엔진을 실제 실행한 결과다.
    for (const c of set.candidates) {
      expect(c.input.careers).toEqual([c.key.career]);
      expect(Math.max(...c.result!.terms.map((t) => t.plannedCredits))).toBeLessThanOrEqual(c.key.paceCredits);
    }
  });

  it("고정 페이스·진로는 펼치지 않는다 → 후보 1개", () => {
    const set = gen({ ...sampleInputV2, pace: { mode: "fixed", credits: 18 } });
    expect(set.candidates.map((c) => c.id)).toEqual(["security|m-|p18"]);
    expect(set.ranking.entries).toEqual([expect.objectContaining({ candidateId: "security|m-|p18", rank: 1 })]);
  });

  it("후보 2개: 가짜 후보를 채우지 않는다", () => {
    const set = gen({ ...sampleInputV2, pace: { mode: "compare", options: [15, 20] } });
    expect(set.candidates).toHaveLength(2);
    expect(set.ranking.entries).toHaveLength(2);
  });

  it("후보 0개: 입력 오류는 계산하지 않고 바꿀 입력을 알려 준다", () => {
    const set = gen(sampleInputV2Invalid);
    expect(set.candidates).toEqual([]);
    expect(set.emptyReason?.changeableFields).toEqual(["progress.earnedMajorCredits", "periods[0].endDate"]);
  });

  it("후보 0개: 이수 과목 미입력이면 재수강 배치를 막기 위해 만들지 않는다", () => {
    const set = gen(sampleInputV2Undecided);
    expect(set.candidates).toEqual([]);
    expect(set.emptyReason?.changeableFields).toEqual(["progress.completedCourseCodes"]);
  });

  it("결과가 같은 후보는 하나로 합치고 낮은 페이스를 대표로 남긴다", () => {
    const set = gen(sampleInputV2NoTarget);
    expect(set.candidates.map((c) => c.id)).toEqual(["security|m-|p15"]);
    expect(set.dedupedInto).toEqual({ "security|m-|p18": "security|m-|p15", "security|m-|p20": "security|m-|p15" });
  });

  it("목표학점 미입력: 빠른 완료 지표를 비교에서 빼고 이유를 남긴다", () => {
    const set = gen({ ...sampleInputV2NoTarget, priorities: ["fast_completion"] });
    expect(set.ranking.usedMetrics).not.toContain("fast_completion");
    expect(set.ranking.excludedMetrics[0]).toEqual({ key: "fast_completion", reason: expect.stringContaining("목표 총학점") });
    expect(set.candidates.every((c) => c.status === "conditional" && c.result!.expectedCompletion === null)).toBe(true);
  });

  it("기간 미정: 후보는 유지하되 완료 학기를 확정하지 않는다", () => {
    const set = gen(sampleInputV2PeriodUnknown);
    expect(set.candidates.length).toBeGreaterThan(0);
    for (const c of set.candidates) {
      expect(c.status).toBe("conditional");
      expect(c.result!.expectedCompletion).toBeNull();
      expect(c.missing.map((m) => m.field)).toContain("periods[0].startDate");
    }
  });

  it("교환 인정 미정: 교환 학기는 exchange로 표시하고 국내 과목을 넣지 않는다", () => {
    const c = gen(sampleInputV2ExchangeUnknown).candidates[0];
    const exchange = c.result!.terms.filter((t) => t.status === "exchange");
    expect(exchange.map((t) => t.term)).toEqual([{ year: 2030, season: 1 }]);
    expect(exchange[0].courses).toEqual([]);
    expect(c.result!.expectedCompletion).toBeNull();
    expect(c.result!.assumptions.map((a) => a.kind)).toContain("exchange_unrecognized");
    // 인정 여부를 모르면 교환 이후 학년 진행을 확정하지 않는다.
    const after = c.result!.terms.filter((t) => t.status === "study" && t.term.year > 2030);
    expect(after.every((t) => t.termOrdinal === null)).toBe(true);
  });

  it("고정 군 복무·교환 겹침은 충돌로 정상 후보에서 제외한다", () => {
    const set = gen(sampleInputV2Conflict);
    expect(set.candidates.every((c) => c.status === "conflict")).toBe(true);
    expect(set.ranking.entries).toEqual([]);
    expect(set.emptyReason?.changeableFields).toEqual(["periods[0]", "periods[1]"]);
  });

  it("핵심 과목 자료가 없으면 '진로 과목 먼저'를 계산하지 않는다", () => {
    const set = generateCandidates(sampleInputV2, fixtureDataset);
    expect(set.configVersion).toBe("default-1");
    expect(set.ranking.excludedMetrics.map((e) => e.key)).toContain("career_core");
  });

  it("입력을 바꾸면 후보가 바뀐다", () => {
    const a = gen(sampleInputV2);
    const b = gen({ ...sampleInputV2, periods: [] });
    expect(b.candidates[0].result!.expectedCompletion).not.toEqual(a.candidates[0].result!.expectedCompletion);
  });
});

// ── 정렬은 지표 값만으로 검증한다 ─────────────────────────

const metric = (key: MetricValue["key"], value: number | null, secondary: number | null = null): MetricValue => ({
  key,
  value,
  secondary,
  lowerIsBetter: key !== "exchange",
  unavailableReason: value === null ? `${key} 없음` : null,
});
const cand = (id: string, fast: number | null, core: number | null, load: number, avg = load): TrackCandidate =>
  ({
    id,
    status: "computable",
    result: null,
    key: { career: "security", militaryStartTerm: null, paceCredits: 18 },
    metrics: [metric("fast_completion", fast), metric("career_core", core), metric("light_terms", load, avg), metric("exchange", 0)],
  }) as unknown as TrackCandidate;

describe("rankCandidates", () => {
  it("1순위 지표로 정렬하고, 같으면 빠른 완료 → 진로 → 여유 순서", () => {
    const pool = [cand("a", 8, 3, 20), cand("b", 9, 2, 15), cand("c", 8, 2, 18)];
    expect(rankCandidates(pool, ["light_terms"]).entries.map((e) => e.candidateId)).toEqual(["b", "c", "a"]);
    expect(rankCandidates(pool, ["fast_completion"]).entries.map((e) => e.candidateId)).toEqual(["c", "a", "b"]);
    expect(rankCandidates(pool, ["career_core"]).entries.map((e) => e.candidateId)).toEqual(["c", "b", "a"]);
  });

  it("여유는 최대 학점이 같으면 평균 학점으로 비교한다", () => {
    const pool = [cand("a", 8, 2, 18, 17), cand("b", 8, 2, 18, 16)];
    expect(rankCandidates(pool, ["light_terms"]).entries.map((e) => e.candidateId)).toEqual(["b", "a"]);
  });

  it("한 후보라도 계산 못 한 지표는 비교 전체에서 제외한다", () => {
    const r = rankCandidates([cand("a", null, 3, 18), cand("b", 7, 2, 20)], ["fast_completion"]);
    expect(r.usedMetrics).toEqual(["career_core", "light_terms"]);
    expect(r.excludedMetrics).toEqual([{ key: "fast_completion", reason: "fast_completion 없음" }]);
    expect(r.entries[0].candidateId).toBe("b");
  });

  it("모든 지표가 같으면 같은 순위, ID 순서, 동률 안내", () => {
    const r = rankCandidates([cand("b", 8, 2, 18), cand("a", 8, 2, 18)], ["fast_completion"]);
    expect(r.entries.map((e) => [e.candidateId, e.rank])).toEqual([["a", 1], ["b", 1]]);
    expect(r.entries[0].tiedWith).toEqual(["b"]);
    expect(r.entries[0].reasons.at(-1)).toContain("동률");
  });

  it("모든 지표가 미확인이면 순위를 붙이지 않는다", () => {
    const x = cand("a", null, null, 0);
    x.metrics[2] = metric("light_terms", null);
    const r = rankCandidates([x], ["fast_completion"]);
    expect(r.unrankedReason).toBe("all_metrics_unknown");
    expect(r.entries[0].rank).toBeNull();
  });

  it("교환 경험은 사용자가 우선순위로 고른 경우만 비교한다", () => {
    expect(metricOrder(["light_terms"])).toEqual(["light_terms", "fast_completion", "career_core"]);
    expect(metricOrder(["exchange"])[0]).toBe("exchange");
  });

  it("추천 이유는 실제 지표 값으로 만든다", () => {
    const r = rankCandidates([cand("a", 8, 2, 18, 16.5), cand("b", 9, 2, 18)], ["light_terms"]);
    expect(r.entries[0].reasons[0]).toBe("학기 최대 18학점, 평균 16.5학점으로 계획합니다 — 후보 중 가장 여유롭습니다.");
  });
});

describe("validatePlanInputV2", () => {
  it("미입력은 정보 부족, 잘못된 값은 오류로 구분한다", () => {
    const issues = validatePlanInputV2({
      ...sampleInputV2,
      target: null,
      progress: { ...sampleInputV2.progress, earnedCredits: -1 },
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: "missing", field: "target" }),
        expect.objectContaining({ severity: "error", field: "progress.earnedCredits" }),
      ]),
    );
  });

  it("0은 미입력이 아니다", () => {
    const issues = validatePlanInputV2({
      ...sampleInputV2,
      progress: { ...sampleInputV2.progress, completedTerms: 0, earnedCredits: 0, earnedMajorCredits: 0, completedCourseCodes: [] },
    });
    expect(issues.filter((i) => i.field.startsWith("progress"))).toEqual([]);
  });

  it("개월 수로 종료일을 정한다(말일 보정)", () => {
    expect(addMonths("2028-04-01", 18)).toBe("2029-10-01");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
  });
});
