import type { PlanInput } from "./types";

/** 샘플 프로필: 1학년을 마치고 2027년 1학기부터 계획, 군 복무 포함 */
export const sampleInput: PlanInput = {
  startTerm: { year: 2027, season: 1 },
  completedCourseCodes: ["CSE1002", "ITE1012", "ITE1009"],
  earnedCredits: 36,
  earnedMajorCredits: 9,
  completedTerms: 2,
  targetCredits: 130,
  track: "security",
  creditCap: 18,
  breaks: [{ kind: "military", startDate: "2028-04-01", endDate: "2029-11-01" }],
};

/** 중단 기간이 없는 기준 플랜 */
export const sampleInputNoBreak: PlanInput = { ...sampleInput, breaks: [] };

/** 목표학점을 모르는 경우: 예상 완료 학기를 계산하지 않아야 한다 */
export const sampleInputUnknownTarget: PlanInput = { ...sampleInput, targetCredits: null };

/** 입력 오류 사례 */
export const sampleInputInvalid: PlanInput = {
  ...sampleInput,
  breaks: [{ kind: "leave", startDate: "2028-09-01", endDate: "2028-03-01" }],
};
