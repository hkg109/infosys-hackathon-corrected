import type { Course, Dataset, MajorRequirement } from "@/contracts/types";

/**
 * 전공 요건(개인 졸업사정) 계산 도우미. 순수 함수.
 * 단위는 학수번호의 첫 숫자로 판단한다(서비스 가정): 1~3 → 100~300단위, 4 → 400단위, 그 밖(0·5·6 등) → 단위 미상.
 */

export type CourseLevel = "lower" | "upper" | "unknown";

export const LEVEL_ASSUMPTION = "과목 단위는 학수번호 첫 숫자로 판단했어요(1~3 → 100~300단위, 4 → 400단위). 포털 졸업사정에서 다시 확인하세요.";

export function courseLevel(code: string): CourseLevel {
  const d = code.match(/\d/)?.[0];
  if (d === "1" || d === "2" || d === "3") return "lower";
  if (d === "4") return "upper";
  return "unknown";
}

/** 이수구분에 "전공"이 들어간 과목 */
export const isMajorCourse = (c: Pick<Course, "category"> | undefined | null) => !!c?.category?.includes("전공");

export function hasMajorRequirement(r: MajorRequirement | null | undefined): r is MajorRequirement {
  return !!r && (r.majorCredits !== null || r.lowerLevelCredits !== null || r.upperLevelCredits !== null);
}

/** 이수 과목 중 자료에 있는 400단위 전공 과목 학점(추정용 하한) */
export function estimateUpperEarned(completed: string[], dataset: Dataset): number {
  const done = new Set(completed);
  return dataset.courses
    .filter((c) => done.has(c.code) && isMajorCourse(c) && courseLevel(c.code) === "upper")
    .reduce((a, c) => a + c.credits, 0);
}

export interface LevelCredits {
  major: number;
  lower: number;
  upper: number;
  unknownLevel: number;
}

export function sumMajorLevels(courses: Array<Pick<Course, "code" | "credits" | "category">>): LevelCredits {
  const out: LevelCredits = { major: 0, lower: 0, upper: 0, unknownLevel: 0 };
  for (const c of courses) {
    if (!isMajorCourse(c)) continue;
    out.major += c.credits;
    const l = courseLevel(c.code);
    if (l === "lower") out.lower += c.credits;
    else if (l === "upper") out.upper += c.credits;
    else out.unknownLevel += c.credits;
  }
  return out;
}

/**
 * 추천 과목(planned)으로 채우고도 남는 전공 학점. 모두 최소 요건으로 본다.
 * upper·lower는 major의 일부이며, major는 upper+lower보다 작지 않다.
 */
export function majorShortfall(
  req: MajorRequirement,
  earned: { major: number; lower: number; upper: number },
  planned: LevelCredits,
): { major: number; lower: number; upper: number } {
  const upper = req.upperLevelCredits === null ? 0 : Math.max(0, req.upperLevelCredits - earned.upper - planned.upper);
  const lower = req.lowerLevelCredits === null ? 0 : Math.max(0, req.lowerLevelCredits - earned.lower - planned.lower);
  const total = req.majorCredits === null ? 0 : Math.max(0, req.majorCredits - earned.major - planned.major);
  return { major: Math.max(total, upper + lower), lower, upper };
}
