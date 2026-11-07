"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, Flag, Info } from "lucide-react";
import { useState } from "react";
import type { CandidateSet, MetricKey, MetricValue, RankedEntry, TrackCandidate } from "@/contracts/types";
import { formatTerm } from "@/engine";
import { TRACK_NAME } from "../labels";
import { Badge, Button } from "./ui";

/**
 * 맞 단계의 후보 카드 목록(FE-1). BE-2가 만든 CandidateSet을 그대로 보여준다.
 * 순위·지표·추천 이유는 엔진 결과이며 화면에서 다시 계산하거나 정렬하지 않는다.
 */

const METRIC_NAME: Record<MetricKey, string> = {
  fast_completion: "빠른 계획 완료",
  career_core: "진로 과목 먼저",
  light_terms: "여유 있는 학기",
  exchange: "교환 경험",
};

const STATUS: Record<TrackCandidate["status"], { label: string; tone: "ok" | "warm" | "muted" }> = {
  computable: { label: "계산 완료", tone: "ok" },
  conditional: { label: "확인 필요", tone: "warm" },
  conflict: { label: "충돌", tone: "warm" },
  search_limit: { label: "부분 결과", tone: "warm" },
};

export function CandidateList({
  set,
  initialVisible = 3,
  selectedId,
  onSelect,
}: {
  set: CandidateSet;
  initialVisible?: number;
  selectedId: string | null;
  onSelect: (candidate: TrackCandidate) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const byId = new Map(set.candidates.map((c) => [c.id, c]));
  const ranked = set.ranking.entries
    .map((e) => ({ entry: e, candidate: byId.get(e.candidateId) }))
    .filter((r): r is { entry: RankedEntry; candidate: TrackCandidate } => !!r.candidate);
  const excluded = set.candidates.filter((c) => c.status === "conflict");
  const visible = showAll ? ranked : ranked.slice(0, initialVisible);
  const hidden = ranked.length - visible.length;

  return (
    <div>
      <RankingBasis set={set} count={ranked.length} />

      {ranked.length === 0 ? (
        <EmptyCandidates set={set} />
      ) : (
        <ol className="grid gap-3">
          {visible.map(({ entry, candidate }) => (
            <li key={candidate.id}>
              <CandidateCard
                candidate={candidate}
                entry={entry}
                unranked={set.ranking.unrankedReason !== null}
                selected={candidate.id === selectedId}
                onSelect={() => onSelect(candidate)}
                tiedNames={entry.tiedWith.map((id) => (byId.get(id) ? candidateName(byId.get(id)!) : id))}
              />
            </li>
          ))}
        </ol>
      )}

      {ranked.length > initialVisible && (
        <div className="mt-3 flex justify-center">
          <Button onClick={() => setShowAll((s) => !s)}>
            {showAll ? "상위 후보만 보기" : `나머지 후보 ${hidden}개 더 보기`}
            <ChevronDown size={14} aria-hidden className={showAll ? "rotate-180" : ""} />
          </Button>
        </div>
      )}

      {excluded.length > 0 && (
        <div className="mt-4 rounded-xl border border-line bg-panel px-4 py-3">
          <p className="text-[13px] font-semibold">비교에서 뺀 후보 {excluded.length}개</p>
          <ul className="mt-1.5 grid gap-1 text-xs text-muted">
            {excluded.map((c) => (
              <li key={c.id}>
                <span className="font-medium text-ink">{candidateName(c)}</span> — {c.conflicts.map((x) => x.message).join(" / ")}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** 어떤 기준으로 줄 세웠는지, 뺀 지표와 그 이유 */
function RankingBasis({ set, count }: { set: CandidateSet; count: number }) {
  const { ranking } = set;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
      <span>
        조합 {set.exploredCount}개를 계산해 후보 {count}개
        {count > 0 && ranking.unrankedReason === null && <> · 비교 순서</>}
      </span>
      {ranking.unrankedReason === null &&
        ranking.usedMetrics.map((k, i) => (
          <Badge key={k} tone={i === 0 ? "brand" : "muted"}>
            {i + 1}. {METRIC_NAME[k]}
          </Badge>
        ))}
      {ranking.excludedMetrics.map((x) => (
        <span key={x.key} className="inline-flex items-center gap-1 text-warm-ink">
          <Info size={12} aria-hidden /> {METRIC_NAME[x.key]} 제외: {x.reason}
        </span>
      ))}
      {ranking.unrankedReason === "all_metrics_unknown" && (
        <span className="inline-flex items-center gap-1 text-warm-ink">
          <Info size={12} aria-hidden /> 비교할 수 있는 지표가 없어 순위 없이 보여드려요
        </span>
      )}
    </div>
  );
}

function EmptyCandidates({ set }: { set: CandidateSet }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-4 py-4 text-[13px]">
      <p className="flex items-center gap-1.5 font-semibold">
        <AlertTriangle size={15} aria-hidden className="text-warm-ink" /> 계산할 수 있는 후보가 없어요
      </p>
      {set.emptyReason && (
        <>
          <p className="mt-1 text-muted">{set.emptyReason.message}</p>
          {set.emptyReason.changeableFields.length > 0 && (
            <p className="mt-1 text-muted">바꿔 볼 수 있는 입력: {set.emptyReason.changeableFields.join(", ")}</p>
          )}
        </>
      )}
    </div>
  );
}

function candidateName(c: TrackCandidate): string {
  return `${TRACK_NAME[c.key.career]} · 학기당 ${c.key.paceCredits}학점`;
}

function CandidateCard({
  candidate,
  entry,
  unranked,
  selected,
  onSelect,
  tiedNames,
}: {
  candidate: TrackCandidate;
  entry: RankedEntry;
  unranked: boolean;
  selected: boolean;
  onSelect: () => void;
  tiedNames: string[];
}) {
  const [open, setOpen] = useState(false);
  const { result, key } = candidate;
  const status = STATUS[candidate.status];
  const tags = [
    TRACK_NAME[key.career],
    `학기당 ${key.paceCredits}학점`,
    key.militaryStartTerm ? `${formatTerm(key.militaryStartTerm)} 입대` : null,
    candidate.input.periods.some((p) => p.kind === "military") && !key.militaryStartTerm ? "군 복무 포함" : null,
    candidate.input.periods.some((p) => p.kind === "leave") ? "휴학 포함" : null,
    candidate.input.periods.some((p) => p.kind === "exchange") ? "교환학생 포함" : null,
  ].filter((t): t is string => !!t);
  const coreNames = coreCourses(candidate);
  const headingId = `cand-${candidate.id}`;

  return (
    <article
      aria-labelledby={headingId}
      className={`rounded-2xl border-2 bg-panel ${selected ? "border-brand" : "border-line"}`}
    >
      <div className="grid gap-4 p-5 md:grid-cols-[auto_minmax(0,1fr)_auto]">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-active text-[17px] font-semibold text-brand tabular-nums">
          {entry.rank !== null && !unranked ? entry.rank : "–"}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 id={headingId} className="text-[17px] font-semibold">
              {candidateName(candidate)}
            </h3>
            <Badge tone={status.tone}>{status.label}</Badge>
            {selected && (
              <Badge>
                <CheckCircle2 size={11} aria-hidden /> 선택함
              </Badge>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <Badge key={t} tone="muted">
                {t}
              </Badge>
            ))}
          </div>
          {entry.reasons.length > 0 && (
            <ul className="mt-3 grid gap-0.5 text-[13px]">
              {entry.reasons.map((r) => (
                <li key={r} className="before:mr-1.5 before:text-brand before:content-['•']">
                  {r}
                </li>
              ))}
            </ul>
          )}
          {tiedNames.length > 0 && <p className="mt-1.5 text-xs text-muted">평가 동률: {tiedNames.join(", ")}</p>}
          {coreNames.length > 0 && <p className="mt-2 text-xs text-muted">진로 핵심 과목: {coreNames.join(", ")}</p>}
        </div>
        <div className="md:text-right">
          <p className="text-xs text-muted">예상 계획 완료</p>
          <p className="text-[22px] font-semibold tracking-tight text-brand tabular-nums">
            {result?.expectedCompletion ? formatTerm(result.expectedCompletion) : "확인 필요"}
          </p>
          {candidate.missing.length > 0 && (
            <p className="text-xs text-warm-ink">확인할 항목 {candidate.missing.length}개</p>
          )}
        </div>
      </div>

      <div className="flex border-t border-line">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-brand hover:bg-bg"
        >
          {open ? "접기" : "자세히 보기"}
          <ChevronDown size={14} aria-hidden className={open ? "rotate-180" : ""} />
        </button>
        <button
          type="button"
          onClick={onSelect}
          disabled={selected}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 border-l border-line py-2.5 text-xs font-semibold text-brand hover:bg-bg disabled:cursor-default disabled:text-muted disabled:hover:bg-transparent"
        >
          {selected ? "선택한 후보예요" : "이 트랙으로 시작"}
        </button>
      </div>

      {open && <CandidateDetail candidate={candidate} />}
    </article>
  );
}

/** 학기 미니 타임라인, 평가 지표, 확인 필요 항목과 가정 */
function CandidateDetail({ candidate }: { candidate: TrackCandidate }) {
  const { result } = candidate;
  return (
    <div className="grid gap-5 border-t border-line p-5">
      {result && (
        <section>
          <h4 className="mb-2 text-[13px] font-semibold">학기 흐름</h4>
          <ol className="flex gap-1.5 overflow-x-auto pb-1">
            {result.terms.map((t) => {
              const end =
                !!result.expectedCompletion &&
                result.expectedCompletion.year === t.term.year &&
                result.expectedCompletion.season === t.term.season;
              return (
                <li
                  key={`${t.term.year}-${t.term.season}`}
                  className={`w-[92px] shrink-0 rounded-lg border px-2 py-2 text-[11px] ${
                    t.status === "study" ? "border-line bg-bg" : "hatch border-dashed border-line"
                  }`}
                >
                  <p className="font-semibold tabular-nums">
                    {String(t.term.year).slice(2)}-{t.term.season}
                  </p>
                  {t.status === "study" ? (
                    <>
                      <p className="mt-1 tabular-nums">{t.plannedCredits}학점</p>
                      <p className="truncate text-muted" title={t.courses.map((c) => c.name).join(", ")}>
                        {t.courses.length > 0 ? t.courses.map((c) => c.name).join(", ") : "교양·전공 학점"}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 font-medium">{t.status === "exchange" ? "교환학생" : periodLabel(candidate, t.periodIds)}</p>
                  )}
                  {end && (
                    <p className="mt-1 flex items-center gap-1 text-brand">
                      <Flag size={10} aria-hidden /> 완료
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {candidate.metrics.length > 0 && (
        <section>
          <h4 className="mb-2 text-[13px] font-semibold">평가 지표</h4>
          <dl className="grid gap-2 sm:grid-cols-3">
            {candidate.metrics.map((m) => (
              <div key={m.key} className="rounded-lg border border-line px-3 py-2">
                <dt className="text-xs text-muted">{METRIC_NAME[m.key]}</dt>
                <dd className="mt-0.5 text-[13px] font-semibold tabular-nums">{metricText(m, candidate)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {(candidate.missing.length > 0 || (result?.assumptions.length ?? 0) > 0) && (
        <section className="grid gap-1.5 text-xs">
          <h4 className="text-[13px] font-semibold">확인할 것과 가정</h4>
          {candidate.missing.map((m) => (
            <p key={m.field} className="text-warm-ink">
              확인 필요 · {m.message}
              {m.impact && <span className="text-muted"> — {m.impact}</span>}
            </p>
          ))}
          {result?.assumptions.map((a) => (
            <p key={a.id} className="text-muted">
              가정 · {a.message}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}

function metricText(m: MetricValue, c: TrackCandidate): string {
  if (m.value === null) return m.unavailableReason ?? "확인 필요";
  switch (m.key) {
    case "fast_completion":
      return c.result?.expectedCompletion ? formatTerm(c.result.expectedCompletion) : `${m.value}학기 뒤`;
    case "career_core":
      return `평균 ${m.value}학기째`;
    case "light_terms":
      return m.secondary !== null && m.secondary !== m.value ? `최대 ${m.value}학점 (평균 ${m.secondary})` : `최대 ${m.value}학점`;
    case "exchange":
      return m.value > 0 ? "포함" : "미포함";
  }
}

function periodLabel(c: TrackCandidate, ids: string[]): string {
  const kinds = new Set(c.input.periods.filter((p) => ids.includes(p.id)).map((p) => p.kind));
  if (kinds.has("military")) return "군 복무";
  if (kinds.has("leave")) return "휴학";
  return "중단";
}

/** 결과에 배치된 이름을 쓰고, 아직 배치되지 않은 과목은 코드로 보여준다. */
function coreCourses(c: TrackCandidate): string[] {
  const placed = new Map((c.result?.terms ?? []).flatMap((t) => t.courses.map((x) => [x.code, { name: x.name, term: t.term }] as const)));
  const done = new Set(c.input.progress.completedCourseCodes ?? []);
  return c.coreCourseCodes.map((code) => {
    const p = placed.get(code);
    if (p) return `${p.name}(${formatTerm(p.term)})`;
    return done.has(code) ? `${code}(이수)` : `${code}(미배치)`;
  });
}
