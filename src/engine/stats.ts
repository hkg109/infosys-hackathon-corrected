import type { PlanResultV2, TrackCandidate } from "@/contracts/types";

/** 후보 카드·상세에 쓰는 요약 지표. 엔진 결과에서 읽기만 한다(배치를 다시 계산하지 않는다). */
export interface PlanStats {
  studyTerms: number;
  maxCredits: number | null;
  avgCredits: number | null;
  /** 3학년(유효학기 5~6) 평균 계획학점. 해당 학기가 없으면 null */
  year3Avg: number | null;
  /** 4학년 이후(유효학기 7~) 평균 계획학점 */
  year4PlusAvg: number | null;
  /** 진로 핵심 과목 평균 배치 학기(지표 career_core) */
  coreTiming: number | null;
  /** 확인이 필요한 항목 수(정보 부족 + 미배치 + 조건부) */
  checkCount: number;
}

const avg = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

export function planStats(result: PlanResultV2 | null, candidate?: TrackCandidate): PlanStats {
  const study = result?.terms.filter((t) => t.status === "study") ?? [];
  const credits = study.map((t) => t.plannedCredits);
  const inRange = (from: number, to: number) =>
    study.filter((t) => t.termOrdinal !== null && t.termOrdinal >= from && t.termOrdinal <= to).map((t) => t.plannedCredits);
  return {
    studyTerms: study.length,
    maxCredits: credits.length ? Math.max(...credits) : null,
    avgCredits: avg(credits),
    year3Avg: avg(inRange(5, 6)),
    year4PlusAvg: avg(inRange(7, 99)),
    coreTiming: candidate?.metrics.find((m) => m.key === "career_core")?.value ?? null,
    checkCount:
      (candidate?.missing.length ?? 0) +
      (result?.unplaced.length ?? 0) +
      (candidate?.key.militaryRole === "conditional" ? 1 : 0),
  };
}
