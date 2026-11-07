import type { CareerTrack } from "./types";

/**
 * 서비스가 정한 진로 분류(학교 공식 트랙이 아니다). 순서는 후보 생성·표시의 고정 순서다.
 * 정보시스템학과 교육과정(S1)의 과목 묶음을 기준으로 나눴다.
 */
export const CAREER_TRACKS: readonly CareerTrack[] = ["software", "data", "security", "consulting", "business"];

export const CAREER_LABEL: Record<CareerTrack, string> = {
  software: "소프트웨어 개발",
  data: "데이터·AI",
  security: "정보보안",
  consulting: "IT 컨설팅·기획",
  business: "IT 비즈니스·서비스",
};

export const isCareerTrack = (x: unknown): x is CareerTrack =>
  typeof x === "string" && (CAREER_TRACKS as readonly string[]).includes(x);
