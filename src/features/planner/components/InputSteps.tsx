"use client";

import { ArrowLeft, ArrowRight, BookOpen, Check, ClipboardPaste, CornerDownLeft, PencilLine } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CAREER_LABEL, CAREER_TRACKS } from "@/contracts/careers";
import type { CareerTrack, DatasetV2, ExchangePriority, PriorityKey, Term } from "@/contracts/types";
import { formatTerm, GOAL_LABEL, LATE_LIGHT_CONFIG, paceBandsFor } from "@/engine";
import { usePlanner } from "../PlannerApp";
import { parseGraduationCheck, type GraduationCheckParse } from "../graduationCheck";
import { INPUT_STEPS, type StepId, stepPath } from "../inputSteps";
import { blankDraft, type Draft, draftProblem, needsMilitary } from "../plan";
import { exPrefsOf, type ExchangePrefs, PRIORITY_LABEL } from "../exchangePrefs";
import { type MilitaryPrefs, parseMilitarySentence, prefsOf, type SentenceParse } from "../militaryPrefs";
import { completedTermsLabel, curriculumCovers } from "../profile";
import { stepAnswered, stepProblem, visibleSteps } from "../questions";
import { QUIZ } from "../recommend";
import { SAMPLE_GRADUATION_CHECK } from "../testProfiles";
import { TranscriptImport } from "./TranscriptImport";
import { Button, Choice, Tag } from "./ui";

/** 01 아 — 한 화면에 질문 하나. 입력은 바로 이 브라우저에 저장된다. */
export function InputStep({ step }: { step: StepId }) {
  const { mounted, today, draft, setDraft, dataset } = usePlanner();

  useEffect(() => {
    if (mounted && today && !draft) setDraft(blankDraft(today));
  }, [mounted, today, draft, setDraft]);

  if (!mounted || !draft) return <div className="h-96 animate-pulse rounded bg-paper-2" aria-busy="true" />;
  return <StepFrame key={step} step={step} draft={draft} dataset={dataset} />;
}

/** 단일 선택 질문: 고르면 짧게 표시한 뒤 다음 질문으로 넘어간다 */
const AUTO_ADVANCE: StepId[] = ["admission", "completed", "start", "career", "pace", "military-branch", "katusa", "priority"];
const ADVANCE_MS = 220;

interface StepCtx {
  d: Draft;
  set: (patch: Partial<Draft>) => void;
  update: (fn: (d: Draft) => Draft) => void;
  dataset: DatasetV2 | null;
  today: string;
  /** 단일 선택 후 자동 진행 */
  picked: () => void;
  /** 숫자키로 고를 선택지 등록 */
  registerKeys: (handlers: Array<() => void>) => void;
}

function StepFrame({ step, draft, dataset }: { step: StepId; draft: Draft; dataset: DatasetV2 | null }) {
  const router = useRouter();
  const { updateDraft, today } = usePlanner();
  const [tried, setTried] = useState(false);
  const [flash, setFlash] = useState(false);
  const keys = useRef<Array<() => void>>([]);
  const steps = visibleSteps(draft);
  const pos = Math.max(0, steps.indexOf(step));
  const prev = steps[pos - 1];
  const next = steps[pos + 1];
  const cur = INPUT_STEPS.find((s) => s.id === step)!;
  const isReview = step === "review";
  const problem = isReview ? null : stepProblem(step, draft);
  const finalProblem = isReview ? draftProblem(draft, dataset, today) : null;

  const go = useCallback(() => {
    setTried(true);
    if (problem) return;
    if (isReview) {
      if (finalProblem) return;
      router.push("/match");
      return;
    }
    if (next) router.push(stepPath(next));
  }, [problem, isReview, finalProblem, next, router]);

  const goRef = useRef(go);
  goRef.current = go;
  const picked = useCallback(() => {
    if (!AUTO_ADVANCE.includes(step)) return;
    setFlash(true);
    window.setTimeout(() => goRef.current(), ADVANCE_MS);
  }, [step]);

  // 키보드: Enter = 다음, 숫자키 = 선택지 고르기(입력칸에 쓰는 중이면 무시)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && (el as HTMLInputElement).type !== "checkbox");
      if (e.key === "Enter" && !e.isComposing && el.tagName !== "TEXTAREA" && el.tagName !== "BUTTON" && el.tagName !== "A") {
        e.preventDefault();
        goRef.current();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= keys.current.length) {
        e.preventDefault();
        keys.current[n - 1]();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ctx: StepCtx = {
    d: draft,
    set: (patch) => updateDraft((x) => ({ ...x, ...patch })),
    update: updateDraft,
    dataset,
    today,
    picked,
    registerKeys: (h) => {
      keys.current = h;
    },
  };

  const answered = steps.filter((s) => s !== "review" && stepAnswered(s, draft)).length;
  const percent = Math.round(((pos + (flash ? 1 : 0)) / Math.max(1, steps.length - 1)) * 100);

  return (
    <div className="flex min-h-[calc(100dvh-210px)] flex-col">
      {/* 진행률 */}
      <div className="flex items-center gap-4">
        <p className="font-hand text-[22px] leading-none text-pen">01 · 아 — 내 정보</p>
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-paper-2"
          role="progressbar"
          aria-valuenow={pos + 1}
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-label="질문 진행률"
        >
          <div className="h-full rounded-full bg-pen transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${percent}%` }} />
        </div>
        <p className="font-serif text-[15px] text-ink-soft tabular-nums">
          {pos + 1} / {steps.length}
        </p>
      </div>
      {draft.demo && (
        <p className="mt-2 text-[12px] text-muted">
          <Tag tone="marker">테스트 정보</Tag> {draft.demo.label} — 모든 값은 가상 데이터예요.
        </p>
      )}

      <section key={step} className="step-in flex flex-1 flex-col pt-10" aria-labelledby="q-title">
        <p className="text-[14px] text-muted">{cur.title}</p>
        <h1 id="q-title" className="mt-1 max-w-[980px] font-serif text-[44px] leading-[1.2] font-bold tracking-tight">
          {cur.q}
        </h1>
        <div className="mt-10 max-w-[1080px] flex-1">
          <StepBody step={step} ctx={ctx} />
        </div>

        {tried && (problem || finalProblem) && (
          <p role="alert" className="mt-6 border-l-[3px] border-red pl-3 text-[15px] text-red">
            {problem ?? finalProblem?.message}
            {finalProblem?.step && finalProblem.step !== "review" && (
              <Link href={stepPath(finalProblem.step)} className="ml-3 font-semibold underline underline-offset-4">
                그 질문으로 가기
              </Link>
            )}
          </p>
        )}

        <div className="mt-10 flex items-center justify-between border-t border-line pt-6">
          {prev ? (
            <Link href={stepPath(prev)} className="inline-flex min-h-[48px] items-center gap-2 rounded-[6px] px-3 text-[16px] text-ink-soft hover:bg-paper-2 hover:text-ink">
              <ArrowLeft size={18} aria-hidden /> 이전
            </Link>
          ) : (
            <Link href="/" className="inline-flex min-h-[48px] items-center gap-2 rounded-[6px] px-3 text-[16px] text-ink-soft hover:bg-paper-2 hover:text-ink">
              <ArrowLeft size={18} aria-hidden /> 표지
            </Link>
          )}
          <p className="hidden items-center gap-1.5 text-[12px] text-muted lg:flex">
            <CornerDownLeft size={13} aria-hidden /> Enter로 다음 · 숫자키로 선택 · 답한 질문 {answered}개
          </p>
          <Button kind="ink" onClick={go} className="min-h-[56px] px-8 text-[17px]">
            {isReview ? "내 트랙 보러 가기" : flash ? "좋아요!" : "다음"} <ArrowRight size={18} aria-hidden />
          </Button>
        </div>
      </section>
    </div>
  );
}

function StepBody({ step, ctx }: { step: StepId; ctx: StepCtx }) {
  switch (step) {
    case "name":
      return <NameStep ctx={ctx} />;
    case "admission":
      return <AdmissionStep ctx={ctx} />;
    case "completed":
      return <CompletedStep ctx={ctx} />;
    case "start":
      return <StartStep ctx={ctx} />;
    case "transcript":
      return <TranscriptStep ctx={ctx} />;
    case "credits":
      return <NumberStep ctx={ctx} field="earnedCredits" unit="학점" hint="성적표의 ‘취득학점’ 합계예요. 신입생이면 0을 적어 주세요." />;
    case "major":
      return <NumberStep ctx={ctx} field="earnedMajorCredits" unit="학점" hint="총 이수학점 안에 포함된 전공 학점이에요(총학점에 더하지 않아요)." />;
    case "courses":
      return <CoursesStep ctx={ctx} />;
    case "target":
      return <TargetStep ctx={ctx} />;
    case "career":
      return <CareerStep ctx={ctx} />;
    case "quiz":
      return <QuizStep ctx={ctx} />;
    case "pace":
      return <PaceStep ctx={ctx} />;
    case "late":
      return <LateStep ctx={ctx} />;
    case "military":
      return <MilitaryStep ctx={ctx} />;
    case "military-branch":
      return <MilitaryBranchStep ctx={ctx} />;
    case "military-goal":
      return <MilitaryGoalStep ctx={ctx} />;
    case "katusa":
      return <KatusaStep ctx={ctx} />;
    case "katusa-evidence":
      return <KatusaEvidenceStep ctx={ctx} />;
    case "leave":
      return <LeaveStep ctx={ctx} />;
    case "exchange":
      return <ExchangeStep ctx={ctx} />;
    case "exchange-when":
      return <ExchangeWhenStep ctx={ctx} />;
    case "exchange-length":
      return <ExchangeLengthStep ctx={ctx} />;
    case "exchange-goal":
      return <ExchangeGoalStep ctx={ctx} />;
    case "exchange-language":
      return <ExchangeLanguageStep ctx={ctx} />;
    case "exchange-life":
      return <ExchangeLifeStep ctx={ctx} />;
    case "priority":
      return <PriorityStep ctx={ctx} />;
    case "review":
      return <ReviewStep ctx={ctx} />;
  }
}

// ── 공통 부품 ────────────────────────────────────────────

interface Opt<T> {
  value: T;
  label: ReactNode;
  desc?: ReactNode;
}

/** 큰 선택 버튼 묶음. 숫자키 1~9로도 고른다. */
function BigChoices<T>({
  ctx,
  options,
  selected,
  onPick,
  cols = 3,
  label,
  autoAdvance = true,
}: {
  ctx: StepCtx;
  options: Opt<T>[];
  selected: (v: T) => boolean;
  onPick: (v: T) => void;
  cols?: 2 | 3 | 4;
  label: string;
  autoAdvance?: boolean;
}) {
  const pick = (v: T) => {
    onPick(v);
    if (autoAdvance) ctx.picked();
  };
  useEffect(() => {
    ctx.registerKeys(options.map((o) => () => pick(o.value)));
  });
  const grid = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" }[cols];
  return (
    <div role="radiogroup" aria-label={label} className={`grid ${grid} gap-3`}>
      {options.map((o, i) => (
        <BigChoice key={i} n={i + 1} selected={selected(o.value)} onClick={() => pick(o.value)}>
          <span className="block text-[18px] font-semibold text-ink">{o.label}</span>
          {o.desc && <span className="mt-0.5 block text-[13px] text-ink-soft">{o.desc}</span>}
        </BigChoice>
      ))}
    </div>
  );
}

function BigChoice({ n, selected, onClick, children, role = "radio" }: { n?: number; selected: boolean; onClick: () => void; children: ReactNode; role?: "radio" | "checkbox" }) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      onClick={onClick}
      className={`relative flex min-h-[80px] cursor-pointer items-center gap-4 rounded-[10px] border-2 px-5 py-4 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.99] motion-reduce:transition-none ${
        selected ? "border-pen bg-pen/[0.08] shadow-[0_0_0_3px_rgba(45,74,133,0.12)]" : "border-line bg-paper hover:border-ink/40"
      }`}
    >
      {n !== undefined && (
        <span
          aria-hidden
          className={`grid size-8 shrink-0 place-items-center rounded-[6px] border font-serif text-[15px] font-bold tabular-nums ${
            selected ? "border-pen bg-pen text-paper" : "border-ink/25 text-ink-soft"
          }`}
        >
          {selected ? <Check size={16} strokeWidth={3} /> : n}
        </span>
      )}
      <span className="min-w-0">{children}</span>
    </button>
  );
}

function BigNumber({ value, onChange, unit, label, min = 0, max = 250 }: { value: number | null; onChange: (v: number | null) => void; unit: string; label: string; min?: number; max?: number }) {
  return (
    <label className="inline-flex items-baseline gap-3 border-b-[3px] border-ink pb-1">
      <span className="sr-only">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        autoFocus
        value={value ?? ""}
        placeholder="0"
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="!w-[200px] !border-0 !bg-transparent !p-0 font-serif !text-[64px] font-bold tabular-nums !shadow-none"
      />
      <span className="font-serif text-[28px] text-ink-soft">{unit}</span>
    </label>
  );
}

function Help({ children }: { children: ReactNode }) {
  return <p className="mt-6 max-w-[760px] text-[15px] leading-relaxed text-ink-soft">{children}</p>;
}

function InfoLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} className="group mt-8 flex max-w-[760px] items-center gap-4 rounded-[10px] border-[1.5px] border-dashed border-pen/50 bg-pen/[0.04] px-5 py-4 hover:border-pen">
      <BookOpen size={22} className="shrink-0 text-pen" aria-hidden />
      <span className="min-w-0">
        <span className="block text-[16px] font-semibold text-pen">{title}</span>
        <span className="block text-[13px] text-ink-soft">{desc}</span>
      </span>
      <ArrowRight size={18} className="ml-auto shrink-0 text-pen transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
    </Link>
  );
}

// ── 질문별 화면 ──────────────────────────────────────────

function NameStep({ ctx }: { ctx: StepCtx }) {
  return (
    <div>
      <input
        autoFocus
        value={ctx.d.name}
        maxLength={20}
        placeholder="이름 또는 닉네임"
        aria-label="이름 또는 닉네임"
        onChange={(e) => ctx.set({ name: e.target.value })}
        className="!w-[520px] !border-0 !border-b-[3px] !border-ink !bg-transparent !px-0 font-serif !text-[40px] font-bold"
      />
      <Help>화면 인사말에만 쓰고 계산에는 쓰지 않아요. 비워 두고 넘어가도 돼요.</Help>
    </div>
  );
}

function AdmissionStep({ ctx }: { ctx: StepCtx }) {
  const thisYear = Number((ctx.today || "2026").slice(0, 4));
  const years = Array.from({ length: 7 }, (_, i) => thisYear - i);
  const covers = ctx.dataset ? curriculumCovers(ctx.dataset.curriculum, ctx.d.admissionYear) : null;
  return (
    <div>
      <BigChoices
        ctx={ctx}
        label="입학연도"
        cols={4}
        options={[...years.map((y) => ({ value: y as number | null, label: `${y}년`, desc: `${String(y).slice(2)}학번` })), { value: null, label: "말하지 않을래요", desc: "학교 상한 적용·교육과정 범위를 확인 필요로 둬요" }]}
        selected={(v) => v !== null && ctx.d.admissionYear === v}
        onPick={(v) => ctx.set({ admissionYear: v })}
      />
      {covers === false && ctx.dataset && (
        <p className="mt-5 text-[15px] text-red">
          자료 범위 확인 필요 — 지금 과목 자료는 {ctx.dataset.curriculum} 교육과정이에요. {ctx.d.admissionYear}년 입학생에게 공식 적용된다고 볼 수 없어요.
        </p>
      )}
    </div>
  );
}

function CompletedStep({ ctx }: { ctx: StepCtx }) {
  return (
    <div>
      <BigChoices
        ctx={ctx}
        label="마친 학기"
        cols={3}
        options={Array.from({ length: 9 }, (_, i) => ({ value: i, label: completedTermsLabel(i), desc: `유효학기 ${i}개` }))}
        selected={(v) => ctx.d.completedTerms === v}
        onPick={(v) => ctx.set({ completedTerms: v })}
      />
      <Help>휴학이나 군 복무로 쉰 학기는 빼고, 실제로 다닌 학기만 세어 주세요. 입학 후 지난 해 수로 학년을 짐작하지 않아요.</Help>
    </div>
  );
}

function StartStep({ ctx }: { ctx: StepCtx }) {
  const y = Number((ctx.today || "2026").slice(0, 4));
  const terms: Term[] = [y, y + 1, y + 2].flatMap((year) => [1, 2].map((season) => ({ year, season: season as 1 | 2 })));
  const past = (t: Term) => !!ctx.today && (t.season === 1 ? `${t.year}-07-01` : `${t.year + 1}-01-01`) <= ctx.today;
  return (
    <div>
      <BigChoices
        ctx={ctx}
        label="계획 시작 학기"
        cols={3}
        options={terms.filter((t) => !past(t)).map((t) => ({ value: t, label: formatTerm(t), desc: t.season === 1 ? "3월 – 6월" : "9월 – 12월" }))}
        selected={(t) => ctx.d.startTerm?.year === t.year && ctx.d.startTerm?.season === t.season}
        onPick={(t) => ctx.set({ startTerm: t })}
      />
      <Help>
        이 학기부터 로드맵을 배치해요. 마친 학기가 {ctx.d.completedTerms ?? "?"}개이면 {ctx.d.completedTerms !== null ? `${ctx.d.completedTerms + 1}번째` : "다음"} 유효학기부터 이어져요. 이미 지난 학기는 고를 수 없어요.
      </Help>
    </div>
  );
}

function NumberStep({ ctx, field, unit, hint }: { ctx: StepCtx; field: "earnedCredits" | "earnedMajorCredits"; unit: string; hint: string }) {
  return (
    <div>
      <BigNumber value={ctx.d[field]} onChange={(v) => ctx.set({ [field]: v } as Partial<Draft>)} unit={unit} label={unit} />
      <Help>{hint}</Help>
      {field === "earnedMajorCredits" && ctx.d.earnedCredits !== null && (
        <p className="mt-2 text-[14px] text-muted">총 이수학점: {ctx.d.earnedCredits}학점</p>
      )}
    </div>
  );
}

function TranscriptStep({ ctx }: { ctx: StepCtx }) {
  const router = useRouter();
  return (
    <TranscriptImport
      draft={ctx.d}
      update={ctx.update}
      dataset={ctx.dataset}
      onManual={() => {
        ctx.set({ progressMode: "manual" });
        router.push(stepPath("credits"));
      }}
    />
  );
}

function CoursesStep({ ctx }: { ctx: StepCtx }) {
  const { d, update } = ctx;
  const courses = ctx.dataset ? [...ctx.dataset.courses].sort((a, b) => (a.recommendedYear ?? 9) - (b.recommendedYear ?? 9)) : [];
  const toggle = (code: string) =>
    update((x) => ({
      ...x,
      coursesConfirmed: true,
      completedCourseCodes: x.completedCourseCodes.includes(code) ? x.completedCourseCodes.filter((c) => c !== code) : [...x.completedCourseCodes, code],
    }));
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-10">
      <div>
        <p className="flex items-center gap-2 text-[16px] font-semibold">
          <ClipboardPaste size={17} aria-hidden /> 성적표로 한 번에
        </p>
        <p className="mt-1 mb-3 text-[13px] text-muted">하나씩 고르기 번거로우면 성적표를 붙여넣거나 캡처로 가져와요. 확인한 뒤에만 반영해요.</p>
        <Link href={stepPath("transcript")} className="inline-flex items-center gap-2 text-[14px] font-semibold text-pen underline-offset-4 hover:underline">
          성적표 가져오기로 가기 <ArrowRight size={15} aria-hidden />
        </Link>
        <Button
          kind="ghost"
          className="mt-6"
          onClick={() => update((x) => ({ ...x, coursesConfirmed: true, completedCourseCodes: [] }))}
        >
          아직 들은 학과 과목이 없어요
        </Button>
        {d.coursesConfirmed && d.completedCourseCodes.length === 0 && <p className="mt-1 text-[13px] text-sage-ink">‘들은 과목 없음’으로 확인했어요.</p>}
      </div>
      <div>
        <p className="text-[16px] font-semibold">직접 선택 · {d.completedCourseCodes.length}과목 체크됨</p>
        <div className="mt-3 grid max-h-[380px] grid-cols-2 gap-x-4 overflow-y-auto rounded-[8px] border border-line bg-paper px-4 py-2">
          {courses.map((c) => (
            <label key={c.code} className="flex min-h-[36px] items-center gap-2 border-b border-rule text-[14px]">
              <input type="checkbox" checked={d.completedCourseCodes.includes(c.code)} onChange={() => toggle(c.code)} />
              <span className="min-w-0 truncate">{c.name}</span>
              <span className="ml-auto text-[11px] text-muted tabular-nums">{c.recommendedYear ? `${c.recommendedYear}학년` : ""}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-muted">이미 들은 과목은 앞으로의 로드맵에 다시 넣지 않아요.</p>
      </div>
    </div>
  );
}

function TargetStep({ ctx }: { ctx: StepCtx }) {
  const { d, set } = ctx;
  const [paste, setPaste] = useState(d.demo?.profileId === "D" ? SAMPLE_GRADUATION_CHECK : "");
  const [parsed, setParsed] = useState<GraduationCheckParse | null>(null);
  return (
    <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-12">
      <div>
        <BigNumber
          value={d.targetCredits}
          onChange={(v) => set({ targetCredits: v, targetSource: v === null ? null : d.targetSource ?? "user_goal" })}
          unit="학점"
          label="목표 총학점"
          min={1}
        />
        <Help>
          학교 공통 졸업학점이 아니라 <b className="text-ink">내 졸업사정 조회에서 확인한 값</b>을 적어 주세요. 모르면 비워 두세요 — 그러면 예상 완료 학기는 ‘확인 필요’로 보여 드려요.
        </Help>
        {d.targetCredits !== null && (
          <p className="mt-3 text-[14px]">
            출처: <Tag tone={d.targetSource === "graduation_check" ? "sage" : "plain"}>{d.targetSource === "graduation_check" ? "개인 졸업사정 조회(이 학생만)" : "내가 정한 목표"}</Tag>
            <button type="button" className="ml-3 cursor-pointer text-[13px] text-pen underline underline-offset-4" onClick={() => set({ targetCredits: null, targetSource: null })}>
              비우기
            </button>
          </p>
        )}
      </div>
      <div className="rounded-[10px] border border-line bg-paper p-5">
        <p className="flex items-center gap-2 text-[16px] font-semibold">
          <ClipboardPaste size={17} aria-hidden /> 졸업사정 조회 결과 붙여넣기
        </p>
        <p className="mt-1 mb-3 text-[13px] text-muted">열이 분명한 값만 읽고, 어느 열인지 모호한 줄은 직접 확인하도록 남겨요.</p>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={6} className="w-full resize-y font-mono text-[12px]" aria-label="졸업사정 조회 결과" />
        <Button className="mt-2" disabled={!paste.trim()} onClick={() => setParsed(parseGraduationCheck(paste))}>
          읽어 보기
        </Button>
        {parsed && (
          <div className="mt-4 text-[14px]">
            <ul className="grid gap-1">
              {parsed.rows.map((r) => (
                <li key={r.raw} className="flex items-baseline gap-2">
                  <Tag tone={r.status === "clear" ? "sage" : "red"}>{r.status === "clear" ? "읽음" : r.status === "ambiguous" ? "확인 필요" : "숫자 없음"}</Tag>
                  <b className="font-medium">{r.label}</b>
                  <span className="text-ink-soft">
                    {r.status === "clear" ? Object.entries(r.values).map(([k, v]) => `${k} ${v}`).join(" · ") : r.note}
                  </span>
                </li>
              ))}
            </ul>
            {parsed.target.status === "clear" ? (
              <Button
                kind="ink"
                className="mt-4"
                onClick={() =>
                  set({
                    targetCredits: parsed.target.value,
                    targetSource: "graduation_check",
                    ...(parsed.earned.status === "clear" ? { earnedCredits: parsed.earned.value } : {}),
                    ...(parsed.majorEarned.status === "clear" ? { earnedMajorCredits: parsed.majorEarned.value } : {}),
                  })
                }
              >
                확인했어요 — 목표 {parsed.target.value}학점
                {parsed.earned.status === "clear" ? ` · 취득 ${parsed.earned.value}학점` : ""}
                {parsed.majorEarned.status === "clear" ? ` · 전공 취득 ${parsed.majorEarned.value}학점` : ""} 사용
              </Button>
            ) : (
              <p className="mt-3 text-red">목표 졸업학점 줄을 분명하게 읽지 못했어요. 왼쪽에 직접 적어 주세요.</p>
            )}
            <p className="mt-2 text-[12px] text-muted">이 값은 이 학생 한 명의 입력값으로만 써요. 학교 공통 졸업요건으로 저장하지 않아요.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function CareerStep({ ctx }: { ctx: StepCtx }) {
  return (
    <div>
      <BigChoices<CareerTrack | "unsure">
        ctx={ctx}
        label="관심 진로"
        cols={3}
        options={[
          ...CAREER_TRACKS.map((t) => ({ value: t as CareerTrack | "unsure", label: CAREER_LABEL[t] })),
          { value: "unsure", label: "잘 모르겠어요", desc: "짧은 질문으로 추천받을래요" },
        ]}
        selected={(v) => ctx.d.career === v}
        onPick={(v) => ctx.set({ career: v })}
      />
      <Help>고른 진로를 맨 앞에 두고, 다른 진로 트랙도 함께 비교해 보여 드려요. 진로 분류는 서비스가 정한 것이며 학교 공식 트랙이 아니에요.</Help>
    </div>
  );
}

function QuizStep({ ctx }: { ctx: StepCtx }) {
  return (
    <ol className="grid gap-6">
      {QUIZ.map((q, i) => (
        <li key={q.id}>
          <p className="mb-2 flex items-baseline gap-2 text-[17px] font-semibold">
            <span className="font-hand text-[24px] font-normal text-pen">Q{i + 1}.</span>
            {q.prompt}
          </p>
          <div role="radiogroup" aria-label={q.prompt} className="flex flex-wrap gap-2">
            {q.options.map((o) => (
              <Choice key={o.id} selected={ctx.d.answers[q.id] === o.id} onClick={() => ctx.update((x) => ({ ...x, answers: { ...x.answers, [q.id]: o.id } }))} className="min-h-[48px] text-[15px]">
                {o.label}
              </Choice>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

function PaceStep({ ctx }: { ctx: StepCtx }) {
  return (
    <div>
      <BigChoices<number | "compare">
        ctx={ctx}
        label="학기당 학점"
        cols={4}
        options={[
          { value: 15, label: "15학점", desc: "여유 있게" },
          { value: 18, label: "18학점", desc: "보통" },
          { value: 20, label: "20학점", desc: "빠르게" },
          { value: "compare", label: "비교해 주세요", desc: "15·18·20을 모두 계산" },
        ]}
        selected={(v) => ctx.d.paceCredits === v}
        onPick={(v) => ctx.set({ paceCredits: v })}
      />
      <Help>내가 정하는 계획 상한이에요(학교 승인값 아님). 확인된 학교 최대 수강학점이 더 작으면 그 값을 써요.</Help>
    </div>
  );
}

function LateStep({ ctx }: { ctx: StepCtx }) {
  const { d, set } = ctx;
  const pace = typeof d.paceCredits === "number" ? d.paceCredits : 18;
  const bands = paceBandsFor("late_light", pace);
  const custom = d.customPace ?? { early: pace, year3: pace, year4: pace };
  return (
    <div>
      <BigChoices
        ctx={ctx}
        label="학점 배치 방식"
        cols={4}
        autoAdvance={false}
        options={[
          { value: "balanced" as const, label: "균형형", desc: "매 학기 비슷한 학점" },
          { value: "late_light" as const, label: "후반 여유형", desc: `3학년 ${bands[1].credits} · 4학년 ${bands[2].credits}학점까지` },
          { value: "compare" as const, label: "둘 다 비교", desc: "균형형과 후반 여유형을 나란히" },
          { value: "custom" as const, label: "직접 설정", desc: "학년별 학점을 적을게요" },
        ]}
        selected={(v) => d.paceStyle === v}
        onPick={(v) => set({ paceStyle: v, ...(v === "custom" && !d.customPace ? { customPace: custom } : {}) })}
      />
      {d.paceStyle === "custom" && (
        <div className="mt-6 flex gap-8">
          {(
            [
              ["early", "1·2학년"],
              ["year3", "3학년"],
              ["year4", "4학년 이후"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="grid gap-1 text-[13px] text-muted">
              {label} 학기당
              <input
                type="number"
                min={1}
                max={30}
                value={custom[k]}
                onChange={(e) => set({ customPace: { ...custom, [k]: Number(e.target.value) } })}
                className="!w-[120px] !text-[22px] font-serif font-bold"
              />
            </label>
          ))}
        </div>
      )}
      <div className="mt-6 max-w-[820px] rounded-[8px] border-l-[3px] border-marker bg-marker/20 px-4 py-3 text-[14px] text-ink-soft">
        <b className="text-ink">{LATE_LIGHT_CONFIG.disclaimer}</b> {LATE_LIGHT_CONFIG.rationale} 후반 학점을 줄이면 계획 완료가 늦어질 수 있고, 그 결과도 숨기지 않고 보여 드려요.
      </div>
    </div>
  );
}

function setPrefs(ctx: StepCtx, patch: Partial<MilitaryPrefs>) {
  ctx.update((x) => ({ ...x, militaryPrefs: { ...prefsOf(x), ...patch } }));
}

function MilitaryStep({ ctx }: { ctx: StepCtx }) {
  const setMil = (status: Draft["military"]["status"]) => ctx.update((x) => ({ ...x, military: { ...x.military, status } }));
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<SentenceParse | null>(null);
  return (
    <div>
      <BigChoices
        ctx={ctx}
        label="군 복무 계획"
        cols={4}
        options={[
          { value: "planned" as const, label: "필요해요", desc: "앞으로 다녀올 예정" },
          { value: "done" as const, label: "이미 마쳤어요" },
          { value: "none" as const, label: "해당 없어요", desc: "면제 등" },
          { value: "undecided" as const, label: "아직 모르겠어요", desc: "필요할 수 있다고 보고 비교" },
        ]}
        selected={(v) => ctx.d.military.status === v}
        onPick={setMil}
      />
      <div className="mt-8 max-w-[760px] rounded-[10px] border border-line bg-paper-2/40 p-4">
        <label className="block text-[14px] font-semibold" htmlFor="mil-sentence">
          한 줄로 말해도 돼요 <span className="font-normal text-muted">(선택)</span>
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="mil-sentence"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setParsed(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && text.trim()) {
                e.preventDefault();
                e.stopPropagation();
                setParsed(parseMilitarySentence(text));
              }
            }}
            placeholder="예) 육군 일반병을 생각하고 있고 카투사도 지원해 보고 싶어요"
            className="min-w-0 flex-1"
          />
          <Button onClick={() => setParsed(parseMilitarySentence(text))} disabled={!text.trim()}>
            알아듣기
          </Button>
        </div>
        {parsed &&
          (parsed.understood.length > 0 ? (
            <div className="mt-3" aria-live="polite">
              <p className="text-[14px]">
                이렇게 이해했어요: <b>{parsed.understood.join(" · ")}</b>
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  kind="ink"
                  onClick={() => {
                    const { status, ...prefs } = parsed.patch;
                    ctx.update((x) => ({ ...x, military: { ...x.military, status: status ?? x.military.status }, militaryPrefs: { ...prefsOf(x), ...prefs } }));
                    setParsed(null);
                    setText("");
                  }}
                >
                  맞아요, 반영
                </Button>
                <Button kind="ghost" onClick={() => setParsed(null)}>
                  아니에요
                </Button>
              </div>
              <p className="mt-1 text-[12px] text-muted">정해진 표현만 알아듣는 규칙 기반 해석이에요(생성형 AI 아님). 남은 건 다음 질문에서 골라요.</p>
            </div>
          ) : (
            <p className="mt-3 text-[13px] text-ink-soft">
              알아들은 게 없어요. 위에서 ‘필요해요’를 고르고 다음 질문(선호하는 군)에서 이어서 골라 주세요.
            </p>
          ))}
      </div>
      <InfoLink href="/info/military" title="군대 트랙 자세히 알아보기" desc="육군 현역병·기술행정병·공군 기술병·카투사의 지원자격, 선발 방식, 모집 일정 근거를 병무청 원문 기준으로 정리했어요." />
    </div>
  );
}

function MilitaryBranchStep({ ctx }: { ctx: StepCtx }) {
  const p = prefsOf(ctx.d);
  return (
    <div>
      <BigChoices
        ctx={ctx}
        label="선호하는 군"
        cols={3}
        options={[
          { value: "army" as const, label: "육군", desc: "일반 입영·기술행정병·카투사" },
          { value: "air_force" as const, label: "공군", desc: "기술병(정보보호병·IT개발관리병 등)" },
          { value: "navy" as const, label: "해군", desc: "아직 자료 검토 전 — 공고 확인 안내만" },
          { value: "marine" as const, label: "해병대", desc: "아직 자료 검토 전 — 공고 확인 안내만" },
          { value: "any" as const, label: "상관없어요" },
          { value: "unknown" as const, label: "아직 모르겠어요" },
        ]}
        selected={(v) => p.branch === v}
        onPick={(v) => setPrefs(ctx, { branch: v })}
      />
      <Help>복무기간·모집 일정·중복지원 규칙은 묻지 않아요. 고른 군에 맞춰 서비스가 병무청 원문으로 계산해요.</Help>
    </div>
  );
}

function MilitaryGoalStep({ ctx }: { ctx: StepCtx }) {
  const p = prefsOf(ctx.d);
  const { d, update } = ctx;
  const setMil = (patch: Partial<Draft["military"]>) => update((x) => ({ ...x, military: { ...x.military, ...patch } }));
  return (
    <div>
      <BigChoices
        ctx={ctx}
        label="군 복무에서 가장 중요한 것"
        cols={3}
        autoAdvance={false}
        options={[
          { value: "fast_stable" as const, label: "빠르고 안정적인 입대", desc: "입영일을 직접 골라 바로" },
          { value: "it_experience" as const, label: "IT·개발 관련 경험", desc: "기술행정병·공군 IT 특기 도전" },
          { value: "katusa" as const, label: "카투사 우선", desc: "선발·미선발 분기를 함께" },
          { value: "return_predictable" as const, label: "학업 복귀 시점 예측", desc: "복무기간이 확인된 경로 위주" },
          { value: "unknown" as const, label: "아직 모르겠어요" },
        ]}
        selected={(v) => p.goal === v}
        onPick={(v) => setPrefs(ctx, { goal: v, ...(v === "it_experience" ? { it: "high" as const } : {}) })}
      />
      <details className="mt-8 max-w-[760px] text-[14px]" open={d.military.timing === "fixed"}>
        <summary className="cursor-pointer font-medium text-ink-soft">이미 정해진 일정이 있어요(선택)</summary>
        <div className="mt-3 grid gap-4 rounded-[10px] border border-line p-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={d.military.timing === "fixed"} onChange={(e) => setMil({ timing: e.target.checked ? "fixed" : "recommend", ...(e.target.checked ? {} : { startDate: null }) })} />
            입영일이 이미 정해졌어요
          </label>
          {d.military.timing === "fixed" && (
            <label className="grid w-[260px] gap-1 text-[13px] text-muted">
              입영일
              <input type="date" value={d.military.startDate ?? ""} onChange={(e) => setMil({ startDate: e.target.value || null })} />
            </label>
          )}
          <p className="text-[12px] text-muted">정해진 날짜가 없으면 비워 두세요. 학년을 마친 시점마다 서비스가 비교해요.</p>
        </div>
      </details>
    </div>
  );
}

function KatusaStep({ ctx }: { ctx: StepCtx }) {
  const p = prefsOf(ctx.d);
  return (
    <div>
      <BigChoices
        ctx={ctx}
        label="카투사"
        cols={2}
        options={[
          { value: "first_priority" as const, label: "최우선으로 생각해요", desc: "선발되면 카투사로, 안 되면 다른 경로로" },
          { value: "consider" as const, label: "가능하면 고려해요" },
          { value: "exclude" as const, label: "생각하지 않아요" },
          { value: "unknown" as const, label: "아직 모르겠어요" },
        ]}
        selected={(v) => p.katusa === v}
        onPick={(v) => ctx.update((x) => ({ ...x, militaryPrefs: { ...prefsOf(x), katusa: v }, katusa: { ...x.katusa, priority: v === "first_priority" || v === "consider" } }))}
      />
      <Help>카투사는 추첨으로 선발해요. 합격 가능성은 계산하지 않고, 선발·미선발·모두 안 될 때의 경로를 나눠 보여 드려요.</Help>
    </div>
  );
}

function KatusaEvidenceStep({ ctx }: { ctx: StepCtx }) {
  const p = prefsOf(ctx.d);
  const history: Array<[NonNullable<MilitaryPrefs["katusaHistory"]>, string]> = [
    ["none", "지원한 적 없어요"],
    ["waiting", "지원했고 결과 기다려요"],
    ["selected", "선발됐어요"],
    ["not_selected", "지원했지만 선발되지 않았어요"],
    ["cancelled", "접수를 취소했어요"],
    ["medical", "신체검사에서 불합격했어요"],
  ];
  return (
    <div className="grid gap-8">
      <div>
        <p className="mb-3 text-[16px] font-semibold">카투사 기준을 넘는 영어 정기시험 성적(접수일 기준 5년 이내)이 있나요?</p>
        <BigChoices
          ctx={ctx}
          label="영어 성적"
          cols={3}
          autoAdvance={false}
          options={[
            { value: "yes" as const, label: "있어요" },
            { value: "no" as const, label: "아직 없어요", desc: "접수 전까지 준비하는 것으로 계산" },
            { value: "unknown" as const, label: "잘 모르겠어요" },
          ]}
          selected={(v) => p.english === v}
          onPick={(v) => setPrefs(ctx, { english: v })}
        />
        <p className="mt-2 text-[12px] text-muted">기준 점수와 인정 시험은 2026년 모집 원문 표를 따라요(예: TOEIC 780점 이상). 다음 연도 기준은 공고 확인이 필요해요.</p>
      </div>
      <label className="grid max-w-[420px] gap-1 text-[14px]">
        <span className="font-semibold">예전에 카투사에 지원한 적이 있나요?</span>
        <select value={p.katusaHistory ?? ""} onChange={(e) => setPrefs(ctx, { katusaHistory: (e.target.value || null) as MilitaryPrefs["katusaHistory"] })}>
          <option value="">고르지 않음</option>
          {history.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <span className="text-[12px] text-muted">카투사 지원은 1회에 한해요(접수취소·신체검사 불합격은 재지원 가능, 원문).</span>
      </label>
    </div>
  );
}

const ORDINAL_CHOICES: Array<[number, string]> = [
  [2, "1학년 마치고"],
  [3, "2학년 1학기 마치고"],
  [4, "2학년 마치고"],
  [5, "3학년 1학기 마치고"],
  [6, "3학년 마치고"],
];

function LeaveStep({ ctx }: { ctx: StepCtx }) {
  const { d, update } = ctx;
  const setLeave = (patch: Partial<Draft["leave"]>) => update((x) => ({ ...x, leave: { ...x.leave, ...patch } }));
  const done = d.completedTerms ?? 0;
  return (
    <div>
      <BigChoices
        ctx={ctx}
        label="휴학 계획"
        cols={2}
        autoAdvance={false}
        options={[
          { value: "none" as const, label: "없어요", desc: needsMilitary(d) ? "군 휴학은 군 복무 질문에서 따로 다뤄요" : undefined },
          { value: "pick" as const, label: "한 학기 쉬고 싶어요", desc: "언제 쉴지 고를게요" },
        ]}
        selected={(v) => d.leave.mode === v}
        onPick={(v) => setLeave({ mode: v, ...(v === "none" ? { ordinal: null } : {}) })}
      />
      {d.leave.mode === "pick" && (
        <div role="radiogroup" aria-label="휴학 시점" className="mt-5 flex flex-wrap gap-2">
          {ORDINAL_CHOICES.filter(([o]) => o >= done).map(([o, label]) => (
            <Choice key={o} selected={d.leave.ordinal === o} onClick={() => setLeave({ ordinal: o })} className="min-h-[52px] text-[15px]">
              {label}
            </Choice>
          ))}
        </div>
      )}
    </div>
  );
}

function setEx(ctx: StepCtx, patch: Partial<ExchangePrefs>) {
  ctx.update((x) => {
    const next = { ...exPrefsOf(x), ...patch };
    const on = next.intent !== null && next.intent !== "none";
    // 트랙 계산용 교환 모드: 고른 전략이 있으면 그 학기, 없으면 시기별 추천
    const exchange: Draft["exchange"] = !on ? { mode: "none", ordinal: null } : x.exchangeChoice ? x.exchange : { mode: "recommend", ordinal: null };
    return { ...x, exchangePrefs: next, exchange, ...(on ? {} : { exchangeChoice: null }) };
  });
}

function ExchangeStep({ ctx }: { ctx: StepCtx }) {
  const p = exPrefsOf(ctx.d);
  return (
    <div>
      <BigChoices
        ctx={ctx}
        label="교환학생"
        cols={2}
        options={[
          { value: "committed" as const, label: "꼭 가고 싶어요" },
          { value: "conditional" as const, label: "조건이 맞으면 가고 싶어요" },
          { value: "considering" as const, label: "아직 고민 중이에요" },
          { value: "none" as const, label: "지금은 생각 없어요", desc: "로드맵에 넣지 않아요(정보는 언제든 볼 수 있어요)" },
        ]}
        selected={(v) => p.intent === v}
        onPick={(v) => setEx(ctx, { intent: v })}
      />
      <Help>교환 시기와 지원 학교까지 졸업·군 복무 계획에 함께 맞춰 볼 수 있어요. 학교별 TO·마감·GPA 기준·과목 제한은 묻지 않고 공식 자료로 확인해요.</Help>
      <InfoLink href="/info/exchange" title="교환학생 선택지 자세히 알아보기" desc="교환·방문학생 차이, 준비 흐름, 학점 인정 방식을 정리했어요." />
    </div>
  );
}

function ExchangeWhenStep({ ctx }: { ctx: StepCtx }) {
  const p = exPrefsOf(ctx.d);
  const start = ctx.d.startTerm;
  const terms: Term[] = [];
  if (start) {
    let t = start;
    for (let i = 0; i < 6; i++) {
      terms.push(t);
      t = t.season === 1 ? { year: t.year, season: 2 } : { year: t.year + 1, season: 1 };
    }
  }
  return (
    <div>
      <BigChoices
        ctx={ctx}
        label="교환 시기"
        cols={3}
        autoAdvance={false}
        options={[
          { value: "recommend" as const, label: "가장 좋은 시기를 추천해 주세요", desc: "지원 자격·군 복무를 보고 골라요" },
          { value: "next_spring" as const, label: "다음 봄학기" },
          { value: "next_fall" as const, label: "다음 가을학기" },
          { value: "fixed" as const, label: "직접 학기를 고를게요" },
          { value: "unknown" as const, label: "아직 모르겠어요" },
        ]}
        selected={(v) => p.when === v}
        onPick={(v) => setEx(ctx, { when: v, ...(v !== "fixed" ? { fixedTerm: null } : {}) })}
      />
      {p.when === "fixed" && (
        <div role="radiogroup" aria-label="파견 학기" className="mt-5 flex flex-wrap gap-2">
          {terms.map((t) => (
            <Choice key={`${t.year}-${t.season}`} selected={p.fixedTerm?.year === t.year && p.fixedTerm?.season === t.season} onClick={() => setEx(ctx, { fixedTerm: t })} className="min-h-[52px] text-[15px]">
              {formatTerm(t)}
            </Choice>
          ))}
        </div>
      )}
      <details className="mt-8 max-w-[760px] text-[14px]">
        <summary className="cursor-pointer font-medium text-ink-soft">해당되면 체크해 주세요(선택)</summary>
        <div className="mt-3 grid gap-2 rounded-[10px] border border-line p-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={p.priorExchange} onChange={(e) => setEx(ctx, { priorExchange: e.target.checked })} /> 예전에 파견교환을 다녀왔어요
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={p.transfer} onChange={(e) => setEx(ctx, { transfer: e.target.checked })} /> 편입생이에요
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={p.doubleMajor} onChange={(e) => setEx(ctx, { doubleMajor: e.target.checked })} /> 복수전공(복수학위)을 하고 있어요
          </label>
        </div>
      </details>
      <Help>공고가 아직 없는 학기는 학교를 확정하지 않고, 지난 회차 자료로 준비할 점과 ‘다음 공고 확인 필요’를 보여 드려요.</Help>
    </div>
  );
}

function ExchangeLengthStep({ ctx }: { ctx: StepCtx }) {
  const p = exPrefsOf(ctx.d);
  return (
    <BigChoices
      ctx={ctx}
      label="교환 기간"
      cols={2}
      options={[
        { value: "one_term" as const, label: "한 학기" },
        { value: "one_year" as const, label: "1년", desc: "1년 옵션이 확인된 학교만 보여 드려요" },
        { value: "either" as const, label: "둘 다 괜찮아요" },
        { value: "recommend" as const, label: "추천해 주세요" },
      ]}
      selected={(v) => p.duration === v}
      onPick={(v) => setEx(ctx, { duration: v })}
    />
  );
}

function ExchangeGoalStep({ ctx }: { ctx: StepCtx }) {
  const p = exPrefsOf(ctx.d);
  const all = Object.keys(PRIORITY_LABEL) as ExchangePriority[];
  const toggle = (k: ExchangePriority) => {
    const has = p.priorities.includes(k);
    const next = has ? p.priorities.filter((x) => x !== k) : p.priorities.length >= 2 ? [p.priorities[0], k] : [...p.priorities, k];
    setEx(ctx, { priorities: next });
  };
  useEffect(() => {
    ctx.registerKeys(all.map((k) => () => toggle(k)));
  });
  return (
    <div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
        {all.map((k, i) => {
          const order = p.priorities.indexOf(k);
          return (
            <BigChoice key={k} n={i + 1} role="checkbox" selected={order >= 0} onClick={() => toggle(k)}>
              <span className="block text-[17px] font-semibold">{PRIORITY_LABEL[k]}</span>
              {order >= 0 && <span className="mt-0.5 block text-[13px] text-pen">{order === 0 ? "1순위" : "2순위"}</span>}
            </BigChoice>
          );
        })}
      </div>
      <Help>먼저 고른 것이 1순위예요. 비용·명성·국가는 비교할 공식 자료가 아직 없어서 고르면 순위 대신 이유로 알려 드려요.</Help>
    </div>
  );
}

function ExchangeLanguageStep({ ctx }: { ctx: StepCtx }) {
  const p = exPrefsOf(ctx.d);
  const lang = p.language ?? { test: "IELTS_ACADEMIC" as const, total: null, testedAt: null };
  return (
    <div className="grid gap-8">
      <BigChoices
        ctx={ctx}
        label="어학 준비"
        cols={2}
        autoAdvance={false}
        options={[
          { value: "has_score" as const, label: "성적이 있어요" },
          { value: "preparing" as const, label: "시험을 준비 중이에요" },
          { value: "none" as const, label: "아직 없어요" },
          { value: "unknown" as const, label: "어떤 시험이 필요한지 모르겠어요" },
        ]}
        selected={(v) => p.languageStatus === v}
        onPick={(v) => setEx(ctx, { languageStatus: v, ...(v !== "has_score" ? { language: null } : {}) })}
      />
      {p.languageStatus === "has_score" && (
        <div className="flex flex-wrap items-end gap-4 text-[14px]">
          <label className="grid gap-1">
            시험
            <select value={lang.test} onChange={(e) => setEx(ctx, { language: { ...lang, test: e.target.value as typeof lang.test } })}>
              <option value="IELTS_ACADEMIC">IELTS Academic</option>
              <option value="TOEFL_IBT">TOEFL iBT(120점, 2026-01 이전 응시)</option>
              <option value="TOEFL_IBT_2026">TOEFL iBT(6점, 2026-01 이후 응시)</option>
            </select>
          </label>
          <label className="grid gap-1">
            총점
            <input type="number" step="0.5" min={0} value={lang.total ?? ""} onChange={(e) => setEx(ctx, { language: { ...lang, total: e.target.value === "" ? null : Number(e.target.value) } })} className="!w-[120px]" />
          </label>
          <label className="grid gap-1">
            응시일(선택)
            <input type="date" value={lang.testedAt ?? ""} onChange={(e) => setEx(ctx, { language: { ...lang, testedAt: e.target.value || null } })} />
          </label>
        </div>
      )}
      <label className="grid max-w-[420px] gap-1 text-[14px]">
        <span className="font-semibold">누적 평점(4.5 만점) — 알면 적어 주세요</span>
        <input type="number" step="0.01" min={0} max={4.5} value={p.gpa ?? ""} placeholder="예) 3.75" onChange={(e) => setEx(ctx, { gpa: e.target.value === "" ? null : Number(e.target.value) })} className="!w-[160px]" />
        <span className="text-[12px] text-muted">비워 두면 GPA 조건은 ‘확인 필요’로 남겨요. 파견교 기준이 4.0 만점이면 한양대 엑셀 변환식으로만 비교해요.</span>
      </label>
    </div>
  );
}

function ExchangeLifeStep({ ctx }: { ctx: StepCtx }) {
  const p = exPrefsOf(ctx.d);
  return (
    <div className="grid gap-8">
      <div>
        <p className="mb-3 text-[16px] font-semibold">예산</p>
        <BigChoices
          ctx={ctx}
          label="예산"
          cols={2}
          autoAdvance={false}
          options={[
            { value: "save" as const, label: "비용 절약이 가장 중요해요" },
            { value: "moderate" as const, label: "보통 수준이면 괜찮아요" },
            { value: "flexible" as const, label: "학교·경험이 더 중요해요" },
            { value: "unknown" as const, label: "아직 모르겠어요" },
          ]}
          selected={(v) => p.budget === v}
          onPick={(v) => setEx(ctx, { budget: v })}
        />
      </div>
      <div>
        <p className="mb-3 text-[16px] font-semibold">주거</p>
        <div role="radiogroup" aria-label="주거" className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
          {(
            [
              ["guaranteed_required", "기숙사 보장이 중요해요"],
              ["preferred", "기숙사가 있으면 좋아요"],
              ["off_campus_ok", "교외 숙소도 괜찮아요"],
              ["unknown", "아직 모르겠어요"],
            ] as const
          ).map(([v, l]) => (
            <BigChoice key={v} selected={p.housing === v} onClick={() => setEx(ctx, { housing: v })}>
              <span className="block text-[17px] font-semibold">{l}</span>
            </BigChoice>
          ))}
        </div>
      </div>
      <Help>정확한 생활비는 묻지 않아요. 학교별 비용 자료가 아직 없어 금액으로 비교하지 않고, 기숙사는 ‘신청 가능’과 ‘보장’을 구분해 보여 드려요.</Help>
    </div>
  );
}

function PriorityStep({ ctx }: { ctx: StepCtx }) {
  const opts: Array<Opt<PriorityKey>> = [
    { value: "fast_completion", label: "빨리 끝내기", desc: "계획 완료 학기가 빠른 트랙" },
    { value: "career_core", label: "진로 과목 먼저", desc: "진로 핵심 과목을 일찍 듣는 트랙" },
    { value: "light_terms", label: "여유 있는 학기", desc: "한 학기 최대 학점이 적은 트랙" },
  ];
  return <BigChoices ctx={ctx} label="우선순위" cols={3} options={opts} selected={(v) => ctx.d.priority === v} onPick={(v) => ctx.set({ priority: v })} />;
}

function ReviewStep({ ctx }: { ctx: StepCtx }) {
  const { d } = ctx;
  const steps = visibleSteps(d).filter((s) => s !== "review");
  const value = (s: StepId): string => {
    switch (s) {
      case "name":
        return d.name || "—";
      case "admission":
        return d.admissionYear ? `${d.admissionYear}년` : "말하지 않음";
      case "completed":
        return d.completedTerms === null ? "—" : completedTermsLabel(d.completedTerms);
      case "start":
        return d.startTerm ? formatTerm(d.startTerm) : "—";
      case "transcript":
        return d.earnedCredits === null ? "—" : `총 ${d.earnedCredits} · 전공 ${d.earnedMajorCredits ?? "—"}학점 · 학과 과목 ${d.completedCourseCodes.length}개${d.progressMode === "import" ? " (가져오기)" : ""}`;
      case "credits":
        return d.earnedCredits === null ? "—" : `${d.earnedCredits}학점`;
      case "major":
        return d.earnedMajorCredits === null ? "—" : `${d.earnedMajorCredits}학점`;
      case "courses":
        return d.completedCourseCodes.length > 0 ? `${d.completedCourseCodes.length}과목` : d.coursesConfirmed ? "없음으로 확인" : "—";
      case "target":
        return d.targetCredits === null ? "모름(완료 학기 확인 필요)" : `${d.targetCredits}학점 · ${d.targetSource === "graduation_check" ? "졸업사정 조회" : "내 목표"}`;
      case "career":
        return d.career === "unsure" ? "질문으로 추천받기" : d.career ? CAREER_LABEL[d.career] : "—";
      case "quiz":
        return `${Object.keys(d.answers).length}개 답함`;
      case "pace":
        return d.paceCredits === "compare" ? "15·18·20 비교" : d.paceCredits ? `${d.paceCredits}학점` : "—";
      case "late":
        return d.paceStyle === "compare" ? "균형형·후반 여유형 비교" : d.paceStyle === "late_light" ? "후반 여유형" : d.paceStyle === "custom" ? `직접 설정 ${d.customPace?.early}/${d.customPace?.year3}/${d.customPace?.year4}` : d.paceStyle === "balanced" ? "균형형" : "—";
      case "military":
        return { planned: "다녀올 예정", undecided: "고민 중", done: "마침", none: "해당 없음" }[d.military.status ?? "none"] ?? "—";
      case "military-branch":
        return { army: "육군", air_force: "공군", navy: "해군", marine: "해병대", any: "상관없음", unknown: "아직 모름" }[prefsOf(d).branch ?? "unknown"];
      case "military-goal":
        return (prefsOf(d).goal ? GOAL_LABEL[prefsOf(d).goal!] : "—") + (d.military.timing === "fixed" ? ` · 입영일 ${d.military.startDate ?? "—"}` : "");
      case "katusa":
        return { first_priority: "최우선", consider: "가능하면 고려", exclude: "생각 안 함", unknown: "아직 모름" }[prefsOf(d).katusa ?? "unknown"];
      case "katusa-evidence":
        return `영어 성적 ${{ yes: "있음", no: "없음", unknown: "모름" }[prefsOf(d).english ?? "unknown"]}`;
      case "leave":
        return d.leave.mode === "pick" ? `${ORDINAL_CHOICES.find(([o]) => o === d.leave.ordinal)?.[1] ?? "?"} 한 학기` : d.leave.mode === "none" ? "없음" : "—";
      case "exchange":
        return { committed: "꼭 가고 싶음", conditional: "조건이 맞으면", considering: "고민 중", none: "생각 없음" }[exPrefsOf(d).intent ?? "none"] + (d.exchangeChoice ? ` · ${d.exchangeChoice.universityName} ${formatTerm(d.exchangeChoice.term)}` : "");
      case "exchange-when": {
        const p = exPrefsOf(d);
        return p.when === "fixed" && p.fixedTerm ? formatTerm(p.fixedTerm) : { next_spring: "다음 봄학기", next_fall: "다음 가을학기", recommend: "추천받기", unknown: "모름", fixed: "—" }[p.when ?? "unknown"];
      }
      case "exchange-length":
        return { one_term: "한 학기", one_year: "1년", either: "둘 다", recommend: "추천" }[exPrefsOf(d).duration ?? "recommend"];
      case "exchange-goal":
        return exPrefsOf(d).priorities.map((k) => PRIORITY_LABEL[k]).join(" → ") || "—";
      case "exchange-language": {
        const p = exPrefsOf(d);
        return `${{ has_score: "성적 있음", preparing: "준비 중", none: "없음", unknown: "모름" }[p.languageStatus ?? "unknown"]}${p.language?.total ? ` (${p.language.total})` : ""} · GPA ${p.gpa ?? "모름"}`;
      }
      case "exchange-life": {
        const p = exPrefsOf(d);
        return `${{ save: "절약", moderate: "보통", flexible: "경험 우선", unknown: "모름" }[p.budget ?? "unknown"]} · ${{ guaranteed_required: "기숙사 보장 필요", preferred: "기숙사 선호", off_campus_ok: "교외 가능", unknown: "모름" }[p.housing ?? "unknown"]}`;
      }
      case "priority":
        return d.priority === "fast_completion" ? "빨리 끝내기" : d.priority === "career_core" ? "진로 과목 먼저" : d.priority === "light_terms" ? "여유 있는 학기" : "—";
      default:
        return "";
    }
  };
  return (
    <dl className="grid grid-cols-2 gap-x-10 border-t-[1.5px] border-ink">
      {steps.map((s) => {
        const p = stepProblem(s, d);
        const title = INPUT_STEPS.find((x) => x.id === s)!.title;
        return (
          <div key={s} className="flex min-h-[52px] items-center gap-4 border-b border-rule">
            <dt className="w-[120px] shrink-0 text-[13px] text-muted">{title}</dt>
            <dd className={`min-w-0 flex-1 truncate text-[15px] font-medium ${p ? "text-red" : ""}`}>{p ? p : value(s)}</dd>
            <Link href={stepPath(s)} className="inline-flex shrink-0 items-center gap-1 rounded-[6px] px-2 py-1 text-[13px] text-pen hover:bg-paper-2" aria-label={`${title} 고치기`}>
              <PencilLine size={13} aria-hidden /> 고치기
            </Link>
          </div>
        );
      })}
    </dl>
  );
}

