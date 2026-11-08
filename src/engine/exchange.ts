import type {
  EligibilityEvaluation,
  ExchangeAction,
  ExchangeCandidateSet,
  ExchangeCatalog,
  ExchangeEligibilityRule,
  ExchangeMatchCandidate,
  ExchangeOutcomeBranch,
  ExchangePeriodConflict,
  ExchangePlanningInput,
  ExchangePriority,
  HanyangExchangeCycle,
  ISODate,
  PartnerOffering,
  SourcedValue,
  Term,
  TruthState,
} from "@/contracts/types";
import { formatTerm, termIndex, termRange } from "./terms";

/**
 * 교환학생 후보·백업·분기·준비 로드맵. 순수 함수(같은 입력·같은 카탈로그 → 같은 ID·순위·이유).
 *
 * - 한양대 공통 자격과 파견교 자격을 따로 pass/fail/unknown으로 판정한다.
 * - 목표 학기의 회차 자료가 없으면(공고 전) 가장 최근 회차 자료를 "이전 회차(stale)"로만 쓴다:
 *   판정은 확정하지 않고(unknown), 마감은 만들지 않는다.
 * - TO·랭킹·비용을 합격 가능성이나 점수로 바꾸지 않는다. 비교할 자료가 없는 우선순위는 정렬에 쓰지 않고 이유로 알린다.
 * - 인정학점은 계산하지 않는다(PLAN 10장): recognitionSummary는 항상 unknown.
 */

export interface MilitaryWindow {
  branchId: string;
  label: string;
  start: ISODate;
  /** 끝(제외). 모르면 null(시작 이후 계속 겹친다고 보지 않고 조건부로만) */
  end: ISODate | null;
  /** 사용자가 확정한 일정이면 true(hard), 지원 결과에 따른 분기면 false(conditional) */
  fixed: boolean;
}

export interface ExchangeContext {
  today: ISODate;
  /** 군 복무 분기별 예상 기간. 없으면 빈 배열 */
  militaryWindows: MilitaryWindow[];
}

const REGULAR_TERMS = 8;
const STATUS_RANK: Record<ExchangeMatchCandidate["status"], number> = { eligible: 0, conditional: 1, schedule_conflict: 2, deadline_passed: 3, ineligible: 4 };

// ── 학기 계산 ────────────────────────────────────────────

const nextTermOf = (t: Term): Term => (t.season === 1 ? { year: t.year, season: 2 } : { year: t.year + 1, season: 1 });
const sameTerm = (a: Term, b: Term) => a.year === b.year && a.season === b.season;

/** 파견 학기 직전까지 마친 학기 수(계획 시작부터 쉬지 않고 다닌다고 가정 — 군 복무는 분기 충돌로 따로 본다) */
export function completedAtDeparture(input: ExchangePlanningInput, term: Term): number | null {
  const { completedTermsNow, planStartTerm } = input.academic;
  if (completedTermsNow === null || !planStartTerm) return null;
  return completedTermsNow + Math.max(0, termIndex(term) - termIndex(planStartTerm));
}

/** 지원 시점(파견 직전 학기 중)에 마친 학기 수 */
export const completedAtApplication = (input: ExchangePlanningInput, term: Term) => {
  const d = completedAtDeparture(input, term);
  return d === null ? null : Math.max(0, d - 1);
};

/** 사용자의 시기 답 → 비교할 파견 학기(최대 3개) */
export function targetTerms(input: ExchangePlanningInput, catalog: ExchangeCatalog): Term[] {
  const start = input.academic.planStartTerm;
  if (!start) return [];
  const t = input.targetTerm;
  if (t.mode === "fixed") return [t.term];
  const range: Term[] = [];
  let cur = start;
  for (let i = 0; i < 8; i++) {
    range.push(cur);
    cur = nextTermOf(cur);
  }
  if (t.mode === "next_spring") return range.filter((x) => x.season === 1).slice(0, 1);
  if (t.mode === "next_fall") return range.filter((x) => x.season === 2).slice(0, 1);
  // 추천·모름: 한양대 이수학기 하한을 넘고 마지막 정규학기가 아닌 학기부터(규칙은 가장 최근 회차 기준)
  const rules = latestRules(catalog);
  const min = numberRule(rules, "completed_terms_min") ?? 0;
  const max = numberRule(rules, "completed_terms_max") ?? REGULAR_TERMS - 2;
  return range
    .filter((x) => {
      const app = completedAtApplication(input, x);
      const dep = completedAtDeparture(input, x);
      return app === null || dep === null || (app >= min && app <= max && dep < REGULAR_TERMS - 1);
    })
    .slice(0, 3);
}

function latestRules(c: ExchangeCatalog): ExchangeEligibilityRule[] {
  const withRules = [...c.cycles].filter((x) => x.commonEligibilityRules.length > 0).sort((a, b) => termIndex(b.targetHomeTerm) - termIndex(a.targetHomeTerm));
  return withRules[0]?.commonEligibilityRules ?? [];
}
const numberRule = (rules: ExchangeEligibilityRule[], kind: ExchangeEligibilityRule["kind"]) => {
  const r = rules.find((x) => x.kind === kind);
  return typeof r?.operand === "number" ? r.operand : null;
};

// ── 회차 선택 ────────────────────────────────────────────

export function cycleFor(catalog: ExchangeCatalog, term: Term) {
  const target = catalog.cycles.find((c) => sameTerm(c.targetHomeTerm, term)) ?? null;
  const data =
    target && target.officialStatus !== "forecast" && target.commonEligibilityRules.length > 0
      ? target
      : ([...catalog.cycles].filter((c) => c.officialStatus !== "forecast" && catalog.offerings.some((o) => o.applicationCycleId === c.id)).sort((a, b) => termIndex(b.targetHomeTerm) - termIndex(a.targetHomeTerm))[0] ?? null);
  return { target, data, stale: !!data && (!target || data.id !== target.id) };
}

// ── 한양대 공통 자격 ─────────────────────────────────────

function evalCommon(rule: ExchangeEligibilityRule, input: ExchangePlanningInput, term: Term, stale: boolean): EligibilityEvaluation {
  const a = input.academic;
  const base = { ruleId: rule.id, owner: "hanyang" as const, label: rule.source.value ?? rule.id, sourceRefs: rule.source.sourceRefs };
  const res = (result: EligibilityEvaluation["result"], reason: string, missing: string[] = []): EligibilityEvaluation => {
    // 이전 회차 규칙으로는 현재 자격을 확정하지 않는다
    if (stale && result !== "unknown")
      return { ...base, result: "unknown", reason: `${result === "pass" ? "지난 회차 기준으로는 충족" : "지난 회차 기준으로는 충족하지 않음"} — ${reason} 다음 공고에서 다시 확인해야 해요.`, missingInputIds: missing, truth: "stale" };
    return { ...base, result, reason, missingInputIds: missing, truth: result === "unknown" && rule.source.truth === "verified_official" ? "unknown" : rule.source.truth };
  };
  const app = completedAtApplication(input, term);
  const dep = completedAtDeparture(input, term);
  switch (rule.kind) {
    case "campus":
      return a.campus === null ? res("unknown", "캠퍼스를 확인하지 못했어요.", ["campus"]) : res(a.campus === "서울" ? "pass" : "fail", `${a.campus}캠퍼스 학생이에요.`);
    case "completed_terms_min":
      return app === null ? res("unknown", "마친 학기 수를 몰라요.", ["completedTerms"]) : res(app >= Number(rule.operand) ? "pass" : "fail", `지원 시점에 ${app}개 학기를 마친 것으로 계산했어요(최소 ${rule.operand}).`);
    case "completed_terms_max":
      if (app === null) return res("unknown", "마친 학기 수를 몰라요.", ["completedTerms"]);
      if (app > Number(rule.operand)) return res("fail", `지원 시점 ${app}개 학기 — 상한 ${rule.operand}개를 넘어요.`);
      return res("pass", app === Number(rule.operand) ? `지원 시점 ${app}개 학기 — 상한과 같아 휴학·한 학기 지원 같은 추가 조건이 있어요.` : `지원 시점 ${app}개 학기(상한 ${rule.operand}).`);
    case "gpa_min":
      return a.cumulativeGpa === null
        ? res("unknown", "누적 평점을 몰라요(성적표 가져오기나 직접 입력으로 확인).", ["gpa"])
        : res(a.cumulativeGpa >= Number(rule.operand) ? "pass" : "fail", `누적 평점 ${a.cumulativeGpa}/4.5(기준 ${rule.operand}).`);
    case "prior_exchange":
      return a.priorExchangeTerms === null ? res("unknown", "예전 파견 이력을 몰라요.", ["priorExchange"]) : res(a.priorExchangeTerms <= Number(rule.operand) ? "pass" : "fail", `예전 파견 ${a.priorExchangeTerms}학기.`);
    case "consecutive_exchange":
      return a.priorExchangeTerms === 0 ? res("pass", "예전 파견이 없어 해당하지 않아요.") : res("unknown", "바로 전 학기에 파견됐는지 확인이 필요해요.", ["priorExchange"]);
    case "final_regular_term":
      return dep === null ? res("unknown", "마친 학기 수를 몰라요.", ["completedTerms"]) : res(dep >= REGULAR_TERMS - 1 ? "fail" : "pass", `파견 학기가 ${dep + 1}번째 정규학기예요${dep >= REGULAR_TERMS - 1 ? "(마지막 정규학기)" : ""}.`);
    case "transfer_terms":
      return a.transferStudent === null ? res("unknown", "편입 여부를 몰라요.", ["transfer"]) : a.transferStudent ? res("unknown", "편입생은 본교에서 1개 학기 이상 이수해야 해요 — 본교 이수 학기를 확인해 주세요.", ["transferTerms"]) : res("pass", "편입생이 아니에요.");
    case "major_restriction":
      return a.majorArrangement === "unknown" ? res("pass", "단일 전공으로 보고 계산했어요(복수전공이면 지원 불가).") : res(a.majorArrangement === "double_degree" ? "fail" : "pass", a.majorArrangement === "double_degree" ? "복수전공 이수자는 지원할 수 없어요." : "다중전공·부전공·단일 전공은 지원할 수 있어요.");
    case "language":
      return res("unknown", "한양대 권역별 최소 어학 기준 표를 이번 자료에서 숫자로 확인하지 못했어요. 파견교 기준은 학교별로 따로 봐요.", input.languageStatus === "has_score" ? [] : ["language"]);
    default:
      return res("unknown", "자동으로 판정하지 않는 조건이에요.");
  }
}

export function evaluateCommon(input: ExchangePlanningInput, cycle: HanyangExchangeCycle | null, term: Term, stale: boolean) {
  const evaluations = (cycle?.commonEligibilityRules ?? []).map((r) => evalCommon(r, input, term, stale));
  const blocking = (cycle?.commonEligibilityRules ?? []).filter((r) => r.blocking).map((r) => r.id);
  const status: ExchangeCandidateSet["common"]["status"] = evaluations.some((e) => e.result === "fail" && blocking.includes(e.ruleId))
    ? "ineligible"
    : evaluations.length === 0 || evaluations.some((e) => e.result === "unknown")
      ? "conditional"
      : "eligible";
  return { status, evaluations };
}

// ── 파견교 자격 ──────────────────────────────────────────

/** 한양대 엑셀 변환식으로 4.5 만점 평점을 다른 만점으로. 공식 변환식이 없는 만점이면 null */
export function convertGpa(gpa45: number, scale: number, catalog: ExchangeCatalog): number | null {
  if (scale === 4.5) return gpa45;
  const conv = catalog.gpaConversions.value?.find((c) => c.scale === scale);
  return conv ? Math.round(((gpa45 * scale) / 4.5) * 100) / 100 : null;
}

function evalHost(o: PartnerOffering, input: ExchangePlanningInput, catalog: ExchangeCatalog, stale: boolean): EligibilityEvaluation[] {
  const out: EligibilityEvaluation[] = [];
  const t = (v: SourcedValue<unknown>): TruthState => (stale ? "stale" : v.truth);
  // GPA
  const g = o.gpa.value;
  const gpa = input.academic.cumulativeGpa;
  if (!g) {
    const noOwn = /한양대 선발 기준/.test(o.gpaRaw);
    out.push({
      ruleId: `${o.id}-gpa`,
      owner: "host",
      label: "파견교 GPA",
      result: noOwn ? "pass" : "unknown",
      reason: noOwn ? "파견교 별도 GPA 기준 없이 한양대 선발 기준을 따라요(엑셀)." : `숫자 기준으로 읽을 수 없는 원문이에요: “${o.gpaRaw.slice(0, 80)}”`,
      missingInputIds: [],
      truth: t(o.gpa),
      sourceRefs: o.gpa.sourceRefs,
    });
  } else if (gpa === null) {
    out.push({ ruleId: `${o.id}-gpa`, owner: "host", label: "파견교 GPA", result: "unknown", reason: `파견교 기준 ${g.min}/${g.scale}. 누적 평점을 알려 주면 비교해요.`, missingInputIds: ["gpa"], truth: t(o.gpa), sourceRefs: o.gpa.sourceRefs });
  } else {
    const conv = convertGpa(gpa, g.scale, catalog);
    out.push(
      conv === null
        ? { ruleId: `${o.id}-gpa`, owner: "host", label: "파견교 GPA", result: "unknown", reason: `파견교 기준은 ${g.min}/${g.scale}인데 한양대 공식 변환식에 ${g.scale} 만점이 없어 비교하지 않았어요(단순 비례 환산을 공식으로 쓰지 않아요).`, missingInputIds: [], truth: "unknown", sourceRefs: [...o.gpa.sourceRefs, ...catalog.gpaConversions.sourceRefs] }
        : {
            ruleId: `${o.id}-gpa`,
            owner: "host",
            label: "파견교 GPA",
            result: stale ? "unknown" : conv >= g.min ? "pass" : "fail",
            reason: `${gpa}/4.5 → ${conv}/${g.scale}(한양대 엑셀 변환식) · 기준 ${g.min}/${g.scale}${stale ? " — 지난 회차 기준" : ""}. 파견교가 이 변환을 쓰는지는 확인 필요.`,
            missingInputIds: [],
            truth: stale ? "stale" : "derived",
            sourceRefs: [...o.gpa.sourceRefs, ...catalog.gpaConversions.sourceRefs],
          },
    );
  }
  // 어학
  if (o.language.length === 0) {
    out.push({ ruleId: `${o.id}-lang`, owner: "host", label: "파견교 어학", result: "unknown", reason: "엑셀에 파견교 어학 기준이 숫자로 없어요(N/A 또는 링크). 원문 확인 필요.", missingInputIds: [], truth: "unknown", sourceRefs: o.sourceRefs });
  } else {
    const ev = input.languageEvidence.find((e) => e.evidenceStatus === "user_entered" && e.total !== null && o.language.some((l) => l.test === e.test && l.total !== null));
    if (!ev) {
      const reqs = o.language.filter((l) => l.total !== null).map((l) => `${l.test === "IELTS_ACADEMIC" ? "IELTS" : l.test === "TOEFL_IBT_2026" ? "TOEFL(6점 체계)" : "TOEFL iBT"} ${l.total}${l.subscoresRequired ? "+영역" : ""}`);
      out.push({ ruleId: `${o.id}-lang`, owner: "host", label: "파견교 어학", result: "unknown", reason: `기준: ${reqs.join(" / ") || "원문 확인"}. ${input.languageStatus === "has_score" ? "입력한 시험 종류로는 비교할 수 없어요." : "아직 성적이 없어 준비가 필요해요."}`, missingInputIds: ["language"], truth: stale ? "stale" : "verified_official", sourceRefs: o.sourceRefs });
    } else {
      const req = o.language.find((l) => l.test === ev.test && l.total !== null)!;
      const ok = ev.total! >= req.total!;
      out.push({
        ruleId: `${o.id}-lang`,
        owner: "host",
        label: "파견교 어학",
        result: stale ? "unknown" : ok ? (req.subscoresRequired ? "unknown" : "pass") : "fail",
        reason: `${req.scaleVersion} 기준 ${req.total}, 내 점수 ${ev.total}${req.subscoresRequired ? " — 영역별 최소점수도 확인해야 해요" : ""}${stale ? " — 지난 회차 기준" : ""}.`,
        missingInputIds: req.subscoresRequired ? ["languageSubscores"] : [],
        truth: stale ? "stale" : "verified_official",
        sourceRefs: o.sourceRefs,
      });
    }
  }
  return out;
}

// ── 후보 ────────────────────────────────────────────────

const overlap = (a: { start: string; end: string | null }, b: { start: string; end: string }) => a.start < b.end && (a.end === null || b.start < a.end);

function conflicts(term: Term, durationTerms: number, windows: MilitaryWindow[]): ExchangePeriodConflict[] {
  const start = termRange(term).start;
  let last = term;
  for (let i = 1; i < durationTerms; i++) last = nextTermOf(last);
  const ex = { start, end: termRange(last).end };
  return windows
    .filter((w) => overlap(w, ex))
    .map((w) => ({
      branchId: w.branchId,
      label: w.label,
      kind: w.fixed ? ("hard" as const) : ("conditional" as const),
      detail: `${w.label}(${w.start}~${w.end ?? "기간 확인 필요"})이 교환 학기(${formatTerm(term)}${durationTerms > 1 ? "부터 1년" : ""})와 겹쳐요.`,
    }));
}

const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
};

function candidateFor(o: PartnerOffering, term: Term, input: ExchangePlanningInput, catalog: ExchangeCatalog, ctx: ExchangeContext, common: ReturnType<typeof evaluateCommon>, stale: boolean, targetClosed: boolean, fp: string): ExchangeMatchCandidate | null {
  const opts = o.durationOptions.value ?? [];
  const duration: "one_term" | "one_year" = input.duration === "one_year" ? "one_year" : "one_term";
  if (duration === "one_year" && !opts.includes("one_year")) return null; // 1년이 확인된 offering만
  const host = evalHost(o, input, catalog, stale);
  const eligibility = [...common.evaluations, ...host];
  const access = o.courseAccess[0];
  const accessStatus: "limited" | "unknown" | "closed" = access?.access === "limited" ? "limited" : access?.access === "closed" ? "closed" : "unknown";
  const mil = conflicts(term, duration === "one_year" ? 2 : 1, ctx.militaryWindows);
  const nomination = o.deadlines.nomination.value;
  const deadlinePassed = !stale && (targetClosed || (nomination !== null && nomination < ctx.today));

  let status: ExchangeMatchCandidate["status"] = "eligible";
  if (common.status === "ineligible" || host.some((e) => e.result === "fail")) status = "ineligible";
  else if (deadlinePassed) status = "deadline_passed";
  else if (mil.some((c) => c.kind === "hard")) status = "schedule_conflict";
  else if (stale || common.status === "conditional" || host.some((e) => e.result === "unknown") || mil.length > 0) status = "conditional";

  const lang = host.find((e) => e.ruleId.endsWith("-lang"))!;
  const ieltsReq = o.language.find((l) => l.test === "IELTS_ACADEMIC")?.total ?? null;
  const riskKeys: ExchangeMatchCandidate["riskKeys"] = [];
  if (accessStatus !== "unknown") riskKeys.push("course_access");
  if (lang.result === "fail" || (ieltsReq !== null && ieltsReq >= 6.5) || o.language.some((l) => l.subscoresRequired)) riskKeys.push("language");
  if (o.housing.onCampus === "unavailable") riskKeys.push("housing");
  if (host.find((e) => e.ruleId.endsWith("-gpa"))?.result !== "pass") riskKeys.push("gpa");
  if (o.quota.value === 1) riskKeys.push("quota_small");
  if (mil.length > 0) riskKeys.push("schedule");
  if (stale) riskKeys.push("stale");

  const reasons: string[] = [];
  if (accessStatus === "unknown") reasons.push("엑셀 수강불가 목록에 컴퓨터·정보시스템 계열이 없어요(수강 가능은 과목 목록으로 따로 확인).");
  if (host.find((e) => e.ruleId.endsWith("-gpa"))?.result === "pass") reasons.push("파견교 GPA 조건을 충족하거나 별도 기준이 없어요.");
  if (ieltsReq !== null && ieltsReq <= 6) reasons.push(`IELTS 기준이 ${ieltsReq}로 비교적 낮아요(엑셀).`);
  if (o.housing.onCampus === "available_not_guaranteed") reasons.push("교내 기숙사를 신청할 수 있어요(배정 보장 아님).");
  if (opts.includes("one_year")) reasons.push("1년 파견 옵션도 있어요.");

  const risks: string[] = [];
  if (accessStatus === "limited") risks.push(access.conditions[0]);
  if (stale) risks.push(`${formatTerm(term)} 회차 공고 전이라 2027-1 자료로 계산했어요. 이 학교가 다음 회차에도 열리는지 확인이 필요해요.`);
  if (deadlinePassed) risks.push("이 회차의 마감이 지났어요.");
  if (o.housing.onCampus === "unavailable") risks.push("교내 기숙사가 없어 교외 숙소를 구해야 해요(엑셀).");
  if (o.nationalityRestriction.value) risks.push(`${o.nationalityRestriction.value}(엑셀).`);
  if (o.quota.value === 1) risks.push("배정 TO가 1명이에요(정원 정보이며 합격 가능성이 아니에요).");
  for (const c of mil) risks.push(c.detail);

  const id = `ex-${o.id}-${term.year}${term.season}-${duration}-rec-unknown`;
  return {
    id,
    offeringId: o.id,
    inputFingerprint: fp,
    exchangeTerm: term,
    duration,
    status,
    staleCycle: stale,
    eligibility,
    courseAccess: { status: accessStatus, reasons: access?.conditions ?? [] },
    recognitionSummary: { confirmedCredits: null, countsAsTerm: null, status: "unknown" },
    militaryConflicts: mil,
    riskKeys,
    reasons,
    risks,
    sourceRefs: o.sourceRefs,
  };
}

// ── 정렬 ────────────────────────────────────────────────

/** 우선순위별 비교값(작을수록 좋음). 비교할 자료가 없으면 null → 그 우선순위는 정렬에 쓰지 않는다 */
function priorityValue(p: ExchangePriority, c: ExchangeMatchCandidate, o: PartnerOffering): number | null {
  switch (p) {
    case "major_course_access":
      return c.courseAccess.status === "unknown" ? 0 : c.courseAccess.status === "limited" ? 1 : 2;
    case "language_fit": {
      const ielts = o.language.find((l) => l.test === "IELTS_ACADEMIC")?.total ?? null;
      return ielts === null ? 9 : ielts + (o.language.some((l) => l.subscoresRequired) ? 0.25 : 0);
    }
    case "housing":
      return o.housing.onCampus === "available_not_guaranteed" ? 0 : o.housing.onCampus === "unknown" ? 1 : 2;
    case "graduation_fit":
      return c.duration === "one_term" ? 0 : 1;
    default:
      return null; // 비용·명성·국가 선호: 비교할 공식 자료가 없음
  }
}

export const PRIORITY_NO_DATA: Partial<Record<ExchangePriority, string>> = {
  low_cost: "생활비·주거비 공식 자료가 없어 비용으로 순위를 매기지 않았어요.",
  prestige: "최신 랭킹 근거를 넣지 않아 명성으로 순위를 매기지 않았어요.",
  country_culture: "선호 국가를 받지 않아 국가로 순위를 매기지 않았어요.",
};

// ── 전체 ────────────────────────────────────────────────

export function buildExchangeCandidateSet(input: ExchangePlanningInput, catalog: ExchangeCatalog, ctx: ExchangeContext): ExchangeCandidateSet {
  const fp = hash(JSON.stringify({ input, v: catalog.catalogVersion, mil: ctx.militaryWindows, today: ctx.today }));
  const empty = (reason: string, extra: Partial<ExchangeCandidateSet> = {}): ExchangeCandidateSet => ({
    catalogVersion: catalog.catalogVersion,
    inputFingerprint: fp,
    targetCycle: null,
    dataCycleId: null,
    common: { status: "conditional", evaluations: [] },
    primary: null,
    backups: [],
    all: [],
    wholeSetConditional: false,
    emptyReason: reason,
    branches: [],
    actions: [],
    ...extra,
  });
  if (input.intent === "none") return empty("교환학생을 생각하지 않는다고 해서 후보를 만들지 않았어요.");
  const terms = targetTerms(input, catalog);
  if (terms.length === 0) return empty("지금 정보로는 지원 자격(이수 학기)에 맞는 파견 학기를 찾지 못했어요. 계획 시작 학기와 마친 학기를 확인해 주세요.");

  // 첫 목표 학기 기준으로 회차·공통 자격을 본다(추천 모드는 가장 이른 가능 학기)
  const offeringsById = new Map(catalog.offerings.map((o) => [o.id, o]));
  let chosen: { term: Term; cyc: ReturnType<typeof cycleFor>; common: ReturnType<typeof evaluateCommon>; list: ExchangeMatchCandidate[] } | null = null;
  for (const term of terms) {
    const cyc = cycleFor(catalog, term);
    if (!cyc.data) continue;
    const common = evaluateCommon(input, cyc.data, term, cyc.stale);
    const targetClosed = !cyc.stale && cyc.target?.officialStatus === "closed";
    const list = catalog.offerings
      .filter((o) => o.applicationCycleId === cyc.data!.id && o.reviewStatus !== "rejected")
      .map((o) => candidateFor(o, term, input, catalog, ctx, common, cyc.stale, targetClosed, fp))
      .filter((c): c is ExchangeMatchCandidate => c !== null);
    const current = { term, cyc, common, list };
    // 고정 시기면 첫 학기만, 추천이면 지원 가능한(마감·불가가 아닌) 후보가 있는 첫 학기
    if (input.targetTerm.mode === "fixed" || input.targetTerm.mode === "next_spring" || input.targetTerm.mode === "next_fall" || list.some((c) => c.status === "eligible" || c.status === "conditional")) {
      chosen = current;
      break;
    }
    chosen ??= current;
  }
  if (!chosen) return empty("파견교 자료가 있는 회차가 없어요.");
  const { term, cyc, common } = chosen;

  const pri = input.priorities.slice(0, 2);
  const sorted = [...chosen.list].sort((a, b) => {
    const s = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (s) return s;
    for (const p of pri) {
      const va = priorityValue(p, a, offeringsById.get(a.offeringId)!);
      const vb = priorityValue(p, b, offeringsById.get(b.offeringId)!);
      if (va !== null && vb !== null && va !== vb) return va - vb;
    }
    const ua = a.eligibility.filter((e) => e.result === "unknown").length;
    const ub = b.eligibility.filter((e) => e.result === "unknown").length;
    return ua - ub || a.riskKeys.length - b.riskKeys.length || a.offeringId.localeCompare(b.offeringId);
  });

  const usable = sorted.filter((c) => c.status === "eligible" || c.status === "conditional");
  const primary = usable[0] ?? null;
  const backups: ExchangeMatchCandidate[] = [];
  if (primary) {
    const top = (c: ExchangeMatchCandidate) => c.riskKeys.find((k) => k !== "stale" && k !== "quota_small") ?? null;
    const pRisk = top(primary);
    const pCountry = offeringsById.get(primary.offeringId)!.country;
    // 백업 1: 1순위의 가장 큰 위험을 갖지 않은 후보
    const b1 = usable.find((c) => c !== primary && (pRisk === null || !c.riskKeys.includes(pRisk))) ?? usable.find((c) => c !== primary);
    if (b1) {
      backups.push(b1);
      const b1Risk = top(b1);
      // 백업 2: 1순위·백업1과 다른 핵심 위험, 가능하면 다른 국가
      const b2 =
        usable.find((c) => c !== primary && c !== b1 && top(c) !== pRisk && top(c) !== b1Risk && offeringsById.get(c.offeringId)!.country !== pCountry) ??
        usable.find((c) => c !== primary && c !== b1 && top(c) !== pRisk && top(c) !== b1Risk) ??
        usable.find((c) => c !== primary && c !== b1 && offeringsById.get(c.offeringId)!.country !== offeringsById.get(b1.offeringId)!.country);
      if (b2) backups.push(b2);
    }
  }
  const trio = [primary, ...backups].filter((c): c is ExchangeMatchCandidate => !!c);
  const wholeSetConditional = trio.length > 0 && trio.every((c) => c.staleCycle || c.status === "conditional");

  const emptyReason = primary
    ? null
    : common.status === "ineligible"
      ? "지금 기준으로는 한양대 공통 자격을 충족하지 않아요. 아래 이유와 다음 준비를 확인하세요."
      : sorted.some((c) => c.status === "deadline_passed")
        ? `${cyc.data?.label ?? "이 회차"}는 마감됐어요. 다음 회차 공고를 확인해 주세요.`
        : "조건에 맞는 파견교 후보가 없어요.";

  const primaryOffering = primary ? offeringsById.get(primary.offeringId)! : null;
  return {
    catalogVersion: catalog.catalogVersion,
    inputFingerprint: fp,
    targetCycle: cyc.target ? { id: cyc.target.id, label: cyc.target.label, officialStatus: cyc.target.officialStatus } : { id: `forecast-${term.year}-${term.season}`, label: `${formatTerm(term)} 파견 모집(공고 전)`, officialStatus: "unknown" },
    dataCycleId: cyc.data?.id ?? null,
    common,
    primary,
    backups,
    all: sorted,
    wholeSetConditional,
    emptyReason,
    branches: branchesFor(primary, primaryOffering, backups, cyc.data, input),
    actions: actionsFor(term, cyc, primaryOffering, primary, input),
  };
}

// ── 결과 분기 ────────────────────────────────────────────

function branchesFor(primary: ExchangeMatchCandidate | null, o: PartnerOffering | null, backups: ExchangeMatchCandidate[], cycle: HanyangExchangeCycle | null, input: ExchangePlanningInput): ExchangeOutcomeBranch[] {
  if (!primary || !o) return [];
  const b = (id: string, parentId: string | null, event: ExchangeOutcomeBranch["event"], title: string, nextActions: string[]): ExchangeOutcomeBranch => ({ id, parentId, event, title, probability: null, nextActions });
  const cancel = cycle?.cancellationRules.value ?? [];
  return [
    b("selected", null, "hanyang_selected", "한양대 선발·파견교 배정", ["파견교 노미네이션 뒤 파견교에 따로 지원(application)", "파견교 수락 전까지 확정이 아니에요"]),
    b("not-selected", null, "hanyang_not_selected", "한양대 선발이 안 되면", [
      backups.length > 0 ? "백업 학교로 자동 합격되지 않아요. 지원서의 희망 대학 순서대로 배정되는지 공고에서 확인" : "다음 회차 공고 확인",
      "추가모집이 공고되면 별도 회차로 지원(미래 추가모집은 약속되지 않아요)",
    ]),
    b("host-accepted", "selected", "host_accepted", "파견교 수락", ["비자·보험·주거·과목 신청 진행"]),
    b("host-rejected", "selected", "host_rejected", "파견교 거절·프로그램 취소", [cancel[0] ?? "국제처에 대체 절차 문의", "파견교 취소는 본인 취소와 같은 제재로 보지 않아요(원문 기준 재지원 가능 여부 확인)"]),
    b("courses-ok", "host-accepted", "primary_courses_approved", "1순위 과목 승인", ["학과에 전공 인정 가능 여부 문의 기록"]),
    b("courses-backup", "host-accepted", "backup_courses_required", "1순위 과목이 막히면 백업 과목", ["같은 학기 백업 과목으로 최소 수강학점을 채울 수 있는지 확인", o.creditLoad.value ? `파견교 최소·최대 수강: ${o.creditLoad.value.min} / ${o.creditLoad.value.max}` : "최소 수강학점 확인 필요"]),
    ...(input.housing === "guaranteed_required" || o.housing.onCampus !== "available_not_guaranteed"
      ? [b("housing-no", "host-accepted", "housing_not_secured", "기숙사를 못 구하면", [o.housing.onCampus === "unavailable" ? "교내 기숙사가 없는 학교예요 — 교외 숙소 준비" : "교외 숙소 대안 확인(파견교 안내)"])]
      : []),
    b("credit-pending", "host-accepted", "credit_pending", "학점 인정은 귀국 후 결정", ["인정학점이 정해질 때까지 졸업 완료 학기를 확정하지 않아요", "귀국 후 다음 학기 말까지 인정 신청(공고 기준)"]),
    b("cancel", null, "user_cancelled", "개인 사유로 취소하면", [cancel[1] ?? "취소 제재는 공고 원문 확인"]),
  ];
}

// ── 준비 로드맵 ──────────────────────────────────────────

function actionsFor(term: Term, cyc: ReturnType<typeof cycleFor>, o: PartnerOffering | null, c: ExchangeMatchCandidate | null, input: ExchangePlanningInput): ExchangeAction[] {
  const stale = cyc.stale;
  const v = <T,>(value: T | null, truth: TruthState, refs: string[], note?: string): SourcedValue<T> => ({
    value,
    truth: value === null && truth !== "forecast" && truth !== "stale" ? "unknown" : truth,
    sourceRefs: refs,
    validity: { applicationCycleId: cyc.data?.id ?? null, exchangeTermId: `${term.year}-${term.season}`, hostAcademicPeriod: o?.hostAcademicPeriod ?? null, effectiveFrom: null, effectiveUntil: null },
    ...(note ? { note } : {}),
  });
  const win = cyc.target && !stale ? cyc.target.applicationWindow : null;
  const a = (id: string, title: string, detail: string, timing: ExchangeAction["timing"], due: SourcedValue<ISODate>, refs: string[] = []): ExchangeAction => ({
    id,
    checkKey: `exchange:${id}`,
    title,
    detail,
    timing,
    dueAt: due,
    status: "todo",
    blockingReason: null,
    sourceRefs: refs,
  });
  const noDate = (note: string) => v<ISODate>(null, "unknown", [], note);
  const list: ExchangeAction[] = [
    a("notice", `${formatTerm(term)} 파견 모집 공고 확인`, stale ? `${formatTerm(term)} 공고는 아직 없어요. 2027-1 공고는 2026-07-03에 게시됐어요 — 다음 회차 일정은 확인되지 않았어요.` : "공고와 파견교 엑셀 첨부를 확인", "before_application", win?.value ? v(win.value.start, win.truth, win.sourceRefs) : noDate("공고 확인 필요"), cyc.target?.sourceRefs ?? []),
    a(
      "language",
      input.languageStatus === "has_score" ? "어학 점수 체계·유효기간 확인" : "어학시험 준비",
      input.languageStatus === "has_score" ? "TOEFL은 2026-01 전후 점수 체계가 달라요. 파견교가 받는 체계와 영역별 점수를 확인하세요." : "후보 학교의 IELTS·TOEFL 기준을 보고 시험 종류를 고르세요. 시험 일정은 시험기관에서 확인 필요.",
      "before_application",
      noDate("시험 일정 확인 필요"),
    ),
    a("transcript", "영문 성적증명서·지원 서류 준비", "지원서·유학계획서·활동 이력은 공고 요구 문서를 따르세요. 평가 비율은 공고에서 확인.", "before_application", win?.value ? v(win.value.end, win.truth, win.sourceRefs) : noDate("공고 확인 필요")),
    a("major", "학과에 전공 인정 가능성 문의", "현지에서 들을 과목이 전공으로 인정되는지는 귀국 후 학과 심의로 정해져요. 미리 후보 과목으로 문의해 두세요.", "before_application", noDate("학과 문의")),
    a("nomination", "한양대 노미네이션 이후 파견교 지원", o ? `${o.universityName} 지원 마감` : "파견교 지원 마감 확인", "after_home_selection", o ? (stale ? v<ISODate>(null, "stale", o.deadlines.application.sourceRefs, `2027-1 기준 ${o.deadlines.application.value ?? "—"} — 다음 회차는 확인 필요`) : o.deadlines.application) : noDate("확인 필요"), o?.sourceRefs ?? []),
    a("housing", "기숙사·주거 신청", o?.housing.onCampus === "unavailable" ? "교내 기숙사가 없어요 — 교외 숙소 준비" : "교내 기숙사 신청(배정 보장 아님)", "before_exchange", noDate("파견교 안내 확인")),
    a("visa", "비자·보험 확인", "국가별 규정은 파견교·대사관 공식 안내로 확인하세요.", "before_exchange", noDate("공식 안내 확인")),
    a("courses", "1순위·백업 과목 신청", c?.courseAccess.status === "limited" ? "컴퓨팅 계열 제한이 있어 백업 과목을 넉넉히" : "교환학생 대상 최신 과목 목록에서 1순위·백업 과목 고르기", "before_exchange", noDate("파견교 안내 확인"), o?.sourceRefs ?? []),
    a("adddrop", "현지 수강 변경 결과 기록", "실제 수강과목·학점이 바뀌면 기록해 두세요(귀국 후 인정 신청에 필요).", "during_exchange", noDate("파견 중")),
    a("recognition", "귀국 후 학점 인정 신청", "성적표 수령 뒤 다음 학기 말까지 인정 신청(봄 파견 2월 말, 가을 파견 8월 말 — 2027-1 공고 기준). 인정학점이 정해지면 졸업 로드맵을 다시 계산해요.", "after_exchange", noDate("귀국 후"), cyc.data?.sourceRefs ?? []),
  ];
  return list;
}
