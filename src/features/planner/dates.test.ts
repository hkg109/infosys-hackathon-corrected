import { describe, expect, it } from "vitest";
import { endDateToMonth, monthToEndDate, monthToStartDate, startDateToMonth } from "./dates";

describe("월 입력 ↔ [startDate, endDate) 변환", () => {
  it("시작 월은 그 달 1일(포함)", () => {
    expect(monthToStartDate("2028-04")).toBe("2028-04-01");
    expect(startDateToMonth("2028-04-01")).toBe("2028-04");
  });

  it("종료 월은 포함하므로 다음 달 1일(제외)을 endDate로 쓴다", () => {
    expect(monthToEndDate("2029-10")).toBe("2029-11-01");
    expect(monthToEndDate("2029-09")).toBe("2029-10-01");
  });

  it("12월 종료는 다음 해 1월 1일", () => {
    expect(monthToEndDate("2028-12")).toBe("2029-01-01");
    expect(endDateToMonth("2029-01-01")).toBe("2028-12");
  });

  it("왕복 변환하면 원래 월이 나온다", () => {
    for (let y = 2027; y <= 2029; y++)
      for (let m = 1; m <= 12; m++) {
        const month = `${y}-${String(m).padStart(2, "0")}`;
        expect(startDateToMonth(monthToStartDate(month))).toBe(month);
        expect(endDateToMonth(monthToEndDate(month))).toBe(month);
      }
  });

  it("한 달짜리 구간은 시작일 < 종료일", () => {
    const start = monthToStartDate("2028-02");
    const end = monthToEndDate("2028-02");
    expect(start < end).toBe(true);
    expect(end).toBe("2028-03-01");
  });
});
