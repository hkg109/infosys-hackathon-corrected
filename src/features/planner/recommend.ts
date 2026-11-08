import { CAREER_TRACKS } from "@/contracts/careers";
import type { CareerTrack, Dataset } from "@/contracts/types";

/**
 * 관심사 질문 → 진로 추천. 서비스의 진로 분류에 대한 단순 가중치 합이며 적성 검사가 아니다.
 * 같은 답이면 항상 같은 순서가 나온다(동점은 CAREER_TRACKS 순서).
 */

export interface QuizOption {
  id: string;
  label: string;
  weights: Partial<Record<CareerTrack, number>>;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: QuizOption[];
}

export const QUIZ: QuizQuestion[] = [
  {
    id: "project",
    prompt: "학기 프로젝트 주제를 고를 수 있다면",
    options: [
      { id: "app", label: "직접 쓸 수 있는 웹 서비스 만들기", weights: { software: 2 } },
      { id: "insight", label: "공공데이터로 숨은 패턴 찾기", weights: { data: 2 } },
      { id: "hack", label: "우리 학교 사이트 취약점 점검하기", weights: { security: 2 } },
      { id: "process", label: "동아리 업무를 시스템으로 바꾸는 설계", weights: { consulting: 2 } },
      { id: "biz", label: "새 서비스 사업계획서 쓰기", weights: { business: 2 } },
      { id: "invest", label: "주가·금융 데이터로 투자 전략 분석하기", weights: { finance: 2, data: 1 } },
    ],
  },
  {
    id: "team",
    prompt: "팀플에서 자연스럽게 맡게 되는 일",
    options: [
      { id: "build", label: "일단 코드부터 짜 본다", weights: { software: 2, security: 1 } },
      { id: "research", label: "자료를 모아 숫자로 정리한다", weights: { data: 2, consulting: 1 } },
      { id: "review", label: "빠진 것·위험한 것을 짚는다", weights: { security: 2, consulting: 1 } },
      { id: "organize", label: "역할을 나누고 일정을 짠다", weights: { consulting: 2, business: 1 } },
      { id: "pitch", label: "아이디어를 내고 발표한다", weights: { business: 2 } },
      { id: "budget", label: "예산과 숫자가 맞는지 따진다", weights: { finance: 2, consulting: 1 } },
    ],
  },
  {
    id: "class",
    prompt: "시간표에 꼭 넣고 싶은 수업",
    options: [
      { id: "web", label: "웹시스템프로그래밍", weights: { software: 2 } },
      { id: "ai", label: "확률및통계 · 인공지능및응용", weights: { data: 2 } },
      { id: "net", label: "컴퓨터네트워크 · 정보보호", weights: { security: 2 } },
      { id: "erp", label: "ERP시스템 · IT와경영전략", weights: { consulting: 2 } },
      { id: "ecom", label: "전자상거래이론 · 마케팅개론", weights: { business: 2 } },
      { id: "fin", label: "재무관리 · 블록체인개론", weights: { finance: 2 } },
    ],
  },
  {
    id: "work",
    prompt: "졸업하고 일하고 싶은 곳",
    options: [
      { id: "dev", label: "IT 서비스 회사 개발팀", weights: { software: 2 } },
      { id: "ml", label: "데이터·AI 조직", weights: { data: 2 } },
      { id: "sec", label: "보안 기업이나 금융권 보안팀", weights: { security: 2 } },
      { id: "si", label: "IT 컨설팅·SI 회사", weights: { consulting: 2 } },
      { id: "startup", label: "스타트업 서비스 기획팀", weights: { business: 2 } },
      { id: "bank", label: "은행·증권사 IT나 핀테크 회사", weights: { finance: 2 } },
    ],
  },
  {
    id: "joy",
    prompt: "시간 가는 줄 모르는 순간",
    options: [
      { id: "code", label: "버그를 잡고 기능이 돌아갈 때", weights: { software: 2, security: 1 } },
      { id: "pattern", label: "그래프에서 의미가 보일 때", weights: { data: 2 } },
      { id: "puzzle", label: "남들이 못 찾은 허점을 찾았을 때", weights: { security: 2 } },
      { id: "fix", label: "복잡한 일이 깔끔하게 정리될 때", weights: { consulting: 2, business: 1 } },
      { id: "people", label: "사람들이 내 아이디어에 반응할 때", weights: { business: 2, consulting: 1 } },
      { id: "market", label: "시장 흐름을 읽어 낸 게 맞았을 때", weights: { finance: 2, data: 1 } },
    ],
  },
];

/** 이수 과목 하나가 진로에 더하는 점수와 그 상한 */
const COURSE_WEIGHT = 0.5;
const COURSE_CAP = 1.5;

export interface CareerMatch {
  track: CareerTrack;
  score: number;
  /** 이 진로에 점수를 준 답의 개수 */
  matchedAnswers: number;
  /** 화면에 보여 줄 근거: 고른 답과 이미 들은 진로 과목 */
  reasons: string[];
}

export const answeredCount = (answers: Record<string, string>) =>
  QUIZ.filter((q) => q.options.some((o) => o.id === answers[q.id])).length;

export function recommendCareers(
  answers: Record<string, string>,
  completedCourseCodes: string[] = [],
  dataset: Dataset | null = null,
  /** 사용자가 직접 고른 관심 진로. 있으면 맨 앞에 둔다 */
  picked: CareerTrack | null = null,
): CareerMatch[] {
  const rows = CAREER_TRACKS.map((track) => ({ track, score: 0, matchedAnswers: 0, reasons: [] as string[] }));
  const row = (t: CareerTrack) => rows.find((r) => r.track === t)!;

  for (const q of QUIZ) {
    const opt = q.options.find((o) => o.id === answers[q.id]);
    if (!opt) continue;
    for (const [track, w] of Object.entries(opt.weights) as Array<[CareerTrack, number]>) {
      const r = row(track);
      r.score += w;
      r.matchedAnswers += 1;
      if (w >= 2) r.reasons.push(opt.label);
    }
  }

  if (dataset) {
    const done = new Set(completedCourseCodes);
    for (const r of rows) {
      const taken = dataset.careerTags.filter((t) => t.group === r.track && done.has(t.courseCode));
      if (taken.length === 0) continue;
      r.score += Math.min(COURSE_CAP, taken.length * COURSE_WEIGHT);
      const names = taken
        .map((t) => dataset.courses.find((c) => c.code === t.courseCode)?.name)
        .filter((n): n is string => !!n);
      r.reasons.push(`이미 들은 ${names.slice(0, 2).join(", ")}${names.length > 2 ? ` 외 ${names.length - 2}과목` : ""}`);
    }
  }

  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => Number(b.r.track === picked) - Number(a.r.track === picked) || b.r.score - a.r.score || a.i - b.i)
    .map(({ r }) => r);
}
