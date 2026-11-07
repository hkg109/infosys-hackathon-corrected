import { CAREER_LABEL } from "@/contracts/careers";
import type { CareerTrack, DatasetV2, PeriodInput, PlanInputV2, RankedEntry, Term, TrackCandidate } from "@/contracts/types";
import {
  formatTerm,
  generateCandidates,
  militaryTimingTerms,
  nextTerm,
  resolvePeriodRange,
  termIndex,
  termRange,
  withMilitaryStart,
} from "@/engine";
import { overlaps } from "@/engine/terms";
import { type Draft, draftToInputV2, gradeLabel } from "./plan";
import { type CareerMatch, QUIZ, recommendCareers } from "./recommend";

/**
 * 트랙 = 진로 × 입대 시기 × 교환학생 여부 하나의 조합.
 * 각 조합의 학기 배치·지표는 엔진(generateCandidates)이 계산하고, 그중 1순위 학점 페이스 후보를 트랙의 대표로 쓴다.
 * 트랙 사이 순서: 진로 적합도(질문 답) → 같은 진로 안에서는 엔진 순위 → 교환 없는 트랙 먼저.
 */
export interface Track {
  /** URL에 쓰는 ID: "{career}-m{병역 시작 학기 인덱스|n}-x{교환 학기 인덱스|n}" */
  id: string;
  career: CareerTrack;
  militaryStart: Term | null;
  exchangeTerm: Term | null;
  /** 대표 후보(엔진 1순위 학점 페이스) */
  candidate: TrackCandidate;
  entry: RankedEntry;
  /** 같은 조합에서 계산한 다른 학점 페이스 후보 */
  alternatives: TrackCandidate[];
  match: CareerMatch;
  /** 전체 추천 순위(1부터) */
  rank: number;
  title: string;
  subtitle: string;
  tags: string[];
  highlights: string[];
  cautions: string[];
}

export interface TrackRow {
  id: string;
  title: string;
  desc: string;
  trackIds: string[];
}

const EXCHANGE_ID = "exc-1";
const MILITARY_ID = "mil-1";
/** 교환 시기 추천: 3학년 1학기·2학기(교환 학기 전까지 마친 학기 4·5). 서비스 기준이며 학교 규정이 아니다. */
const RECOMMENDED_EXCHANGE_ORDINALS = [4, 5];

const idx = (t: Term | null) => (t ? String(termIndex(t)) : "n");
export const trackIdOf = (career: CareerTrack, mil: Term | null, exc: Term | null) => `${career}-m${idx(mil)}-x${idx(exc)}`;

/** 군 복무 구간을 피해, 교환 학기 전까지 마친 학기 수가 ordinal이 되는 첫 학기 */
export function exchangeTermFor(input: PlanInputV2, ordinal: number): Term | null {
  if (!input.startTerm) return null;
  const ranges = input.periods.flatMap((p) => {
    const r = resolvePeriodRange(p);
    return r && p.kind === "military" ? [r] : [];
  });
  let done = input.progress.completedTerms ?? 0;
  let t = input.startTerm;
  for (let i = 0; i < 24; i++, t = nextTerm(t)) {
    if (ranges.some((r) => overlaps(termRange(t), r))) continue;
    if (done >= ordinal) return t;
    done++;
  }
  return null;
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
  mil: Term | null;
  exc: Term | null;
  candidate: TrackCandidate;
  entry: RankedEntry;
  alternatives: TrackCandidate[];
}

function bestOf(set: ReturnType<typeof generateCandidates>, filter: (c: TrackCandidate) => boolean) {
  const ranked = set.ranking.entries.flatMap((e) => {
    const c = set.candidates.find((x) => x.id === e.candidateId);
    return c && filter(c) ? [{ c, e }] : [];
  });
  if (ranked.length === 0) return null;
  return { candidate: ranked[0].c, entry: ranked[0].e, alternatives: ranked.slice(1).map((r) => r.c) };
}

const metric = (c: TrackCandidate, key: string) => c.metrics.find((m) => m.key === key)?.value ?? null;

export function buildTracks(draft: Draft, dataset: DatasetV2): { tracks: Track[]; rows: TrackRow[]; matches: CareerMatch[] } {
  const matches = recommendCareers(draft.answers, draft.completedCourseCodes, dataset);
  const raws: Raw[] = [];
  const exchangeOrdinals =
    draft.exchange.mode === "recommend"
      ? RECOMMENDED_EXCHANGE_ORDINALS
      : draft.exchange.mode === "pick" && draft.exchange.ordinal !== null
        ? [draft.exchange.ordinal]
        : [];

  for (const { track: career } of matches) {
    const base = draftToInputV2(draft, dataset, [career]);

    // 교환 없는 트랙: 병역 시점은 엔진이 펼친다.
    const set = generateCandidates(base, dataset);
    const timings: Array<Term | null> =
      draft.military.mode === "recommend" ? militaryTimingTerms(base, 3) : [null];
    for (const mil of timings) {
      const best = bestOf(set, (c) => idx(c.key.militaryStartTerm) === idx(mil));
      if (best) raws.push({ career, mil, exc: null, ...best });
    }

    // 교환 트랙: 입대 시기마다 교환 학기를 군 복무와 겹치지 않게 넣어 다시 계산한다.
    for (const mil of timings) {
      const fixedMil = mil ? withMilitaryStart(base, MILITARY_ID, mil) : base;
      const seen = new Set<number>();
      for (const ord of exchangeOrdinals) {
        const exc = exchangeTermFor(fixedMil, ord);
        if (!exc || seen.has(termIndex(exc))) continue;
        seen.add(termIndex(exc));
        const exSet = generateCandidates(withExchange(fixedMil, exc), dataset);
        const best = bestOf(exSet, () => true);
        if (best) raws.push({ career, mil, exc, ...best });
      }
    }
  }

  // 순서: 진로 적합도 → 교환 없는 트랙 먼저 → 엔진 순위 → 입대·교환 시기
  const careerOrder = new Map(matches.map((m, i) => [m.track, i]));
  raws.sort(
    (a, b) =>
      careerOrder.get(a.career)! - careerOrder.get(b.career)! ||
      Number(a.exc !== null) - Number(b.exc !== null) ||
      (a.entry.rank ?? 99) - (b.entry.rank ?? 99) ||
      idx(a.mil).localeCompare(idx(b.mil)) ||
      idx(a.exc).localeCompare(idx(b.exc)),
  );

  const tracks: Track[] = raws.map((r, i) => describeTrack(r, i + 1, raws, draft, dataset, matches));
  return { tracks, rows: buildRows(tracks, draft, matches), matches };
}

function describeTrack(r: Raw, rank: number, all: Raw[], draft: Draft, dataset: DatasetV2, matches: CareerMatch[]): Track {
  const match = matches.find((m) => m.track === r.career)!;
  const start = termIndex(draft.startTerm);
  const milLabel = r.mil ? afterGradeLabel(draft.completedTerms + termIndex(r.mil) - start) : null;
  const res = r.candidate.result;
  const completion = res?.expectedCompletion ?? null;

  // 교환 학기가 몇 학년 몇 학기인지: 마친 학기 + 그 전까지 다닌 학기
  const excGrade = r.exc && res
    ? gradeLabel(draft.completedTerms + res.terms.filter((t) => t.status === "study" && termIndex(t.term) < termIndex(r.exc!)).length)
    : null;
  const name = r.exc
    ? `${excGrade} 교환${milLabel ? ` · ${milLabel} 입대` : ""}`
    : r.mil
      ? `${milLabel} 입대`
      : draft.military.mode === "fixed"
        ? "입영일 맞춤"
        : "정석";
  const title = `${CAREER_LABEL[r.career]} · ${name}`;
  const parts: string[] = [];
  if (r.mil) parts.push(`${formatTerm(r.mil)} 입대`);
  if (r.exc) parts.push(`${formatTerm(r.exc)} 교환`);
  parts.push(`학기당 ${r.candidate.key.paceCredits}학점`);

  const tags = [CAREER_LABEL[r.career]];
  if (r.mil || draft.military.mode === "fixed") tags.push("군 복무");
  if (r.exc) tags.push("교환학생");

  // 장점: 실제 지표를 같은 진로·전체 트랙과 비교해 만든다.
  const highlights: string[] = [];
  if (match.matchedAnswers > 0) highlights.push(`질문 답 ${QUIZ.length}개 중 ${match.matchedAnswers}개가 ${CAREER_LABEL[r.career]} 쪽을 가리켜요.`);
  const sameCareer = all.filter((x) => x.career === r.career && x.candidate.result?.expectedCompletion);
  if (completion) {
    const best = Math.min(...sameCareer.map((x) => termIndex(x.candidate.result!.expectedCompletion!)));
    if (termIndex(completion) === best) highlights.push(`같은 진로 트랙 중 가장 빨리 계획을 마쳐요 (${formatTerm(completion)}).`);
  }
  const core = metric(r.candidate, "career_core");
  if (core !== null) {
    const bestCore = Math.min(...all.filter((x) => x.career === r.career).map((x) => metric(x.candidate, "career_core") ?? 99));
    highlights.push(
      core === bestCore
        ? `진로 핵심 과목을 이 진로 트랙 중 가장 일찍(평균 ${core.toFixed(1)}번째 학기) 들어요.`
        : `진로 핵심 과목을 평균 ${core.toFixed(1)}번째 학기에 들어요.`,
    );
  }
  const maxCredits = metric(r.candidate, "light_terms");
  if (maxCredits !== null && maxCredits <= 15) highlights.push(`한 학기 최대 ${maxCredits}학점으로 여유 있게 다녀요.`);
  if (r.mil && res) {
    const milStart = termIndex(r.mil);
    const coreCodes = new Set(r.candidate.coreCourseCodes);
    const before = res.terms.filter((t) => termIndex(t.term) < milStart).flatMap((t) => t.courses).filter((c) => coreCodes.has(c.code)).length;
    highlights.push(`학년을 다 마친 뒤 입대해 학기 중간에 끊기지 않아요${before > 0 ? ` · 입대 전에 핵심 과목 ${before}개를 먼저 들어요` : ""}.`);
  }
  if (r.exc) highlights.push(`${formatTerm(r.exc)}에 교환학생 한 학기를 넣었어요. 군 복무 기간과 겹치지 않게 골랐어요.`);

  const cautions = [
    ...(res?.assumptions.map((a) => a.message) ?? []),
    ...r.candidate.missing.map((m) => `${m.message}${m.impact ? ` ${m.impact}` : ""}`),
    ...(res?.unplaced.map((u) => `${u.name}: ${u.reason}`) ?? []),
  ];

  return {
    id: trackIdOf(r.career, r.mil, r.exc),
    career: r.career,
    militaryStart: r.mil,
    exchangeTerm: r.exc,
    candidate: r.candidate,
    entry: r.entry,
    alternatives: r.alternatives,
    match,
    rank,
    title,
    subtitle: parts.join(" · "),
    tags,
    highlights,
    cautions: [...new Set(cautions)],
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
  if (draft.military.mode === "recommend" && top) {
    rows.push({
      id: "military",
      title: `${CAREER_LABEL[top]} — 입대 시기별 트랙`,
      desc: "학년을 마친 시점마다 다녀오면 어떻게 달라지는지",
      trackIds: tracks.filter((t) => t.career === top && !t.exchangeTerm).map((t) => t.id),
    });
  }
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

