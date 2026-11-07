"use client";

import { useState } from "react";
import type { BreakPeriod } from "@/contracts/types";
import { endDateToMonth, monthToEndDate, monthToStartDate, startDateToMonth } from "../dates";
import { BREAK_NAME } from "../labels";

type Kind = BreakPeriod["kind"];

/**
 * 군 복무·휴학 구간 하나를 월 단위로 입력한다(종료 월 포함 → endDate는 다음 달 1일, 제외).
 * 두 월을 모두 고르기 전에는 계획에 반영하지 않는다. 기본 날짜를 채워 넣지 않는다.
 * 부모가 입력을 통째로 바꿀 때는 key를 바꿔 다시 마운트한다.
 */
export function BreakEditor({ breaks, onChange }: { breaks: BreakPeriod[]; onChange: (next: BreakPeriod[]) => void }) {
  const current = breaks[0];
  const [on, setOn] = useState(!!current);
  const [kind, setKind] = useState<Kind>(current?.kind ?? "military");
  const [start, setStart] = useState(current ? startDateToMonth(current.startDate) : "");
  const [end, setEnd] = useState(current ? endDateToMonth(current.endDate) : "");

  const commit = (next: { on?: boolean; kind?: Kind; start?: string; end?: string }) => {
    const v = { on, kind, start, end, ...next };
    setOn(v.on);
    setKind(v.kind);
    setStart(v.start);
    setEnd(v.end);
    onChange(
      v.on && v.start && v.end
        ? [{ kind: v.kind, startDate: monthToStartDate(v.start), endDate: monthToEndDate(v.end) }]
        : [],
    );
  };

  const pending = on && (!start || !end);

  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">군 복무·휴학</legend>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={on} onChange={(e) => commit({ on: e.target.checked })} />
        계획 중간에 쉬는 기간이 있어요
      </label>
      {on && (
        <div className="mt-3 grid gap-2.5 sm:grid-cols-[auto_1fr_1fr]">
          <div className="flex gap-1 self-end rounded-lg border border-line bg-panel p-1" role="group" aria-label="쉬는 이유">
            {(Object.keys(BREAK_NAME) as Kind[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => commit({ kind: k })}
                className={`cursor-pointer rounded-md px-3 py-1.5 text-xs whitespace-nowrap ${
                  kind === k ? "bg-active font-medium text-brand" : "text-muted hover:text-ink"
                }`}
              >
                {BREAK_NAME[k]}
              </button>
            ))}
          </div>
          <label className="grid gap-1.5 text-xs text-muted">
            시작 월
            <input type="month" value={start} onChange={(e) => commit({ start: e.target.value })} />
          </label>
          <label className="grid gap-1.5 text-xs text-muted">
            마지막 월(포함)
            <input type="month" value={end} onChange={(e) => commit({ end: e.target.value })} />
          </label>
        </div>
      )}
      {pending && <p className="mt-2 text-xs text-warm-ink">시작 월과 마지막 월을 모두 고르면 계획에 반영됩니다.</p>}
    </fieldset>
  );
}
