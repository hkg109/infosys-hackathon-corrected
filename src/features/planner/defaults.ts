import type { ISODate, PlanInput, Term } from "@/contracts/types";

/** 브라우저의 오늘 날짜(YYYY-MM-DD). 마운트 후에만 호출한다. */
export function todayISO(): ISODate {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 오늘 기준으로 처음 계획할 학기(사용자가 바꿀 수 있는 기본값). */
export function upcomingTerm(today: ISODate): Term {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (month <= 2) return { year, season: 1 };
  if (month <= 8) return { year, season: 2 };
  return { year: year + 1, season: 1 };
}

/**
 * 처음 입력 화면의 빈 값. 학교 수치(목표학점 등)는 채우지 않는다.
 * 학기당 상한은 사용자 제약이며 화면에서 바꿀 수 있다.
 */
export function blankInput(today: ISODate): PlanInput {
  return {
    startTerm: upcomingTerm(today),
    completedCourseCodes: [],
    earnedCredits: 0,
    earnedMajorCredits: 0,
    completedTerms: 0,
    targetCredits: null,
    track: "security",
    creditCap: 18,
    breaks: [],
  };
}
