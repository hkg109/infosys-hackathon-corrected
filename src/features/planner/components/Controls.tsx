import type { PlanInput, Season } from "@/contracts/types";
import { TRACKS } from "../labels";
import { BreakEditor } from "./BreakEditor";
import { Field, Panel, Segmented } from "./ui";

/** 계획 조건 수정. revision이 바뀌면(입력 초기화 등) 쉬는 기간 입력을 다시 그린다. */
export function Controls({
  input,
  revision,
  onChange,
}: {
  input: PlanInput;
  revision: number;
  onChange: (next: PlanInput) => void;
}) {
  const set = (patch: Partial<PlanInput>) => onChange({ ...input, ...patch });
  const num = (v: string) => (v === "" ? 0 : Number(v));

  return (
    <Panel className="mb-5">
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div>
          <p className="mb-2 text-xs text-muted">희망 진로</p>
          <Segmented label="희망 진로" options={TRACKS} value={input.track} onChange={(track) => set({ track })} />
        </div>
        <BreakEditor key={revision} breaks={input.breaks} onChange={(breaks) => set({ breaks })} />
      </div>

      <details className="mt-4 border-t border-line pt-3">
        <summary className="cursor-pointer text-xs text-muted">학점과 계획 조건 수정</summary>
        <div className="my-3 grid gap-2.5 sm:grid-cols-3">
          <Field label="계획 시작 연도">
            <input type="number" inputMode="numeric" min={2024} max={2040} value={input.startTerm.year} onChange={(e) => set({ startTerm: { ...input.startTerm, year: num(e.target.value) } })} />
          </Field>
          <Field label="계획 시작 학기">
            <select value={input.startTerm.season} onChange={(e) => set({ startTerm: { ...input.startTerm, season: Number(e.target.value) as Season } })}>
              <option value={1}>1학기</option>
              <option value={2}>2학기</option>
            </select>
          </Field>
          <Field label="인정 유효학기">
            <input type="number" inputMode="numeric" min={0} max={16} value={input.completedTerms} onChange={(e) => set({ completedTerms: num(e.target.value) })} />
          </Field>
          <Field label="총 이수학점">
            <input type="number" inputMode="numeric" min={0} max={250} value={input.earnedCredits} onChange={(e) => set({ earnedCredits: num(e.target.value) })} />
          </Field>
          <Field label="전공 이수학점(총학점에 포함)">
            <input type="number" inputMode="numeric" min={0} max={250} value={input.earnedMajorCredits} onChange={(e) => set({ earnedMajorCredits: num(e.target.value) })} />
          </Field>
          <Field label="목표 총학점(모르면 비워두기)">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={250}
              value={input.targetCredits ?? ""}
              onChange={(e) => set({ targetCredits: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </Field>
          <Field label="학기당 상한">
            <select value={input.creditCap} onChange={(e) => set({ creditCap: Number(e.target.value) })}>
              {[9, 12, 15, 18, 21].map((n) => (
                <option key={n} value={n}>
                  {n}학점
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="text-xs text-muted">목표학점·상한은 직접 입력한 값이며 학교 공식 요건이 아닙니다.</p>
      </details>
    </Panel>
  );
}
