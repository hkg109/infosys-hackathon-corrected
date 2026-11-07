/** 01 아(내 정보) 질문 페이지 순서. 서버 page에서도 읽으므로 "use client" 파일에 두지 않는다. */
export const INPUT_STEPS = [
  { id: "basic", path: "/input", title: "기본 정보", q: "먼저, 당신에 대해 알려 주세요" },
  { id: "record", path: "/input/record", title: "지금까지", q: "지금까지 얼마나 들었나요?" },
  { id: "interest", path: "/input/interest", title: "끌리는 것", q: "어떤 쪽에 마음이 가나요?" },
  { id: "military", path: "/input/military", title: "군대", q: "군대는 어떻게 할 계획인가요?" },
  { id: "exchange", path: "/input/exchange", title: "교환학생", q: "교환학생에 관심 있나요?" },
  { id: "goals", path: "/input/goals", title: "목표", q: "마지막으로, 무엇이 가장 중요한가요?" },
] as const;
export type StepId = (typeof INPUT_STEPS)[number]["id"];
