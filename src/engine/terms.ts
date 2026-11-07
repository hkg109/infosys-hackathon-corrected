import type { BreakPeriod, ISODate, Season, Term } from "@/contracts/types";

/**
 * 학기 구간(가정): 1학기 = 03-01 ~ 07-01, 2학기 = 09-01 ~ 다음 해 01-01. 모두 [start, end).
 * 날짜는 YYYY-MM-DD 문자열로 비교해 시간대 영향을 받지 않는다.
 */
export function termRange(term: Term): { start: ISODate; end: ISODate } {
  return term.season === 1
    ? { start: `${term.year}-03-01`, end: `${term.year}-07-01` }
    : { start: `${term.year}-09-01`, end: `${term.year + 1}-01-01` };
}

export function nextTerm(term: Term): Term {
  return term.season === 1
    ? { year: term.year, season: 2 }
    : { year: term.year + 1, season: 1 };
}

export function termIndex(term: Term): number {
  return term.year * 2 + (term.season - 1);
}

export function termFromIndex(index: number): Term {
  return { year: Math.floor(index / 2), season: ((index % 2) + 1) as Season };
}

export function sameTerm(a: Term, b: Term): boolean {
  return a.year === b.year && a.season === b.season;
}

/** 두 [start, end) 구간이 겹치는지 */
export function overlaps(a: { start: ISODate; end: ISODate }, b: { start: ISODate; end: ISODate }): boolean {
  return a.start < b.end && b.start < a.end;
}

export function isBlocked(term: Term, breaks: BreakPeriod[]): boolean {
  const range = termRange(term);
  return breaks.some((b) => overlaps(range, { start: b.startDate, end: b.endDate }));
}

export function formatTerm(term: Term | null): string {
  return term ? `${term.year}년 ${term.season}학기` : "검토 필요";
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
