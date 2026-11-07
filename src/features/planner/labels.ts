import type { BreakPeriod, CareerTrack } from "@/contracts/types";

export const TRACK_NAME: Record<CareerTrack, string> = { security: "정보보안", data: "데이터 분석" };
export const TRACKS = Object.entries(TRACK_NAME) as Array<[CareerTrack, string]>;

export const BREAK_NAME: Record<BreakPeriod["kind"], string> = { military: "군 복무", leave: "휴학" };

export function breakLabel(breaks: BreakPeriod[]): string {
  const kinds = [...new Set(breaks.map((b) => b.kind))];
  return kinds.length === 1 ? BREAK_NAME[kinds[0]] : "군 복무·휴학";
}
