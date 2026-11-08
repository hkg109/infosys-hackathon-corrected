import type { PopularitySnapshot } from "@/contracts/types";

/**
 * 전체 트랙 인기 순위. 개인화 추천과 완전히 분리한다.
 * 실제 집계(서비스 사용자의 익명 최종 선택, 공식 지원자 통계)가 생기기 전에는 순위를 만들지 않는다.
 * - 개발자가 정한 순위, 한 사람의 선택, 이 브라우저의 localStorage, 개인화 점수를 인기로 쓰지 않는다.
 * 나중에 API(/api/popularity)로 바꿔도 화면은 이 함수 모양만 쓴다.
 */
export function getPopularitySnapshot(): PopularitySnapshot {
  return {
    available: false,
    metric: "service_user_selection",
    scope: "정보시스템학과 트랙 플래너 사용자",
    from: null,
    to: null,
    sampleSize: null,
    source: null,
    demo: false,
    entries: [],
    unavailableReason: "아직 다른 사용자의 선택 데이터가 충분하지 않아요. 데이터가 쌓이면 전체 인기 TOP 3를 보여드릴게요.",
  };
}
