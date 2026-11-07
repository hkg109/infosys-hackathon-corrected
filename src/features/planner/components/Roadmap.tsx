import type { BreakPeriod, CourseGroup, Dataset, PlanInput, PlannedTerm, PlanResult } from "@/contracts/types";
import { isBlocked, termIndex } from "@/engine";
import { gradeLabel, termMonths } from "../plan";
import { GroupDot, groupLabel } from "./ui";

/**
 * 학기별 로드맵: 연도 한 줄에 1·2학기 두 칸. 엔진 결과(PlanResult)를 그대로 그린다.
 */
export function Roadmap({
  input,
  result,
  dataset,
  exchange = null,
}: {
  input: PlanInput;
  result: PlanResult;
  dataset: Dataset;
  /** 교환학생 학기 구간. v1 입력에서는 중단 구간과 구분되지 않아 따로 받는다. */
  exchange?: { startDate: string; endDate: string } | null;
}) {
  const years = [...new Set(result.terms.map((t) => t.term.year))];
  const completionIdx = result.expectedCompletion ? termIndex(result.expectedCompletion) : null;
  const category = (code: string) => dataset.courses.find((c) => c.code === code)?.category ?? null;

  // 학년 표시: 마친 학기 + 이번 계획에서 다닌 학기
  const ordinal = new Map<number, number>();
  let n = input.completedTerms;
  for (const t of result.terms) if (t.status === "study") ordinal.set(termIndex(t.term), n++);

  const groups = [...new Set(result.terms.flatMap((t) => t.courses.map((c) => c.group)))].sort(
    (a, b) => (a === "common" ? -1 : b === "common" ? 1 : 0),
  ) as CourseGroup[];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-ink-soft">
        {groups.map((g) => (
          <span key={g} className="flex items-center gap-1.5">
            <GroupDot group={g} /> {groupLabel(g)}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="hatch inline-block size-[11px] rounded-[2px] border border-line" /> 중단 학기
        </span>
      </div>

      <div className="grid gap-5">
        {years.map((year) => (
          <div key={year} className="grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)] gap-4 break-inside-avoid">
            <p className="pt-2 font-serif text-[22px] font-bold text-ink-soft tabular-nums">{year}</p>
            {([1, 2] as const).map((season) => {
              const t = result.terms.find((x) => x.term.year === year && x.term.season === season);
              if (!t) return <div key={season} className="rounded-[6px] border border-dashed border-line/70" aria-hidden />;
              const idx = termIndex(t.term);
              return (
                <TermPage
                  key={season}
                  t={t}
                  grade={ordinal.has(idx) ? gradeLabel(ordinal.get(idx)!) : null}
                  breakName={t.status === "break" ? breakName(t, input.breaks, exchange) : null}
                  isCompletion={idx === completionIdx}
                  category={category}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function breakName(t: PlannedTerm, breaks: BreakPeriod[], exchange: { startDate: string; endDate: string } | null): string {
  if (exchange && isBlocked(t.term, [{ kind: "leave", ...exchange }])) return "교환학생";
  const hit = breaks.filter((b) => isBlocked(t.term, [b]));
  return hit.some((b) => b.kind === "military") ? "군 복무" : "휴학";
}

function TermPage({
  t,
  grade,
  breakName,
  isCompletion,
  category,
}: {
  t: PlannedTerm;
  grade: string | null;
  breakName: string | null;
  isCompletion: boolean;
  category: (code: string) => string | null;
}) {
  const header = (
    <div className="flex items-baseline justify-between border-b-[1.5px] border-ink/70 px-4 pt-3 pb-1.5">
      <p className="font-serif text-[16px] font-bold">
        {t.term.season}학기 <span className="ml-1 text-[12px] font-normal text-muted">{termMonths(t.term)}</span>
      </p>
      {grade && <span className="text-[12px] text-ink-soft">{grade}</span>}
    </div>
  );

  if (breakName)
    return (
      <div className="hatch relative min-h-[150px] overflow-hidden rounded-[6px] border border-line">
        {header}
        <div className="grid h-[110px] place-items-center">
          <span className="stamp rotate-[-6deg] px-4 py-1 text-[18px] text-ink-soft/70">{breakName}</span>
        </div>
      </div>
    );

  return (
    <div className={`relative overflow-hidden rounded-[6px] border bg-paper ${isCompletion ? "border-red" : "border-line"}`}>
      {header}
      <ul className="ruled px-4">
        {t.courses.map((c) => (
          <li key={c.code} className="flex h-[34px] items-center gap-2.5 text-[13.5px]">
            <GroupDot group={c.group} />
            <span className="min-w-0 truncate">{c.name}</span>
            {c.assumptions.length > 0 && (
              <span className="text-[11px] text-red" title="개설 시기를 가정해 배치했어요">
                가정
              </span>
            )}
            <span className="ml-auto shrink-0 text-[11px] text-muted">{category(c.code)}</span>
            <span className="w-9 shrink-0 text-right tabular-nums text-ink-soft">{c.credits}</span>
          </li>
        ))}
        {t.slotCredits > 0 && (
          <li className="flex h-[34px] items-center gap-2.5 text-[13px] text-muted">
            <span aria-hidden className="inline-block size-[9px] rounded-[2px] border border-dashed border-muted" />
            그 밖의 전공·교양 (직접 고르기)
            <span className="ml-auto w-9 text-right tabular-nums">{t.slotCredits}</span>
          </li>
        )}
        {t.courses.length === 0 && t.slotCredits === 0 && <li className="flex h-[34px] items-center text-[13px] text-muted">배치할 과목 없음</li>}
      </ul>
      <div className="flex items-center justify-between px-4 pt-1 pb-2.5">
        {isCompletion ? <span className="font-hand text-[20px] text-red">여기서 계획 완료!</span> : <span />}
        <span className="text-[12px] text-ink-soft">
          합계 <b className="text-[14px] text-ink tabular-nums">{t.plannedCredits}</b>학점
        </span>
      </div>
    </div>
  );
}
