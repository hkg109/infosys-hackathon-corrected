import type { BreakPeriod, CareerTrack, Term } from "@/contracts/types";
import { isBlocked } from "@/engine/terms";

export const TRACK_NAME: Record<CareerTrack, string> = { security: "정보보안", data: "데이터 분석" };
export const TRACKS = Object.entries(TRACK_NAME) as Array<[CareerTrack, string]>;

export const BREAK_NAME: Record<BreakPeriod["kind"], string> = { military: "군 복무", leave: "휴학" };

export function breakLabel(breaks: BreakPeriod[]): string {
  const kinds = [...new Set(breaks.map((b) => b.kind))];
  return kinds.length === 1 ? BREAK_NAME[kinds[0]] : "군 복무·휴학";
}

/** 이 학기를 막은 중단 구간의 이름. 겹침 판정은 엔진의 isBlocked를 그대로 쓴다. */
export function breakLabelFor(term: Term, breaks: BreakPeriod[]): string {
  const hit = breaks.filter((b) => isBlocked(term, [b]));
  return breakLabel(hit.length > 0 ? hit : breaks);
}
