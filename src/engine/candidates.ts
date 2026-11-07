import type {
  Assumption,
  CandidateConflict,
  CandidateSet,
  CareerTrack,
  Dataset,
  DatasetV2,
  InputIssue,
  ISODate,
  MetricKey,
  MilitaryScenario,
  PaceStyle,
  MetricValue,
  PlanInputV2,
  PlanResultV2,
  PriorityKey,
  RankedEntry,
  RankingResult,
  PeriodInput,
  RecommendationConfig,
  Term,
  TrackCandidate,
} from "@/contracts/types";
import { CAREER_LABEL, CAREER_TRACKS } from "@/contracts/careers";
import { findPeriodConflicts, toEngineInput, validatePlanInputV2 } from "./inputV2";
import { candidateIdOf, planResultFromV1 } from "./migrate";
import { resolveMilitaryScenarios } from "./military";
import { LATE_LIGHT_CONFIG, PACE_STYLE_LABEL } from "./pace";
import { ENGINE_VERSION, MAX_FUTURE_TERMS, simulatePlan } from "./simulate";
import { formatTerm, nextTerm, termIndex, termRange } from "./terms";

export const RANKING_VERSION = "rank-1";

/**
 * 진로 자료(DB-3)가 없을 때 쓰는 서비스 기본 설정. 핵심 과목 목록이 비어 있으므로
 * "진로 과목 먼저" 지표는 계산하지 않고 이유를 표시한다(지어내지 않는다).
 */
export const DEFAULT_RECOMMENDATION_CONFIG: RecommendationConfig = {
  configVersion: "default-1",
  careers: [],
  paceOptions: [15, 18, 20],
  maxMilitaryTimings: 3,
  maxCandidates: 18,
  initialVisible: 3,
};

const CAREER_ORDER = CAREER_TRACKS;
/** 1순위가 같을 때의 고정 비교 순서(PLAN 5.1) */
const DEFAULT_METRIC_ORDER: MetricKey[] = ["fast_completion", "career_core", "light_terms"];
const METRIC_LABEL: Record<MetricKey, string> = {
  fast_completion: "빠른 완료",
  career_core: "진로 과목 먼저",
  light_terms: "여유 있는 학기",
  exchange: "교환 경험",
};
/** 24학기 안에 배치하지 못한 핵심 과목의 시점 값(PLAN 6.3) */
const UNPLACED_CORE_INDEX = MAX_FUTURE_TERMS + 1;

// ── 지표 ────────────────────────────────────────────────

function completionMetric(input: PlanInputV2, result: PlanResultV2): MetricValue {
  const base = { key: "fast_completion" as const, secondary: null, lowerIsBetter: true };
  if (result.expectedCompletion && input.startTerm)
    return {
      ...base,
      value: termIndex(result.expectedCompletion) - termIndex(input.startTerm),
      unavailableReason: null,
    };
  const reason =
    input.target === null
      ? "목표 총학점이 없어 예상 완료 학기를 계산하지 않았습니다."
      : result.unplaced.length > 0
        ? "배치하지 못한 과목이 있어 완료 학기를 계산하지 않았습니다."
        : result.warnings.some((w) => w.code === "SEARCH_LIMIT")
          ? `${MAX_FUTURE_TERMS}개 학기 안에 계획을 끝내지 못했습니다.`
          : "확인이 필요한 기간이 있어 완료 학기를 계산하지 않았습니다.";
  return { ...base, value: null, unavailableReason: reason };
}

function coreMetric(
  input: PlanInputV2,
  result: PlanResultV2,
  coreCodes: string[],
  dataset: Dataset,
): MetricValue {
  const base = { key: "career_core" as const, secondary: null, lowerIsBetter: true };
  if (coreCodes.length === 0)
    return { ...base, value: null, unavailableReason: "이 진로의 핵심 과목 자료가 아직 없습니다." };
  const known = new Set(dataset.courses.map((c) => c.code));
  const missing = coreCodes.filter((c) => !known.has(c));
  if (missing.length > 0)
    return { ...base, value: null, unavailableReason: `핵심 과목(${missing.join(", ")})이 과목 자료에 없습니다.` };
  if (!input.startTerm) return { ...base, value: null, unavailableReason: "시작 학기가 없습니다." };

  const done = new Set(input.progress.completedCourseCodes ?? []);
  const start = termIndex(input.startTerm);
  const placedAt = new Map<string, number>();
  for (const t of result.terms) for (const c of t.courses) placedAt.set(c.code, termIndex(t.term) - start + 1);
  const values = coreCodes.map((code) => (done.has(code) ? 0 : (placedAt.get(code) ?? UNPLACED_CORE_INDEX)));
  return { ...base, value: values.reduce((a, b) => a + b, 0) / values.length, unavailableReason: null };
}

function loadMetric(result: PlanResultV2): MetricValue {
  const base = { key: "light_terms" as const, lowerIsBetter: true };
  const study = result.terms.filter((t) => t.status === "study");
  if (study.length === 0)
    return { ...base, value: null, secondary: null, unavailableReason: "수강 학기가 없습니다." };
  const credits = study.map((t) => t.plannedCredits);
  return {
    ...base,
    value: Math.max(...credits),
    secondary: credits.reduce((a, b) => a + b, 0) / credits.length,
    unavailableReason: null,
  };
}

function exchangeMetric(input: PlanInputV2): MetricValue {
  return {
    key: "exchange",
    value: input.periods.some((p) => p.kind === "exchange") ? 1 : 0,
    secondary: null,
    lowerIsBetter: false,
    unavailableReason: null,
  };
}

// ── 병역 시점 펼치기 ─────────────────────────────────────

/** 시작만 미정이고 길이(개월)가 있는 병역 기간. 시점을 후보로 펼친다. */
export function expandableMilitary(input: PlanInputV2): PeriodInput | null {
  return (
    input.periods.find(
      (p) => p.kind === "military" && p.timing === "flexible" && p.startDate === null && p.durationMonths !== null,
    ) ?? null
  );
}

/**
 * 병역 시작 학기 후보: 학년을 마친 직후(인정 유효학기가 짝수가 되는 학기)부터 1년 간격으로 최대 max개.
 * 학교·병무청 규정이 아니라 계획 비교용 서비스 규칙이다.
 */
export function militaryTimingTerms(input: PlanInputV2, max: number): Term[] {
  if (!input.startTerm || max < 1) return [];
  const first = (input.progress.completedTerms ?? 0) % 2 === 0 ? 0 : 1;
  const out: Term[] = [];
  let t = input.startTerm;
  for (let offset = 0; out.length < max && offset < MAX_FUTURE_TERMS; offset++, t = nextTerm(t))
    if (offset >= first && (offset - first) % 2 === 0) out.push(t);
  return out;
}

/** 펼친 병역 시점을 고정 기간으로 채운 입력. 입대일은 그 학기 시작일로 가정한다. */
export function withMilitaryStart(input: PlanInputV2, periodId: string, term: Term): PlanInputV2 {
  return {
    ...input,
    periods: input.periods.map((p) =>
      p.id === periodId ? { ...p, timing: "fixed" as const, startDate: termRange(term).start } : p,
    ),
  };
}

// ── 후보 하나 ────────────────────────────────────────────

interface Axis {
  career: CareerTrack;
  pace: number;
  style: PaceStyle;
  militaryStartTerm: Term | null;
  scenario: MilitaryScenario | null;
}

function buildCandidate(
  input: PlanInputV2,
  axis: Axis,
  dataset: DatasetV2,
  config: RecommendationConfig,
  missing: InputIssue[],
): TrackCandidate | null {
  const { career, pace, style, militaryStartTerm, scenario } = axis;
  const engineInput = toEngineInput(input, career, pace, style);
  if (!engineInput) return null;
  const snapshot: PlanInputV2 = {
    ...input,
    careers: [career],
    pace: { mode: "fixed", credits: pace },
    ...(input.paceStyles ? { paceStyles: [style] } : {}),
    ...(input.militaryPlan && scenario
      ? { militaryPlan: { ...input.militaryPlan, trackIds: scenario.trackId ? [scenario.trackId] : [] } }
      : {}),
  };
  const v1 = simulatePlan(engineInput, dataset);
  const result = planResultFromV1(v1, snapshot, engineInput.completedTerms);

  // 정보 부족이 있으면 완료 학기를 확정하지 않는다(기간 미정·교환 인정 미정 등).
  const blocksCompletion = missing.some((m) => m.field !== "target" && m.field.startsWith("periods"));
  if (blocksCompletion) {
    result.expectedCompletion = null;
    result.estimation = "unavailable";
  }
  result.issues = missing;
  result.partial = result.partial || blocksCompletion;
  result.assumptions = [...result.assumptions, ...exchangeAssumptions(input)];
  if (militaryStartTerm) {
    const months = input.periods.find((p) => p.kind === "military" && p.timing === "fixed")?.durationMonths;
    result.assumptions.push({
      id: `military_timing:${termIndex(militaryStartTerm)}`,
      kind: "period_user_estimate",
      message: `입대일을 ${formatTerm(militaryStartTerm)} 시작일(${termRange(militaryStartTerm).start})로, 복무 기간을 입력한 ${months ?? "?"}개월로 가정했습니다.`,
      status: "user_assumption",
    });
  }

  if (style !== "balanced")
    result.assumptions.push({
      id: `pace_style:${style}`,
      kind: "credit_cap_user_only",
      message:
        style === "late_light"
          ? `${LATE_LIGHT_CONFIG.name}(${LATE_LIGHT_CONFIG.configVersion}): ${LATE_LIGHT_CONFIG.description} ${LATE_LIGHT_CONFIG.disclaimer}`
          : "학기별 계획 학점을 직접 설정한 값으로 배치했습니다. 학교 공식 권장 학점이 아닙니다.",
      status: "user_assumption",
    });
  if (scenario && scenario.trackId) {
    result.assumptions.push({
      id: `military_track:${scenario.trackId}:${scenario.role}`,
      kind: "period_user_estimate",
      message:
        scenario.months === null
          ? `${scenario.label}: 복무기간을 공식 자료로 확인하지 못해 완료 학기를 확정하지 않습니다.`
          : scenario.monthsStatus === "verified"
            ? `${scenario.label}: 공식 자료에서 확인한 복무기간 ${scenario.months}개월을 썼습니다.`
            : `${scenario.label}: 직접 입력한 예상 복무기간 ${scenario.months}개월(사용자 가정)을 썼습니다.`,
      status: scenario.monthsStatus,
    });
    if (scenario.role === "conditional")
      result.assumptions.push({
        id: "katusa_conditional",
        kind: "period_user_estimate",
        message: "카투사 선발 결과에 따라 달라지는 조건부 계획입니다. 선발을 가정한 것이며 합격 가능성 예측이 아닙니다.",
        status: "unknown",
      });
  }

  const conflicts: CandidateConflict[] = findPeriodConflicts(input).map(({ a, b }) => ({
    code: "PERIOD_OVERLAP",
    message: "고정한 군 복무와 교환학생 기간이 겹칩니다.",
    periodIds: [a.id, b.id],
  }));
  const coreCodes = config.careers.find((c) => c.track === career)?.coreCourses.map((c) => c.courseCode) ?? [];
  const metrics = [
    completionMetric(input, result),
    coreMetric(input, result, coreCodes, dataset),
    loadMetric(result),
    exchangeMetric(input),
  ];
  const status: TrackCandidate["status"] =
    conflicts.length > 0
      ? "conflict"
      : v1.warnings.some((w) => w.code === "SEARCH_LIMIT")
        ? "search_limit"
        : missing.length > 0 || result.unplaced.length > 0 || scenario?.role === "conditional"
          ? "conditional"
          : "computable";

  const key = {
    career,
    militaryStartTerm,
    paceCredits: pace,
    ...(style !== "balanced" ? { paceStyle: style } : {}),
    ...(scenario?.trackId ? { militaryTrackId: scenario.trackId } : {}),
    ...(scenario && scenario.role !== "normal" ? { militaryRole: scenario.role } : {}),
  };
  return {
    id: candidateIdOf(key),
    key,
    status,
    input: snapshot,
    result,
    metrics,
    missing,
    conflicts,
    coreCourseCodes: coreCodes,
  };
}

function exchangeAssumptions(input: PlanInputV2): Assumption[] {
  return input.periods
    .filter((p) => p.kind === "exchange" && (p.exchange?.credits ?? null) === null)
    .map((p) => ({
      id: `exchange_unrecognized:${p.id}`,
      kind: "exchange_unrecognized" as const,
      message: "교환학생 인정학점이 미정이라 교환 학기에는 국내 과목을 배치하지 않고 학점을 더하지 않았습니다.",
      status: "unknown" as const,
    }));
}

/** 같은 진로에서 학기·과목·학점 배치가 같으면 같은 후보다. */
function fingerprint(c: TrackCandidate): string {
  const r = c.result;
  // 군 복무 트랙·시나리오 역할·페이스 방식이 다르면 배치가 같아도 다른 후보로 둔다.
  const axes = `${c.key.career}|${c.key.militaryTrackId ?? "-"}|${c.key.militaryRole ?? "normal"}|${c.key.paceStyle ?? "balanced"}`;
  if (!r) return `${axes}|none`;
  const terms = r.terms
    .map((t) => `${termIndex(t.term)}:${t.status}:${t.plannedCredits}:${t.courses.map((x) => x.code).join(",")}`)
    .join(";");
  return `${axes}|${terms}|${r.unplaced.map((u) => u.code).join(",")}|${r.expectedCompletion ? termIndex(r.expectedCompletion) : "-"}`;
}

// ── 정렬 ────────────────────────────────────────────────

/** 사용자 1순위(들) → 고정 순서. exchange는 사용자가 고른 경우만 비교한다. */
export function metricOrder(priorities: PriorityKey[]): MetricKey[] {
  const out: MetricKey[] = [];
  for (const k of [...priorities, ...DEFAULT_METRIC_ORDER]) if (!out.includes(k)) out.push(k);
  return out;
}

const metricOf = (c: TrackCandidate, key: MetricKey) => c.metrics.find((m) => m.key === key)!;

function compareOn(a: TrackCandidate, b: TrackCandidate, key: MetricKey): number {
  const x = metricOf(a, key);
  const y = metricOf(b, key);
  const sign = x.lowerIsBetter ? 1 : -1;
  const d = ((x.value ?? 0) - (y.value ?? 0)) * sign;
  if (d !== 0) return d;
  return ((x.secondary ?? 0) - (y.secondary ?? 0)) * sign;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function describe(c: TrackCandidate, key: MetricKey, best: TrackCandidate): string {
  const m = metricOf(c, key);
  const b = metricOf(best, key);
  switch (key) {
    case "fast_completion": {
      const when = formatTerm(c.result?.expectedCompletion ?? null);
      const gap = (m.value ?? 0) - (b.value ?? 0);
      return gap === 0
        ? `예상 계획 완료 ${when} — 후보 중 가장 빠릅니다.`
        : `예상 계획 완료 ${when} — 가장 빠른 후보보다 ${gap}학기 늦습니다.`;
    }
    case "career_core": {
      const gap = (m.value ?? 0) - (b.value ?? 0);
      return `${CAREER_LABEL[c.key.career]} 핵심 과목을 평균 ${fmt(m.value ?? 0)}번째 학기에 듣습니다${gap === 0 ? " — 후보 중 가장 이릅니다." : "."}`;
    }
    case "light_terms":
      return `학기 최대 ${fmt(m.value ?? 0)}학점, 평균 ${fmt(m.secondary ?? 0)}학점으로 계획합니다${m.value === b.value && m.secondary === b.secondary ? " — 후보 중 가장 여유롭습니다." : "."}`;
    case "exchange":
      return m.value === 1 ? "교환학생 기간을 포함합니다." : "교환학생 기간이 없습니다.";
  }
}

export function rankCandidates(candidates: TrackCandidate[], priorities: PriorityKey[]): RankingResult {
  const pool = candidates.filter((c) => c.status !== "conflict").sort((a, b) => a.id.localeCompare(b.id));
  const order = metricOrder(priorities);
  const usedMetrics: MetricKey[] = [];
  const excludedMetrics: RankingResult["excludedMetrics"] = [];
  for (const key of order) {
    const blocked = pool.find((c) => metricOf(c, key).value === null);
    if (blocked) excludedMetrics.push({ key, reason: metricOf(blocked, key).unavailableReason ?? "확인 필요" });
    else usedMetrics.push(key);
  }
  if (pool.length > 0 && usedMetrics.length === 0)
    return {
      rankingVersion: RANKING_VERSION,
      priorities,
      usedMetrics,
      excludedMetrics,
      entries: pool.map((c) => ({ candidateId: c.id, rank: null, tiedWith: [], reasons: [] })),
      unrankedReason: "all_metrics_unknown",
    };

  const cmp = (a: TrackCandidate, b: TrackCandidate) => {
    for (const k of usedMetrics) {
      const d = compareOn(a, b, k);
      if (d !== 0) return d;
    }
    return 0;
  };
  const sorted = [...pool].sort((a, b) => cmp(a, b) || a.id.localeCompare(b.id));
  const bestOf = (key: MetricKey) => [...pool].sort((a, b) => compareOn(a, b, key) || a.id.localeCompare(b.id))[0];

  const entries: RankedEntry[] = [];
  sorted.forEach((c, i) => {
    const prev = sorted[i - 1];
    const rank = prev && cmp(prev, c) === 0 ? entries[i - 1].rank : i + 1;
    const tiedWith = sorted.filter((o) => o !== c && cmp(o, c) === 0).map((o) => o.id);
    const reasons = usedMetrics.map((k) => describe(c, k, bestOf(k)));
    if (tiedWith.length > 0) reasons.push("비교한 지표가 모두 같아 평가 동률입니다.");
    entries.push({ candidateId: c.id, rank, tiedWith, reasons });
  });
  return { rankingVersion: RANKING_VERSION, priorities, usedMetrics, excludedMetrics, entries, unrankedReason: null };
}

// ── 후보 집합 ────────────────────────────────────────────

/**
 * 관심 진로(없으면 전체 진로) × 병역 시점(펼칠 때만) × 학점 페이스(고정값 또는 비교값) 조합을 각각 계산하고 정렬한다.
 * 같은 입력·자료·설정이면 같은 결과를 돌려준다.
 */
export function generateCandidates(
  input: PlanInputV2,
  dataset: DatasetV2,
  config: RecommendationConfig = dataset.recommendation ?? DEFAULT_RECOMMENDATION_CONFIG,
  opts: { today?: ISODate } = {},
): CandidateSet {
  const issues = validatePlanInputV2(input, opts);
  const errors = issues.filter((i) => i.severity === "error");
  const missing = issues.filter((i) => i.severity === "missing");
  const base = {
    input,
    catalogVersion: dataset.catalogVersion,
    engineVersion: ENGINE_VERSION,
    configVersion: config.configVersion,
  };
  const empty = (message: string, fields: string[]): CandidateSet => ({
    ...base,
    candidates: [],
    ranking: rankCandidates([], input.priorities),
    dedupedInto: {},
    exploredCount: 0,
    emptyReason: { message, changeableFields: fields },
  });

  if (errors.length > 0) return empty(errors.map((e) => e.message).join(" "), errors.map((e) => e.field));

  const careers = CAREER_ORDER.filter((c) => (input.careers.length === 0 ? true : input.careers.includes(c)));
  const paces =
    input.pace.mode === "fixed"
      ? [input.pace.credits]
      : [...new Set(input.pace.options ?? config.paceOptions)].sort((a, b) => a - b);

  const styles: PaceStyle[] = [...new Set(input.paceStyles && input.paceStyles.length > 0 ? input.paceStyles : ["balanced" as const])];

  // 군 복무 트랙(카투사 우선 희망 포함)을 시나리오로 펼친다. 트랙 입력이 없으면 기존 병역 기간 하나.
  const milPeriod = input.periods.find((p) => p.kind === "military") ?? null;
  const resolution =
    input.militaryPlan && milPeriod
      ? resolveMilitaryScenarios(input.militaryPlan, dataset.military, milPeriod.durationMonths)
      : null;
  const scenarioInputs: Array<{ scenario: MilitaryScenario | null; input: PlanInputV2 }> = resolution
    ? resolution.scenarios.map((sc) => ({
        scenario: sc,
        input: {
          ...input,
          periods: input.periods.map((p) =>
            p.id === milPeriod!.id
              ? { ...p, durationMonths: p.endDate ? p.durationMonths : sc.months }
              : p,
          ),
        },
      }))
    : [{ scenario: null, input }];

  const built: TrackCandidate[] = [];
  for (const career of careers)
    for (const { scenario, input: scInput } of scenarioInputs) {
      const flex = expandableMilitary(scInput);
      const timings: Array<Term | null> = flex ? militaryTimingTerms(scInput, config.maxMilitaryTimings) : [];
      if (timings.length === 0) timings.push(null);
      // 시나리오마다 정보 부족이 다르다(복무기간 미확인 등).
      const scMissing = scenario ? validatePlanInputV2(scInput, opts).filter((i) => i.severity === "missing") : missing;
      for (const timing of timings)
        for (const style of styles)
          for (const pace of style === "custom" ? [paces[0]] : paces) {
            const snapshot = flex && timing ? withMilitaryStart(scInput, flex.id, timing) : scInput;
            const c = buildCandidate(snapshot, { career, pace, style, militaryStartTerm: timing, scenario }, dataset, config, scMissing);
            if (c) built.push(c);
          }
    }
  if (built.length === 0) {
    const blocking = missing.filter((m) => m.field === "startTerm" || m.field.startsWith("progress"));
    return empty(
      blocking.length > 0
        ? `후보를 만들려면 다음 정보가 필요합니다: ${blocking.map((m) => m.message).join(" ")}`
        : "조합할 진로나 학점 페이스가 없습니다.",
      blocking.length > 0 ? blocking.map((m) => m.field) : ["careers", "pace"],
    );
  }

  // 중복 제거: 생성 순서(진로 고정 순서 → 병역 시점 → 페이스 오름차순)의 첫 후보를 대표로 남긴다.
  const seen = new Map<string, string>();
  const dedupedInto: Record<string, string> = {};
  const unique: TrackCandidate[] = [];
  for (const c of built) {
    const fp = fingerprint(c);
    const rep = seen.get(fp);
    if (rep) dedupedInto[c.id] = rep;
    else {
      seen.set(fp, c.id);
      unique.push(c);
    }
  }
  // 상한은 시나리오·페이스 방식 조합마다 적용한다(서로 다른 군 복무 시나리오가 잘려 사라지지 않게).
  const candidates = unique.slice(0, config.maxCandidates * scenarioInputs.length * styles.length);
  const ranking = rankCandidates(candidates, input.priorities);
  const valid = candidates.filter((c) => c.status !== "conflict");

  return {
    ...base,
    candidates,
    ranking,
    dedupedInto,
    exploredCount: built.length,
    military: resolution,
    emptyReason:
      valid.length === 0
        ? {
            message: "고정한 조건끼리 충돌해 만들 수 있는 후보가 없습니다. 기간을 바꿔 주세요.",
            changeableFields: [...new Set(candidates.flatMap((c) => c.conflicts.flatMap((x) => x.periodIds)))].map(
              (id) => `periods[${input.periods.findIndex((p) => p.id === id)}]`,
            ),
          }
        : null,
  };
}

export { METRIC_LABEL, CAREER_LABEL, PACE_STYLE_LABEL };
