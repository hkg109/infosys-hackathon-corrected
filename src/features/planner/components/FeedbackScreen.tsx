"use client";

import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { CAREER_LABEL, CAREER_TRACKS } from "@/contracts/careers";
import type { CareerTrack, DatasetV2, PlanInput, PlanResult, Term } from "@/contracts/types";
import { diffPlans, ENGINE_VERSION, formatTerm, simulatePlan, termIndex } from "@/engine";
import { usePlanner } from "../PlannerApp";
import { militarySummary, shiftMilitary } from "../plan";
import type { PlanState } from "../storage";
import { ActionBar } from "./OutputScreen";
import { Button, Choice, Empty, Field, GroupDot, Hand, LinkButton, PageTitle } from "./ui";

const PACES: Array<[number, string]> = [
  [15, "여유 있게"],
  [18, "보통으로"],
  [20, "빠듯하게"],
];

export function FeedbackScreen() {
  const { mounted, plan, dataset } = usePlanner();
  if (!mounted) return <div className="h-96 animate-pulse rounded bg-paper-2" aria-busy="true" />;
  if (!plan || !dataset)
    return (
      <Empty title="고칠 로드맵이 없어요" href="/processing" cta="선택지 고르러 가기">
        먼저 로드맵을 그린 뒤 피드백을 남겨 주세요.
      </Empty>
    );
  return <Feedback plan={plan} dataset={dataset} />;
}

function Feedback({ plan, dataset }: { plan: PlanState; dataset: DatasetV2 }) {
  const { setPlan } = usePlanner();
  const router = useRouter();
  const base = plan.input;
  const before = useMemo(() => simulatePlan(base, dataset), [base, dataset]);
  const baseMil = militarySummary(base, before);

  const [pace, setPace] = useState(base.creditCap);
  const [shift, setShift] = useState(0);
  const [career, setCareer] = useState<CareerTrack>(base.track);
  const [target, setTarget] = useState<number | null>(base.targetCredits);

  const next: PlanInput = useMemo(
    () => shiftMilitary({ ...base, creditCap: pace, track: career, targetCredits: target }, shift),
    [base, pace, career, target, shift],
  );
  const after = useMemo(() => simulatePlan(next, dataset), [next, dataset]);
  const diff = useMemo(() => diffPlans(before, after), [before, after]);
  const afterMil = militarySummary(next, after);

  // 군 복무를 계획 시작보다 앞으로 당길 수는 없다.
  const minShift = baseMil ? -(termIndex(baseMil.first) - termIndex(base.startTerm)) : 0;

  const changes: string[] = [];
  if (pace !== base.creditCap) changes.push(`학기당 ${base.creditCap} → ${pace}학점`);
  if (shift !== 0 && baseMil) changes.push(`입대 ${formatTerm(baseMil.first)} → ${afterMil ? formatTerm(afterMil.first) : "변경"}`);
  if (career !== base.track) changes.push(`진로 ${CAREER_LABEL[base.track]} → ${CAREER_LABEL[career]}`);
  if (target !== base.targetCredits) changes.push(`목표 ${base.targetCredits ?? "미입력"} → ${target ?? "미입력"}학점`);

  const apply = () => {
    if (changes.length === 0 || after.error) return;
    setPlan({
      ...plan,
      input: next,
      previous: {
        schemaVersion: 1,
        savedAt: new Date().toISOString(),
        input: base,
        result: before,
        catalogVersion: before.catalogVersion,
        engineVersion: ENGINE_VERSION,
      },
      lastChanges: changes,
      confirmedAt: null,
    });
    router.push("/output");
  };

  const moved = movedCourses(before, after);

  return (
    <div>
      <PageTitle
        step="03 · 다 했다 — 피드백"
        title="어디가 아쉬웠나요?"
        sub="바꾸고 싶은 것을 고르면 바로 다시 계산해서 고치기 전과 비교해 드려요."
        aside={
          <LinkButton href="/output" kind="ghost">
            <ArrowLeft size={15} aria-hidden /> 로드맵으로
          </LinkButton>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)_400px] gap-12">
        <div className="grid content-start gap-9">
          <Ask q="학기가 너무 빡빡하거나, 반대로 더 빨리 끝내고 싶다면">
            <div role="radiogroup" aria-label="학기당 학점" className="grid grid-cols-3 gap-2">
              {PACES.map(([n, word]) => (
                <Choice key={n} selected={pace === n} onClick={() => setPace(n)}>
                  <b className="font-semibold">{word}</b>
                  <span className="block text-[12px] text-muted">학기당 최대 {n}학점{n === base.creditCap ? " · 지금" : ""}</span>
                </Choice>
              ))}
            </div>
          </Ask>

          {baseMil && (
            <Ask q="입대 시기를 옮기고 싶다면">
              <div className="flex items-center gap-3">
                <Button onClick={() => setShift((s) => Math.max(minShift, s - 1))} disabled={shift <= minShift}>
                  <ChevronLeft size={16} aria-hidden /> 한 학기 당기기
                </Button>
                <div className="min-w-[190px] text-center">
                  <p className="font-serif text-[19px] font-bold">{afterMil ? formatTerm(afterMil.first) : formatTerm(baseMil.first)} 입대</p>
                  <p className="text-[12px] text-muted">
                    {shift === 0 ? "지금 계획 그대로" : `지금보다 ${Math.abs(shift)}학기 ${shift > 0 ? "늦게" : "일찍"}`}
                  </p>
                </div>
                <Button onClick={() => setShift((s) => Math.min(6, s + 1))} disabled={shift >= 6}>
                  한 학기 미루기 <ChevronRight size={16} aria-hidden />
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-muted">복무 기간은 그대로 두고 시작·끝을 6개월씩 옮겨요.</p>
            </Ask>
          )}

          <Ask q="다른 진로로도 그려 보고 싶다면">
            <div role="radiogroup" aria-label="진로" className="flex flex-wrap gap-2">
              {CAREER_TRACKS.map((t) => (
                <Choice key={t} selected={career === t} onClick={() => setCareer(t)}>
                  <span className="flex items-center gap-2">
                    <GroupDot group={t} /> {CAREER_LABEL[t]}
                    {t === base.track && <span className="text-[11px] text-muted">지금</span>}
                  </span>
                </Choice>
              ))}
            </div>
          </Ask>

          <Ask q="졸업사정 조회로 목표 학점을 확인했다면">
            <div className="max-w-[240px]">
              <Field label="목표 총학점">
                <input
                  type="number"
                  min={1}
                  max={250}
                  placeholder="모르면 비워 두기"
                  value={target ?? ""}
                  onChange={(e) => setTarget(e.target.value === "" ? null : Number(e.target.value))}
                />
              </Field>
            </div>
          </Ask>
        </div>

        {/* 고치기 전 → 후 */}
        <aside className="sticky top-6 self-start rounded-[6px] border-[1.5px] border-ink bg-paper p-5">
          <p className="font-hand text-[22px] leading-none text-pen">고치기 전 → 후</p>
          {changes.length === 0 ? (
            <p className="mt-4 text-[13px] text-muted">왼쪽에서 하나라도 바꾸면 차이가 여기 나타나요.</p>
          ) : after.error ? (
            <p className="mt-4 text-[13px] text-red">{after.error}</p>
          ) : (
            <>
              <dl className="mt-4 grid grid-cols-[88px_minmax(0,1fr)] gap-y-2 text-[13px]">
                <dt className="text-muted">예상 완료</dt>
                <dd className="font-medium">
                  {formatTerm(before.expectedCompletion)} → <b className="text-red">{formatTerm(after.expectedCompletion)}</b>
                  {diff.completionDeltaTerms !== null && diff.completionDeltaTerms !== 0 && (
                    <span className="ml-1 text-ink-soft">
                      ({diff.completionDeltaTerms > 0 ? `${diff.completionDeltaTerms}학기 늦게` : `${-diff.completionDeltaTerms}학기 빨리`})
                    </span>
                  )}
                </dd>
                <dt className="text-muted">바뀐 과목</dt>
                <dd>
                  {moved.length}과목 이동{diff.addedCourses.length > 0 && ` · ${diff.addedCourses.length}과목 추가`}
                  {diff.removedCourses.length > 0 && ` · ${diff.removedCourses.length}과목 빠짐`}
                </dd>
              </dl>

              <CreditBars rows={diff.creditDiffByTerm} />

              {moved.length > 0 && (
                <ul className="mt-4 grid gap-1 border-t border-dashed border-line pt-3 text-[12px]">
                  {moved.slice(0, 6).map((m) => (
                    <li key={m.code} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{m.name}</span>
                      <span className="shrink-0 text-ink-soft tabular-nums">
                        {short(m.before)} → {short(m.after)}
                      </span>
                    </li>
                  ))}
                  {moved.length > 6 && <li className="text-muted">외 {moved.length - 6}과목</li>}
                </ul>
              )}
            </>
          )}
        </aside>
      </div>

      <ActionBar>
        <p className="text-[14px] text-ink-soft">
          {changes.length > 0 ? changes.join(" · ") : <Hand>바꿀 것을 하나 이상 골라 주세요.</Hand>}
        </p>
        <Button kind="ink" onClick={apply} disabled={changes.length === 0 || !!after.error} className="px-6">
          이렇게 고치기 <ArrowRight size={16} aria-hidden />
        </Button>
      </ActionBar>
    </div>
  );
}

function Ask({ q, children }: { q: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-5 first:border-t-0 first:pt-0">
      <p className="mb-3 font-serif text-[17px] font-bold">“{q}”</p>
      {children}
    </section>
  );
}

const short = (t: Term | null) => (t ? `${String(t.year).slice(2)}-${t.season}` : "없음");

function movedCourses(a: PlanResult, b: PlanResult) {
  const at = (r: PlanResult) => {
    const m = new Map<string, { term: Term; name: string }>();
    for (const t of r.terms) for (const c of t.courses) m.set(c.code, { term: t.term, name: c.name });
    return m;
  };
  const x = at(a);
  const y = at(b);
  const out: Array<{ code: string; name: string; before: Term | null; after: Term | null }> = [];
  for (const [code, v] of x) {
    const w = y.get(code);
    if (w && termIndex(w.term) !== termIndex(v.term)) out.push({ code, name: v.name, before: v.term, after: w.term });
  }
  return out;
}

/** 학기별 학점: 고치기 전(테두리) vs 후(채움) */
function CreditBars({ rows }: { rows: Array<{ term: Term; before: number; after: number }> }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.before, r.after]));
  return (
    <div className="mt-4">
      <p className="mb-1.5 flex items-center gap-3 text-[11px] text-muted">
        학기별 학점
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 border border-ink/40" /> 전
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 bg-pen" /> 후
        </span>
      </p>
      <div className="flex h-[84px] items-end gap-[3px]" role="img" aria-label="학기별 계획 학점 비교">
        {rows.map((r) => (
          <div key={termIndex(r.term)} className="relative flex h-full min-w-0 flex-1 items-end" title={`${formatTerm(r.term)}: ${r.before} → ${r.after}학점`}>
            <span className="absolute bottom-0 left-0 w-full border border-ink/35" style={{ height: `${(r.before / max) * 100}%` }} />
            <span className="relative mx-auto w-1/2 bg-pen" style={{ height: `${(r.after / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted tabular-nums">
        <span>{rows[0] ? short(rows[0].term) : ""}</span>
        <span>{rows.length > 0 ? short(rows[rows.length - 1].term) : ""}</span>
      </div>
    </div>
  );
}
