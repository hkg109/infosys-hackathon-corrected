import { CAREER_LABEL } from "@/contracts/careers";
import type {
  CareerTrack,
  DatasetV2,
  MilitaryScenarioResolution,
  PaceStyle,
  PeriodInput,
  PlanInputV2,
  RankedEntry,
  Term,
  TrackCandidate,
} from "@/contracts/types";
import {
  formatTerm,
  generateCandidates,
  militaryTimingTerms,
  PACE_STYLE_LABEL,
  planStats,
  type PlanStats,
  termIndex,
  termRange,
  withMilitaryStart,
} from "@/engine";
import { type Draft, draftToInputV2, gradeLabel, needsMilitary, termAfterOrdinal } from "./plan";
import { type CareerMatch, QUIZ, recommendCareers } from "./recommend";

/**
 * 트랙 = 진로 × 군 복무 트랙(카투사 조건부 포함) × 입대 시기 × 학점 페이스 방식 × 교환학생 조합 하나.
 * 각 조합의 학기 배치·지표는 엔진(generateCandidates)이 계산하고, 그중 1순위 학점(15·18·20) 후보를 트랙의 대표로 쓴다.
 * 트랙 사이 순서: 진로 적합도 → 교환 없는 트랙 먼저 → 엔진 순위 → 고정 축 순서.
 */
export interface Track {
  /** URL에 쓰는 ID */
  id: string;
  career: CareerTrack;
  militaryStart: Term | null;
  exchangeTerm: Term | null;
  paceStyle: PaceStyle;
  /** 군 복무 트랙 ID와 시나리오 역할 */
  militaryTrackId: string | null;
  militaryRole: "normal" | "primary" | "conditional" | "fallback";
  militaryLabel: string | null;
  /** 대표 후보(엔진 1순위 학점 페이스) */
  candidate: TrackCandidate;
  entry: RankedEntry;
  alternatives: TrackCandidate[];
  match: CareerMatch;
  rank: number;
  title: string;
  subtitle: string;
  tags: string[];
  /** 실제 지표로 만든 추천 이유 */
  highlights: string[];
  cautions: string[];
  stats: PlanStats;
}

export interface TrackRow {
  id: string;
  title: string;
  desc: string;
  trackIds: string[];
}

export interface TrackSet {
  tracks: Track[];
  rows: TrackRow[];
  matches: CareerMatch[];
  /** 카투사 우선 희망 해석(제외 이유·대안) */
  military: MilitaryScenarioResolution | null;
}

const EXCHANGE_ID = "exc-1";
const MILITARY_ID = "mil-1";
/** 교환 시기 추천: 3학년 1학기·2학기(교환 학기 전까지 마친 학기 4·5). 서비스 기준이며 학교 규정이 아니다. */
const RECOMMENDED_EXCHANGE_ORDINALS = [4, 5];

const idx = (t: Term | null) => (t ? String(termIndex(t)) : "n");

export function trackIdOf(c: Pick<TrackCandidate, "key">, exc: Term | null, mil: Term | null = c.key.militaryStartTerm): string {
  const k = c.key;
  return [
    k.career,
    `m${idx(mil)}`,
    `x${idx(exc)}`,
    `s${k.paceStyle ?? "balanced"}`,
    `t${k.militaryTrackId ?? "n"}`,
    `r${k.militaryRole ?? "normal"}`,
  ].join("-");
}

/** 군 복무 구간을 피해, 교환 학기 전까지 마친 학기 수가 ordinal이 되는 첫 학기 */
export function exchangeTermFor(input: PlanInputV2, ordinal: number): Term | null {
  return termAfterOrdinal(input, ordinal, ["military", "leave"]);
}

function withExchange(input: PlanInputV2, term: Term): PlanInputV2 {
  const r = termRange(term);
  const period: PeriodInput = {
    id: EXCHANGE_ID,
    kind: "exchange",
    timing: "fixed",
    startDate: r.start,
    endDate: r.end,
    durationMonths: null,
    returnTerm: null,
    exchange: { credits: null, countsAsTerm: null, status: "unknown" },
    status: "user_assumption",
  };
  return { ...input, exchange: "included", periods: [...input.periods.filter((p) => p.id !== EXCHANGE_ID), period] };
}

/** 마친 학기 수 → "2학년 마치고" */
export function afterGradeLabel(done: number): string {
  if (done <= 0) return "입학하고 바로";
  if (done % 2 === 0) return `${done / 2}학년 마치고`;
  return `${Math.ceil(done / 2)}학년 1학기 마치고`;
}

interface Raw {
  career: CareerTrack;
  exc: Term | null;
  /** 입대 학기(엔진이 펼쳤거나 교환 트랙에서 고정한 값) */
  mil: Term | null;
  candidate: TrackCandidate;
  entry: RankedEntry;
  alternatives: TrackCandidate[];
}

/** 같은 축(학점만 다른) 후보 묶음마다 엔진 순위가 가장 높은 후보 하나 */
function bestPerGroup(set: ReturnType<typeof generateCandidates>, exc: Term | null, fixedMil: Term | null = null): Raw[] {
  const groups = new Map<string, Raw>();
  for (const e of set.ranking.entries) {
    const c = set.candidates.find((x) => x.id === e.candidateId);
    if (!c) continue;
    const mil = fixedMil ?? c.key.militaryStartTerm;
    const g = trackIdOf(c, exc, mil);
    const cur = groups.get(g);
    if (!cur) groups.set(g, { career: c.key.career, exc, mil, candidate: c, entry: e, alternatives: [] });
    else cur.alternatives.push(c);
  }
  return [...groups.values()];
}

/** 군 복무·교환 기간을 확정하지 못해 로드맵에 넣지 못한 후보 */
const periodUnresolved = (c: TrackCandidate) => c.missing.some((m) => m.field.startsWith("periods") && !m.field.endsWith(".exchange"));

const metric = (c: TrackCandidate, key: string) => c.metrics.find((m) => m.key === key)?.value ?? null;

export function buildTracks(draft: Draft, dataset: DatasetV2, today = ""): TrackSet {
  const picked = draft.career && draft.career !== "unsure" ? draft.career : null;
  const matches = recommendCareers(draft.answers, draft.completedCourseCodes, dataset, picked);
  const opts = { today: today || undefined };
  const raws: Raw[] = [];
  let military: MilitaryScenarioResolution | null = null;
  const exchangeOrdinals =
    draft.exchange.mode === "recommend"
      ? RECOMMENDED_EXCHANGE_ORDINALS
      : draft.exchange.mode === "pick" && draft.exchange.ordinal !== null
        ? [draft.exchange.ordinal]
        : [];

  for (const { track: career } of matches) {
    const base = draftToInputV2(draft, dataset, [career]);
    const set = generateCandidates(base, dataset, undefined, opts);
    military ??= set.military ?? null;
    raws.push(...bestPerGroup(set, null));

    if (exchangeOrdinals.length === 0) continue;
    // 교환 트랙: 입대 시기마다 교환 학기를 군 복무와 겹치지 않게 넣어 다시 계산한다(대표 군 복무 시나리오 기준).
    const timings: Array<Term | null> =
      needsMilitary(draft) && draft.military.timing === "recommend" && base.periods.some((p) => p.durationMonths !== null)
        ? militaryTimingTerms(base, 3)
        : [null];
    for (const mil of timings) {
      const fixedMil = mil ? withMilitaryStart(base, MILITARY_ID, mil) : base;
      const seen = new Set<number>();
      for (const ord of exchangeOrdinals) {
        const exc = exchangeTermFor(fixedMil, ord);
        if (!exc || seen.has(termIndex(exc))) continue;
        seen.add(termIndex(exc));
        const exSet = generateCandidates(withExchange(fixedMil, exc), dataset, undefined, opts);
        // 교환 트랙은 대표 시나리오(엔진 1순위) 하나만 둔다.
        const groups = bestPerGroup(exSet, exc, mil);
        if (groups[0]) raws.push(groups[0]);
      }
    }
  }

  const careerOrder = new Map(matches.map((m, i) => [m.track, i]));
  const roleOrder = { primary: 0, normal: 1, conditional: 2, fallback: 3 } as const;
  // 교환 전략을 고른 경우: 그 학기 교환 트랙을 먼저(고른 계획이 기본 로드맵이 되도록). 아니면 교환 없는 트랙을 먼저.
  const chosenExc = draft.exchangeChoice ? termIndex(draft.exchangeChoice.term) : null;
  const excRank = (r: Raw) => (chosenExc === null ? Number(r.exc !== null) : r.exc && termIndex(r.exc) === chosenExc ? 0 : 1);
  raws.sort(
    (a, b) =>
      careerOrder.get(a.career)! - careerOrder.get(b.career)! ||
      excRank(a) - excRank(b) ||
      // 기간을 확정하지 못한 트랙(복무기간 미확인 등)은 일정이 빠진 채 계산돼 지표가 공정하지 않으므로 뒤로
      Number(periodUnresolved(a.candidate)) - Number(periodUnresolved(b.candidate)) ||
      (a.entry.rank ?? 99) - (b.entry.rank ?? 99) ||
      roleOrder[a.candidate.key.militaryRole ?? "normal"] - roleOrder[b.candidate.key.militaryRole ?? "normal"] ||
      trackIdOf(a.candidate, a.exc, a.mil).localeCompare(trackIdOf(b.candidate, b.exc, b.mil)),
  );

  // 같은 ID(교환 트랙이 일반 트랙과 겹치는 경우 등)는 하나만 남긴다.
  const seenIds = new Set<string>();
  const unique = raws.filter((r) => {
    const id = trackIdOf(r.candidate, r.exc, r.mil);
    if (seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });
  const tracks = unique.map((r, i) => describeTrack(r, i + 1, unique, draft, dataset, matches));
  return { tracks, rows: buildRows(tracks, draft, matches), matches, military };
}

function militaryName(c: TrackCandidate, dataset: DatasetV2): string | null {
  const id = c.key.militaryTrackId;
  if (!id) return null;
  const name = dataset.military?.tracks.find((t) => t.id === id)?.officialName ?? id;
  if (c.key.militaryRole === "conditional") return `${name} 선발 시`;
  if (c.key.militaryRole === "fallback") return `카투사 미선발 시 ${name}`;
  return name;
}

function describeTrack(r: Raw, rank: number, all: Raw[], draft: Draft, dataset: DatasetV2, matches: CareerMatch[]): Track {
  const c = r.candidate;
  const match = matches.find((m) => m.track === r.career)!;
  const mil = r.mil;
  const style = c.key.paceStyle ?? "balanced";
  const done0 = draft.completedTerms ?? 0;
  const start = draft.startTerm ? termIndex(draft.startTerm) : 0;
  const milLabel = mil ? afterGradeLabel(done0 + (c.result?.terms.filter((t) => t.status === "study" && termIndex(t.term) < termIndex(mil)).length ?? termIndex(mil) - start)) : null;
  const res = c.result;
  const completion = res?.expectedCompletion ?? null;
  const milName = militaryName(c, dataset);
  const stats = planStats(res, c);

  const excGrade =
    r.exc && res ? gradeLabel(done0 + res.terms.filter((t) => t.status === "study" && termIndex(t.term) < termIndex(r.exc!)).length) : null;
  const nameParts: string[] = [];
  if (milName) nameParts.push(milName);
  if (milLabel) nameParts.push(`${milLabel} 입대`);
  if (r.exc) nameParts.push(`${excGrade} 교환`);
  if (style !== "balanced") nameParts.push(PACE_STYLE_LABEL[style]);
  if (nameParts.length === 0) nameParts.push(draft.military.timing === "fixed" && needsMilitary(draft) ? "입영일 맞춤" : "정석");
  const title = `${CAREER_LABEL[r.career]} · ${nameParts.join(" · ")}`;

  const parts: string[] = [];
  if (mil) parts.push(`${formatTerm(mil)} 입대`);
  if (r.exc) parts.push(`${formatTerm(r.exc)} 교환`);
  parts.push(`학기당 ${c.key.paceCredits}학점`);
  if (style !== "balanced") parts.push(PACE_STYLE_LABEL[style]);

  const tags = [CAREER_LABEL[r.career]];
  if (milName || needsMilitary(draft)) tags.push(milName ? milName : "군 복무");
  if (c.key.militaryRole === "conditional") tags.push("조건부");
  if (r.exc) tags.push("교환학생");
  if (style === "late_light") tags.push("후반 여유형");

  // 추천 이유: 실제 지표를 같은 진로·전체 트랙과 비교해 만든다.
  const highlights: string[] = [];
  if (draft.career === r.career) highlights.push(`직접 고른 관심 진로(${CAREER_LABEL[r.career]})예요.`);
  else if (match.matchedAnswers > 0) highlights.push(`질문 답 ${QUIZ.length}개 중 ${match.matchedAnswers}개가 ${CAREER_LABEL[r.career]} 쪽을 가리켜요.`);
  const sameCareer = all.filter((x) => x.career === r.career && x.candidate.result?.expectedCompletion);
  if (completion && sameCareer.length > 0) {
    const best = Math.min(...sameCareer.map((x) => termIndex(x.candidate.result!.expectedCompletion!)));
    if (termIndex(completion) === best) highlights.push(`같은 진로 트랙 중 가장 빨리 계획을 마쳐요 (${formatTerm(completion)}).`);
  }
  const core = metric(c, "career_core");
  if (core !== null) {
    const bestCore = Math.min(...all.filter((x) => x.career === r.career).map((x) => metric(x.candidate, "career_core") ?? 99));
    highlights.push(
      core === bestCore
        ? `진로 핵심 과목을 이 진로 트랙 중 가장 일찍(평균 ${core.toFixed(1)}번째 학기) 들어요.`
        : `진로 핵심 과목을 평균 ${core.toFixed(1)}번째 학기에 들어요.`,
    );
  }
  if (stats.maxCredits !== null && stats.maxCredits <= 15) highlights.push(`한 학기 최대 ${stats.maxCredits}학점으로 여유 있게 다녀요.`);
  if (style === "late_light" && stats.year4PlusAvg !== null)
    highlights.push(`4학년 이후 평균 ${stats.year4PlusAvg.toFixed(1)}학점으로 줄여 계획해요(서비스 계획 방식).`);
  if (mil && res) {
    const coreCodes = new Set(c.coreCourseCodes);
    const before = res.terms.filter((t) => termIndex(t.term) < termIndex(mil)).flatMap((t) => t.courses).filter((x) => coreCodes.has(x.code)).length;
    highlights.push(`학년을 다 마친 뒤 입대해 학기 중간에 끊기지 않아요${before > 0 ? ` · 입대 전에 핵심 과목 ${before}개를 먼저 들어요` : ""}.`);
  }
  if (r.exc) highlights.push(`${formatTerm(r.exc)}에 교환학생 한 학기를 넣었어요. 군 복무 기간과 겹치지 않게 골랐어요.`);

  const cautions = [
    ...(c.key.militaryRole === "conditional" ? ["카투사 선발 결과에 따라 달라지는 조건부 계획이에요. 선발을 가정한 것이며 합격 가능성 예측이 아니에요."] : []),
    ...(res?.assumptions.filter((a) => a.id !== "term_calendar").map((a) => a.message) ?? []),
    ...c.missing.map((m) => `${m.message}${m.impact ? ` ${m.impact}` : ""}`),
    ...(res?.unplaced.map((u) => `${u.name}: ${u.reason}`) ?? []),
  ];

  return {
    id: trackIdOf(c, r.exc, r.mil),
    career: r.career,
    militaryStart: mil,
    exchangeTerm: r.exc,
    paceStyle: style,
    militaryTrackId: c.key.militaryTrackId ?? null,
    militaryRole: c.key.militaryRole ?? "normal",
    militaryLabel: milName,
    candidate: c,
    entry: r.entry,
    alternatives: r.alternatives,
    match,
    rank,
    title,
    subtitle: parts.join(" · "),
    tags,
    highlights,
    cautions: [...new Set(cautions)],
    stats,
  };
}

function buildRows(tracks: Track[], draft: Draft, matches: CareerMatch[]): TrackRow[] {
  const rows: TrackRow[] = [];
  const firstOf = new Map<CareerTrack, Track>();
  for (const t of tracks) if (!t.exchangeTerm && !firstOf.has(t.career)) firstOf.set(t.career, t);

  rows.push({
    id: "top",
    title: "나에게 딱 맞는 트랙",
    desc: "진로마다 가장 좋은 트랙 하나씩, 추천 순서대로",
    trackIds: matches.flatMap((m) => (firstOf.get(m.track) ? [firstOf.get(m.track)!.id] : [])),
  });

  const top = matches[0]?.track;
  const topTracks = tracks.filter((t) => t.career === top && !t.exchangeTerm);
  if (top && topTracks.some((t) => t.militaryRole === "conditional"))
    rows.push({
      id: "katusa",
      title: "카투사 선발 시 vs 선발되지 않을 경우",
      desc: "결과가 나오기 전에는 두 경우를 함께 봐요. 합격 가능성은 계산하지 않아요.",
      trackIds: topTracks.filter((t) => t.militaryRole === "conditional" || t.militaryRole === "fallback").map((t) => t.id),
    });
  if (top && needsMilitary(draft) && new Set(topTracks.map((t) => idx(t.militaryStart))).size > 1)
    rows.push({
      id: "military",
      title: `${CAREER_LABEL[top]} — 입대 시기별 트랙`,
      desc: "학년을 마친 시점마다 다녀오면 어떻게 달라지는지",
      trackIds: topTracks.filter((t) => t.militaryStart).map((t) => t.id),
    });
  if (top && topTracks.some((t) => t.paceStyle === "late_light") && topTracks.some((t) => t.paceStyle === "balanced"))
    rows.push({
      id: "pace",
      title: "균형형 vs 후반 여유형",
      desc: "3·4학년 학점을 줄이면 완료 학기가 어떻게 달라지는지(서비스 계획 방식)",
      trackIds: topTracks.filter((t) => t.militaryRole !== "fallback").map((t) => t.id),
    });
  const exch = tracks.filter((t) => t.exchangeTerm);
  if (exch.length > 0)
    rows.push({ id: "exchange", title: "교환학생까지 챙기는 트랙", desc: "군 복무와 겹치지 않게 교환 학기를 넣었어요", trackIds: exch.map((t) => t.id) });

  for (const m of matches.slice(1, 3)) {
    const ids = tracks.filter((t) => t.career === m.track && !t.exchangeTerm).map((t) => t.id);
    if (ids.length > 1) rows.push({ id: `career-${m.track}`, title: `${CAREER_LABEL[m.track]} 트랙도 있어요`, desc: "다음으로 잘 맞는 진로", trackIds: ids });
  }

  rows.push({ id: "all", title: "전체 트랙 순위", desc: `계산한 트랙 ${tracks.length}개 전부`, trackIds: tracks.map((t) => t.id) });
  return rows;
}
