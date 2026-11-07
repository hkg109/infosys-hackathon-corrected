import { describe, expect, it } from "vitest";
import { fixtureDataset } from "@/data/fixtures";
import { findCoursesInText } from "./parseTranscript";

const courses = fixtureDataset.courses;

describe("findCoursesInText", () => {
  it("학수번호로 찾는다", () => {
    expect(findCoursesInText("2025-1 CSE1002 전산학개론 3 A+", courses)).toEqual(["CSE1002"]);
  });

  it("학수번호가 없으면 과목명 전체로 찾는다(공백 무시)", () => {
    expect(findCoursesInText("정보 시스템 개론\tA0\n데이터구조 B+", courses).sort()).toEqual(["APA2054", "ITE1012"]);
  });

  it("비슷한 이름은 섞지 않는다", () => {
    expect(findCoursesInText("인공지능실무응용 A", courses)).toEqual(["ITE4086"]);
  });

  it("자료에 없는 과목이나 빈 입력은 무시한다", () => {
    expect(findCoursesInText("XYZ9999 교양영어 A", courses)).toEqual([]);
    expect(findCoursesInText("   ", courses)).toEqual([]);
  });
});
