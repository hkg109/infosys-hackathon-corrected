import type { CareerTrack, PlanInput, Season } from "@/contracts/types";
import { endDateToMonth, monthToEndDate, monthToStartDate, startDateToMonth } from "../dates";
import { Panel } from "./ui";

const TRACKS: Array<[CareerTrack, string]> = [
  ["security", "정보보안"],
  ["data", "데이터 분석"],
];

const DEFAULT_BREAK = { kind: "military" as const, startDate: "2028-04-01", endDate: "2029-11-01" };

export function Controls({ input, onChange }: { input: PlanInput; onChange: (next: PlanInput) => void }) {
  const brk = input.breaks[0];
  const set = (patch: Partial<PlanInput>) => onChange({ ...input, ...patch });
  const num = (v: string) => (v === "" ? 0 : Number(v));

  return (
    <Panel className="mb-4">
      <div className="grid gap-5 md:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="mb-2 text-xs text-muted">희망 진로</p>
          <div className="flex gap-1 rounded-lg bg-bg p-1" role="group" aria-label="희망 진로">
            {TRACKS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={input.track === id}
                onClick={() => set({ track: id })}
                className={`flex-1 cursor-pointer rounded-md p-2 text-xs ${
                  input.track === id ? "bg-brand text-contrast" : ""
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="flex min-h-[31px] items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={!!brk}
              onChange={(e) => set({ breaks: e.target.checked ? [DEFAULT_BREAK] : [] })}
            />
            군 복무·휴학 포함
          </label>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <label className="grid gap-1.5 text-xs">
              시작 월
              <input
                type="month"
                disabled={!brk}
                value={brk ? startDateToMonth(brk.startDate) : ""}
                onChange={(e) =>
                  brk && e.target.value && set({ breaks: [{ ...brk, startDate: monthToStartDate(e.target.value) }] })
                }
              />
            </label>
            <label className="grid gap-1.5 text-xs">
              종료 월(포함)
              <input
                type="month"
                disabled={!brk}
                value={brk ? endDateToMonth(brk.endDate) : ""}
                onChange={(e) =>
                  brk && e.target.value && set({ breaks: [{ ...brk, endDate: monthToEndDate(e.target.value) }] })
                }
              />
            </label>
          </div>
        </div>
      </div>

      <details className="mt-4 border-t border-line pt-3">
        <summary className="cursor-pointer text-xs text-muted">학점과 계획 조건 수정</summary>
        <div className="my-3 grid gap-2.5 sm:grid-cols-3">
          <Field label="계획 시작 연도">
            <input
              type="number"
              min={2024}
              max={2040}
              value={input.startTerm.year}
              onChange={(e) => set({ startTerm: { ...input.startTerm, year: num(e.target.value) } })}
            />
          </Field>
          <Field label="계획 시작 학기">
            <select
              value={input.startTerm.season}
              onChange={(e) => set({ startTerm: { ...input.startTerm, season: Number(e.target.value) as Season } })}
            >
              <option value={1}>1학기</option>
              <option value={2}>2학기</option>
            </select>
          </Field>
          <Field label="인정 유효학기">
            <input type="number" min={0} max={16} value={input.completedTerms} onChange={(e) => set({ completedTerms: num(e.target.value) })} />
          </Field>
          <Field label="총 이수학점">
            <input type="number" min={0} max={250} value={input.earnedCredits} onChange={(e) => set({ earnedCredits: num(e.target.value) })} />
          </Field>
          <Field label="전공 이수학점(총학점에 포함)">
            <input type="number" min={0} max={250} value={input.earnedMajorCredits} onChange={(e) => set({ earnedMajorCredits: num(e.target.value) })} />
          </Field>
          <Field label="목표학점 · 직접 입력">
            <input
              type="number"
              min={1}
              max={250}
              placeholder="모르면 비워두기"
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
        <p className="text-xs text-muted">목표학점·상한은 사용자 입력이며 학교 공식 요건이 아닙니다.</p>
      </details>
    </Panel>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid min-w-0 gap-1.5 text-xs">{label}{children}</label>;
}
