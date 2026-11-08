import { blankDraft, type Draft } from "./plan";
import { QUIZ } from "./recommend";

/**
 * 시연용 테스트 프로필. 모두 가상 데이터이며 실제 학생 정보가 아니다.
 * 불러오면 입력·선택한 트랙·교양 자리·전후 비교·확정 로드맵·체크리스트를 모두 초기화하고 이 값으로 바꾼다.
 */
export interface TestProfile {
  id: "A" | "B" | "C" | "D";
  title: string;
  summary: string;
  /** 불러온 뒤 이동할 질문 */
  landing: string;
  draft: (today: string) => Draft;
}

const answersFor = (index: number) => Object.fromEntries(QUIZ.map((q) => [q.id, q.options[index].id]));

export const TEST_PROFILES: TestProfile[] = [
  {
    id: "A",
    title: "A · 1학년 수료, 카투사 우선",
    summary: "2개 학기 완료 · 정보보안 · 카투사 최우선(지원 준비 중) · 균형형↔후반 여유형 비교 · 교양 2·3학점 자리",
    landing: "review",
    draft: (today) => ({
      ...blankDraft(today),
      name: "가상 학생 A",
      admissionYear: 2026,
      completedTerms: 2,
      startTerm: { year: 2027, season: 1 },
      earnedCredits: 36,
      earnedMajorCredits: 9,
      completedCourseCodes: ["GEN5029", "CSE1002", "ITE1012", "ITE1009"],
      coursesConfirmed: true,
      targetCredits: 130,
      targetSource: "user_goal",
      career: "security",
      paceCredits: 18,
      paceStyle: "compare",
      military: { status: "planned", trackIds: ["katusa"], timing: "recommend", startDate: null, months: null, certificateIds: [] },
      katusa: { priority: true, status: "preparing" },
      militaryPrefs: { branch: "army", goal: "katusa", katusa: "first_priority", it: "high", english: "yes", katusaHistory: "none", mustReturnBy: null },
      leave: { mode: "none", ordinal: null },
      exchange: { mode: "none", ordinal: null },
      priority: "career_core",
      demo: {
        profileId: "A",
        label: "테스트 프로필 A(가상)",
        genEd: [
          { studyIndex: 0, credits: 2 },
          { studyIndex: 1, credits: 3 },
        ],
      },
    }),
  },
  {
    id: "B",
    title: "B · 2학년 수료, 육군 기술행정병 관심",
    summary: "4개 학기 완료 · 소프트웨어 개발 · 기술행정병 · 교환학생(전공 과목 우선, IELTS 7.0 가상) · 후반 여유형",
    landing: "review",
    draft: (today) => ({
      ...blankDraft(today),
      name: "가상 학생 B",
      admissionYear: 2025,
      completedTerms: 4,
      startTerm: { year: 2027, season: 1 },
      earnedCredits: 70,
      earnedMajorCredits: 33,
      completedCourseCodes: ["GEN5029", "CSE1002", "ITE1012", "ITE1009", "ITE1010", "APA2054", "ITE3032", "ITE2020", "ITE2023", "ITE2021", "GEN0044", "ACC2056"],
      coursesConfirmed: true,
      targetCredits: 130,
      targetSource: "user_goal",
      career: "software",
      paceCredits: 18,
      paceStyle: "late_light",
      military: {
        status: "planned",
        trackIds: ["army-technical"],
        timing: "recommend",
        startDate: null,
        months: null,
        certificateIds: ["programming-craftsman", "sqld"],
      },
      katusa: { priority: false, status: "not_applying" },
      militaryPrefs: { branch: "army", goal: "it_experience", katusa: "exclude", it: "high", english: null, katusaHistory: null, mustReturnBy: null },
      leave: { mode: "none", ordinal: null },
      exchange: { mode: "recommend", ordinal: null },
      exchangePrefs: {
        intent: "committed",
        when: "recommend",
        fixedTerm: null,
        duration: "one_term",
        priorities: ["major_course_access", "housing"],
        languageStatus: "has_score",
        language: { test: "IELTS_ACADEMIC", total: 7, testedAt: "2026-09-12" },
        gpa: 3.82,
        budget: "moderate",
        housing: "preferred",
        priorExchange: false,
        transfer: false,
        doubleMajor: false,
      },
      priority: "fast_completion",
      demo: { profileId: "B", label: "테스트 프로필 B(가상)", genEd: [] },
    }),
  },
  {
    id: "C",
    title: "C · 3학년부터 시작",
    summary: "6개 학기 완료 · 군 복무 마침 · IT 컨설팅 · 4학년을 가볍게(후반 여유형) · 목표학점이 남으면 완료 학기 연장",
    landing: "review",
    draft: (today) => ({
      ...blankDraft(today),
      name: "가상 학생 C",
      admissionYear: 2024,
      completedTerms: 6,
      startTerm: { year: 2027, season: 1 },
      earnedCredits: 100,
      earnedMajorCredits: 54,
      completedCourseCodes: [
        "GEN5029", "GEN5100", "CSE1002", "ITE1012", "ITE1009", "ITE1010", "APA2054", "ITE3032", "GEN0044", "ACC2056", "ITE2023",
        "ITE2024", "ITE2030", "ITE3016", "ITE3035", "ITE3026", "ITE4050", "ITE4035",
      ],
      coursesConfirmed: true,
      targetCredits: 130,
      targetSource: "user_goal",
      career: "consulting",
      paceCredits: 18,
      paceStyle: "late_light",
      military: { status: "done", trackIds: [], timing: "recommend", startDate: null, months: null, certificateIds: [] },
      katusa: { priority: false, status: "not_applying" },
      leave: { mode: "none", ordinal: null },
      exchange: { mode: "none", ordinal: null },
      priority: "light_terms",
      demo: { profileId: "C", label: "테스트 프로필 C(가상)", genEd: [] },
    }),
  },
  {
    id: "D",
    title: "D · 목표학점 미입력",
    summary: "1학기만 마친 신입생, 목표 총학점을 비워 두면 예상 완료가 ‘확인 필요’로 보임 · 데이터·AI 관심(질문으로 추천)",
    landing: "target",
    draft: (today) => ({
      ...blankDraft(today),
      name: "가상 학생 D",
      admissionYear: 2026,
      completedTerms: 1,
      startTerm: { year: 2027, season: 1 },
      earnedCredits: 18,
      earnedMajorCredits: 6,
      completedCourseCodes: ["GEN5029", "CSE1002"],
      coursesConfirmed: true,
      targetCredits: null,
      targetSource: null,
      career: "unsure",
      answers: answersFor(1),
      paceCredits: "compare",
      paceStyle: "balanced",
      military: { status: "none", trackIds: [], timing: "recommend", startDate: null, months: null, certificateIds: [] },
      katusa: { priority: false, status: "not_applying" },
      leave: { mode: "none", ordinal: null },
      exchange: { mode: "recommend", ordinal: null },
      priority: "fast_completion",
      demo: { profileId: "D", label: "테스트 프로필 D(가상)", genEd: [] },
    }),
  },
];
