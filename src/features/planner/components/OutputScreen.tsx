"use client";

import { MessageSquareText, Printer, Undo2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { CAREER_LABEL } from "@/contracts/careers";
import type { DatasetV2 } from "@/contracts/types";
import type { Term } from "@/contracts/types";
import { addGenEd, formatTerm, GEN_ED_NOTE, removeGenEd, simulatePlan, staleGenEd, termIndex } from "@/engine";
import { sameTerm } from "@/engine/terms";
import { buildGuidance } from "@/features/guidance/buildGuidance";
import { usePlanner } from "../PlannerApp";
import { militarySummary } from "../plan";
import type { PlanState } from "../storage";
import { PrintPlan } from "./PrintPlan";
import { Roadmap } from "./Roadmap";
import { FeedbackChat } from "./FeedbackChat";
import { Button, Empty, Hand, PageTitle } from "./ui";

export function OutputScreen({ initialChat = false }: { initialChat?: boolean } = {}) {
  const { mounted, plan, dataset, catalog } = usePlanner();
  if (!mounted) return <div className="h-96 animate-pulse rounded bg-paper-2" aria-busy="true" />;
  if (!plan)
    return (
      <Empty title="아직 고른 트랙이 없어요" href="/match" cta="트랙 고르러 가기">
        02 맞(맞춰가기)에서 트랙을 하나 골라 결정하면 여기서 학기별로 펼쳐 보여 드려요.
      </Empty>
    );
  if (!dataset)
    return (
      <Empty title={catalog ? "학과 자료를 불러오지 못했어요" : "학과 자료를 불러오는 중…"} href="/" cta="표지로">
        {catalog?.warnings.join(" ")}
      </Empty>
    );
  return <Output plan={plan} dataset={dataset} initialChat={initialChat} />;
}

function Output({ plan, dataset, initialChat }: { plan: PlanState; dataset: DatasetV2; initialChat: boolean }) {
  const { draft, setPlan, checked, toggleChecked, today } = usePlanner();
  const [chat, setChat] = useState(initialChat && plan.confirmedAt === null);
  const { input } = plan;
  const result = useMemo(() => simulatePlan(input, dataset), [input, dataset]);
  const guidance = useMemo(() => {
    const g = buildGuidance(input, result, dataset);
    if (!plan.exchange) return g;
    return {
      items: [
        {
          id: "exchange",
          title: "교환학생 지원 일정·학점 인정 확인",
          detail: `${draft?.exchangeChoice ? `${draft.exchangeChoice.universityName}(${formatTerm(draft.exchangeChoice.term)}) — ` : ""}2027-1 공고는 2026-07-03에 게시됐어요. 다음 회차 일정은 아직 확인되지 않았어요. 인정학점은 귀국 후 학과 심의로 정해지며, 정해지면 완료 학기를 다시 계산해요.`,
          sourceIds: [],
        },
        ...g.items,
      ].slice(0, 6),
    };
  }, [input, result, dataset, plan.exchange, draft?.exchangeChoice]);
  const mil = militarySummary(input, result);
  // 교환 학기가 들어간 계획은 인정학점·유효학기가 미정이므로 v1 재계산 완료 학기를 확정값으로 보여 주지 않는다(PLAN 10장)
  const exchangePending = plan.exchange !== null && (draft?.exchangeChoice?.recognition.status ?? "unknown") === "unknown";
  const confirmed = plan.confirmedAt !== null;
  const remaining = input.targetCredits === null ? null : Math.max(0, input.targetCredits - input.earnedCredits);
  const total = result.terms.reduce((a, t) => a + t.plannedCredits, 0);
  const name = draft?.name;

  const prev = plan.previous;
  const delta =
    prev?.result.expectedCompletion && result.expectedCompletion
      ? termIndex(result.expectedCompletion) - termIndex(prev.result.expectedCompletion)
      : null;

  const [genEdMsg, setGenEdMsg] = useState<string | null>(null);
  const addGE = (term: Term, credits: 2 | 3) => {
    const r = addGenEd(plan.genEd, result.terms.find((t) => sameTerm(t.term, term)), credits);
    if (!r.ok) return setGenEdMsg(r.reason);
    setGenEdMsg(`${formatTerm(term)}에 ${r.item.label}(${credits}학점) 자리를 넣었어요. 학기 합계는 그대로예요.`);
    setPlan({ ...plan, genEd: r.state });
  };
  const removeGE = (id: string) => {
    setGenEdMsg(null);
    setPlan({ ...plan, genEd: removeGenEd(plan.genEd, id) });
  };
  const stale = staleGenEd(plan.genEd, result.terms);
  const careerCerts = (dataset.military?.careerCertificates ?? []).filter((x) => x.career === input.track);
  const certName = (id: string) => dataset.military?.certificates.find((x) => x.id === id)?.officialName ?? id;
  const capRules = [...new Set(result.terms.flatMap((t) => (t.capRuleId ? [t.capRuleId] : [])))];

  const confirm = () => {
    setChat(false);
    setPlan({ ...plan, confirmedAt: today || new Date().toISOString().slice(0, 10) });
  };
  const reopen = () => {
    setPlan({ ...plan, confirmedAt: null });
    setChat(true);
  };
  const undo = () =>
    prev && setPlan({ ...plan, input: prev.input, previous: null, lastChanges: [], confirmedAt: null, genEd: plan.previousGenEd ?? plan.genEd, previousGenEd: null });

  const warnings = dedupe(result.warnings.filter((w) => w.code !== "UNPLACED_COURSE").map((w) => w.message));
  const printPlan = async () => {
    await Promise.allSettled([
      document.fonts.load("700 18px 'Gowun Batang'"),
      document.fonts.load("18px 'Nanum Pen Script'"),
    ]);
    await document.fonts.ready;
    window.print();
  };

  return (
    <div>
      {/* 인쇄·PDF는 종이용 문서로 따로 그린다. 화면 요소는 인쇄에서 모두 숨긴다 */}
      <PrintPlan
        plan={plan}
        result={result}
        dataset={dataset}
        guidance={guidance.items}
        checked={checked}
        name={name}
        today={today}
        exchangePending={exchangePending}
        exchangeChoice={draft?.exchangeChoice}
        warnings={warnings}
      />
      <div className="print:hidden">
      <div className="relative print:hidden">
        <PageTitle
          step={confirmed ? "03 · 다 — 최종 트랙" : "03 · 다 — 기본 트랙"}
          title={plan.trackTitle}
          sub={
            (confirmed
              ? `${plan.confirmedAt}에 확정한 계획이에요. 인쇄하거나 PDF로 저장해 두세요.`
              : `${name ? `${name}님이 ` : ""}고른 기본 트랙이에요. 피드백으로 나에게 맞게 다듬은 뒤 “아 맞다!”로 확정하세요.`) +
            (plan.lastChanges.length > 0 ? ` 기본 트랙에서 바꾼 점: ${plan.lastChanges.join(" · ")}` : "")
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
        <Cell label={plan.military?.label ?? "군 복무"} sub={mil ? (mil.back ? `${formatTerm(mil.back)} 복학` : "복학은 계획 범위 밖") : plan.military ? "기간 확인 필요" : undefined}>
          {mil ? `${formatTerm(mil.first)} 입대` : plan.military ? "일정 미정" : "없음"}
        </Cell>
        <Cell label="학기당 계획" sub={input.paceStyle === "late_light" ? "후반 여유형(서비스 계획 방식)" : input.paceStyle === "custom" ? "직접 설정" : undefined}>
          최대 {input.creditCap}학점
        </Cell>
        <Cell label="예상 계획 완료" strong sub={exchangePending ? "교환 인정학점 확인 후 계산" : undefined}>
          {exchangePending ? "교환 인정 확인 후" : result.expectedCompletion ? formatTerm(result.expectedCompletion) : input.targetCredits === null ? "목표학점 필요" : "확인 필요"}
        </Cell>
        <Cell label="남은 학점 / 계획">{remaining === null ? `— / ${total}학점` : `${remaining} / ${total}학점`}</Cell>
      </dl>

      {plan.military?.conditional && (
        <p className="mb-6 border-l-[3px] border-red bg-red-soft/40 px-4 py-2.5 text-[14px]">
          <b>선발 결과에 따라 달라지는 조건부 계획이에요.</b> 카투사 선발을 가정했으며 합격 가능성 예측이 아니에요. 선발되지 않으면 02 맞에서 대체 트랙을 고르세요.
        </p>
      )}
      {stale.length > 0 && (
        <p className="mb-6 border-l-[3px] border-red px-4 py-2 text-[13px] text-red print:hidden">
          계획이 바뀌어 맞지 않는 교양 자리가 있어요: {stale.map((g) => `${g.label}(${formatTerm(g.term)})`).join(", ")}. 빼고 다시 넣어 주세요.
        </p>
      )}

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

      <div className={`grid gap-10 print:block ${chat ? "grid-cols-[minmax(0,1fr)_400px] gap-8" : "grid-cols-[minmax(0,1fr)_280px]"}`}>
        <div>
          {!confirmed && (
            <p className="mb-3 text-[13px] text-ink-soft print:hidden" role="status">
              학기 카드의 <b className="text-pen">+ 2학점 교양</b> · <b className="text-pen">+ 3학점 교양</b>으로 미지정 자리를 교양 자리로 바꿀 수 있어요. {GEN_ED_NOTE}
              {genEdMsg && <span className="mt-1 block font-medium text-ink">{genEdMsg}</span>}
            </p>
          )}
          <Roadmap
            input={input}
            result={result}
            dataset={dataset}
            exchange={plan.exchange}
            genEd={plan.genEd}
            onAddGenEd={confirmed ? undefined : addGE}
            onRemoveGenEd={confirmed ? undefined : removeGE}
          />
        </div>

        {chat && <FeedbackChat plan={plan} dataset={dataset} onClose={() => setChat(false)} onUndo={undo} />}
        <aside className={`grid content-start gap-8 print:mt-6 ${chat ? "hidden print:grid" : ""}`}>
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

          {careerCerts.length > 0 && (
            <section>
              <h2 className="mb-1 font-serif text-[16px] font-bold">자격증 준비</h2>
              <p className="mb-2 text-[11px] text-muted">진로 준비에 도움이 되는 서비스 추천이에요. 공식 필수 자격이 아니에요.</p>
              <ul className="grid gap-1.5 text-[13px]">
                {careerCerts.map((x) => (
                  <li key={x.certificateId}>
                    <label className="flex cursor-pointer items-start gap-2">
                      <input type="checkbox" className="mt-1" checked={!!checked[`cert:${x.certificateId}`]} onChange={() => toggleChecked(`cert:${x.certificateId}`)} />
                      <span>
                        <b className="font-medium">{certName(x.certificateId)}</b>
                        <span className="block text-[12px] text-muted">{x.reason}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="text-[12px] text-ink-soft">
            <h2 className="mb-1 font-serif text-[16px] font-bold text-ink">공식 자료와 사용자 가정</h2>
            <p>
              <b className="text-sage-ink">공식</b> 과목·학점: {dataset.department} {dataset.curriculum} 교육과정 자료
              {capRules.length > 0 && ` · 학기 상한: ${capRules.map((id) => dataset.creditCapRules?.find((r) => r.id === id)).filter(Boolean).map((r) => `${r!.maxCredits}학점(${r!.sourceRef.sourceId} ${r!.sourceRef.pages.join("·")}쪽)`).join(", ")}`}
            </p>
            <p className="mt-1">
              <b className="text-pen">가정</b> 학기당 계획 학점 · 학기 구간(3~6월/9~12월) · {input.targetCredits === null ? "목표학점 없음" : `목표 ${input.targetCredits}학점(내 입력)`}
              {plan.military && ` · ${plan.military.label} ${plan.military.monthsStatus === "verified" ? "복무기간(공식 확인)" : "복무기간(확인 필요 또는 내 입력)"}`}
            </p>
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
              <Button kind="ink" onClick={() => void printPlan()}>
                <Printer size={16} aria-hidden /> 인쇄 · PDF 저장
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[14px] text-ink-soft">
              <Hand className="mr-2 text-[20px]">듣기 싫은 수업, 계절학기…</Hand>하고 싶은 말을 적으면 기본 트랙을 나에게 맞게 고쳐 드려요.
            </p>
            <div className="flex gap-2">
              <Button kind={chat ? "ghost" : "line"} onClick={() => setChat((c) => !c)} aria-pressed={chat}>
                <MessageSquareText size={16} aria-hidden /> {chat ? "채팅 닫기" : "채팅으로 맞춤화"}
              </Button>
              <Button kind="stamp" onClick={confirm} disabled={!!result.error} className="px-7 font-serif text-[17px] font-bold tracking-wide">
                아 맞다!
              </Button>
            </div>
          </>
        )}
      </ActionBar>
      </div>
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

