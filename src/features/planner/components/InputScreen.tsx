"use client";

import { ArrowRight, Check, ClipboardPaste } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dataset, PriorityKey, Season } from "@/contracts/types";
import { usePlanner } from "../PlannerApp";
import { findCoursesInText } from "../parseTranscript";
import { blankDraft, type Draft, draftProblem, MIN_ANSWERS } from "../plan";
import { completedTermsLabel, curriculumCovers } from "../profile";
import { answeredCount, QUIZ } from "../recommend";
import { Button, Choice, Field, Hand, PageTitle, Section } from "./ui";

const PRIORITIES: Array<[PriorityKey, string, string]> = [
  ["fast_completion", "빨리 끝내기", "졸업까지 걸리는 학기가 적은 계획"],
  ["career_core", "진로 과목 먼저", "진로 핵심 과목을 일찍 듣는 계획"],
  ["light_terms", "여유 있는 학기", "한 학기에 듣는 학점이 적은 계획"],
];

const SERVICE: Array<[number, string]> = [
  [18, "18개월 · 육군·해병대"],
  [20, "20개월 · 해군"],
  [21, "21개월 · 공군·사회복무요원"],
];

export function InputScreen() {
  const { mounted, today, draft, dataset } = usePlanner();
  if (!mounted || !today) return <div className="h-96 animate-pulse rounded bg-paper-2" aria-busy="true" />;
  return <InputForm initial={draft ?? blankDraft(today)} today={today} dataset={dataset} />;
}

function InputForm({ initial, today, dataset }: { initial: Draft; today: string; dataset: Dataset | null }) {
  const { draft: saved, setDraft, setPlan } = usePlanner();
  const router = useRouter();
  const [d, setD] = useState<Draft>(initial);
  const [tried, setTried] = useState(false);
  const [paste, setPaste] = useState("");
  const [pasteMsg, setPasteMsg] = useState<string | null>(null);

  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setMil = (patch: Partial<Draft["military"]>) => setD((x) => ({ ...x, military: { ...x.military, ...patch } }));
  const num = (v: string) => (v === "" ? 0 : Number(v));
  const problem = draftProblem(d, dataset);
  const answered = answeredCount(d.answers);
  const thisYear = Number(today.slice(0, 4));
  const years = Array.from({ length: 8 }, (_, i) => thisYear - i);
  const covers = dataset ? curriculumCovers(dataset.curriculum, d.admissionYear) : null;
  const courses = dataset ? [...dataset.courses].sort((a, b) => (a.recommendedYear ?? 9) - (b.recommendedYear ?? 9)) : [];

  const toggleCourse = (code: string) =>
    setD((x) => ({
      ...x,
      completedCourseCodes: x.completedCourseCodes.includes(code)
        ? x.completedCourseCodes.filter((c) => c !== code)
        : [...x.completedCourseCodes, code],
    }));

  const applyPaste = () => {
    const found = findCoursesInText(paste, courses);
    const added = found.filter((c) => !d.completedCourseCodes.includes(c));
    setD((x) => ({ ...x, completedCourseCodes: [...new Set([...x.completedCourseCodes, ...found])] }));
    setPasteMsg(
      found.length === 0
        ? "학과 과목을 찾지 못했어요. 학수번호나 과목명이 들어가게 복사해 주세요."
        : `과목 ${found.length}개를 찾아 체크했어요${added.length < found.length ? ` (새로 ${added.length}개)` : ""}.`,
    );
  };

  const submit = () => {
    setTried(true);
    if (problem) return;
    const next = { ...d, name: d.name.trim() };
    if (JSON.stringify(next) !== JSON.stringify(saved)) setPlan(null);
    setDraft(next);
    router.push("/processing");
  };

  const memo: Array<[string, boolean]> = [
    ["이수 현황", d.completedTerms > 0 || d.earnedCredits > 0 || d.completedCourseCodes.length > 0],
    [`끌리는 것 ${answered}/${QUIZ.length}`, answered >= MIN_ANSWERS],
    ["군 복무", d.military.mode === "none" || d.military.months !== null],
    ["목표 총학점", d.targetCredits !== null],
  ];

  return (
    <div>
      <PageTitle
        step="01 · 아 맞다"
        title="나에 대해 적어 주세요"
        sub="진로와 입대 시기는 정하지 않아도 돼요. 여기 적은 답으로 다음 장에서 추천해 드릴게요."
      />

      <div className="grid grid-cols-[minmax(0,1fr)_250px] gap-12">
        <div className="grid gap-10">
          <Section n={1} title="기본 정보">
            <div className="grid grid-cols-2 gap-8">
              <Field label="이름 또는 닉네임 (선택)">
                <input value={d.name} maxLength={20} placeholder="로드맵 제목에만 쓰여요" onChange={(e) => set({ name: e.target.value })} />
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
              <p className="mt-3 text-[12px] text-red">
                지금 자료는 {dataset.curriculum} 교육과정이에요. {d.admissionYear}년 입학생 교육과정은 학사안내에서 확인해 주세요.
              </p>
            )}
          </Section>

          <Section n={2} title="지금까지 들은 것" note="휴학한 학기는 빼고 세요">
            <div className="grid grid-cols-3 gap-8">
              <Field label="마친 학기">
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
              <div className="mt-6 rounded-[6px] border border-line bg-paper/80 p-4">
                <p className="flex items-center gap-2 text-[13px] font-semibold">
                  <ClipboardPaste size={15} aria-hidden /> 성적표 붙여넣기
                </p>
                <p className="mt-0.5 mb-2.5 text-[12px] text-muted">
                  한양인 성적 조회 표를 복사해 붙여넣으면 학과 과목만 골라 체크해요. 성적은 읽지 않아요.
                </p>
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
                  {pasteMsg && (
                    <span role="status" className="text-[12px] text-ink-soft">
                      {pasteMsg}
                    </span>
                  )}
                </div>
                <details className="mt-3 border-t border-dashed border-line pt-3" open={d.completedCourseCodes.length > 0}>
                  <summary className="cursor-pointer text-[13px] text-pen">직접 체크하기 · {d.completedCourseCodes.length}과목 체크됨</summary>
                  <div className="mt-2 grid grid-cols-3 gap-x-3">
                    {courses.map((c) => (
                      <label key={c.code} className="flex items-center gap-2 border-b border-rule py-1.5 text-[13px]">
                        <input type="checkbox" checked={d.completedCourseCodes.includes(c.code)} onChange={() => toggleCourse(c.code)} />
                        <span className="min-w-0 truncate">{c.name}</span>
                        <span className="ml-auto text-[11px] text-muted tabular-nums">{c.recommendedYear ? `${c.recommendedYear}학년` : ""}</span>
                      </label>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </Section>

          <Section n={3} title="끌리는 것" note={`${MIN_ANSWERS}개 이상 답하면 진로를 추천해요`}>
            <ol className="grid gap-6">
              {QUIZ.map((q, i) => (
                <li key={q.id}>
                  <p className="mb-2.5 flex items-baseline gap-2 text-[15px] font-semibold">
                    <span className="font-hand text-[20px] font-normal text-pen">Q{i + 1}.</span>
                    {q.prompt}
                  </p>
                  <div role="radiogroup" aria-label={q.prompt} className="flex flex-wrap gap-2">
                    {q.options.map((o) => (
                      <Choice key={o.id} selected={d.answers[q.id] === o.id} onClick={() => setD((x) => ({ ...x, answers: { ...x.answers, [q.id]: o.id } }))}>
                        {o.label}
                      </Choice>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <Section n={4} title="군 복무">
            <div role="radiogroup" aria-label="군 복무" className="grid grid-cols-3 gap-2">
              <Choice selected={d.military.mode === "recommend"} onClick={() => setMil({ mode: "recommend", startDate: null })}>
                <b className="font-semibold">다녀와야 해요</b>
                <span className="block text-[12px] text-muted">언제 갈지는 추천받을래요</span>
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
              <div className="mt-5 grid grid-cols-2 gap-8">
                <Field label="예상 복무 기간" hint="실제 기간은 병무청에서 확인하세요. 고른 값은 계획용 가정으로만 써요.">
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
                    <Hand>학년을 마친 시점 몇 개를 비교해서 추천해 드릴게요.</Hand>
                  </p>
                )}
              </div>
            )}
          </Section>

          <Section n={5} title="계획 조건">
            <div className="grid grid-cols-3 gap-8">
              <Field label="계획 시작 연도">
                <input type="number" min={2024} max={2040} value={d.startTerm.year} onChange={(e) => set({ startTerm: { ...d.startTerm, year: num(e.target.value) } })} />
              </Field>
              <Field label="시작 학기">
                <select value={d.startTerm.season} onChange={(e) => set({ startTerm: { ...d.startTerm, season: Number(e.target.value) as Season } })}>
                  <option value={1}>1학기</option>
                  <option value={2}>2학기</option>
                </select>
              </Field>
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
            <p className="mt-6 mb-2.5 text-[12px] font-medium text-muted">계획을 고를 때 가장 중요한 것</p>
            <div role="radiogroup" aria-label="가장 중요한 것" className="grid grid-cols-3 gap-2">
              {PRIORITIES.map(([key, label, desc]) => (
                <Choice key={key} selected={d.priority === key} onClick={() => set({ priority: key })}>
                  <b className="font-semibold">{label}</b>
                  <span className="block text-[12px] text-muted">{desc}</span>
                </Choice>
              ))}
            </div>
          </Section>
        </div>

        {/* 오른쪽 메모지 */}
        <aside className="relative">
          <div className="sticky top-6">
            <div className="memo-note relative rotate-[1.2deg] px-5 pt-7 pb-5">
              <div className="tape absolute -top-2.5 left-1/2 h-6 w-24 -translate-x-1/2 -rotate-2" aria-hidden />
              <p className="font-hand text-[24px] leading-none text-ink">체크리스트</p>
              <ul className="mt-3 grid gap-1.5">
                {memo.map(([label, ok]) => (
                  <li key={label} className="flex items-center gap-2 text-[14px]">
                    <span className={`grid size-4 place-items-center rounded-[3px] border ${ok ? "border-pen bg-pen text-paper" : "border-ink/30"}`}>
                      {ok && <Check size={12} strokeWidth={3} aria-hidden />}
                    </span>
                    <span className={ok ? "text-ink" : "text-ink-soft"}>{label}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 font-hand text-[18px] leading-snug text-ink-soft">목표 총학점은 선택이지만, 있으면 졸업 시점까지 계산돼요.</p>
            </div>

            {tried && problem && (
              <p role="alert" className="mt-5 border-l-[3px] border-red pl-3 text-[13px] text-red">
                {problem}
              </p>
            )}
            <Button kind="ink" onClick={submit} className="mt-5 w-full py-3 text-[15px]">
              선택지 보러 가기 <ArrowRight size={16} aria-hidden />
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
