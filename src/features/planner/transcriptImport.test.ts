import { describe, expect, it } from "vitest";
import type { Course } from "@/contracts/types";
import { fixtureDataset } from "@/data/fixtures";
import { applyTranscriptImport, importProblem, parseTranscriptRows, rowsFromTable, rowsFromText } from "./transcriptImport";

// 모두 가상 자료. 실제 학생 성적표가 아니다.
const courses = fixtureDataset.courses;
const withHyphen: Course[] = [...courses, { ...courses[0], code: "I-D3018", name: "가상디자인과목" }];
const parse = (text: string, cs: Course[] = courses, src: "clipboard_text" | "image_file" = "clipboard_text") => parseTranscriptRows(rowsFromText(text), cs, src);
const codes = (rows: { matchedCourseCode: string | null }[]) => rows.map((r) => r.matchedCourseCode).sort();

describe("rowsFromText", () => {
  it("탭·2칸 공백·공백 하나 순서로 셀을 나누고 원문 행을 유지한다", () => {
    const rows = rowsFromText("2025-1\tCSE1002\t전산학개론\t3\tA+\nITE1012  데이터구조  3  B0\n빈줄 다음\n\n");
    expect(rows).toHaveLength(3);
    expect(rows[0].cells).toEqual(["2025-1", "CSE1002", "전산학개론", "3", "A+"]);
    expect(rows[1].cells).toEqual(["ITE1012", "데이터구조", "3", "B0"]);
  });
});

describe("parseTranscriptRows — 과목", () => {
  it("1. 정확한 학수번호를 찾는다", () => {
    const d = parse("CSE1002\t전산학개론\t3\tA+");
    expect(codes(d.completed)).toEqual(["CSE1002"]);
    expect(d.completed[0].matchKind).toBe("exact_code");
    expect(d.completed[0].detectedCredits).toBe(3);
  });

  it("2. 하이픈이 든 학수번호(I-D3018)를 찾는다", () => {
    const d = parse("I-D3018\t가상디자인과목\t3\tA0", withHyphen);
    expect(codes(d.completed)).toEqual(["I-D3018"]);
  });

  it("3. 코드 중간 공백·소문자를 정규화한다", () => {
    expect(codes(parse("cse 1002\t전산학개론\t3\tB+").completed)).toEqual(["CSE1002"]);
    expect(codes(parse("i-d 3018\t3\tA0", withHyphen).completed)).toEqual(["I-D3018"]);
  });

  it("4. 같은 코드는 한 번만 넣고 재수강 가능성을 경고한다", () => {
    const d = parse("2024-1\tCSE1002\t전산학개론\t3\tC0\n2025-1\tCSE1002\t전산학개론\t3\tA0");
    expect(codes(d.completed)).toEqual(["CSE1002"]);
    expect(d.warnings.join(" ")).toContain("재수강");
  });

  it("5. 서로 다른 행을 합쳐 과목명으로 오인하지 않는다", () => {
    // '데이터' / '구조' 가 다른 행에 있으면 데이터구조로 보지 않는다
    const d = parse("데이터\tA0\n구조\tB0");
    expect(d.completed).toHaveLength(0);
  });

  it("6·7. 학과 자료에 없는 과목(교양·타과)은 버리지 않고 미인식으로 남긴다", () => {
    const d = parse("XYZ9999\t교양영어\t3\tA0\nCSE1002\t전산학개론\t3\tA0\nHUM1001\t철학의이해\t3\tB+");
    expect(codes(d.completed)).toEqual(["CSE1002"]);
    expect(d.unrecognizedLines).toEqual(["XYZ9999\t교양영어\t3\tA0", "HUM1001\t철학의이해\t3\tB+"]);
  });

  it("공백이 다른 과목명도 같은 행 안에서만 찾는다", () => {
    const d = parse("정보 시스템 개론  A0\n데이터구조  B+");
    expect(codes(d.completed)).toEqual(["APA2054", "ITE1012"]);
  });

  it("12. F·W는 완료 과목에 넣지 않는다", () => {
    const d = parse("CSE1002\t전산학개론\t3\tF\nITE1012\t데이터구조\t3\tW");
    expect(d.completed).toHaveLength(0);
    expect(codes(d.notCompleted)).toEqual(["CSE1002", "ITE1012"]);
    expect(d.notCompleted.every((r) => !r.selected)).toBe(true);
  });

  it("13. 수강 중 과목을 따로 나눈다", () => {
    const d = parse("ITE1012\t데이터구조\t3\t수강중\nCSE1002\t전산학개론\t3\tA0");
    expect(codes(d.inProgress)).toEqual(["ITE1012"]);
    expect(codes(d.completed)).toEqual(["CSE1002"]);
  });

  it("확인하지 못한 성적 표기는 완료로 단정하지 않는다", () => {
    const d = parse("CSE1002\t전산학개론\t3\tI");
    expect(d.completed).toHaveLength(0);
    expect(d.ambiguous).toHaveLength(1);
  });

  it("14. OCR 유사 매칭(0/O, 1/I)은 자동 확정하지 않는다", () => {
    const d = parse("CSEIOO2\t3\tA0", courses, "image_file");
    expect(d.completed).toHaveLength(0);
    expect(d.ambiguous).toHaveLength(1);
    expect(d.ambiguous[0].matchKind).toBe("ocr_suggestion");
    expect(d.ambiguous[0].candidateCodes).toEqual(["CSE1002"]);
    expect(d.ambiguous[0].selected).toBe(false);
  });

  it("15. 빈 입력", () => {
    const d = parse("   \n\n");
    expect(d.rowCount).toBe(0);
    expect(d.completed).toHaveLength(0);
    expect(d.earnedCredits).toHaveLength(0);
  });

  it("개인정보 행은 계산과 결과에 남기지 않는다", () => {
    const d = parse("성명\t가상학생\n학번\t2026000000\nCSE1002\t전산학개론\t3\tA0");
    expect(d.personalRowsSkipped).toBe(2);
    expect(d.unrecognizedLines.join(" ")).not.toContain("2026000000");
  });

  it("HTML 표 셀도 같은 방식으로 읽는다", () => {
    const rows = rowsFromTable([
      ["학수번호", "과목명", "학점", "성적"],
      ["CSE1002", "전산학개론", "3", "A+"],
      ["", "", "", ""],
      ["ITE1012", "데이터구조", "3", "B0"],
    ]);
    expect(codes(parseTranscriptRows(rows, courses, "clipboard_html").completed)).toEqual(["CSE1002", "ITE1012"]);
  });
});

describe("parseTranscriptRows — 학점 요약", () => {
  const SUMMARY = ["총 이수학점\t36", "전공 이수학점\t9", "평점평균\t3.85", "신청학점\t18", "학년\t2"].join("\n");

  it("8·9. 총 이수학점과 전공학점을 각각 읽고 더하지 않는다", () => {
    const d = parse(SUMMARY);
    expect(d.earnedCredits.map((v) => v.value)).toEqual([36]);
    expect(d.earnedMajorCredits.map((v) => v.value)).toEqual([9]);
  });

  it("10. GPA·신청학점·학년을 총 이수학점으로 오인하지 않는다", () => {
    const d = parse(SUMMARY);
    const all = [...d.earnedCredits, ...d.earnedMajorCredits, ...d.targetCredits].map((v) => v.value);
    expect(all).not.toContain(18);
    expect(all).not.toContain(2);
    expect(all).not.toContain(3.85);
  });

  it("졸업사정 표(배당·취득 열)에서 목표·취득·전공을 읽는다", () => {
    const d = parse("구분\t배당\t취득\n졸업학점\t130\t18\n전공\t81\t6\n핵심교양\t10\t5");
    expect(d.targetCredits.map((v) => v.value)).toEqual([130]);
    expect(d.earnedCredits.map((v) => v.value)).toEqual([18]);
    expect(d.earnedMajorCredits.map((v) => v.value)).toEqual([6]);
  });

  it("'레이블 : 숫자' 한 셀 형식도 읽는다", () => {
    const d = parse("총 이수학점 : 36\n전공학점: 12");
    expect(d.earnedCredits[0].value).toBe(36);
    expect(d.earnedMajorCredits[0].value).toBe(12);
  });

  it("후보가 여럿이면 임의로 고르지 않고 모두 남긴다", () => {
    const d = parse("총 이수학점\t36\n취득학점\t33");
    expect(d.earnedCredits.map((v) => v.value).sort()).toEqual([33, 36]);
    expect(d.warnings.join(" ")).toContain("여러 개");
  });

  it("포털 총학점과 과목 학점 합이 다르면 둘 다 알리고 합계로 덮지 않는다", () => {
    const d = parse("총 이수학점\t36\nCSE1002\t전산학개론\t3\tA0");
    expect(d.courseCreditSum).toBe(3);
    expect(d.earnedCredits[0].value).toBe(36);
    expect(d.warnings.join(" ")).toContain("달라요");
  });

  it("성적표와 졸업사정 표가 함께 붙어도 읽는다", () => {
    const d = parse("구분\t배당\t취득\n졸업학점\t130\t36\n전공\t81\t9\n\n학수번호\t과목명\t학점\t성적\nCSE1002\t전산학개론\t3\tA+\nITE1012\t데이터구조\t3\tB+");
    expect(d.targetCredits[0].value).toBe(130);
    expect(d.earnedCredits[0].value).toBe(36);
    expect(codes(d.completed)).toEqual(["CSE1002", "ITE1012"]);
  });
});

describe("applyTranscriptImport", () => {
  const current = { earnedCredits: 30, earnedMajorCredits: 6, targetCredits: null, completedCourseCodes: ["CSE1002"] };

  it("16. 합치기는 중복을 빼고, 교체는 과목 목록을 바꾼다", () => {
    const base = { earnedCredits: null, earnedMajorCredits: null, targetCredits: null, completedCodes: ["CSE1002", "ITE1012"] };
    expect(applyTranscriptImport(current, { ...base, mode: "merge" }).completedCourseCodes).toEqual(["CSE1002", "ITE1012"]);
    expect(applyTranscriptImport(current, { ...base, completedCodes: ["ITE1012"], mode: "replace" }).completedCourseCodes).toEqual(["ITE1012"]);
  });

  it("고르지 않은 숫자는 기존값을 유지한다", () => {
    const r = applyTranscriptImport(current, { earnedCredits: 36, earnedMajorCredits: null, targetCredits: null, completedCodes: [], mode: "merge" });
    expect(r).toMatchObject({ earnedCredits: 36, earnedMajorCredits: 6, targetCredits: null });
  });

  it("11. 전공학점 > 총학점이면 반영을 막는다", () => {
    expect(importProblem({ earnedCredits: 10, earnedMajorCredits: 12, targetCredits: null, completedCodes: [], mode: "merge" }, current)).toContain("포함");
    expect(importProblem({ earnedCredits: null, earnedMajorCredits: 40, targetCredits: null, completedCodes: [], mode: "merge" }, current)).toContain("포함");
    expect(importProblem({ earnedCredits: 36, earnedMajorCredits: 9, targetCredits: 130, completedCodes: [], mode: "merge" }, current)).toBeNull();
  });
});
