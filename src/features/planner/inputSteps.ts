/**
 * 01 아(내 정보) 질문 순서. 한 화면에 질문 하나.
 * 서버 page(generateStaticParams)에서도 읽으므로 "use client" 파일에 두지 않는다.
 */
export const INPUT_STEPS = [
  { id: "name", title: "이름", q: "어떤 이름으로 불러드릴까요?" },
  { id: "admission", title: "입학연도", q: "입학연도는 언제인가요?" },
  { id: "completed", title: "마친 학기", q: "현재 몇 학기까지 마쳤나요?" },
  { id: "start", title: "시작 학기", q: "다음 계획은 몇 년도 몇 학기부터 시작할까요?" },
  { id: "transcript", title: "이수 현황", q: "성적표를 가져와 이수 현황을 한 번에 채울까요?" },
  { id: "credits", title: "총 이수학점", q: "지금까지 총 몇 학점을 이수했나요?" },
  { id: "major", title: "전공학점", q: "그중 전공학점은 몇 학점인가요?" },
  { id: "courses", title: "이수 과목", q: "이수 과목을 붙여넣거나 직접 선택할까요?" },
  { id: "target", title: "목표 총학점", q: "개인 졸업사정에서 확인한 목표 총학점이 있나요?" },
  { id: "career", title: "진로", q: "관심 있는 진로가 있나요?" },
  { id: "quiz", title: "진로 추천 질문", q: "어떤 쪽에 마음이 가나요?" },
  { id: "pace", title: "학점 페이스", q: "학기당 어느 정도의 학점을 듣고 싶나요?" },
  { id: "late", title: "후반 여유형", q: "3·4학년에는 학점을 줄이는 ‘후반 여유형’을 원하나요?" },
  { id: "military", title: "군 복무", q: "군 복무를 완료했거나 계획하고 있나요?" },
  { id: "military-track", title: "군 복무 트랙", q: "어떤 군 복무 트랙을 알아보고 싶나요?" },
  { id: "military-timing", title: "입대 시점", q: "입대 시점은 정해졌나요?" },
  { id: "katusa", title: "카투사 우선", q: "카투사를 최우선으로 희망하나요?" },
  { id: "katusa-status", title: "카투사 상태", q: "카투사 지원 또는 선발 상태는 무엇인가요?" },
  { id: "leave", title: "휴학", q: "휴학 계획이 있나요?" },
  { id: "exchange", title: "교환학생", q: "교환학생을 고려하고 있나요?" },
  { id: "priority", title: "우선순위", q: "가장 중요한 우선순위는 무엇인가요?" },
  { id: "review", title: "확인", q: "지금까지 입력한 내용을 확인해 주세요." },
] as const;

export type StepId = (typeof INPUT_STEPS)[number]["id"];

export const stepPath = (id: StepId | string) => (id === "name" ? "/input" : `/input/${id}`);
