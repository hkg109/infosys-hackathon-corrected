import { describe, expect, it } from "vitest";
import type { Course } from "@/contracts/types";
import { fixtureDataset } from "@/data/fixtures";
import { applyTranscriptImport, importProblem, parseTranscriptRows, rowsFromTable, rowsFromText, rowsFromVision } from "./transcriptImport";

// 모두 가상 자료. 실제 학생 성적표가 아니다.
const courses = fixtureDataset.courses;
const withHyphen: Course[] = [...courses, { ...courses[0], code: "I-D3018", name: "가상디자인과목" }];
const parse = (text: string, cs: Course[] = courses, src: "clipboard_text" | "clipboard_html" = "clipboard_text") => parseTranscriptRows(rowsFromText(text), cs, src);
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

  it("14. 글자 혼동(O/0, I/1) 유사 매칭(0/O, 1/I)은 자동 확정하지 않는다", () => {
    const d = parse("CSEIOO2\t3\tA0", courses);
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

  it("이미지에서 총·전공 학점을 못 읽고 기존 값도 없으면 반영을 막는다", () => {
    const noProgress = { ...current, earnedCredits: null, earnedMajorCredits: null };
    const empty = { earnedCredits: null, earnedMajorCredits: null, targetCredits: null, completedCodes: ["CSE1002"], mode: "merge" as const };
    expect(importProblem(empty, noProgress)).toContain("총 이수학점과 전공 이수학점");
    expect(importProblem({ ...empty, earnedCredits: 30 }, noProgress)).toContain("전공 이수학점");
    expect(importProblem({ ...empty, earnedMajorCredits: 6 }, noProgress)).toContain("총 이수학점");
    expect(importProblem(empty, current)).toBeNull();
    expect(importProblem({ ...empty, earnedCredits: 30, earnedMajorCredits: 6 }, noProgress)).toBeNull();
  });
});

describe("붙여넣기 형식 견고성", () => {
  it("한 줄에 셀 하나씩 나온 포털 복사도 학수번호 기준으로 묶어 읽는다", () => {
    const text = ["2025", "1학기", "CSE1002", "전산학개론", "전공기초", "3.0", "A+", "2025", "1학기", "ITE1012", "정보시스템개론", "전공핵심", "3.0", "B0", "2025", "2학기", "ITE1009", "C프로그래밍", "전공", "3.0", "F", "총 취득학점", "36", "전공 취득학점", "12", "평점평균", "3.91"].join("\n");
    const d = parse(text);
    expect(d.earnedCredits.map((v) => v.value)).toEqual([36]);
    expect(d.earnedMajorCredits.map((v) => v.value)).toEqual([12]);
    expect(d.layout).toBe("vertical");
    expect(codes(d.completed)).toEqual(["CSE1002", "ITE1012"]);
    expect(codes(d.notCompleted)).toEqual(["ITE1009"]);
  });
  it("전각 문자·nbsp·학수번호와 과목명이 붙은 셀", () => {
    const d = parse("ＣＳＥ１００２전산학개론  ３  Ａ＋");
    expect(codes(d.completed)).toEqual(["CSE1002"]);
  });
  it("한 셀에 성적과 평점이 같이 있어도 성적을 읽는다", () => {
    expect(codes(parse("CSE1002\t전산학개론\t3\tA+ / 4.5").completed)).toEqual(["CSE1002"]);
  });
});

describe("한양인 포털 성적 조회 행 형식(가상 값)", () => {
  const row = (term: string, cat: string, code: string, name: string, credits: string, grade: string) => [term, cat, code, name, credits, "96.7", "96.7", "4.50", grade, "Excellent", "N"].join("\t");
  it("'2.00' 학점, 점수·평점 열과 섞여도 학점과 성적을 바르게 읽고 여러 학기를 이어 붙여도 된다", () => {
    const text = [
      row("2026년-1학년-1학기", "교양필수", "CUL0203", "AI시대쓰기의힘", "2.00", "A+"),
      row("2026년-1학년-1학기", "전공기초(필수)", "CSE1002", "전산학개론", "3.00", "B0"),
      "",
      row("2026년-1학년-2학기", "전공핵심", "ITE1012", "정보시스템개론", "3.00", "A0"),
    ].join("\n");
    const d = parse(text);
    expect(codes(d.completed)).toEqual(["CSE1002", "CUL0203", "ITE1012"]);
    expect(d.completed.find((c) => c.matchedCourseCode === "CUL0203")!.detectedCredits).toBe(2);
    expect(d.courseCreditSum).toBe(8);
  });
});

describe("rowsFromVision(스크린샷 인식 결과)", () => {
  it("여러 장의 과목 행을 같은 파서·검토 경로로 넘기고, 요약 학점은 후보로만", async () => {
    const { rowsFromVision } = await import("./transcriptImport");
    const rows = rowsFromVision([
      { rows: [{ term: "2026년-1학년-1학기", category: "교양필수", code: "CUL0203", name: "AI시대쓰기의힘", credits: 2, grade: "A+" }], summary: { earnedCredits: null, majorCredits: null, targetCredits: null }, unreadable: false },
      { rows: [{ term: "2026년-1학년-2학기", category: "전공핵심", code: "ITE1012", name: "정보시스템개론", credits: 3, grade: "F" }], summary: { earnedCredits: 21, majorCredits: 6, targetCredits: null }, unreadable: false },
    ]);
    const d = parseTranscriptRows(rows, courses, "image_ai");
    expect(codes(d.completed)).toEqual(["CUL0203"]);
    expect(codes(d.notCompleted)).toEqual(["ITE1012"]);
    expect(d.earnedCredits.map((v) => v.value)).toEqual([21]);
    expect(d.earnedMajorCredits.map((v) => v.value)).toEqual([6]);
  });

  const romanCourses: Course[] = [
    ...courses,
    { ...courses[0], code: "PHY0001", name: "기초물리학 II" },
    { ...courses[0], code: "CUL0001", name: "글쓰기 S" },
  ];
  const imageCourse = (code: string, name: string, grade: string | null) =>
    parseTranscriptRows(rowsFromVision([{ rows: [{ term: "2026년-1학년-1학기", category: "교양필수", code, name, credits: 1, grade }], summary: { earnedCredits: null, majorCredits: null, targetCredits: null }, unreadable: false }]), romanCourses, "image_ai");

  it("과목명 속 로마숫자 I와 실제 A+를 분리하고 완료로 기본 선택한다", () => {
    for (const name of ["커리어개발 I :취.창업진로로드맵", "커리어개발I:취.창업진로로드맵"]) {
      const d = imageCourse("GEN5029", name, "A+");
      expect(d.completed.find((r) => r.matchedCourseCode === "GEN5029")).toMatchObject({ detectedGrade: "A+", selected: true });
      expect(d.ambiguous).toHaveLength(0);
    }
  });

  it("다른 로마숫자와 한 글자 과목명 조각은 성적 열을 오염시키지 않는다", () => {
    expect(imageCourse("PHY0001", "기초물리학 II", "B0").completed[0].detectedGrade).toBe("B0");
    const ungraded = imageCourse("CUL0001", "글쓰기 S", null);
    expect(ungraded.completed).toHaveLength(0);
    expect(ungraded.ambiguous[0]).toMatchObject({ detectedGrade: null, detectedStatus: "unknown", selected: false });
  });

  it("실제 성적 열의 I·F·W·P는 기존 상태대로 해석한다", () => {
    const unknown = imageCourse("GEN5029", "커리어개발 I :취.창업진로로드맵", "I");
    expect(unknown.ambiguous[0]).toMatchObject({ detectedGrade: "I", detectedStatus: "unknown" });
    expect(imageCourse("GEN5029", "커리어개발 I :취.창업진로로드맵", "F").notCompleted[0].detectedStatus).toBe("failed");
    expect(imageCourse("GEN5029", "커리어개발 I :취.창업진로로드맵", "W").notCompleted[0].detectedStatus).toBe("withdrawn");
    expect(imageCourse("GEN5029", "커리어개발 I :취.창업진로로드맵", "P").completed[0].detectedStatus).toBe("completed");
  });

  it("구조 없는 행에서도 과목명 속 I보다 오른쪽 성적을 우선하고 숫자 병합 셀을 읽는다", () => {
    const roman = parse("2026-1\tGEN5029\t커리어개발 I :취.창업진로로드맵\t1\tA+");
    expect(roman.completed[0]).toMatchObject({ detectedGrade: "A+", detectedStatus: "completed" });
    const splitRoman = parseTranscriptRows(rowsFromTable([["GEN5029", "커리어개발", "I", ":취.창업진로로드맵", "1", "A+"]]), romanCourses, "clipboard_html");
    expect(splitRoman.completed[0]).toMatchObject({ detectedGrade: "A+", detectedStatus: "completed" });
    const compound = parse("CSE1002\t전산학개론\t3\tA+ / 4.5");
    expect(compound.completed[0]).toMatchObject({ detectedGrade: "A+", detectedStatus: "completed" });
    const splitCompound = parseTranscriptRows(rowsFromTable([["GEN5029", "커리어개발", "I", ":취.창업진로로드맵", "1", "A+ / 4.5"]]), romanCourses, "clipboard_html");
    expect(splitCompound.completed[0]).toMatchObject({ detectedGrade: "A+", detectedStatus: "completed" });
  });
});
