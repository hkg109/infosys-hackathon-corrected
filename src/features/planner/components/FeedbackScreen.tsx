"use client";

import { ArrowLeft, ArrowUp, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CAREER_LABEL } from "@/contracts/careers";
import type { DatasetV2, PlanInput, PlanResult, Term } from "@/contracts/types";
import { diffPlans, ENGINE_VERSION, formatTerm, simulatePlan, termIndex } from "@/engine";
import { type ChatMessage, type FeedbackReply, type FeedbackResponder, requestTrackFeedback } from "../feedbackAgent";
import { SCRIPTED_DEMO_LABEL, scriptedDemoResponder } from "../feedbackDemo";
import { usePlanner } from "../PlannerApp";
import { militarySummary } from "../plan";
import type { PlanState } from "../storage";
import { ActionBar } from "./OutputScreen";
import { Button, Empty, Hand, PageTitle } from "./ui";

const SUGGESTIONS = [
  "특정 교수님의 과목은 피하고 싶어요",
  "계절학기를 활용하고 싶어요",
  "4학년 2학기는 최대한 가볍게 하고 싶어요",
  "조금 더 빨리 끝내고 싶어요",
];

/**
 * 개인화 화면. responder를 넘기면 그 함수로 응답을 받는다(개인화 담당자 연결 지점).
 * 넘기지 않으면 미연결 응답, 사용자가 켜면 "시연용 예시 응답"을 쓴다.
 */
export function FeedbackScreen({ responder }: { responder?: FeedbackResponder } = {}) {
  const { mounted, plan, dataset } = usePlanner();
  if (!mounted) return <div className="h-96 animate-pulse rounded bg-paper-2" aria-busy="true" />;
  if (!plan || !dataset)
    return (
      <Empty title="아직 기본 트랙이 없어요" href="/match" cta="트랙 고르러 가기">
        먼저 02 맞(맞춰가기)에서 기본 트랙을 골라 주세요.
      </Empty>
    );
  return <Feedback plan={plan} dataset={dataset} responder={responder} />;
}

/** 04 피드백 — 기본 트랙을 보여 주고, 하고 싶은 말을 적으면 개인 맞춤 트랙으로 고친다. */
function Feedback({ plan, dataset, responder }: { plan: PlanState; dataset: DatasetV2; responder?: FeedbackResponder }) {
  const [demo, setDemo] = useState(false);
  const respond: FeedbackResponder = responder ?? (demo ? scriptedDemoResponder : requestTrackFeedback);
  const { setPlan, draft } = usePlanner();
  const router = useRouter();
  const base = plan.input;
  const before = useMemo(() => simulatePlan(base, dataset), [base, dataset]);
  const mil = militarySummary(base, before);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: `${draft?.name ? `${draft.name}님, ` : ""}“${plan.trackTitle}”을 기본 트랙으로 골랐어요. 듣기 싫은 수업, 계절학기, 가볍게 다니고 싶은 학기처럼 바라는 걸 편하게 적어 주세요. 그에 맞게 트랙을 고쳐 드릴게요.`,
    },
  ]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<FeedbackReply | null>(null);
  const thread = useRef<HTMLDivElement>(null);

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async (msg: string) => {
    const m = msg.trim();
    if (!m || busy) return;
    const history = [...messages, { role: "user" as const, text: m }];
    setMessages(history);
    setText("");
    setBusy(true);
    try {
      const reply = await respond({ message: m, history, plan, dataset });
      setMessages((h) => [...h, { role: "assistant", text: reply.message, demo: reply.origin === "scripted_demo" }]);
      if (reply.nextInput) setProposal(reply);
    } finally {
      setBusy(false);
    }
  };

  const after = useMemo(() => (proposal?.nextInput ? simulatePlan(proposal.nextInput, dataset) : null), [proposal, dataset]);

  const apply = (next: PlanInput, changes: string[]) => {
    setPlan({
      ...plan,
      input: next,
      previous: { schemaVersion: 1, savedAt: new Date().toISOString(), input: base, result: before, catalogVersion: before.catalogVersion, engineVersion: ENGINE_VERSION },
      previousGenEd: plan.genEd,
      lastChanges: changes,
      confirmedAt: null,
    });
    setProposal(null);
    setMessages((h) => [...h, { role: "assistant", text: "반영했어요. 더 바꾸고 싶은 게 있으면 이어서 적어 주세요." }]);
  };

  const confirm = () => {
    setPlan({ ...plan, confirmedAt: new Date().toISOString().slice(0, 10) });
    router.push("/output");
  };

  return (
    <div>
      <PageTitle
        step="03 · 다 — 맞춤 피드백"
        title="나에게 맞게 다듬기"
        sub="선택한 기본 트랙을 보면서 바라는 점을 적어 주세요. 고친 결과는 적용 전에 전·후를 비교해 보여 드려요."
        aside={
          <Link href="/output" className="inline-flex items-center gap-2 text-[14px] text-ink-soft hover:text-ink">
            <ArrowLeft size={15} aria-hidden /> 기본 트랙 로드맵
          </Link>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-10">
        {/* 채팅 */}
        <section aria-label="피드백 대화" className="flex h-[calc(100dvh-330px)] min-h-[520px] flex-col rounded-[8px] border-[1.5px] border-ink bg-paper">
          <div ref={thread} className="ruled flex-1 overflow-y-auto px-7 py-6">
            <ol className="grid gap-4">
              {messages.map((m, i) => (
                <li key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  {m.role === "assistant" ? (
                    <div className="max-w-[78%]">
                      <p className="mb-1 font-hand text-[18px] leading-none text-pen">아맞다{m.demo ? ` · ${SCRIPTED_DEMO_LABEL}` : ""}</p>
                      <p className="rounded-[4px_14px_14px_14px] border border-line bg-paper-2 px-4 py-3 text-[15px] leading-relaxed">{m.text}</p>
                    </div>
                  ) : (
                    <p className="max-w-[78%] rounded-[14px_4px_14px_14px] bg-ink px-4 py-3 text-[15px] leading-relaxed text-paper">{m.text}</p>
                  )}
                </li>
              ))}
              {busy && (
                <li className="font-hand text-[19px] text-pen" aria-live="polite">
                  트랙을 다시 맞춰 보는 중…
                </li>
              )}
            </ol>
          </div>

          <div className="border-t border-line px-5 pt-3 pb-4">
            {!responder && (
              <label className="mb-2 flex w-fit cursor-pointer items-center gap-2 text-[12px] text-ink-soft">
                <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
                {SCRIPTED_DEMO_LABEL} 사용 — 생성형 AI가 아니라 정해진 문장에만 반응해요
              </label>
            )}
            <div className="mb-3 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setText(s)}
                  className="cursor-pointer rounded-full border border-line bg-paper-2/70 px-3 py-1 text-[12px] text-ink-soft hover:border-ink/40 hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(text);
              }}
              className="flex items-end gap-2"
            >
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send(text);
                  }
                }}
                rows={2}
                placeholder="예) 계절학기 듣고 싶어요 · 금요일 수업은 빼 주세요"
                aria-label="피드백 입력"
                className="min-h-[52px] flex-1 resize-none !border-ink/40 !bg-paper text-[15px]"
              />
              <button
                type="submit"
                disabled={!text.trim() || busy}
                aria-label="보내기"
                className="grid size-[52px] shrink-0 cursor-pointer place-items-center rounded-[8px] bg-ink text-paper disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowUp size={20} aria-hidden />
              </button>
            </form>
          </div>
        </section>

        {/* 기본 트랙 요약 + 제안 */}
        <aside className="grid content-start gap-6">
          <div className="rounded-[8px] border border-line bg-paper p-5">
            <p className="text-[12px] text-muted">지금 트랙</p>
            <p className="mt-0.5 font-serif text-[20px] leading-snug font-bold">{plan.trackTitle}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
              <Item label="진로">{CAREER_LABEL[base.track]}</Item>
              <Item label="학기당 최대">{base.creditCap}학점</Item>
              <Item label="군 복무">{mil ? `${formatTerm(mil.first)} 입대` : "없음"}</Item>
              <Item label="예상 계획 완료">{before.expectedCompletion ? formatTerm(before.expectedCompletion) : "확인 필요"}</Item>
            </dl>
            <MiniTimeline result={before} />
            {plan.lastChanges.length > 0 && <p className="mt-3 text-[12px] text-ink-soft">최근 반영: {plan.lastChanges.join(" · ")}</p>}
          </div>

          {!(proposal?.nextInput && after) && (
            <div className="rounded-[8px] border-[1.5px] border-dashed border-line p-5 text-[13px] text-muted" aria-live="polite">
              <p className="font-semibold text-ink-soft">적용 결과 미리보기</p>
              {busy ? "처리 중이에요…" : "피드백으로 바뀌는 계획이 있으면 여기서 수정 전·후를 비교한 뒤 반영할지 고를 수 있어요."}
            </div>
          )}
          {proposal?.nextInput && after && (
            <div className="rounded-[8px] border-[1.5px] border-pen bg-paper p-5">
              <p className="font-hand text-[22px] leading-none text-pen">
                이렇게 바꿔 볼까요?{proposal.origin === "scripted_demo" && <span className="ml-2 font-sans text-[11px] text-muted">{SCRIPTED_DEMO_LABEL}</span>}
              </p>
              <Proposal before={before} after={after} changes={proposal.changes} />
              <div className="mt-4 flex gap-2">
                <Button kind="ink" onClick={() => apply(proposal.nextInput!, proposal.changes)} className="flex-1">
                  <Check size={16} aria-hidden /> 반영하기
                </Button>
                <Button kind="ghost" onClick={() => setProposal(null)}>
                  그대로 둘래요
                </Button>
              </div>
            </div>
          )}
        </aside>
      </div>

      <ActionBar>
        <p className="text-[14px] text-ink-soft">
          <Hand className="mr-2 text-[20px]">다 맞췄다면</Hand>지금 트랙을 최종 트랙으로 확정하세요. 확정한 뒤에도 다시 고칠 수 있어요.
        </p>
        <Button kind="stamp" onClick={confirm} className="px-7 font-serif text-[17px] font-bold tracking-wide">
          아 맞다! 최종 확정
        </Button>
      </ActionBar>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function MiniTimeline({ result }: { result: PlanResult }) {
  return (
    <div className="mt-4">
      <div className="flex h-[22px] gap-[2px]" role="img" aria-label="학기 흐름">
        {result.terms.map((t) => (
          <span
            key={termIndex(t.term)}
            title={`${formatTerm(t.term)} · ${t.status === "study" ? `${t.plannedCredits}학점` : "중단"}`}
            className={`flex-1 rounded-[2px] ${t.status === "study" ? "bg-ink/80" : "hatch border border-line"}`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted tabular-nums">
        <span>{short(result.terms[0]?.term ?? null)}</span>
        <span>{short(result.terms.at(-1)?.term ?? null)}</span>
      </div>
    </div>
  );
}

const short = (t: Term | null) => (t ? `${String(t.year).slice(2)}-${t.season}` : "");

function Proposal({ before, after, changes }: { before: PlanResult; after: PlanResult; changes: string[] }) {
  const diff = diffPlans(before, after);
  return (
    <div className="mt-3 text-[13px]">
      {changes.length > 0 && (
        <ul className="mb-3 grid gap-1">
          {changes.map((c) => (
            <li key={c}>· {c}</li>
          ))}
        </ul>
      )}
      <p>
        예상 완료 {formatTerm(before.expectedCompletion)} → <b className="text-red">{formatTerm(after.expectedCompletion)}</b>
        {diff.completionDeltaTerms !== null && diff.completionDeltaTerms !== 0 && (
          <span className="text-ink-soft"> ({diff.completionDeltaTerms > 0 ? `${diff.completionDeltaTerms}학기 늦게` : `${-diff.completionDeltaTerms}학기 빨리`})</span>
        )}
      </p>
      <MiniTimeline result={after} />
    </div>
  );
}
