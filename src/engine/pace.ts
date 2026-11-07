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
 * 확인된(verified) 학교 상한 중 이 학생·학기에 적용되는 것. 입학연도를 모르면 적용하지 않는다(미확인).
 * planned(예정) 규칙은 계획 상한에 쓰지 않는다.
 */
export function schoolCapFor(
  rules: CreditCapRule[] | undefined,
  admissionYear: number | null | undefined,
  ordinal: number,
): CreditCapRule | null {
  if (!rules || admissionYear === null || admissionYear === undefined) return null;
  const hits = rules.filter((r) => {
    if (r.status !== "verified") return false;
    const a = r.appliesTo;
    if (a.admissionYearFrom !== null && admissionYear < a.admissionYearFrom) return false;
    if (a.admissionYearTo !== null && admissionYear > a.admissionYearTo) return false;
    if (a.termOrdinalFrom !== null && ordinal < a.termOrdinalFrom) return false;
    if (a.termOrdinalTo !== null && ordinal > a.termOrdinalTo) return false;
    return true;
  });
  return hits.sort((x, y) => x.maxCredits - y.maxCredits || x.id.localeCompare(y.id))[0] ?? null;
}

/** 학기 계획 상한 = min(사용자 페이스 구간, 확인된 학교 상한) */
export function termCapFor(
  input: PlanInput,
  dataset: Pick<DatasetV2, "creditCapRules">,
  ordinal: number,
): { cap: number; ruleId: string | null } {
  const user = userCapFor(input, ordinal);
  const rule = schoolCapFor(dataset.creditCapRules, input.admissionYear, ordinal);
  if (rule && rule.maxCredits < user) return { cap: rule.maxCredits, ruleId: rule.id };
  return { cap: user, ruleId: null };
}
