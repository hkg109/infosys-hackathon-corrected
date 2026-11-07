"use client";

import { MessageSquareText, Printer, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { CAREER_LABEL } from "@/contracts/careers";
import type { DatasetV2 } from "@/contracts/types";
import { formatTerm, simulatePlan, termIndex } from "@/engine";
import { buildGuidance } from "@/features/guidance/buildGuidance";
import { usePlanner } from "../PlannerApp";
import { militarySummary } from "../plan";
import type { PlanState } from "../storage";
import { Roadmap } from "./Roadmap";
import { Button, Empty, Hand, LinkButton, PageTitle } from "./ui";

export function OutputScreen() {
  const { mounted, plan, dataset, catalog } = usePlanner();
  if (!mounted) return <div className="h-96 animate-pulse rounded bg-paper-2" aria-busy="true" />;
  if (!plan)
    return (
      <Empty title="아직 그린 로드맵이 없어요" href="/processing" cta="선택지 고르러 가기">
        맞춰가기에서 진로·입대 시기·학점을 고르면 로드맵이 그려져요.
      </Empty>
    );
  if (!dataset)
    return (
      <Empty title={catalog ? "학과 자료를 불러오지 못했어요" : "학과 자료를 불러오는 중…"} href="/" cta="표지로">
        {catalog?.warnings.join(" ")}
      </Empty>
    );
  return <Output plan={plan} dataset={dataset} />;
}

function Output({ plan, dataset }: { plan: PlanState; dataset: DatasetV2 }) {
  const { draft, setPlan, checked, toggleChecked, today } = usePlanner();
  const router = useRouter();
  const { input } = plan;
  const result = useMemo(() => simulatePlan(input, dataset), [input, dataset]);
  const guidance = useMemo(() => buildGuidance(input, result, dataset), [input, result, dataset]);
  const mil = militarySummary(input, result);
  const confirmed = plan.confirmedAt !== null;
  const remaining = input.targetCredits === null ? null : Math.max(0, input.targetCredits - input.earnedCredits);
  const total = result.terms.reduce((a, t) => a + t.plannedCredits, 0);
  const name = draft?.name;

  const prev = plan.previous;
  const delta =
    prev?.result.expectedCompletion && result.expectedCompletion
      ? termIndex(result.expectedCompletion) - termIndex(prev.result.expectedCompletion)
      : null;

  const confirm = () => setPlan({ ...plan, confirmedAt: today || new Date().toISOString().slice(0, 10) });
  const reopen = () => {
    setPlan({ ...plan, confirmedAt: null });
    router.push("/output/feedback");
  };
  const undo = () => prev && setPlan({ ...plan, input: prev.input, previous: null, lastChanges: [], confirmedAt: null });

  const warnings = dedupe(result.warnings.filter((w) => w.code !== "UNPLACED_COURSE").map((w) => w.message));

  return (
    <div>
      {/* 인쇄용 머리글 */}
      <div className="mb-4 hidden border-b-2 border-ink pb-2 print:block">
        <p className="font-serif text-[18px] font-bold">아 맞다, 인생! — {name ? `${name}님의 ` : ""}학기 로드맵</p>
        <p className="text-[11px]">
          {dataset.department} {dataset.curriculum} 교육과정 · {confirmed ? `${plan.confirmedAt} 확정` : "확정 전 초안"} · 계획·추정 결과이며 졸업 판정이 아닙니다.
        </p>
      </div>

      <div className="relative print:hidden">
        <PageTitle
          step={confirmed ? "03 · 다 했다 — 최종 로드맵" : "03 · 다 했다"}
          title={name ? `${name}님의 학기 로드맵` : "나의 학기 로드맵"}
          sub={
            confirmed
              ? `${plan.confirmedAt}에 확정한 계획이에요. 인쇄하거나 PDF로 저장해 두세요.`
              : "마음에 들면 “아 맞다!”로 확정하고, 아니면 피드백으로 고쳐 보세요."
          }
        />
        {confirmed && (
          <span key={plan.confirmedAt} className="stamp stamp-in absolute top-0 right-6 px-5 py-2 text-[26px] text-red">
            확 정
          </span>
        )}
      </div>

      <dl className="mb-8 grid grid-cols-5 border-y-[1.5px] border-ink">
        <Cell label="진로">{CAREER_LABEL[input.track]}</Cell>
        <Cell label="군 복무" sub={mil ? (mil.back ? `${formatTerm(mil.back)} 복학` : "복학은 계획 범위 밖") : undefined}>
          {mil ? `${formatTerm(mil.first)} 입대` : "없음"}
        </Cell>
        <Cell label="학기당 최대">{input.creditCap}학점</Cell>
        <Cell label="예상 계획 완료" strong>
          {result.expectedCompletion ? formatTerm(result.expectedCompletion) : "목표학점 필요"}
        </Cell>
        <Cell label="남은 학점 / 계획">{remaining === null ? `— / ${total}학점` : `${remaining} / ${total}학점`}</Cell>
      </dl>

      {prev && plan.lastChanges.length > 0 && !confirmed && (
        <div className="mb-8 flex items-center justify-between gap-4 border-l-[3px] border-pen bg-pen/[0.05] px-4 py-3 print:hidden">
          <p className="text-[13px] text-ink-soft">
            <Hand className="mr-2 text-[20px]">방금 고친 것</Hand>
            {plan.lastChanges.join(" · ")}
            {delta !== null && delta !== 0 && <> — 완료 {delta > 0 ? `${delta}학기 늦어짐` : `${-delta}학기 앞당겨짐`}</>}
            {delta === 0 && <> — 완료 시점은 같아요</>}
          </p>
          <Button kind="ghost" onClick={undo} className="min-h-[32px] text-[13px]">
            <Undo2 size={14} aria-hidden /> 되돌리기
          </Button>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_280px] gap-10 print:block">
        <Roadmap input={input} result={result} dataset={dataset} />

        <aside className="grid content-start gap-8 print:mt-6">
          <section>
            <h2 className="mb-2 font-serif text-[18px] font-bold">준비할 것</h2>
            <ul className="border-t border-rule">
              {guidance.items.map((g) => (
                <li key={g.id} className="border-b border-rule py-2.5">
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input type="checkbox" className="mt-1 shrink-0" checked={!!checked[g.id]} onChange={() => toggleChecked(g.id)} />
                    <span>
                      <span className={`block text-[14px] font-medium ${checked[g.id] ? "text-muted line-through" : ""}`}>{g.title}</span>
                      <span className="block text-[12px] leading-relaxed text-muted">{g.detail}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          {result.unplaced.length > 0 && (
            <section>
              <h2 className="mb-2 font-serif text-[16px] font-bold">아직 못 넣은 과목</h2>
              <ul className="grid gap-1.5 text-[13px]">
                {result.unplaced.map((u) => (
                  <li key={u.code}>
                    <b className="font-medium">{u.name}</b>
                    <span className="block text-[12px] text-muted">{u.reason}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {warnings.length > 0 && (
            <details className="text-[12px] text-ink-soft">
              <summary className="cursor-pointer font-medium text-ink">가정한 것·확인 필요 {warnings.length}건</summary>
              <ul className="mt-2 grid gap-1.5 pl-1">
                {warnings.map((w) => (
                  <li key={w}>· {w}</li>
                ))}
              </ul>
            </details>
          )}
        </aside>
      </div>

      <ActionBar>
        {confirmed ? (
          <>
            <p className="text-[14px] text-ink-soft">
              <Hand className="mr-2 text-[20px] text-red">확정!</Hand>이 로드맵을 기준으로 학기마다 다시 열어 체크해 보세요.
            </p>
            <div className="flex gap-2">
              <Button kind="ghost" onClick={reopen}>
                다시 고치기
              </Button>
              <Button kind="ink" onClick={() => window.print()}>
                <Printer size={16} aria-hidden /> 인쇄 · PDF 저장
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[14px] text-ink-soft">
              <Hand className="mr-2 text-[20px]">어딘가 아쉽다면?</Hand>피드백을 남기면 바로 다시 계산해서 보여 드려요.
            </p>
            <div className="flex gap-2">
              <LinkButton href="/output/feedback">
                <MessageSquareText size={16} aria-hidden /> 피드백 주기
              </LinkButton>
              <Button kind="stamp" onClick={confirm} disabled={!!result.error} className="px-7 font-serif text-[17px] font-bold tracking-wide">
                아 맞다!
              </Button>
            </div>
          </>
        )}
      </ActionBar>
    </div>
  );
}

function dedupe(xs: string[]) {
  return [...new Set(xs)];
}

function Cell({ label, strong, sub, children }: { label: string; strong?: boolean; sub?: string; children: ReactNode }) {
  return (
    <div className="border-r border-line px-4 py-3 last:border-r-0">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={`mt-0.5 font-serif font-bold tabular-nums ${strong ? "text-[20px] text-red" : "text-[16px]"}`}>{children}</dd>
      {sub && <dd className="text-[12px] text-ink-soft">{sub}</dd>}
    </div>
  );
}

export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-5 z-10 mt-10 flex items-center justify-between gap-4 rounded-[8px] border-[1.5px] border-ink bg-paper px-6 py-4 shadow-[0_12px_24px_-16px_rgba(40,30,10,0.6)] print:hidden">
      {children}
    </div>
  );
}

