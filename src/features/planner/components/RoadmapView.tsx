import { Flag } from "lucide-react";
import { useEffect, useRef } from "react";
import type { GuidanceResult, PlanInput, PlannedTerm, PlanResult, Term } from "@/contracts/types";
import { formatTerm } from "@/engine";
import { breakLabelFor, TRACK_NAME } from "../labels";
import { Badge, Panel, SectionHeader, Sub } from "./ui";
import { WarningsPanel } from "./WarningsPanel";

export const termAnchor = (t: Term) => `term-${t.year}-${t.season}`;

type Block = { kind: "study"; t: PlannedTerm } | { kind: "break"; from: Term; to: Term; count: number };

/** 연속된 중단 학기를 하나의 띠로 묶는다(표시만, 계산 결과는 그대로). */
function toBlocks(terms: PlannedTerm[]): Block[] {
  const blocks: Block[] = [];
  for (const t of terms) {
    const last = blocks[blocks.length - 1];
    if (t.status === "break" && last?.kind === "break") {
      last.to = t.term;
      last.count++;
    } else if (t.status === "break") blocks.push({ kind: "break", from: t.term, to: t.term, count: 1 });
    else blocks.push({ kind: "study", t });
  }
  return blocks;
}

export function RoadmapView({
  input,
  result,
  guidance,
  checked,
  onToggle,
  focusTerm,
}: {
  input: PlanInput;
  result: PlanResult;
  guidance: GuidanceResult;
  checked: Record<string, boolean>;
  onToggle: (id: string) => void;
  /** 전공 과목 화면에서 고른 학기. 그 학기로 스크롤하고 잠깐 강조한다. */
  focusTerm: Term | null;
}) {
  const blocks = toBlocks(result.terms);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!focusTerm) return;
    const el = listRef.current?.querySelector<HTMLElement>(`#${termAnchor(focusTerm)}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.dataset.flash = "on";
    const timer = setTimeout(() => delete el.dataset.flash, 1800);
    return () => clearTimeout(timer);
  }, [focusTerm]);
  let lastYear: number | null = null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] print:block">
      <section aria-label="학기별 로드맵">
        {!result.error && <WarningsPanel result={result} />}
        <SectionHeader
          title="학기별 로드맵"
          aside={
            <span className="flex items-center gap-3 text-[11px] text-muted">
              <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-muted" />공통 기반</span>
              <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-accent" />{TRACK_NAME[input.track]} 추천</span>
            </span>
          }
        />

        {result.error ? (
          <div role="alert" className="rounded-lg bg-warm px-3.5 py-3 text-[13px] text-warm-ink">
            {result.error} 위의 입력을 고치면 바로 다시 계산됩니다.
          </div>
        ) : (
          <ol ref={listRef} className="relative">
            {blocks.map((b, i) => {
              const term = b.kind === "study" ? b.t.term : b.from;
              const showYear = term.year !== lastYear;
              lastYear = b.kind === "study" ? b.t.term.year : b.to.year;
              return (
                <li key={i} className="break-inside-avoid grid grid-cols-[52px_18px_minmax(0,1fr)] gap-x-2 sm:grid-cols-[64px_22px_minmax(0,1fr)]">
                  <div className="pt-3 text-right">
                    {showYear && <div className="text-[15px] font-semibold text-ink tabular-nums">{term.year}</div>}
                    <div className="text-[11px] text-muted">{term.season}학기</div>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="absolute inset-y-0 w-px bg-line" aria-hidden />
                    <span
                      className={`relative mt-[17px] size-2.5 rounded-full ring-4 ring-bg ${b.kind === "break" ? "bg-line" : "bg-brand"}`}
                      aria-hidden
                    />
                  </div>
                  <div className="min-w-0 pb-3">
                    {b.kind === "break" ? (
                      <BreakBand from={b.from} to={b.to} count={b.count} label={breakLabelFor(b.from, input.breaks)} />
                    ) : (
                      <TermCard t={b.t} />
                    )}
                  </div>
                </li>
              );
            })}
            <li className="grid grid-cols-[52px_18px_minmax(0,1fr)] gap-x-2 sm:grid-cols-[64px_22px_minmax(0,1fr)]">
              <span />
              <div className="flex justify-center">
                <span className="mt-2 grid size-[22px] place-items-center rounded-full bg-brand text-contrast">
                  <Flag size={12} aria-hidden />
                </span>
              </div>
              <div className="pt-2.5 text-[13px]">
                {result.expectedCompletion ? (
                  <>
                    <strong className="font-semibold">{formatTerm(result.expectedCompletion)}</strong>에 계획한 과목과 목표학점을 모두 채워요.
                  </>
                ) : (
                  <span className="text-muted">목표 총학점을 입력하면 예상 완료 학기를 보여줍니다.</span>
                )}
              </div>
            </li>
          </ol>
        )}

        {!result.error && (
          <Sub className="mt-4">
            미배정 학점은 실제 과목이 아닌 학점 자리입니다. 과목이 앞으로도 개설된다는 가정을 포함하며, 졸업요건·복학 승인은 따로 확인해야 합니다.
          </Sub>
        )}
      </section>

      <aside className="break-inside-avoid lg:sticky lg:top-4 lg:self-start print:static print:mt-6">
        <Panel>
          <SectionHeader title="지금 준비할 일" />
          {guidance.items.length === 0 && <Sub>입력을 고치면 준비할 일이 여기 나타납니다.</Sub>}
          {guidance.items.map((g) => (
            <label key={g.id} className="flex cursor-pointer items-start gap-3 border-b border-line py-3 text-[13px] first:pt-0 last:border-0 last:pb-0">
              <input type="checkbox" className="mt-0.5 shrink-0" checked={!!checked[g.id]} onChange={() => onToggle(g.id)} />
              <span className={`grid gap-1 ${checked[g.id] ? "text-muted line-through" : ""}`}>
                {g.title}
                <small className="text-xs text-muted no-underline">{g.detail}</small>
              </span>
            </label>
          ))}
        </Panel>
      </aside>
    </div>
  );
}

function BreakBand({ from, to, count, label }: { from: Term; to: Term; count: number; label: string }) {
  return (
    <div className="hatch flex min-h-[52px] flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-line px-3.5 py-3 text-[13px]">
      <strong className="font-semibold">{label}</strong>
      <span className="text-xs text-muted">
        {count > 1 ? `${formatTerm(from)} ~ ${formatTerm(to)} · ${count}개 학기` : formatTerm(from)}
      </span>
    </div>
  );
}

const ASSUMPTION_TEXT = {
  semester_unknown: "이수학기가 확인되지 않아 이 학기에 가정 배치",
  offering_after_end_year: "자료상 종료연도 이후라 개설 유지를 가정",
} as const;

function TermCard({ t }: { t: PlannedTerm }) {
  return (
    <article id={termAnchor(t.term)} className="flash scroll-mt-24 rounded-lg border border-line bg-panel px-3.5 py-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{t.courses.length > 0 ? `${t.courses.length}과목` : "전공 과목 없음"}</span>
        <Badge tone="muted">{t.plannedCredits}학점</Badge>
      </div>
      <ul className="grid gap-1">
        {t.courses.map((c) => (
          <li key={c.code} className="flex items-center gap-2 text-[13px]">
            <i className={`size-1.5 shrink-0 rounded-full ${c.group === "common" ? "bg-muted" : "bg-accent"}`} aria-hidden />
            <span className="min-w-0 break-words">{c.name}</span>
            {c.assumptions.length > 0 && (
              <span
                className="cursor-help rounded border border-warm-line bg-warm px-1 text-[10px] leading-4 text-warm-ink"
                title={c.assumptions.map((a) => ASSUMPTION_TEXT[a]).join(" / ")}
              >
                가정<span className="sr-only">: {c.assumptions.map((a) => ASSUMPTION_TEXT[a]).join(", ")}</span>
              </span>
            )}
            <span className="ml-auto text-[11px] whitespace-nowrap text-muted tabular-nums">{c.credits}학점</span>
          </li>
        ))}
      </ul>
      {t.slotCredits > 0 && <p className="mt-2 text-xs text-muted">그 밖의 전공·교양 {t.slotCredits}학점</p>}
    </article>
  );
}
