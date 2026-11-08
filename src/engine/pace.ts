import type { CreditCapRule, DatasetV2, PaceBand, PaceStyle, PlanInput } from "@/contracts/types";

/**
 * 후반 여유형 학점 페이스 설정. 학교 규정이 아니라 서비스의 계획용 휴리스틱이다.
 * 값을 바꾸면 configVersion을 올린다(결과 비교·저장에서 어떤 설정을 썼는지 남긴다).
 */
export const LATE_LIGHT_CONFIG = {
  configVersion: "pace-late-light-1",
  name: "후반 여유형",
  description: "1·2학년에 고른 페이스대로 듣고 3·4학년에 계획 학점을 줄입니다.",
  disclaimer: "서비스가 제안하는 계획 방식이며 학교 공식 권장 학점은 아닙니다.",
  rationale:
    "3·4학년에 진로 준비(자격증·인턴·졸업작품)에 쓸 시간을 확보하는 계획 예시입니다. 학생 통계에 근거한 값이 아닙니다.",
  /** fromOrdinal부터 pace - minus, 단 자동 하향은 floor 미만으로 내려가지 않는다(원래 pace가 더 작으면 pace 유지) */
  steps: [
    { fromOrdinal: 5, minus: 3, floor: 12 },
    { fromOrdinal: 7, minus: 6, floor: 9 },
  ],
} as const;

export const PACE_STYLE_LABEL: Record<PaceStyle, string> = {
  balanced: "균형형",
  late_light: "후반 여유형",
  custom: "직접 설정",
};

/** 학점 페이스 방식 → 유효학기 구간별 계획 학점. balanced는 구간 없음(creditCap 하나). */
export function paceBandsFor(style: PaceStyle, pace: number, custom: PaceBand[] | null = null): PaceBand[] {
  if (style === "balanced") return [];
  if (style === "custom") return normalizeBands(custom ?? []);
  return [
    { fromOrdinal: 1, credits: pace },
    ...LATE_LIGHT_CONFIG.steps.map((s) => ({
      fromOrdinal: s.fromOrdinal,
      credits: Math.max(Math.min(pace, s.floor), pace - s.minus),
    })),
  ];
}

export function normalizeBands(bands: PaceBand[]): PaceBand[] {
  return [...bands].sort((a, b) => a.fromOrdinal - b.fromOrdinal);
}

/** ordinal번째 유효학기(1부터)의 사용자 계획 학점 */
export function userCapFor(input: Pick<PlanInput, "creditCap" | "paceBands">, ordinal: number): number {
  let cap = input.creditCap;
  for (const b of normalizeBands(input.paceBands ?? [])) if (b.fromOrdinal <= ordinal) cap = b.credits;
  return cap;
}

/** 어느 학기에서든 쓸 수 있는 가장 큰 계획 학점(배치 불가 과목 판정용) */
export function maxUserCap(input: Pick<PlanInput, "creditCap" | "paceBands">): number {
  return Math.max(input.creditCap, ...(input.paceBands ?? []).map((b) => b.credits));
}

/**
 * 상한 제외 과목: 커리어개발Ⅰ·Ⅱ(교양필수 1학점). 총학점에는 들어가지만 학기 최대 신청학점에 넣지 않아
 * 그 학기에 상한 위로 더할 수 있다. 서비스 기준(사용자 확인) — 학교 안내문 쪽수는 확인하지 못했다.
 * 과목명이 아니라 학수번호로만 판정한다.
 */
export const CAP_EXEMPT_COURSES: readonly string[] = ["GEN5029", "GEN5100"];
export const isCapExempt = (code: string) => CAP_EXEMPT_COURSES.includes(code);
export const CAP_EXEMPT_NOTE = "커리어개발은 학기 최대학점에 포함되지 않아 1학점을 더 들을 수 있어요(서비스 기준 · 안내문 쪽수 미확인).";

const ordinalHit = (r: CreditCapRule, ordinal: number) =>
  (r.appliesTo.termOrdinalFrom === null || ordinal >= r.appliesTo.termOrdinalFrom) &&
  (r.appliesTo.termOrdinalTo === null || ordinal <= r.appliesTo.termOrdinalTo);

/**
 * 이 학생·학기에 적용할 학교 기준 최대학점 규칙.
 * - 서비스 기준 규칙(status "user_assumption", 학년별 1·2학년 20 / 3·4학년 18)이 자료에 있으면 그것만 쓴다.
 *   입학연도와 관계없이 유효학기 순번으로 적용한다(사용자 결정 — data-sources.md).
 * - 없으면 확인된(verified) 규칙만, 입학연도를 알 때만 쓴다. planned(예정) 규칙은 쓰지 않는다.
 */
export function schoolCapFor(
  rules: CreditCapRule[] | undefined,
  admissionYear: number | null | undefined,
  ordinal: number,
): CreditCapRule | null {
  if (!rules) return null;
  const pick = (xs: CreditCapRule[]) => xs.sort((x, y) => x.maxCredits - y.maxCredits || x.id.localeCompare(y.id))[0] ?? null;
  const service = rules.filter((r) => r.status === "user_assumption");
  if (service.length > 0) return pick(service.filter((r) => ordinalHit(r, ordinal)));
  if (admissionYear === null || admissionYear === undefined) return null;
  return pick(
    rules.filter((r) => {
      if (r.status !== "verified") return false;
      const a = r.appliesTo;
      if (a.admissionYearFrom !== null && admissionYear < a.admissionYearFrom) return false;
      if (a.admissionYearTo !== null && admissionYear > a.admissionYearTo) return false;
      return ordinalHit(r, ordinal);
    }),
  );
}

/** 자료에 학년별 서비스 기준 상한이 있는가(입학연도별 현행표와 다를 수 있음 경고용) */
export const usesServiceCap = (rules: CreditCapRule[] | undefined) => !!rules?.some((r) => r.status === "user_assumption");

/**
 * 학교 최소 신청학점(S2 17~18쪽): 현행표(2025학년도 입학자까지)와 2026학년도 신입생 표 모두
 * 첫째~일곱째 학기 10학점이다. 최대학점의 "예정" 여부와 별개로, 최소값은 두 표가 같으므로 둘 다 쓴다.
 * 입학연도를 모르면 이 학기 순번에 걸리는 규칙들의 최소값이 모두 같을 때만 쓴다.
 * 졸업예정학기(3학점)는 엔진이 마지막 학기를 졸업예정학기로 단정하지 않으므로 쓰지 않는다.
 */
export function schoolMinFor(
  rules: CreditCapRule[] | undefined,
  admissionYear: number | null | undefined,
  ordinal: number,
): { min: number; ruleId: string } | null {
  if (!rules) return null;
  const hits = rules.filter((r) => {
    if (r.minCredits === null) return false;
    const a = r.appliesTo;
    if (admissionYear !== null && admissionYear !== undefined) {
      if (a.admissionYearFrom !== null && admissionYear < a.admissionYearFrom) return false;
      if (a.admissionYearTo !== null && admissionYear > a.admissionYearTo) return false;
    }
    if (a.termOrdinalFrom !== null && ordinal < a.termOrdinalFrom) return false;
    if (a.termOrdinalTo !== null && ordinal > a.termOrdinalTo) return false;
    return true;
  });
  if (hits.length === 0) return null;
  const mins = new Set(hits.map((r) => r.minCredits));
  if (mins.size > 1) return null;
  const r = [...hits].sort((x, y) => x.id.localeCompare(y.id))[0];
  return { min: r.minCredits!, ruleId: r.id };
}

/**
 * 학기 상한과 계획 한도를 나눠 돌려준다.
 * - schoolCap: 학교 기준 최대학점(규칙이 없으면 null). 화면의 “상한”
 * - cap: 계획 한도 = min(학점 페이스, 학교 기준). 사용자 학기 제한(termCaps)은 호출하는 쪽에서 더 줄인다
 */
export function termCapFor(
  input: PlanInput,
  dataset: Pick<DatasetV2, "creditCapRules">,
  ordinal: number,
): { cap: number; schoolCap: number | null; ruleId: string | null } {
  const user = userCapFor(input, ordinal);
  const rule = schoolCapFor(dataset.creditCapRules, input.admissionYear, ordinal);
  if (!rule) return { cap: user, schoolCap: null, ruleId: null };
  return { cap: Math.min(user, rule.maxCredits), schoolCap: rule.maxCredits, ruleId: rule.id };
}
