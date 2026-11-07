"use client";

import { ArrowRight, PencilLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { CAREER_LABEL } from "@/contracts/careers";
import type { CareerTrack, DatasetV2, MetricKey, RankedEntry, Term, TrackCandidate } from "@/contracts/types";
import { formatTerm, generateCandidates, termIndex } from "@/engine";
import { usePlanner } from "../PlannerApp";
import { candidatePlanInput, type Draft, draftToInputV2, militarySummary } from "../plan";
import { recommendCareers, QUIZ } from "../recommend";
import { Button, Empty, GroupDot, GROUP_COLOR, Hand, LinkButton, PageTitle, Tag } from "./ui";

export function ProcessingScreen() {
  const { mounted, draft, dataset, catalog, plan } = usePlanner();
  if (!mounted) return <div className="h-96 animate-pulse rounded bg-paper-2" aria-busy="true" />;
  if (!draft)
    return (
      <Empty title="아직 적은 내용이 없어요" href="/input" cta="내 정보 적으러 가기">
        추천을 받으려면 먼저 이수 현황과 끌리는 것을 적어 주세요.
      </Empty>
    );
  if (!dataset)
    return (
      <Empty title={catalog ? "학과 자료를 불러오지 못했어요" : "학과 자료를 불러오는 중…"} href="/" cta="표지로">
        {catalog?.warnings.join(" ")}
      </Empty>
    );
  return <Processing draft={draft} dataset={dataset} restoreId={plan?.candidateId ?? null} />;
}

/** 엔진 후보 ID "career|m{학기 인덱스}|p{학점}"에서 선택을 복구한다. */
function parseId(id: string | null): { career: CareerTrack; timing: number | null; pace: number } | null {
  const m = id ? /^([a-z]+)\|m(-|\d+)\|p(\d+)$/.exec(id) : null;
  if (!m) return null;
  return { career: m[1] as CareerTrack, timing: m[2] === "-" ? null : Number(m[2]), pace: Number(m[3]) };
}

interface Ranked {
  c: TrackCandidate;
  e: RankedEntry;
}

function Processing({ draft, dataset, restoreId }: { draft: Draft; dataset: DatasetV2; restoreId: string | null }) {
  const { setPlan } = usePlanner();
  const router = useRouter();
  const restored = parseId(restoreId);
  const hasTiming = draft.military.mode === "recommend";

  const matches = useMemo(
    () => recommendCareers(draft.answers, draft.completedCourseCodes, dataset),
    [draft.answers, draft.completedCourseCodes, dataset],
  );
  const [career, setCareer] = useState<CareerTrack | null>(restored?.career ?? null);
  const [timing, setTiming] = useState<number | null>(restored?.timing ?? null);
  const [candidateId, setCandidateId] = useState<string | null>(restoreId);
  const [showAll, setShowAll] = useState(false);

  // 고른 진로 하나로 병역 시점 × 학점 페이스를 엔진이 계산·정렬한다. 화면은 순위를 다시 매기지 않는다.
  const set = useMemo(
    () => (career ? generateCandidates(draftToInputV2(draft, dataset, [career]), dataset) : null),
    [career, draft, dataset],
  );
  const ranked: Ranked[] = useMemo(
    () =>
      set
        ? set.ranking.entries.flatMap((e) => {
            const c = set.candidates.find((x) => x.id === e.candidateId);
            return c ? [{ c, e }] : [];
          })
        : [],
    [set],
  );

  const timingOf = (c: TrackCandidate) => (c.key.militaryStartTerm ? termIndex(c.key.militaryStartTerm) : null);
  const timingOptions = useMemo(() => {
    const best = new Map<number, Ranked>();
    for (const r of ranked) {
      const k = timingOf(r.c);
      if (k !== null && !best.has(k)) best.set(k, r);
    }
    return [...best.entries()].sort((a, b) => a[0] - b[0]);
  }, [ranked]);
  const recommendedTiming = ranked[0] ? timingOf(ranked[0].c) : null;

  const paceStepOpen = career !== null && (!hasTiming || timing !== null);
  const paceOptions = paceStepOpen ? ranked.filter((r) => !hasTiming || timingOf(r.c) === timing) : [];
  const recommendedPace = paceOptions.find((r) => r.e.rank !== null)?.c.id ?? null;
  const chosen = ranked.find((r) => r.c.id === candidateId && paceOptions.includes(r)) ?? null;

  const pickCareer = (t: CareerTrack) => {
    setCareer(t);
    setTiming(null);
    setCandidateId(null);
  };
  const pickTiming = (k: number) => {
    setTiming(k);
    setCandidateId(null);
  };

  const finish = () => {
    if (!chosen) return;
    const input = candidatePlanInput(chosen.c);
    if (!input) return;
    setPlan({ schemaVersion: 2, input, candidateId: chosen.c.id, previous: null, lastChanges: [], confirmedAt: null });
    router.push("/output");
  };

  const careerMeta = (t: CareerTrack) => dataset.recommendation?.careers.find((c) => c.track === t);
  const nameOf = (code: string) => dataset.courses.find((c) => c.code === code)?.name ?? code;
  const visible = showAll ? matches : matches.slice(0, 3);
  const steps = hasTiming ? 3 : 2;

  return (
    <div>
      <PageTitle
        step="02 · 맞춰가기"
        title={draft.name ? `${draft.name}님에게 맞는 선택지` : "나에게 맞는 선택지"}
        sub={`하나씩 고르면 로드맵이 구체화돼요. 추천은 적어 준 답과 실제 계산한 결과로 정했어요.`}
        aside={
          <LinkButton href="/input" kind="ghost">
            <PencilLine size={15} aria-hidden /> 답 고치기
          </LinkButton>
        }
      />

      <div className="grid gap-9">
        {/* 1. 진로 */}
        <Step n={1} total={steps} title="어떤 진로로 그려 볼까요?" done={career ? CAREER_LABEL[career] : null} onEdit={() => { setCareer(null); setTiming(null); setCandidateId(null); }}>
          <div className="grid grid-cols-3 gap-4">
            {visible.map((m, i) => {
              const meta = careerMeta(m.track);
              return (
                <OptionCard
                  key={m.track}
                  color={GROUP_COLOR[m.track]}
                  selected={career === m.track}
                  onClick={() => pickCareer(m.track)}
                  badge={i === 0 && m.score > 0 ? <Tag tone="marker">가장 잘 맞아요</Tag> : null}
                >
                  <p className="flex items-center gap-2 font-serif text-[19px] font-bold">
                    <GroupDot group={m.track} size={11} />
                    {CAREER_LABEL[m.track]}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
                    <Dots n={m.matchedAnswers} of={QUIZ.length} />
                    답 {QUIZ.length}개 중 {m.matchedAnswers}개가 이쪽
                  </p>
                  {m.reasons.length > 0 && (
                    <ul className="mt-3 grid gap-0.5">
                      {m.reasons.slice(0, 3).map((r) => (
                        <li key={r} className="font-hand text-[18px] leading-snug text-pen">
                          “{r}”
                        </li>
                      ))}
                    </ul>
                  )}
                  {meta && (
                    <p className="mt-3 border-t border-dashed border-line pt-2.5 text-[12px] text-ink-soft">
                      <span className="text-muted">핵심 과목 </span>
                      {meta.coreCourses
                        .slice(0, 4)
                        .map((c) => nameOf(c.courseCode))
                        .join(" · ")}
                    </p>
                  )}
                </OptionCard>
              );
            })}
          </div>
          {matches.length > 3 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 cursor-pointer text-[13px] text-pen underline-offset-4 hover:underline">
              {showAll ? "추천 3개만 보기" : `다른 진로 ${matches.length - 3}개도 보기`}
            </button>
          )}
          <p className="mt-2 text-[11px] text-muted">진로 분류는 서비스가 교육과정 과목을 묶은 것이며 학교 공식 트랙이 아니에요.</p>
        </Step>

        {set?.emptyReason && (
          <p role="alert" className="border-l-[3px] border-red pl-3 text-[13px] text-red">
            계획을 만들 수 없어요: {set.emptyReason.message}
          </p>
        )}

        {/* 2. 입대 시기 */}
        {hasTiming && career && timingOptions.length > 0 && (
          <Step
            n={2}
            total={steps}
            title="군대는 언제 다녀올까요?"
            done={timing !== null ? `${formatTerm(termOf(timingOptions, timing))} 입대` : null}
            onEdit={() => { setTiming(null); setCandidateId(null); }}
            note={`복무 ${draft.military.months}개월 기준`}
          >
            <div className="grid grid-cols-3 gap-4">
              {timingOptions.map(([k, r]) => {
                const term = r.c.key.militaryStartTerm!;
                const v1 = candidatePlanInput(r.c);
                const mil = v1 && r.c.result ? militarySummary(v1, r.c.result) : null;
                const offset = k - termIndex(draft.startTerm);
                return (
                  <OptionCard
                    key={k}
                    color="var(--pen)"
                    selected={timing === k}
                    onClick={() => pickTiming(k)}
                    badge={k === recommendedTiming && r.e.rank !== null ? <Tag tone="marker">추천</Tag> : null}
                  >
                    <p className="text-[12px] text-muted">{whenLabel(draft.completedTerms + offset)}</p>
                    <p className="font-serif text-[20px] font-bold">{formatTerm(term)} 입대</p>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
                      <Metric label="복학">{mil?.back ? formatTerm(mil.back) : "계획 범위 밖"}</Metric>
                      <Metric label="예상 완료">{r.c.result?.expectedCompletion ? formatTerm(r.c.result.expectedCompletion) : "목표학점 필요"}</Metric>
                    </dl>
                  </OptionCard>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted">
              학년을 마친 직후 시점을 비교했어요. 입대일은 그 학기 시작일로 가정했고, 실제 입영일은 병무청 일정에 따라 달라요.
            </p>
          </Step>
        )}

        {/* 3. 학기 학점 */}
        {paceStepOpen && paceOptions.length > 0 && set && (
          <Step n={steps} total={steps} title="한 학기에 몇 학점까지 들을까요?" done={null}>
            <div className="grid grid-cols-3 gap-4">
              {[...paceOptions]
                .sort((a, b) => a.c.key.paceCredits - b.c.key.paceCredits)
                .map((r) => {
                  const aliases = Object.entries(set.dedupedInto)
                    .filter(([, rep]) => rep === r.c.id)
                    .map(([id]) => parseId(id)?.pace)
                    .filter((p): p is number => p !== undefined);
                  return (
                    <OptionCard
                      key={r.c.id}
                      color="var(--red)"
                      selected={candidateId === r.c.id}
                      onClick={() => setCandidateId(r.c.id)}
                      badge={r.c.id === recommendedPace ? <Tag tone="marker">추천</Tag> : null}
                    >
                      <p className="font-serif text-[20px] font-bold">학기당 최대 {r.c.key.paceCredits}학점</p>
                      {aliases.length > 0 && <p className="text-[12px] text-muted">{aliases.join("·")}학점도 결과가 같아요</p>}
                      <dl className="mt-3 grid grid-cols-3 gap-2 text-[13px]">
                        <Metric label="예상 완료">{r.c.result?.expectedCompletion ? formatTerm(r.c.result.expectedCompletion) : "목표학점 필요"}</Metric>
                        <Metric label="평균 학점">{fmtMetric(r.c, "light_terms", "secondary")}</Metric>
                        <Metric label="핵심 과목">{fmtMetric(r.c, "career_core", "value", "번째 학기")}</Metric>
                      </dl>
                      {r.e.reasons.length > 0 && (
                        <ul className="mt-3 grid gap-1 border-t border-dashed border-line pt-2.5 text-[12px] text-ink-soft">
                          {r.e.reasons.slice(0, 2).map((x) => (
                            <li key={x}>· {x}</li>
                          ))}
                        </ul>
                      )}
                    </OptionCard>
                  );
                })}
            </div>
            {set.ranking.excludedMetrics.length > 0 && (
              <p className="mt-2 text-[11px] text-muted">비교에서 뺀 기준: {set.ranking.excludedMetrics.map((x) => x.reason).join(" ")}</p>
            )}
          </Step>
        )}
      </div>

      <div className="sticky bottom-5 z-10 mt-10 flex items-center justify-between gap-4 rounded-[8px] border-[1.5px] border-ink bg-paper px-6 py-4 shadow-[0_12px_24px_-16px_rgba(40,30,10,0.6)]">
        <p className="text-[14px] text-ink-soft">
          {chosen ? (
            <>
              <b className="text-ink">{CAREER_LABEL[chosen.c.key.career]}</b>
              {chosen.c.key.militaryStartTerm && <> · {formatTerm(chosen.c.key.militaryStartTerm)} 입대</>} · 학기당 {chosen.c.key.paceCredits}학점
            </>
          ) : (
            <Hand>위에서 하나씩 고르면 로드맵을 그릴 수 있어요.</Hand>
          )}
        </p>
        <Button kind="ink" onClick={finish} disabled={!chosen} className="px-6">
          이대로 로드맵 그리기 <ArrowRight size={16} aria-hidden />
        </Button>
      </div>
    </div>
  );
}

const termOf = (opts: Array<[number, Ranked]>, k: number): Term => opts.find(([x]) => x === k)![1].c.key.militaryStartTerm!;

/** 마친 학기 수(입대 직전 기준) → "1학년 마치고" */
function whenLabel(doneTerms: number): string {
  if (doneTerms <= 0) return "입학하고 바로";
  if (doneTerms % 2 === 0) return `${doneTerms / 2}학년 마치고`;
  return `${Math.ceil(doneTerms / 2)}학년 1학기 마치고`;
}

function fmtMetric(c: TrackCandidate, key: MetricKey, field: "value" | "secondary", unit = "학점"): string {
  const m = c.metrics.find((x) => x.key === key);
  const v = m?.[field];
  if (v === null || v === undefined) return "—";
  return `${Number.isInteger(v) ? v : v.toFixed(1)}${unit}`;
}

function Step({
  n,
  total,
  title,
  note,
  done,
  onEdit,
  children,
}: {
  n: number;
  total: number;
  title: string;
  note?: string;
  done: string | null;
  onEdit?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="grid grid-cols-[72px_minmax(0,1fr)] gap-4">
      <div>
        <p className="font-serif text-[30px] leading-none text-red tabular-nums">{n}</p>
        <p className="mt-1 text-[11px] text-muted tabular-nums">
          {n} / {total}
        </p>
      </div>
      <div className="min-w-0">
        <div className="mb-4 flex items-baseline gap-3">
          <h2 className="font-serif text-[21px] font-bold">{title}</h2>
          {note && <Hand>{note}</Hand>}
        </div>
        {done !== null ? (
          <div className="flex items-center gap-4 border-b border-rule pb-3">
            <span className="marker font-serif text-[18px] font-bold">{done}</span>
            <Button
              kind="ghost"
              className="min-h-[32px] px-2 text-[13px]"
              onClick={onEdit}
            >
              다시 고르기
            </Button>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function OptionCard({
  color,
  selected,
  onClick,
  badge,
  children,
}: {
  color: string;
  selected: boolean;
  onClick: () => void;
  badge: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`relative cursor-pointer overflow-hidden rounded-[6px] border-[1.5px] bg-paper px-5 pt-6 pb-4 text-left transition-[transform,border-color] ${
        selected ? "-translate-y-0.5 border-ink shadow-[0_10px_18px_-14px_rgba(40,30,10,0.7)]" : "border-line hover:border-ink/40"
      }`}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-[5px]" style={{ background: color }} />
      {badge && <span className="absolute top-3.5 right-3.5">{badge}</span>}
      {selected && (
        <span aria-hidden className="absolute right-3 bottom-2 rotate-[-8deg] font-hand text-[22px] text-red">
          이걸로!
        </span>
      )}
      {children}
    </button>
  );
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function Dots({ n, of }: { n: number; of: number }) {
  return (
    <span aria-hidden className="flex gap-0.5">
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className={`size-1.5 rounded-full ${i < n ? "bg-ink" : "bg-line"}`} />
      ))}
    </span>
  );
}
