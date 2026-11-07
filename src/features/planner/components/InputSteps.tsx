"use client";

import { ArrowLeft, ArrowRight, BookOpen, Check, ClipboardPaste } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { Dataset, PriorityKey, Season } from "@/contracts/types";
import { usePlanner } from "../PlannerApp";
import { findCoursesInText } from "../parseTranscript";
import { blankDraft, type Draft, draftProblem, MIN_ANSWERS, stepProblem } from "../plan";
import { completedTermsLabel, curriculumCovers } from "../profile";
import { answeredCount, QUIZ } from "../recommend";
import { INPUT_STEPS, type StepId } from "../inputSteps";
import { Button, Choice, Field, Hand } from "./ui";



/** 01 아 — 질문 한 묶음씩 여러 페이지로 나눠 받는다. 입력은 바로 이 브라우저에 저장된다. */
export function InputStep({ step }: { step: StepId }) {
  const { mounted, today, draft, setDraft, dataset } = usePlanner();

  useEffect(() => {
    if (mounted && today && !draft) setDraft(blankDraft(today));
  }, [mounted, today, draft, setDraft]);

  if (!mounted || !draft) return <div className="h-96 animate-pulse rounded bg-paper-2" aria-busy="true" />;
  return <StepFrame step={step} draft={draft} dataset={dataset} />;
}

function StepFrame({ step, draft, dataset }: { step: StepId; draft: Draft; dataset: Dataset | null }) {
  const router = useRouter();
  const [tried, setTried] = useState(false);
  const i = INPUT_STEPS.findIndex((s) => s.id === step);
  const cur = INPUT_STEPS[i];
  const prev = INPUT_STEPS[i - 1];
  const next = INPUT_STEPS[i + 1];
  const problem = next ? stepProblem(step, draft) : draftProblem(draft, dataset);

  const go = () => {
    setTried(true);
    if (problem) return;
    router.push(next ? next.path : "/match");
  };

  return (
    <div className="grid grid-cols-[230px_minmax(0,1fr)] gap-14">
      {/* 왼쪽: 질문 목차 */}
      <nav aria-label="입력 단계" className="border-r border-line pr-8">
        <p className="font-hand text-[22px] leading-none text-pen">01 · 아</p>
        <p className="mt-1 font-serif text-[20px] font-bold">내 정보</p>
        <ol className="mt-6 grid gap-1">
          {INPUT_STEPS.map((s, n) => {
            const done = n < i || (n !== i && !stepProblem(s.id, draft) && stepTouched(s.id, draft));
            return (
              <li key={s.id}>
                <Link
                  href={s.path}
                  aria-current={s.id === step ? "step" : undefined}
                  className={`flex items-center gap-3 rounded-[6px] px-2.5 py-2 text-[14px] ${
                    s.id === step ? "bg-paper-2 font-semibold text-ink" : "text-ink-soft hover:bg-paper-2/60"
                  }`}
                >
                  <span
                    className={`grid size-[22px] place-items-center rounded-full border text-[11px] tabular-nums ${
                      done ? "border-pen bg-pen text-paper" : s.id === step ? "border-ink" : "border-ink/30"
                    }`}
                  >
                    {done ? <Check size={12} strokeWidth={3} aria-hidden /> : n + 1}
                  </span>
                  {s.title}
                </Link>
              </li>
            );
          })}
        </ol>
        <Hand className="mt-8 block text-[18px]">적는 대로 바로 저장돼요. 언제든 돌아와서 고칠 수 있어요.</Hand>
      </nav>

      {/* 오른쪽: 질문 */}
      <section className="max-w-[880px]">
        <p className="font-serif text-[14px] text-muted tabular-nums">
          질문 {i + 1} / {INPUT_STEPS.length}
        </p>
        <h1 className="mt-1 mb-8 font-serif text-[34px] leading-tight font-bold tracking-tight">{cur.q}</h1>

        {step === "basic" && <Basic dataset={dataset} />}
        {step === "record" && <Record dataset={dataset} />}
        {step === "interest" && <Interest />}
        {step === "military" && <Military />}
        {step === "exchange" && <Exchange />}
        {step === "goals" && <Goals />}

        {tried && problem && (
          <p role="alert" className="mt-8 border-l-[3px] border-red pl-3 text-[13px] text-red">
            {problem}
          </p>
        )}
        <div className="mt-10 flex items-center justify-between border-t border-line pt-6">
          {prev ? (
            <Link href={prev.path} className="inline-flex items-center gap-2 text-[14px] text-ink-soft hover:text-ink">
              <ArrowLeft size={15} aria-hidden /> {prev.title}
            </Link>
          ) : (
            <span />
          )}
          <Button kind="ink" onClick={go} className="px-6">
            {next ? (
              <>
                다음 · {next.title} <ArrowRight size={16} aria-hidden />
              </>
            ) : (
              <>
                내 트랙 보러 가기 <ArrowRight size={16} aria-hidden />
              </>
            )}
          </Button>
        </div>
      </section>
    </div>
  );
}

/** 목차 체크 표시용: 이 단계에서 뭔가 적었는지 */
function stepTouched(step: StepId, d: Draft): boolean {
  switch (step) {
    case "basic":
      return d.name !== "" || d.admissionYear !== null;
    case "record":
      return d.completedTerms > 0 || d.earnedCredits > 0 || d.completedCourseCodes.length > 0;
    case "interest":
      return answeredCount(d.answers) >= MIN_ANSWERS;
    case "military":
      return d.military.mode !== "none";
    case "exchange":
      return d.exchange.mode !== "none";
    case "goals":
      return d.targetCredits !== null;
  }
}

function useDraft() {
  const { draft, updateDraft } = usePlanner();
  const set = (patch: Partial<Draft>) => updateDraft((d) => ({ ...d, ...patch }));
  return { d: draft!, set, updateDraft };
}

const num = (v: string) => (v === "" ? 0 : Number(v));

function Basic({ dataset }: { dataset: Dataset | null }) {
  const { d, set } = useDraft();
  const { today } = usePlanner();
  const thisYear = Number(today.slice(0, 4));
  const years = Array.from({ length: 8 }, (_, i) => thisYear - i);
  const covers = dataset ? curriculumCovers(dataset.curriculum, d.admissionYear) : null;
  return (
    <div className="grid gap-9">
      <div className="grid grid-cols-2 gap-10">
        <Field label="이름 또는 닉네임 (선택)">
          <input value={d.name} maxLength={20} placeholder="트랙 이름에만 쓰여요" onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="입학연도">
          <select value={d.admissionYear ?? ""} onChange={(e) => set({ admissionYear: e.target.value === "" ? null : Number(e.target.value) })}>
            <option value="">선택 안 함</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}년 ({String(y).slice(2)}학번)
              </option>
            ))}
          </select>
        </Field>
      </div>
      {covers === false && dataset && (
        <p className="-mt-5 text-[12px] text-red">
          지금 자료는 {dataset.curriculum} 교육과정이에요. {d.admissionYear}년 입학생 교육과정은 학사안내에서 확인해 주세요.
        </p>
      )}
      <div className="grid grid-cols-2 gap-10">
        <Field label="몇 년도부터 계획할까요?">
          <input type="number" min={2024} max={2040} value={d.startTerm.year} onChange={(e) => set({ startTerm: { ...d.startTerm, year: num(e.target.value) } })} />
        </Field>
        <Field label="몇 학기부터?">
          <select value={d.startTerm.season} onChange={(e) => set({ startTerm: { ...d.startTerm, season: Number(e.target.value) as Season } })}>
            <option value={1}>1학기</option>
            <option value={2}>2학기</option>
          </select>
        </Field>
      </div>
    </div>
  );
}

function Record({ dataset }: { dataset: Dataset | null }) {
  const { d, set, updateDraft } = useDraft();
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const courses = dataset ? [...dataset.courses].sort((a, b) => (a.recommendedYear ?? 9) - (b.recommendedYear ?? 9)) : [];
  const toggle = (code: string) =>
    updateDraft((x) => ({
      ...x,
      completedCourseCodes: x.completedCourseCodes.includes(code) ? x.completedCourseCodes.filter((c) => c !== code) : [...x.completedCourseCodes, code],
    }));
  const applyPaste = () => {
    const found = findCoursesInText(paste, courses);
    updateDraft((x) => ({ ...x, completedCourseCodes: [...new Set([...x.completedCourseCodes, ...found])] }));
    setMsg(found.length === 0 ? "학과 과목을 찾지 못했어요. 학수번호나 과목명이 들어가게 복사해 주세요." : `과목 ${found.length}개를 찾아 체크했어요.`);
  };
  return (
    <div className="grid gap-8">
      <div className="grid grid-cols-3 gap-10">
        <Field label="마친 학기 (휴학 학기는 빼고)">
          <select value={d.completedTerms} onChange={(e) => set({ completedTerms: Number(e.target.value) })}>
            {Array.from({ length: 9 }, (_, i) => (
              <option key={i} value={i}>
                {completedTermsLabel(i)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="총 이수학점">
          <input type="number" min={0} max={250} value={d.earnedCredits} onChange={(e) => set({ earnedCredits: num(e.target.value) })} />
        </Field>
        <Field label="그중 전공학점">
          <input type="number" min={0} max={250} value={d.earnedMajorCredits} onChange={(e) => set({ earnedMajorCredits: num(e.target.value) })} />
        </Field>
      </div>

      {courses.length > 0 && (
        <div className="rounded-[6px] border border-line bg-paper/80 p-5">
          <p className="flex items-center gap-2 text-[14px] font-semibold">
            <ClipboardPaste size={15} aria-hidden /> 성적표 붙여넣기로 들은 과목 채우기
          </p>
          <p className="mt-0.5 mb-3 text-[12px] text-muted">한양인 성적 조회 표를 복사해 붙여넣으면 학과 과목만 골라 체크해요. 성적은 읽지 않아요.</p>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={3}
            placeholder={"예)  CSE1002  전산학개론  3  A+\n      ITE1012  정보시스템개론  3  A0"}
            className="w-full resize-y"
            aria-label="성적표 붙여넣기"
          />
          <div className="mt-2 flex items-center gap-3">
            <Button onClick={applyPaste} disabled={!paste.trim()} className="min-h-[34px] px-3 text-[13px]">
              과목 찾기
            </Button>
            {msg && (
              <span role="status" className="text-[12px] text-ink-soft">
                {msg}
              </span>
            )}
          </div>
          <details className="mt-4 border-t border-dashed border-line pt-3" open={d.completedCourseCodes.length > 0}>
            <summary className="cursor-pointer text-[13px] text-pen">직접 체크하기 · {d.completedCourseCodes.length}과목 체크됨</summary>
            <div className="mt-2 grid grid-cols-3 gap-x-4">
              {courses.map((c) => (
                <label key={c.code} className="flex items-center gap-2 border-b border-rule py-1.5 text-[13px]">
                  <input type="checkbox" checked={d.completedCourseCodes.includes(c.code)} onChange={() => toggle(c.code)} />
                  <span className="min-w-0 truncate">{c.name}</span>
                  <span className="ml-auto text-[11px] text-muted tabular-nums">{c.recommendedYear ? `${c.recommendedYear}학년` : ""}</span>
                </label>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function Interest() {
  const { d, updateDraft } = useDraft();
  return (
    <div>
      <Hand className="mb-6 block">정답은 없어요. {MIN_ANSWERS}개 이상 답하면 그걸로 진로를 추천하고, 트랙을 만들어요.</Hand>
      <ol className="grid gap-7">
        {QUIZ.map((q, i) => (
          <li key={q.id}>
            <p className="mb-2.5 flex items-baseline gap-2 text-[16px] font-semibold">
              <span className="font-hand text-[22px] font-normal text-pen">Q{i + 1}.</span>
              {q.prompt}
            </p>
            <div role="radiogroup" aria-label={q.prompt} className="flex flex-wrap gap-2">
              {q.options.map((o) => (
                <Choice key={o.id} selected={d.answers[q.id] === o.id} onClick={() => updateDraft((x) => ({ ...x, answers: { ...x.answers, [q.id]: o.id } }))}>
                  {o.label}
                </Choice>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

const SERVICE: Array<[number, string]> = [
  [18, "18개월 · 육군·해병대"],
  [20, "20개월 · 해군"],
  [21, "21개월 · 공군·사회복무요원"],
];

function Military() {
  const { d, updateDraft } = useDraft();
  const setMil = (patch: Partial<Draft["military"]>) => updateDraft((x) => ({ ...x, military: { ...x.military, ...patch } }));
  return (
    <div className="grid gap-8">
      <InfoLink href="/info/military" title="군대 정보 자세히 알아보기" desc="복무 형태별 기간, 입대 시기 고르는 법, 휴학·복학 흐름을 정리했어요." />
      <div role="radiogroup" aria-label="군 복무 계획" className="grid grid-cols-3 gap-2">
        <Choice selected={d.military.mode === "recommend"} onClick={() => setMil({ mode: "recommend", startDate: null })}>
          <b className="font-semibold">다녀와야 해요</b>
          <span className="block text-[12px] text-muted">언제 갈지는 트랙으로 추천받을래요</span>
        </Choice>
        <Choice selected={d.military.mode === "fixed"} onClick={() => setMil({ mode: "fixed" })}>
          <b className="font-semibold">입영일이 정해졌어요</b>
          <span className="block text-[12px] text-muted">날짜를 직접 적을게요</span>
        </Choice>
        <Choice selected={d.military.mode === "none"} onClick={() => setMil({ mode: "none", months: null, startDate: null })}>
          <b className="font-semibold">해당 없어요</b>
          <span className="block text-[12px] text-muted">마쳤거나 면제 등</span>
        </Choice>
      </div>
      {d.military.mode !== "none" && (
        <div className="grid grid-cols-2 gap-10">
          <Field label="어떤 형태로 다녀올 생각인가요?" hint="기간은 병무청에서 꼭 확인하세요. 고른 값은 계획용 가정으로만 써요.">
            <select value={d.military.months ?? ""} onChange={(e) => setMil({ months: e.target.value === "" ? null : Number(e.target.value) })}>
              <option value="">골라 주세요</option>
              {SERVICE.map(([m, label]) => (
                <option key={m} value={m}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {d.military.mode === "fixed" ? (
            <Field label="입영일">
              <input type="date" value={d.military.startDate ?? ""} onChange={(e) => setMil({ startDate: e.target.value || null })} />
            </Field>
          ) : (
            <p className="self-end pb-1">
              <Hand>학년을 마친 시점마다 트랙을 따로 만들어 비교해 드릴게요.</Hand>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const EXCHANGE_TERMS: Array<[number, string]> = [
  [3, "2학년 2학기"],
  [4, "3학년 1학기"],
  [5, "3학년 2학기"],
  [6, "4학년 1학기"],
];

function Exchange() {
  const { d, updateDraft } = useDraft();
  const setEx = (patch: Partial<Draft["exchange"]>) => updateDraft((x) => ({ ...x, exchange: { ...x.exchange, ...patch } }));
  return (
    <div className="grid gap-8">
      <InfoLink href="/info/exchange" title="교환학생 정보 자세히 알아보기" desc="교환학생이 뭔지, 언제 준비하는지, 학점 인정은 어떻게 하는지 정리했어요." />
      <div role="radiogroup" aria-label="교환학생 계획" className="grid grid-cols-3 gap-2">
        <Choice selected={d.exchange.mode === "recommend"} onClick={() => setEx({ mode: "recommend", ordinal: null })}>
          <b className="font-semibold">관심 있어요</b>
          <span className="block text-[12px] text-muted">언제 갈지는 트랙으로 추천받을래요</span>
        </Choice>
        <Choice selected={d.exchange.mode === "pick"} onClick={() => setEx({ mode: "pick" })}>
          <b className="font-semibold">가고 싶은 학기가 있어요</b>
          <span className="block text-[12px] text-muted">학년·학기를 고를게요</span>
        </Choice>
        <Choice selected={d.exchange.mode === "none"} onClick={() => setEx({ mode: "none", ordinal: null })}>
          <b className="font-semibold">생각 없어요</b>
          <span className="block text-[12px] text-muted">국내에서만 다닐래요</span>
        </Choice>
      </div>
      {d.exchange.mode === "pick" && (
        <div role="radiogroup" aria-label="교환 학기" className="flex flex-wrap gap-2">
          {EXCHANGE_TERMS.map(([ord, label]) => (
            <Choice key={ord} selected={d.exchange.ordinal === ord} onClick={() => setEx({ ordinal: ord })}>
              {label}
            </Choice>
          ))}
        </div>
      )}
      {d.exchange.mode !== "none" && (
        <p className="text-[12px] text-muted">
          교환 학기는 군 복무와 겹치지 않게 넣어요. 인정 학점은 학교 승인 전이라 정해지지 않은 것으로 두고, 그 뒤 완료 시점은 “확인 필요”로 보여 드려요.
        </p>
      )}
    </div>
  );
}

const PRIORITIES: Array<[PriorityKey, string, string]> = [
  ["fast_completion", "빨리 끝내기", "졸업까지 걸리는 학기가 적은 트랙"],
  ["career_core", "진로 과목 먼저", "진로 핵심 과목을 일찍 듣는 트랙"],
  ["light_terms", "여유 있는 학기", "한 학기에 듣는 학점이 적은 트랙"],
];

function Goals() {
  const { d, set } = useDraft();
  return (
    <div className="grid gap-9">
      <div>
        <p className="mb-2.5 text-[13px] font-medium text-muted">트랙 순위를 매길 때 가장 먼저 볼 것</p>
        <div role="radiogroup" aria-label="가장 중요한 것" className="grid grid-cols-3 gap-2">
          {PRIORITIES.map(([key, label, desc]) => (
            <Choice key={key} selected={d.priority === key} onClick={() => set({ priority: key })}>
              <b className="font-semibold">{label}</b>
              <span className="block text-[12px] text-muted">{desc}</span>
            </Choice>
          ))}
        </div>
      </div>
      <div className="max-w-[320px]">
        <Field label="목표 총학점 (선택)" hint="졸업사정 조회에서 확인한 값. 비우면 완료 학기를 계산하지 않아요.">
          <input
            type="number"
            min={1}
            max={250}
            placeholder="모르면 비워 두기"
            value={d.targetCredits ?? ""}
            onChange={(e) => set({ targetCredits: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </Field>
      </div>
    </div>
  );
}

function InfoLink({ href, title, desc }: { href: string; title: string; desc: string }): ReactNode {
  return (
    <Link href={href} className="group flex items-center gap-4 rounded-[6px] border-[1.5px] border-dashed border-pen/50 bg-pen/[0.04] px-5 py-4 hover:border-pen">
      <BookOpen size={22} className="shrink-0 text-pen" aria-hidden />
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-pen">{title}</span>
        <span className="block text-[12px] text-ink-soft">{desc}</span>
      </span>
      <ArrowRight size={18} className="ml-auto shrink-0 text-pen transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}
