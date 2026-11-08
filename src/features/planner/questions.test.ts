import { describe, expect, it } from "vitest";
import { blankDraft } from "./plan";
import { stepProblem } from "./questions";

describe("성적표 가져오기 후 진행 안내", () => {
  it("과목을 반영했지만 총·전공 학점이 없으면 다시 캡처하라고 하지 않는다", () => {
    const draft = {
      ...blankDraft("2026-11-08"),
      progressMode: "import" as const,
      completedCourseCodes: ["CSE1002"],
    };

    expect(stepProblem("transcript", draft)).toBe("과목은 가져왔어요. 총·전공 이수학점만 적어 주세요.");
  });

  it("가져온 과목과 확인한 학점이 있으면 다음으로 진행할 수 있다", () => {
    const draft = {
      ...blankDraft("2026-11-08"),
      progressMode: "import" as const,
      completedCourseCodes: ["CSE1002"],
      earnedCredits: 18,
      earnedMajorCredits: 6,
    };

    expect(stepProblem("transcript", draft)).toBeNull();
  });
});
