import { describe, expect, it } from "vitest";
import type { ExchangeCatalog, ExchangePlanningInput } from "@/contracts/types";
import { exchangeFixture } from "@/data/fixtures";
import { buildExchangeCandidateSet, completedAtApplication, convertGpa, cycleFor, type ExchangeContext, targetTerms } from "./exchange";

const ctx: ExchangeContext = { today: "2026-11-08", militaryWindows: [] };
const base: ExchangePlanningInput = {
  intent: "committed",
  targetTerm: { mode: "recommend" },
  duration: "one_term",
  priorities: ["major_course_access"],
  languageStatus: "none",
  languageEvidence: [],
  budget: "unknown",
  housing: "unknown",
  academic: { campus: "서울", completedTermsNow: 4, cumulativeGpa: 3.8, majorArrangement: "single", transferStudent: false, priorExchangeTerms: 0, planStartTerm: { year: 2027, season: 1 } },
};
const run = (p: Partial<ExchangePlanningInput> = {}, cat: ExchangeCatalog = exchangeFixture, c = ctx) => buildExchangeCandidateSet({ ...base, ...p, academic: { ...base.academic, ...(p.academic ?? {}) } }, cat, c);
const ev = (set: ReturnType<typeof run>, ruleId: string) => set.common.evaluations.find((e) => e.ruleId === ruleId)!;

// 2027-1 회차가 공고 중인 것처럼 바꾼 카탈로그(현재 회차 판정 테스트용)
const openCatalog: ExchangeCatalog = { ...exchangeFixture, cycles: exchangeFixture.cycles.map((c) => (c.id === "hy-2027-1-main" ? { ...c, officialStatus: "announced" as const } : c)) };
const fixed27_1 = { targetTerm: { mode: "fixed" as const, term: { year: 2027, season: 1 as const } }, academic: { ...base.academic, planStartTerm: { year: 2026, season: 2 as const } } };

describe("교환학생 — 회차·시기", () => {
  it("2027-2는 공고 전이라 2027-1 자료를 이전 회차(stale)로만 쓴다", () => {
    const c = cycleFor(exchangeFixture, { year: 2027, season: 2 });
    expect(c.target?.officialStatus).toBe("forecast");
    expect(c.data?.id).toBe("hy-2027-1-main");
    expect(c.stale).toBe(true);
  });

  it("추천 시기는 이수학기 하한을 넘고 마지막 정규학기가 아닌 학기부터", () => {
    const t = targetTerms({ ...base, academic: { ...base.academic, completedTermsNow: 1 } }, exchangeFixture);
    // 1학기 마침, 2027-1 시작 → 2027-2 파견이면 지원 시점 1학기 → 하한 2 미달, 2028-1부터
    expect(t[0]).toEqual({ year: 2028, season: 1 });
    expect(completedAtApplication({ ...base, academic: { ...base.academic, completedTermsNow: 1 } }, { year: 2028, season: 1 })).toBe(2);
  });

  it("마감된 현재 회차(2027-1)는 deadline_passed, 예상 마감으로는 만들지 않는다", () => {
    const s = run(fixed27_1);
    expect(s.all.every((c) => c.status === "deadline_passed" || c.status === "ineligible")).toBe(true);
    expect(s.primary).toBeNull();
    expect(s.emptyReason).toContain("마감");
  });
});

describe("교환학생 — 한양대 공통 자격", () => {
  it("EX-DEMO-01: 지원 시점 1학기 이수면 공식 하한 2학기에 fail → 현재 차수 지원 어려움", () => {
    const s = run({ ...fixed27_1, academic: { ...fixed27_1.academic, completedTermsNow: 1 } }, openCatalog);
    expect(ev(s, "hy-terms-min").result).toBe("fail");
    expect(s.common.status).toBe("ineligible");
  });

  it("경계값: 지원 시점 정확히 2학기면 통과", () => {
    const s = run({ ...fixed27_1, academic: { ...fixed27_1.academic, completedTermsNow: 3 } }, openCatalog);
    // 2026-2 시작, 3학기 마침 → 2027-1 파견 지원 시점(2026-2 중) 3개
    expect(ev(s, "hy-terms-min").result).toBe("pass");
  });

  it("GPA 하한 2.5/4.5 경계와 미입력", () => {
    expect(ev(run({ ...fixed27_1, academic: { ...fixed27_1.academic, cumulativeGpa: 2.5 } }, openCatalog), "hy-gpa").result).toBe("pass");
    expect(ev(run({ ...fixed27_1, academic: { ...fixed27_1.academic, cumulativeGpa: 2.49 } }, openCatalog), "hy-gpa").result).toBe("fail");
    expect(ev(run({ ...fixed27_1, academic: { ...fixed27_1.academic, cumulativeGpa: null } }, openCatalog), "hy-gpa").result).toBe("unknown");
  });

  it("EX-DEMO-06: 마지막 정규학기 파견은 fail", () => {
    const s = run({ ...fixed27_1, academic: { ...fixed27_1.academic, completedTermsNow: 6 } }, openCatalog);
    // 2026-2 시작·6학기 마침 → 2027-1은 8번째 학기
    expect(ev(s, "hy-final-term").result).toBe("fail");
  });

  it("EX-DEMO-07: 편입생이면 본교 이수학기 확인이 필요(조건부)", () => {
    const e = ev(run({ ...fixed27_1, academic: { ...fixed27_1.academic, transferStudent: true } }, openCatalog), "hy-transfer");
    expect(e.result).toBe("unknown");
    expect(e.missingInputIds).toEqual(["transferTerms"]);
  });

  it("복수전공은 지원 불가, 다중전공·부전공은 가능", () => {
    expect(ev(run({ ...fixed27_1, academic: { ...fixed27_1.academic, majorArrangement: "double_degree" } }, openCatalog), "hy-major").result).toBe("fail");
    expect(ev(run({ ...fixed27_1, academic: { ...fixed27_1.academic, majorArrangement: "minor" } }, openCatalog), "hy-major").result).toBe("pass");
  });

  it("이전 회차 규칙으로는 공통 자격을 확정하지 않는다(stale → unknown)", () => {
    const s = run();
    expect(s.common.evaluations.every((e) => e.result === "unknown")).toBe(true);
    expect(s.common.evaluations.find((e) => e.ruleId === "hy-gpa")!.truth).toBe("stale");
    expect(s.common.status).toBe("conditional");
  });
});

describe("교환학생 — 파견교 자격", () => {
  it("공식 변환식이 있는 만점(4.0)은 변환해 비교, 5.0 만점은 unknown", () => {
    expect(convertGpa(3.6, 4, exchangeFixture)).toBe(3.2);
    expect(convertGpa(3.6, 5, exchangeFixture)).toBeNull();
    const s = run({ ...fixed27_1 }, openCatalog);
    const ntu = s.all.find((c) => c.offeringId.includes("nanyang"))!;
    expect(ntu.eligibility.find((e) => e.owner === "host" && e.ruleId.endsWith("-gpa"))!.result).toBe("unknown");
  });

  it("host GPA 미달이면 해당 offering만 ineligible", () => {
    const s = run({ ...fixed27_1, academic: { ...fixed27_1.academic, cumulativeGpa: 3.0 } }, openCatalog);
    // 3.0/4.5 → 2.67/4.0 < UNSW 3.0/4.0
    const unsw = s.all.find((c) => c.offeringId.includes("new-south-wales"))!;
    expect(unsw.status).toBe("ineligible");
    expect(s.common.status).not.toBe("ineligible");
  });

  it("총점 통과·영역 점수 요구 → unknown, 미달 → fail, 계획 점수는 실제로 쓰지 않음", () => {
    const withScore = (total: number) => run({ ...fixed27_1, languageStatus: "has_score", languageEvidence: [{ test: "IELTS_ACADEMIC", total, testedAt: "2026-05-01", evidenceStatus: "user_entered" }] }, openCatalog);
    const sheffield = (s: ReturnType<typeof run>) => s.all.find((c) => c.offeringId.includes("sheffield"))!.eligibility.find((e) => e.ruleId.endsWith("-lang"))!;
    expect(sheffield(withScore(7)).result).toBe("unknown");
    expect(sheffield(withScore(6)).result).toBe("fail");
    const planned = run({ ...fixed27_1, languageStatus: "preparing", languageEvidence: [{ test: "IELTS_ACADEMIC", total: 8, testedAt: null, evidenceStatus: "planned" }] }, openCatalog);
    expect(sheffield(planned).result).toBe("unknown");
  });

  it("어학 기준이 엑셀에 없으면 통과로 보지 않는다", () => {
    const chalmers = run(fixed27_1, openCatalog).all.find((c) => c.offeringId.includes("chalmers"))!;
    expect(chalmers.eligibility.find((e) => e.ruleId.endsWith("-lang"))!.result).toBe("unknown");
  });
});

describe("교환학생 — 과목 접근·정렬·백업", () => {
  it("수강불가 목록에 컴퓨팅이 있으면 limited, 없다고 수강 가능으로 확정하지 않음", () => {
    const s = run();
    expect(s.all.find((c) => c.offeringId.includes("nanyang"))!.courseAccess.status).toBe("limited");
    expect(s.all.every((c) => c.courseAccess.status !== ("open" as string))).toBe(true);
  });

  it("전공 접근 우선이면 제한된 학교가 1순위가 아님", () => {
    const s = run({ priorities: ["major_course_access"] });
    expect(s.primary!.courseAccess.status).toBe("unknown");
  });

  it("백업은 1순위의 핵심 위험을 공유하지 않고, 서로 다른 위험을 낮춘다", () => {
    const s = run({ priorities: ["housing", "language_fit"] });
    expect(s.backups.length).toBeLessThanOrEqual(2);
    const top = (k: string[]) => k.find((x) => x !== "stale" && x !== "quota_small") ?? null;
    const p = top(s.primary!.riskKeys);
    if (p) expect(s.backups[0].riskKeys).not.toContain(p);
    if (s.backups[1]) expect(top(s.backups[1].riskKeys)).not.toBe(top(s.backups[0].riskKeys) ?? "__");
  });

  it("후보가 하나뿐이면 가짜 백업을 만들지 않는다", () => {
    const one: ExchangeCatalog = { ...exchangeFixture, offerings: exchangeFixture.offerings.slice(0, 1) };
    const s = run({}, one);
    expect(s.primary).not.toBeNull();
    expect(s.backups).toEqual([]);
  });

  it("1년 파견은 1년 옵션이 확인된 학교만", () => {
    const s = run({ duration: "one_year" });
    const ids = new Set(exchangeFixture.offerings.filter((o) => o.durationOptions.value?.includes("one_year")).map((o) => o.id));
    expect(s.all.every((c) => ids.has(c.offeringId) && c.duration === "one_year")).toBe(true);
  });

  it("TO·확률을 지표로 쓰지 않고, 인정학점은 항상 미정", () => {
    const s = run();
    expect(s.branches.every((b) => b.probability === null)).toBe(true);
    expect(s.all.every((c) => c.recognitionSummary.status === "unknown" && c.recognitionSummary.confirmedCredits === null && c.recognitionSummary.countsAsTerm === null)).toBe(true);
  });

  it("세 후보가 모두 이전 회차 자료에 기대면 조합 전체가 조건부", () => {
    expect(run().wholeSetConditional).toBe(true);
  });

  it("같은 입력 → 같은 결과, 교환 시기·기간이 후보 ID에 들어감", () => {
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
    const a = run({ targetTerm: { mode: "fixed", term: { year: 2027, season: 2 } } }).primary!.id;
    const b = run({ targetTerm: { mode: "fixed", term: { year: 2028, season: 1 } } }).primary!.id;
    expect(a).not.toBe(b);
    expect(a).toContain("20272");
  });

  it("교환 안 함이면 후보 없음", () => {
    expect(run({ intent: "none" }).primary).toBeNull();
  });
});

describe("교환학생 — 군 복무 충돌", () => {
  const win = (fixed: boolean) => ({ branchId: "katusa", label: "카투사 선발 시", start: "2027-07-01", end: "2029-01-01", fixed });
  it("EX-DEMO-04: 군 분기 하나만 겹치면 hard fail이 아니라 조건부", () => {
    const s = run({ targetTerm: { mode: "fixed", term: { year: 2027, season: 2 } } }, exchangeFixture, { ...ctx, militaryWindows: [win(false)] });
    expect(s.primary!.militaryConflicts[0].kind).toBe("conditional");
    expect(s.primary!.status).toBe("conditional");
  });
  it("고정 입영일과 실제로 겹치면 schedule_conflict", () => {
    const s = run({ targetTerm: { mode: "fixed", term: { year: 2027, season: 2 } } }, exchangeFixture, { ...ctx, militaryWindows: [win(true)] });
    expect(s.all.every((c) => c.status === "schedule_conflict")).toBe(true);
  });
  it("경계가 맞닿기만 하면 겹침 아님", () => {
    const s = run({ targetTerm: { mode: "fixed", term: { year: 2027, season: 2 } } }, exchangeFixture, { ...ctx, militaryWindows: [{ ...win(true), start: "2027-03-01", end: "2027-09-01" }] });
    expect(s.primary!.militaryConflicts).toEqual([]);
  });
});

describe("교환학생 — 준비 로드맵", () => {
  it("공고 전 회차는 날짜를 만들지 않고, 2027-1 게시일만 사실로 알린다", () => {
    const s = run({ targetTerm: { mode: "fixed", term: { year: 2027, season: 2 } } });
    const notice = s.actions.find((a) => a.id === "notice")!;
    expect(notice.dueAt.value).toBeNull();
    expect(notice.detail).toContain("2026-07-03");
    expect(s.actions.find((a) => a.id === "nomination")!.dueAt.truth).toBe("stale");
    expect(s.actions.every((a) => !/보통 1년 전|합격 가능성|인정됩니다/.test(a.detail))).toBe(true);
  });
});
