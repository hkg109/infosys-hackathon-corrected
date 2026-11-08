import { describe, expect, it } from "vitest";
import { sampleInputV2ExchangeUnknown } from "@/contracts/mock-plan";
import type { PlanInputV2 } from "@/contracts/types";
import { validatePlanInputV2 } from "./inputV2";

const ex = sampleInputV2ExchangeUnknown;
const exIdx = ex.periods.findIndex((p) => p.kind === "exchange");
const withEx = (patch: Partial<NonNullable<PlanInputV2["periods"][number]["exchange"]>> | null): PlanInputV2 => ({
  ...ex,
  periods: ex.periods.map((p, i) => (i === exIdx ? { ...p, exchange: patch === null ? undefined : { credits: null, countsAsTerm: null, status: "unknown", ...patch } } : p)),
});
const errors = (i: PlanInputV2) => validatePlanInputV2(i).filter((x) => x.severity === "error").map((x) => x.field);
const missing = (i: PlanInputV2) => validatePlanInputV2(i).filter((x) => x.severity === "missing").map((x) => x.field);

describe("교환 기간 검증(명세 25.1)", () => {
  it("인정학점 null은 미정(missing), 0은 유효한 값", () => {
    expect(missing(withEx({ credits: null }))).toContain(`periods[${exIdx}].exchange`);
    expect(missing(withEx({ credits: 0, countsAsTerm: true }))).not.toContain(`periods[${exIdx}].exchange`);
    expect(errors(withEx({ credits: 0, countsAsTerm: true }))).toEqual([]);
  });
  it("음수·NaN·Infinity 인정학점은 오류", () => {
    for (const c of [-3, Number.NaN, Number.POSITIVE_INFINITY]) expect(errors(withEx({ credits: c }))).toContain(`periods[${exIdx}].exchange.credits`);
  });
  it("countsAsTerm null도 따로 미정으로 표시", () => {
    expect(missing(withEx({ credits: 12, countsAsTerm: null }))).toContain(`periods[${exIdx}].exchange.countsAsTerm`);
    expect(missing(withEx({ credits: 12, countsAsTerm: false }))).not.toContain(`periods[${exIdx}].exchange.countsAsTerm`);
  });
  it("다른 종류 기간에 교환 정보가 있으면 오류", () => {
    const bad: PlanInputV2 = { ...ex, periods: [...ex.periods, { id: "mil-x", kind: "military", timing: "fixed", startDate: "2030-03-01", endDate: "2031-09-01", durationMonths: null, returnTerm: null, status: "user_assumption", exchange: { credits: 0, countsAsTerm: null, status: "unknown" } }] };
    expect(errors(bad)).toContain(`periods[${ex.periods.length}].exchange`);
  });
  it("기간 ID 중복과 exchange 플래그 불일치는 오류", () => {
    expect(errors({ ...ex, periods: [...ex.periods, { ...ex.periods[exIdx], startDate: "2031-03-01", endDate: "2031-07-01" }] }).some((f) => f.endsWith(".id"))).toBe(true);
    expect(errors({ ...ex, exchange: "none" })).toContain("exchange");
    expect(errors({ ...ex, periods: ex.periods.filter((p) => p.kind !== "exchange"), exchange: "included" })).toContain("exchange");
  });
});
