"use client";

import { ChevronDown, Flag } from "lucide-react";
import { useState } from "react";
import type { PlanInput, PlanResult } from "@/contracts/types";
import { formatTerm } from "@/engine";
import { breakLabelFor, TRACK_NAME } from "../labels";
import { Badge } from "./ui";

/**
 * 트랙 카드 하나. 지금은 사용자의 현재 계획(엔진 결과)만 보여준다.
 * 후보 여러 개와 순위·근거는 BE-3(후보 생성·정렬) 계약이 나오면 같은 모양으로 연결한다.
 * 화면에서 학점·기간·순위를 계산하지 않고 엔진 결과만 표시한다.
 */
export function TrackCard({ input, result, label }: { input: PlanInput; result: PlanResult; label: string }) {
  const [open, setOpen] = useState(false);
  const study = result.terms.filter((t) => t.status === "study");
  const core = result.terms
    .flatMap((t) => t.courses.filter((c) => c.group === input.track).map((c) => ({ ...c, term: t.term })))
    .slice(0, 3);
  const tags = [
    TRACK_NAME[input.track],
    input.breaks.some((b) => b.kind === "military") ? "군 복무 포함" : null,
    input.breaks.some((b) => b.kind === "leave") ? "휴학 포함" : null,
    `학기당 최대 ${input.creditCap}학점`,
  ].filter((t): t is string => !!t);
  const notes = result.warnings.filter((w) => w.code !== "INVALID_INPUT").length;

  return (
    <article className="rounded-2xl border-2 border-brand bg-panel">
      <div className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <Badge>{label}</Badge>
          <h3 className="mt-2 text-[18px] font-semibold">{tags.slice(0, 2).join(" · ")}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <Badge key={t} tone="muted">
                {t}
              </Badge>
            ))}
          </div>
          {core.length > 0 && (
            <p className="mt-3 text-[13px] text-muted">
              진로 핵심 과목: {core.map((c) => `${c.name}(${formatTerm(c.term)})`).join(", ")}
            </p>
          )}
        </div>
        <div className="md:text-right">
          <p className="text-xs text-muted">예상 계획 완료</p>
          <p className="text-[24px] font-semibold tracking-tight text-brand tabular-nums">
            {result.expectedCompletion ? formatTerm(result.expectedCompletion) : "확인 필요"}
          </p>
          <p className="text-xs text-muted">
            수강 {study.length}개 학기 · 확인할 항목 {notes}개
          </p>
        </div>
      </div>

      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center justify-center gap-1.5 border-t border-line py-2.5 text-xs font-medium text-brand hover:bg-bg"
      >
        {open ? "접기" : "학기 흐름 보기"}
        <ChevronDown size={14} aria-hidden className={open ? "rotate-180" : ""} />
      </button>

      {open && (
        <div className="border-t border-line p-5">
          <ol className="flex gap-1.5 overflow-x-auto pb-1">
            {result.terms.map((t) => {
              const end =
                !!result.expectedCompletion &&
                result.expectedCompletion.year === t.term.year &&
                result.expectedCompletion.season === t.term.season;
              return (
                <li
                  key={`${t.term.year}-${t.term.season}`}
                  className={`w-[92px] shrink-0 rounded-lg border px-2 py-2 text-[11px] ${
                    t.status === "break" ? "hatch border-dashed border-line" : "border-line bg-bg"
                  }`}
                >
                  <p className="font-semibold tabular-nums">
                    {String(t.term.year).slice(2)}-{t.term.season}
                  </p>
                  {t.status === "break" ? (
                    <p className="mt-1 font-medium">{breakLabelFor(t.term, input.breaks)}</p>
                  ) : (
                    <>
                      <p className="mt-1 tabular-nums">{t.plannedCredits}학점</p>
                      <p className="text-muted">{t.courses.length}과목</p>
                    </>
                  )}
                  {end && (
                    <p className="mt-1 flex items-center gap-1 text-brand">
                      <Flag size={10} aria-hidden /> 완료
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-[11px] text-muted">학기별 과목은 &ldquo;다 했다&rdquo; 단계의 로드맵에서 자세히 볼 수 있어요.</p>
        </div>
      )}
    </article>
  );
}
