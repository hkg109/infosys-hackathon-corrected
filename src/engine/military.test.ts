import { describe, expect, it } from "vitest";
import { sampleInputV2, sampleInputV2MilitaryFlexible } from "@/contracts/mock-plan";
import type { MilitaryCatalog, MilitaryPlanInput, PlanInputV2 } from "@/contracts/types";
import { fixtureDataset, militaryFixture } from "@/data/fixtures";
import { validateMilitary } from "../../scripts/normalize/validate-fixture";
import { generateCandidates } from "./candidates";
import { findCertificate, matchCertificates, resolveMilitaryScenarios } from "./military";

const plan = (p: Partial<MilitaryPlanInput>): MilitaryPlanInput => ({
  trackIds: ["katusa", "army-general"],
  katusaPriority: true,
  katusaStatus: "applied_waiting",
  certificateIds: [],
  ...p,
});

/** 시점 미정·기간 18개월(사용자 가정)인 병역 + 군 트랙 입력 */
const withPlan = (p: MilitaryPlanInput | null): PlanInputV2 => ({ ...sampleInputV2MilitaryFlexible, careers: ["security"], militaryPlan: p });

const ids = (input: PlanInputV2) => generateCandidates(input, fixtureDataset).candidates.map((c) => c.id);
const ranking = (input: PlanInputV2) => generateCandidates(input, fixtureDataset).ranking.entries.map((e) => [e.candidateId, e.rank]);

describe("카투사 최우선 희망", () => {
  it("우선 희망이 꺼져 있으면 카투사 상태와 무관하게 기존 결과(후보·순위·일정)가 그대로", () => {
    const before = generateCandidates(withPlan(null), fixtureDataset);
    for (const status of ["selected", "applied_waiting", "not_selected", "undecided"] as const) {
      const off = withPlan(plan({ trackIds: [], katusaPriority: false, katusaStatus: status }));
      expect(ids(off)).toEqual(before.candidates.map((c) => c.id));
      expect(ranking(off)).toEqual(before.ranking.entries.map((e) => [e.candidateId, e.rank]));
      expect(generateCandidates(off, fixtureDataset).candidates.map((c) => c.result?.terms)).toEqual(before.candidates.map((c) => c.result?.terms));
    }
  });

  it("최우선 + 선발됨: 카투사만 기본 계획, 다른 트랙은 대안", () => {
    const r = resolveMilitaryScenarios(plan({ katusaStatus: "selected" }), militaryFixture, 18);
    expect(r.scenarios.map((s) => [s.trackId, s.role])).toEqual([["katusa", "primary"]]);
    expect(r.alternatives).toEqual(["army-general"]);
    const set = generateCandidates(withPlan(plan({ katusaStatus: "selected" })), fixtureDataset);
    expect(new Set(set.candidates.map((c) => c.key.militaryTrackId))).toEqual(new Set(["katusa"]));
  });

  it("최우선 + 결과 대기: 조건부 카투사와 대체 트랙을 함께(합격을 가정해 하나로 확정하지 않음)", () => {
    const set = generateCandidates(withPlan(plan({ katusaStatus: "applied_waiting" })), fixtureDataset);
    const roles = new Set(set.candidates.map((c) => `${c.key.militaryTrackId}:${c.key.militaryRole}`));
    expect(roles).toEqual(new Set(["katusa:conditional", "army-general:fallback"]));
    for (const c of set.candidates.filter((x) => x.key.militaryRole === "conditional")) {
      expect(c.status).toBe("conditional");
      expect(c.result?.assumptions.some((a) => a.id === "katusa_conditional")).toBe(true);
    }
  });

  it("결과 대기인데 대체 트랙을 고르지 않았으면 육군 현역병을 대체로 쓴다", () => {
    const r = resolveMilitaryScenarios(plan({ trackIds: ["katusa"], katusaStatus: "preparing" }), militaryFixture, null);
    expect(r.scenarios.map((s) => [s.trackId, s.role])).toEqual([
      ["katusa", "conditional"],
      ["army-general", "fallback"],
    ]);
  });

  it("최우선 + 선발되지 않음: 카투사 제외, 이유 표시, 기존 정렬로 복귀", () => {
    const r = resolveMilitaryScenarios(plan({ katusaStatus: "not_selected" }), militaryFixture, 18);
    expect(r.scenarios.map((s) => s.trackId)).toEqual(["army-general"]);
    expect(r.excluded[0]).toMatchObject({ trackId: "katusa" });
    expect(r.excluded[0].reason).toMatch(/선발되지 않/);
    const set = generateCandidates(withPlan(plan({ katusaStatus: "not_selected" })), fixtureDataset);
    expect(set.candidates.some((c) => c.key.militaryTrackId === "katusa")).toBe(false);
    expect(set.military?.excluded).toHaveLength(1);
  });

  it("복무기간이 공식 확인되지 않은 트랙은 사용자 값이 없으면 완료 학기를 확정하지 않는다", () => {
    const input: PlanInputV2 = {
      ...withPlan(plan({ trackIds: ["katusa"], katusaStatus: "selected" })),
      periods: [{ ...sampleInputV2MilitaryFlexible.periods[0], durationMonths: null }],
    };
    const set = generateCandidates(input, fixtureDataset);
    expect(set.candidates.length).toBeGreaterThan(0);
    for (const c of set.candidates) {
      expect(c.result?.expectedCompletion).toBeNull();
      expect(c.missing.some((m) => m.message.includes("기간 확인"))).toBe(true);
    }
  });

  it("공식 확인된 복무기간(육군 현역병 18개월)은 사용자 값보다 우선한다", () => {
    const r = resolveMilitaryScenarios(plan({ trackIds: ["army-general"], katusaPriority: false }), militaryFixture, 24);
    expect(r.scenarios[0]).toMatchObject({ months: 18, monthsStatus: "verified" });
    const k = resolveMilitaryScenarios(plan({ trackIds: ["katusa"], katusaPriority: false }), militaryFixture, 24);
    expect(k.scenarios[0]).toMatchObject({ months: 24, monthsStatus: "user_assumption" });
  });

  it("서로 다른 군 복무 시나리오는 배치가 같아도 중복 제거로 합쳐지지 않는다", () => {
    // 두 트랙 모두 사용자 18개월 가정 → 일정이 같아도 트랙이 다르면 별도 후보
    const input = withPlan(plan({ trackIds: ["army-technical", "katusa"], katusaPriority: false }));
    const set = generateCandidates(input, fixtureDataset);
    const tech = set.candidates.filter((c) => c.key.militaryTrackId === "army-technical");
    const kat = set.candidates.filter((c) => c.key.militaryTrackId === "katusa");
    expect(tech.length).toBeGreaterThan(0);
    expect(kat.length).toBe(tech.length);
    for (const [from, to] of Object.entries(set.dedupedInto)) expect(from.split("|t")[1]).toBe(to.split("|t")[1]);
  });

  it("기존 후보 ID 형식은 유지(기본 축은 ID에 붙지 않음)", () => {
    expect(ids(sampleInputV2)).toEqual(["security|m-|p15", "security|m-|p18", "security|m-|p20"]);
  });
});

describe("자격증", () => {
  it("공식 관계가 없는 자격증을 인정 자격증으로 표시하지 않는다(점수 계산 없음)", () => {
    const m = matchCertificates("army-technical", ["programming-craftsman", "sqld"], militaryFixture);
    expect(m).toHaveLength(2);
    expect(m.every((x) => x.officialRelations.length === 0 && /확인 필요/.test(x.note))).toBe(true);
  });

  it("공식 관계가 있으면(출처·verified) 그 관계만 돌려준다", () => {
    const catalog: MilitaryCatalog = {
      ...militaryFixture,
      relations: [
        { militaryTrackId: "army-technical", certificateId: "sqld", relation: "score", criterion: "가상", points: null, appliesTo: "2026", sourceUrl: "https://example.org", checkedAt: "2026-11-07", status: "verified", note: "" },
        { militaryTrackId: "army-technical", certificateId: "adsp", relation: "score", criterion: "가상", points: null, appliesTo: "2026", sourceUrl: "https://example.org", checkedAt: null, status: "unknown", note: "" },
      ],
    };
    expect(matchCertificates("army-technical", ["sqld"], catalog)[0].officialRelations).toHaveLength(1);
    expect(matchCertificates("army-technical", ["adsp"], catalog)[0].officialRelations).toHaveLength(0);
    expect(matchCertificates("katusa", ["sqld"], catalog)[0].officialRelations).toHaveLength(0);
  });

  it("구 명칭으로 찾을 수 있지만 같은 자격으로 확정하지 않는다", () => {
    const r = findCertificate("정보처리기능사", militaryFixture);
    expect(r[0]).toMatchObject({ certificate: { id: "programming-craftsman" }, matchedAlias: "정보처리기능사" });
    expect(r[0].certificate.aliases[0].status).not.toBe("verified");
  });

  it("검증: 존재하지 않는 트랙·자격증 참조, 출처 없는 공식 관계, 적용연도 누락, 확인일 없는 verified를 잡아낸다", () => {
    const bad: MilitaryCatalog = {
      ...militaryFixture,
      relations: [{ militaryTrackId: "no-such-track", certificateId: "no-such-cert", relation: "score", criterion: "", points: 0, appliesTo: null, sourceUrl: "", checkedAt: null, status: "verified", note: "" }],
      certificates: [...militaryFixture.certificates, { ...militaryFixture.certificates[0] }],
    };
    const errs = validateMilitary(bad).join("\n");
    expect(errs).toMatch(/존재하지 않는 군 트랙/);
    expect(errs).toMatch(/존재하지 않는 자격증/);
    expect(errs).toMatch(/출처 URL이 없음/);
    expect(errs).toMatch(/확인일이 없음/);
    expect(errs).toMatch(/적용 모집연도/);
    expect(errs).toMatch(/0점/);
    expect(errs).toMatch(/중복 자격증 ID/);
    expect(validateMilitary(militaryFixture)).toEqual([]);
  });

  it("공식 확인되지 않은 복무기간은 fixture에 null로 둔다(조사 메모 값을 쓰지 않음)", () => {
    for (const t of militaryFixture.tracks) {
      if (t.serviceMonthsStatus !== "verified") expect(t.serviceMonths).toBeNull();
      else expect(t.sources.length).toBeGreaterThan(0);
    }
  });
});
