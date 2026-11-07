"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import type { BreakPeriod } from "@/contracts/types";
import { endDateToMonth, monthToEndDate, monthToStartDate, startDateToMonth } from "../dates";
import { BREAK_NAME } from "../labels";

type Kind = BreakPeriod["kind"];
type Row = { id: number; kind: Kind; start: string; end: string };

const MAX_ROWS = 4;
let nextId = 1;
const newRow = (kind: Kind = "military"): Row => ({ id: nextId++, kind, start: "", end: "" });

/**
 * 군 복무·휴학 구간을 월 단위로 여러 개 입력한다(마지막 월 포함 → endDate는 다음 달 1일, 제외).
 * 두 월을 모두 고른 구간만 계획에 반영한다. 기본 날짜를 채워 넣지 않는다.
 * 부모가 입력을 통째로 바꿀 때는 key를 바꿔 다시 마운트한다.
 */
export function BreakEditor({ breaks, onChange }: { breaks: BreakPeriod[]; onChange: (next: BreakPeriod[]) => void }) {
  const [rows, setRows] = useState<Row[]>(() =>
    breaks.map((b) => ({ id: nextId++, kind: b.kind, start: startDateToMonth(b.startDate), end: endDateToMonth(b.endDate) })),
  );

  const commit = (next: Row[]) => {
    setRows(next);
    onChange(
      next
        .filter((r) => r.start && r.end)
        .map((r) => ({ kind: r.kind, startDate: monthToStartDate(r.start), endDate: monthToEndDate(r.end) })),
    );
  };
  const patch = (id: number, p: Partial<Row>) => commit(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const pending = rows.some((r) => !r.start || !r.end);

  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">군 복무·휴학</legend>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={rows.length > 0} onChange={(e) => commit(e.target.checked ? [newRow()] : [])} />
        계획 중간에 쉬는 기간이 있어요
      </label>

      {rows.length > 0 && (
        <div className="mt-3 grid gap-2">
          {rows.map((r, i) => (
            <div key={r.id} className="grid grid-cols-[auto_1fr_1fr_auto] items-end gap-2">
              <div className="flex gap-1 rounded-lg border border-line bg-panel p-1" role="group" aria-label={`${i + 1}번째 쉬는 이유`}>
                {(Object.keys(BREAK_NAME) as Kind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={r.kind === k}
                    onClick={() => patch(r.id, { kind: k })}
                    className={`cursor-pointer rounded-md px-3 py-1.5 text-xs whitespace-nowrap ${
                      r.kind === k ? "bg-active font-medium text-brand" : "text-muted hover:text-ink"
                    }`}
                  >
                    {BREAK_NAME[k]}
                  </button>
                ))}
              </div>
              <label className="grid gap-1.5 text-xs text-muted">
                {i === 0 ? "시작 월" : <span className="sr-only">시작 월</span>}
                <input type="month" aria-label={`${i + 1}번째 시작 월`} value={r.start} onChange={(e) => patch(r.id, { start: e.target.value })} />
              </label>
              <label className="grid gap-1.5 text-xs text-muted">
                {i === 0 ? "마지막 월(포함)" : <span className="sr-only">마지막 월(포함)</span>}
                <input type="month" aria-label={`${i + 1}번째 마지막 월`} value={r.end} onChange={(e) => patch(r.id, { end: e.target.value })} />
              </label>
              <button
                type="button"
                aria-label={`${i + 1}번째 쉬는 기간 삭제`}
                onClick={() => commit(rows.filter((x) => x.id !== r.id))}
                className="grid size-[38px] cursor-pointer place-items-center rounded-lg text-muted hover:bg-bg hover:text-ink"
              >
                <X size={15} aria-hidden />
              </button>
            </div>
          ))}
          {rows.length < MAX_ROWS && (
            <button
              type="button"
              onClick={() => commit([...rows, newRow("leave")])}
              className="flex w-fit cursor-pointer items-center gap-1.5 rounded-md px-1 py-1 text-xs text-brand hover:underline"
            >
              <Plus size={14} aria-hidden /> 쉬는 기간 추가
            </button>
          )}
        </div>
      )}
      {pending && <p className="mt-2 text-xs text-warm-ink">시작 월과 마지막 월을 모두 고른 기간만 계획에 반영됩니다.</p>}
    </fieldset>
  );
}
