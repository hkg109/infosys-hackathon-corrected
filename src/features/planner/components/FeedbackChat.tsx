"use client";

import { ArrowUp, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DatasetV2 } from "@/contracts/types";
import { diffPlans, ENGINE_VERSION, formatTerm, simulatePlan } from "@/engine";
import { type ChatMessage, type FeedbackResponder, requestTrackFeedback } from "../feedbackAgent";
import { SCRIPTED_DEMO_LABEL, scriptedDemoResponder } from "../feedbackDemo";
import { usePlanner } from "../PlannerApp";
import type { PlanState } from "../storage";

const SUGGESTIONS = [
  "특정 교수님의 과목은 피하고 싶어요",
  "계절학기를 활용하고 싶어요",
  "4학년 2학기는 최대한 가볍게 하고 싶어요",
  "조금 더 빨리 끝내고 싶어요",
];

type Msg = ChatMessage & { applied?: { changes: string[]; summary: string; undone?: boolean } };

/**
 * 03 다 화면 옆에 붙는 피드백 채팅. 왼쪽 로드맵을 보면서 말하면, 바뀌는 계획은 바로 반영되고
 * 로드맵이 그 자리에서 다시 그려진다. 되돌리기는 직전 한 번까지.
 * responder를 넘기면 그 함수로 응답을 받는다(개인화 담당자 연결 지점).
 */
export function FeedbackChat({
  plan,
  dataset,
  onClose,
  onUndo,
  responder,
}: {
  plan: PlanState;
  dataset: DatasetV2;
  onClose: () => void;
  onUndo: () => void;
  responder?: FeedbackResponder;
}) {
  const { setPlan, draft } = usePlanner();
  const [demo, setDemo] = useState(false);
  const respond: FeedbackResponder = responder ?? (demo ? scriptedDemoResponder : requestTrackFeedback);

  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: `${draft?.name ? `${draft.name}님, ` : ""}왼쪽 트랙을 보면서 바라는 걸 편하게 적어 주세요. 듣기 싫은 수업, 계절학기, 가볍게 다니고 싶은 학기처럼요. 바뀌는 계획은 바로 로드맵에 반영해 드릴게요.`,
    },
  ]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const thread = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);
  useEffect(() => input.current?.focus(), []);

  const send = async (msg: string) => {
    const m = msg.trim();
    if (!m || busy) return;
    const history = [...messages, { role: "user" as const, text: m }];
    setMessages(history);
    setText("");
    setBusy(true);
    try {
      const reply = await respond({ message: m, history, plan, dataset });
      const isDemo = reply.origin === "scripted_demo";
      if (reply.nextInput) {
        const before = simulatePlan(plan.input, dataset);
        const after = simulatePlan(reply.nextInput, dataset);
        const d = diffPlans(before, after).completionDeltaTerms;
        const summary =
          `예상 완료 ${formatTerm(before.expectedCompletion)} → ${formatTerm(after.expectedCompletion)}` +
          (d ? ` (${d > 0 ? `${d}학기 늦게` : `${-d}학기 빨리`})` : " (같음)");
        setPlan({
          ...plan,
          input: reply.nextInput,
          previous: { schemaVersion: 1, savedAt: new Date().toISOString(), input: plan.input, result: before, catalogVersion: before.catalogVersion, engineVersion: ENGINE_VERSION },
          previousGenEd: plan.genEd,
          lastChanges: reply.changes,
          confirmedAt: null,
        });
        setMessages((h) => [...h, { role: "assistant", text: reply.message, demo: isDemo, applied: { changes: reply.changes, summary } }]);
      } else {
        setMessages((h) => [...h, { role: "assistant", text: reply.message, demo: isDemo }]);
      }
    } finally {
      setBusy(false);
    }
  };

  const lastApplied = messages.findLastIndex((m) => m.applied);
  const canUndo = plan.previous !== null && plan.lastChanges.length > 0;

  const undo = () => {
    onUndo();
    setMessages((h) => [...h.map((m, j) => (j === lastApplied && m.applied ? { ...m, applied: { ...m.applied, undone: true } } : m)), { role: "assistant", text: "방금 바꾼 걸 되돌렸어요." }]);
  };

  return (
    <section
      aria-label="피드백 대화"
      className="sticky top-4 flex h-[calc(100dvh-140px)] max-h-[820px] min-h-[480px] flex-col rounded-[8px] border-[1.5px] border-ink bg-paper shadow-[0_12px_24px_-16px_rgba(40,30,10,0.6)] print:hidden"
    >
      <header className="flex items-center justify-between border-b border-line px-5 py-3">
        <p className="font-serif text-[16px] font-bold">
          나에게 맞게 다듬기 <span className="ml-1 font-sans text-[12px] font-normal text-muted">말하면 왼쪽 트랙이 바로 바뀌어요</span>
        </p>
        <button type="button" onClick={onClose} aria-label="채팅 닫기" className="cursor-pointer rounded p-1 text-ink-soft hover:bg-paper-2 hover:text-ink">
          <X size={18} aria-hidden />
        </button>
      </header>

      <div ref={thread} className="ruled flex-1 overflow-y-auto px-5 py-5">
        <ol className="grid gap-4">
          {messages.map((m, i) => (
            <li key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" ? (
                <div className="max-w-[88%]">
                  <p className="mb-1 font-hand text-[18px] leading-none text-pen">아맞다{m.demo ? ` · ${SCRIPTED_DEMO_LABEL}` : ""}</p>
                  <p className="rounded-[4px_14px_14px_14px] border border-line bg-paper-2 px-4 py-3 text-[14px] leading-relaxed">{m.text}</p>
                  {m.applied && (
                    <div className={`mt-2 rounded-[6px] border-l-[3px] px-3 py-2 text-[13px] ${m.applied.undone ? "border-line text-muted line-through" : "border-pen bg-pen/[0.05]"}`}>
                      <p className="font-semibold">로드맵에 반영했어요</p>
                      {m.applied.changes.map((c) => (
                        <p key={c}>· {c}</p>
                      ))}
                      <p className="text-ink-soft">{m.applied.summary}</p>
                      {i === lastApplied && canUndo && !m.applied.undone && (
                        <button type="button" onClick={undo} className="mt-1.5 inline-flex cursor-pointer items-center gap-1 text-[12px] font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline">
                          <Undo2 size={13} aria-hidden /> 되돌리기
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="max-w-[88%] rounded-[14px_4px_14px_14px] bg-ink px-4 py-3 text-[14px] leading-relaxed text-paper">{m.text}</p>
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

      <div className="border-t border-line px-4 pt-3 pb-4">
        {!responder && (
          <label className="mb-2 flex w-fit cursor-pointer items-center gap-2 text-[12px] text-ink-soft">
            <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
            {SCRIPTED_DEMO_LABEL} 사용 — 정해진 문장에만 반응해요
          </label>
        )}
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setText(s);
                input.current?.focus();
              }}
              className="cursor-pointer rounded-full border border-line bg-paper-2/70 px-2.5 py-0.5 text-[12px] text-ink-soft hover:border-ink/40 hover:text-ink"
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
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(text);
              }
            }}
            rows={2}
            placeholder="예) 계절학기 듣고 싶어요 · 4학년은 가볍게"
            aria-label="피드백 입력"
            className="min-h-[52px] flex-1 resize-none !border-ink/40 !bg-paper text-[14px]"
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
  );
}
