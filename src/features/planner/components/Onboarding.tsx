"use client";

import { useState } from "react";
import type { Dataset, PlanInput, Season } from "@/contracts/types";
import { validatePlanInput } from "@/engine";
import { blankInput, todayISO } from "../defaults";
import { TRACKS } from "../labels";
import { BreakEditor } from "./BreakEditor";
import { Button, Field, Segmented } from "./ui";

/** 저장된 계획이 없을 때 보이는 첫 입력. 샘플 값 없이 사용자 정보로 시작한다. */
export function Onboarding({ dataset, onDone }: { dataset: Dataset | null; onDone: (input: PlanInput) => void }) {
  const [draft, setDraft] = useState<PlanInput>(() => blankInput(todayISO()));
  const [tried, setTried] = useState(false);
  const set = (patch: Partial<PlanInput>) => setDraft((d) => ({ ...d, ...patch }));
  const num = (v: string) => (v === "" ? 0 : Number(v));
  const error = validatePlanInput(draft);

  const courses = dataset ? [...dataset.courses].sort((a, b) => (a.recommendedYear ?? 9) - (b.recommendedYear ?? 9)) : [];
  const toggle = (code: string) =>
    set({
      completedCourseCodes: draft.completedCourseCodes.includes(code)
        ? draft.completedCourseCodes.filter((c) => c !== code)
        : [...draft.completedCourseCodes, code],
    });

  const submit = () => {
    setTried(true);
    if (!error) onDone(draft);
  };

  return (
    <div className="mx-auto max-w-[720px] py-2">
      <h1 className="text-[26px] font-semibold tracking-tight text-ink sm:text-[30px]">내 학기 계획 만들기</h1>
      <p className="mt-2 mb-7 text-[13px] text-muted">
        지금까지 들은 것과 앞으로의 일정을 알려주면 학기별로 무엇을 들을지 배치해 드려요. 입력은 이 브라우저에만 저장됩니다.
      </p>

      <ol className="grid gap-7">
        <Step n={1} title="어떤 진로를 생각하나요?">
          <Segmented label="희망 진로" options={TRACKS} value={draft.track} onChange={(track) => set({ track })} />
          <p className="mt-2 text-xs text-muted">서비스가 나눈 진로 분류이며 학교 공식 트랙이 아닙니다.</p>
        </Step>

        <Step n={2} title="지금까지 얼마나 들었나요?">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="다닌 학기 수(인정 유효학기)">
              <input type="number" inputMode="numeric" min={0} max={16} value={draft.completedTerms} onChange={(e) => set({ completedTerms: num(e.target.value) })} />
            </Field>
            <Field label="총 이수학점">
              <input type="number" inputMode="numeric" min={0} max={250} value={draft.earnedCredits} onChange={(e) => set({ earnedCredits: num(e.target.value) })} />
            </Field>
            <Field label="그중 전공학점">
              <input type="number" inputMode="numeric" min={0} max={250} value={draft.earnedMajorCredits} onChange={(e) => set({ earnedMajorCredits: num(e.target.value) })} />
            </Field>
          </div>
          {courses.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-[13px] text-brand">
                이미 들은 전공 과목 고르기 {draft.completedCourseCodes.length > 0 && `(${draft.completedCourseCodes.length}개 선택)`}
              </summary>
              <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {courses.map((c) => (
                  <label key={c.code} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-bg">
                    <input type="checkbox" checked={draft.completedCourseCodes.includes(c.code)} onChange={() => toggle(c.code)} />
                    <span className="min-w-0 truncate">{c.name}</span>
                    <span className="ml-auto text-[11px] text-muted tabular-nums">{c.recommendedYear ? `${c.recommendedYear}학년` : ""}</span>
                  </label>
                ))}
              </div>
            </details>
          )}
        </Step>

        <Step n={3} title="언제부터, 몇 학점까지 계획할까요?">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="시작 연도">
              <input type="number" inputMode="numeric" min={2024} max={2040} value={draft.startTerm.year} onChange={(e) => set({ startTerm: { ...draft.startTerm, year: num(e.target.value) } })} />
            </Field>
            <Field label="시작 학기">
              <select value={draft.startTerm.season} onChange={(e) => set({ startTerm: { ...draft.startTerm, season: Number(e.target.value) as Season } })}>
                <option value={1}>1학기</option>
                <option value={2}>2학기</option>
              </select>
            </Field>
            <Field label="목표 총학점">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={250}
                placeholder="모르면 비워두기"
                value={draft.targetCredits ?? ""}
                onChange={(e) => set({ targetCredits: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </Field>
          </div>
          <p className="mt-2 text-xs text-muted">
            졸업 총학점은 아직 확인된 자료가 없어 직접 입력받아요. 비워두면 예상 완료 학기는 계산하지 않습니다.
          </p>
        </Step>

        <Step n={4} title="중간에 쉬는 기간이 있나요?">
          <BreakEditor breaks={draft.breaks} onChange={(breaks) => set({ breaks })} />
        </Step>
      </ol>

      {tried && error && <p className="mt-6 rounded-lg bg-warm px-3 py-2.5 text-[13px] text-warm-ink">{error}</p>}
      <div className="mt-8 flex justify-end">
        <Button primary onClick={submit} className="px-5">
          로드맵 만들기
        </Button>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
      <span className="grid size-7 place-items-center rounded-full bg-brand text-xs font-semibold text-contrast tabular-nums">{n}</span>
      <div className="min-w-0 pt-0.5">
        <h2 className="mb-3 text-[15px] font-semibold text-ink">{title}</h2>
        {children}
      </div>
    </li>
  );
}
