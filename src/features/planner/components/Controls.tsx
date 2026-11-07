import type { PlanInput, Season } from "@/contracts/types";
import { TRACKS } from "../labels";
import { BreakEditor } from "./BreakEditor";
import { Field, Panel, Segmented } from "./ui";

/** 학점 페이스 버튼. 후보 비교와 같은 서비스 설정(15·18·20)이며 학교 승인값이 아니다. */
const PACES = [15, 18, 20];

/**
 * 맞 단계의 조건 고치기(FE-2). 자주 바꾸는 진로·학점 페이스·군 복무/휴학만 보이고,
 * 나머지 계획 조건은 접어 둔다. revision이 바뀌면(후보 선택 등) 쉬는 기간 입력을 다시 그린다.
 */
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
  const paces = PACES.includes(input.creditCap) ? PACES : [...PACES, input.creditCap].sort((a, b) => a - b);

  return (
    <Panel>
      <h3 className="mb-4 text-[15px] font-semibold">조건 고치기</h3>
      <div className="grid gap-4">
        <div>
          <p className="mb-1.5 text-xs text-muted">진로</p>
          <Segmented label="진로" options={TRACKS} value={input.track} onChange={(track) => set({ track })} />
        </div>
        <div>
          <p className="mb-1.5 text-xs text-muted">학기당 학점</p>
          <Segmented
            label="학기당 학점"
            options={paces.map((n) => [String(n), `${n}학점`] as [string, string])}
            value={String(input.creditCap)}
            onChange={(v) => set({ creditCap: Number(v) })}
          />
        </div>
        <BreakEditor key={revision} breaks={input.breaks} onChange={(breaks) => set({ breaks })} />
      </div>

      <details className="mt-4 border-t border-line pt-3">
        <summary className="cursor-pointer text-xs text-muted">시작 학기·이수학점·목표 고치기</summary>
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
        </div>
        <p className="text-xs text-muted">목표학점·학기당 학점은 직접 정한 값이며 학교 공식 요건이 아닙니다.</p>
      </details>
    </Panel>
  );
}
