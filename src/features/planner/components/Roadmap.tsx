import { Plus, X } from "lucide-react";
import type { BreakPeriod, CourseGroup, Dataset, PlanInput, PlannedTerm, PlanResult, Term } from "@/contracts/types";
import { emptyGenEd, GEN_ED_NOTE, type GenEdState, isBlocked, termBreakdown, termIndex } from "@/engine";
import { gradeLabel, termMonths } from "../plan";
import { GroupDot, groupLabel } from "./ui";

/**
 * 학기별 로드맵: 연도 한 줄에 1·2학기 두 칸. 엔진 결과(PlanResult)를 그대로 그린다.
 * 교양 자리는 학기의 미지정 학점을 구체화할 뿐이라 학기 합계는 엔진 값 그대로다.
 */
export function Roadmap({
  input,
  result,
  dataset,
  exchange = null,
  genEd = emptyGenEd(),
  onAddGenEd,
  onRemoveGenEd,
}: {
  input: PlanInput;
  result: PlanResult;
  dataset: Dataset;
  /** 교환학생 학기 구간. v1 입력에서는 중단 구간과 구분되지 않아 따로 받는다. */
  exchange?: { startDate: string; endDate: string } | null;
  genEd?: GenEdState;
  /** 없으면 읽기 전용(확정 후·인쇄) */
  onAddGenEd?: (term: Term, credits: 2 | 3) => void;
  onRemoveGenEd?: (id: string) => void;
}) {
  const years = [...new Set(result.terms.map((t) => t.term.year))];
  const completionIdx = result.expectedCompletion ? termIndex(result.expectedCompletion) : null;
  const category = (code: string) => dataset.courses.find((c) => c.code === code)?.category ?? null;

  // 유효학기 순번: 마친 학기 + 이번 계획에서 다닌 학기
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
          <span aria-hidden className="inline-block size-[9px] rounded-[2px] border border-dashed border-pen bg-pen/10" /> 교양 자리(실제 과목 아님)
        </span>
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
              if (!t) return <div key={season} className="rounded-[6px] border border-dashed border-line/70 print:hidden" aria-hidden />;
              const idx = termIndex(t.term);
              return (
                <TermPage
                  key={season}
                  t={t}
                  ordinal={ordinal.get(idx) ?? null}
                  breakName={t.status === "break" ? breakName(t, input.breaks, exchange) : null}
                  isCompletion={idx === completionIdx}
                  category={category}
                  dataset={dataset}
                  genEd={genEd}
                  onAdd={onAddGenEd}
                  onRemove={onRemoveGenEd}
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
  ordinal,
  breakName,
  isCompletion,
  category,
  dataset,
  genEd,
  onAdd,
  onRemove,
}: {
  t: PlannedTerm;
  ordinal: number | null;
  breakName: string | null;
  isCompletion: boolean;
  category: (code: string) => string | null;
  dataset: Dataset;
  genEd: GenEdState;
  onAdd?: (term: Term, credits: 2 | 3) => void;
  onRemove?: (id: string) => void;
}) {
  const header = (
    <div className="flex items-baseline justify-between border-b-[1.5px] border-ink/70 px-4 pt-3 pb-1.5">
      <p className="font-serif text-[16px] font-bold">
        {t.term.season}학기 <span className="ml-1 text-[12px] font-normal text-muted">{termMonths(t.term)}</span>
      </p>
      {ordinal !== null ? (
        <span className="text-[12px] text-ink-soft">
          {gradeLabel(ordinal)} · 유효학기 {ordinal + 1}
        </span>
      ) : (
        <span className="text-[12px] font-semibold text-ink-soft">{breakName}</span>
      )}
    </div>
  );

  if (breakName)
    return (
      <div className="hatch relative min-h-[150px] overflow-hidden rounded-[6px] border border-line break-inside-avoid">
        {header}
        <div className="grid h-[110px] place-items-center">
          <span className="stamp rotate-[-6deg] px-4 py-1 text-[18px] text-ink-soft/70">{breakName}</span>
        </div>
      </div>
    );

  const b = termBreakdown(t, genEd, dataset);
  const left = b.unassigned;
  const reason = (c: 2 | 3) => (left <= 0 ? "이 학기에는 남은 미지정 학점이 없어요" : c > left ? `남은 미지정 학점이 ${left}학점이에요` : `교양 ${c}학점 자리 추가`);

  return (
    <div className={`relative overflow-hidden rounded-[6px] border bg-paper break-inside-avoid ${isCompletion ? "border-red" : "border-line"}`}>
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
        {b.placeholders.map((g) => (
          <li key={g.id} className="flex h-[34px] items-center gap-2.5 text-[13.5px]" title={GEN_ED_NOTE}>
            <span aria-hidden className="inline-block size-[9px] shrink-0 rounded-[2px] border border-dashed border-pen bg-pen/10" />
            <span className="min-w-0 truncate font-medium text-pen">{g.label}</span>
            {g.origin === "demo" && <span className="shrink-0 text-[10px] text-muted">시연</span>}
            <span className="ml-auto shrink-0 text-[11px] text-muted">교양 자리</span>
            {onRemove && (
              <button type="button" onClick={() => onRemove(g.id)} className="-my-1 grid size-6 shrink-0 cursor-pointer place-items-center rounded text-muted hover:bg-paper-2 hover:text-red print:hidden" aria-label={`${g.label} 빼기`}>
                <X size={13} aria-hidden />
              </button>
            )}
            <span className="w-9 shrink-0 text-right tabular-nums text-ink-soft">{g.credits}</span>
          </li>
        ))}
        {b.majorSlot > 0 && (
          <li className="flex h-[34px] items-center gap-2.5 text-[13.5px]" title="전공 요건(졸업사정)을 채우려고 잡은 자리예요. 수강신청 때 전공 과목을 직접 골라야 해요.">
            <span aria-hidden className="inline-block size-[9px] shrink-0 rounded-[2px] border border-dashed border-ink bg-ink/10" />
            <span className="min-w-0 truncate font-medium">
              전공 선택 자리
            </span>
            <span className="ml-auto shrink-0 text-[11px] text-muted">{(t.upperMajorSlotCredits ?? 0) > 0 ? `400단위 ${t.upperMajorSlotCredits}` : "전공 요건"}</span>
            <span className="w-9 shrink-0 text-right tabular-nums text-ink-soft">{b.majorSlot}</span>
          </li>
        )}
        {b.unassigned > 0 && (
          <li className="flex h-[34px] items-center gap-2.5 text-[13px] text-muted">
            <span aria-hidden className="inline-block size-[9px] shrink-0 rounded-[2px] border border-dashed border-muted" />
            <span className="min-w-0 truncate">미지정 전공·교양 자리</span>
            <span className="ml-auto shrink-0 text-[11px]">직접 고르기</span>
            <span className="w-9 shrink-0 text-right tabular-nums">{b.unassigned}</span>
          </li>
        )}
        {t.courses.length === 0 && t.slotCredits === 0 && <li className="flex h-[34px] items-center text-[13px] text-muted">배치할 과목 없음</li>}
      </ul>
      {onAdd && (
        <div className="flex gap-1.5 px-4 pt-1.5 print:hidden">
          {([2, 3] as const).map((c) => (
            <button
              key={c}
              type="button"
              disabled={c > left}
              title={reason(c)}
              onClick={() => onAdd(t.term, c)}
              className="inline-flex min-h-[30px] cursor-pointer items-center gap-1 rounded-[5px] border border-dashed border-pen/60 px-2 text-[12px] text-pen hover:bg-pen/[0.06] disabled:cursor-not-allowed disabled:border-line disabled:text-muted"
            >
              <Plus size={12} aria-hidden /> {c}학점 교양
            </button>
          ))}
        </div>
      )}
      {onAdd && left < 3 && (
        <p role="note" className="mx-4 mt-1.5 rounded-[4px] bg-red-soft/40 px-2 py-1 text-[11.5px] text-red print:hidden">
          {left <= 0
            ? `이 학기는 최대 ${t.capCredits ?? t.plannedCredits}학점이 다 차서 교양을 더 넣을 수 없어요.`
            : `남은 자리가 ${left}학점이라 3학점 교양은 넣을 수 없어요(최대 ${t.capCredits ?? t.plannedCredits}학점).`}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 px-4 pt-1.5 pb-2.5">
        {isCompletion ? <span className="font-hand text-[20px] text-red">여기서 계획 완료!</span> : <span />}
        <span className="text-right text-[12px] text-ink-soft tabular-nums">
          전공 {b.major + b.majorSlot} · 교양 {b.generalEducation}
          {b.unassigned > 0 ? ` · 미지정 ${b.unassigned}` : ""} · 합계 <b className="text-[14px] text-ink">{b.total}</b>
          {t.capCredits !== undefined && <span className="text-muted"> / 상한 {t.capCredits}</span>}
        </span>
      </div>
    </div>
  );
}
