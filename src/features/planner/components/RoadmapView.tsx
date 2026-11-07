import { Pause } from "lucide-react";
import type { GuidanceResult, PlanInput, PlannedTerm, PlanResult } from "@/contracts/types";
import { formatTerm } from "@/engine";
import { Badge, Panel, SectionHeader, Sub } from "./ui";

const TRACK_NAME = { security: "정보보안", data: "데이터 분석" } as const;

export function RoadmapView({
  input,
  result,
  guidance,
  checked,
  onToggle,
}: {
  input: PlanInput;
  result: PlanResult;
  guidance: GuidanceResult;
  checked: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  const years = [...new Set(result.terms.map((t) => t.term.year))];

  return (
    <>
      <SectionHeader
        title="학기별 로드맵"
        aside={<Badge>{formatTerm(input.startTerm)}부터 · {TRACK_NAME[input.track]}</Badge>}
      />

      {result.error ? (
        <div className="mb-4 rounded-lg bg-warm px-3 py-2.5 text-xs text-warm-ink">{result.error}</div>
      ) : (
        years.map((year) => (
          <div key={year} className="mb-3 grid gap-1 sm:grid-cols-[45px_minmax(0,1fr)] sm:gap-3.5">
            <div className="text-[13px] font-medium tabular-nums sm:pt-3.5">{year}</div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {result.terms.filter((t) => t.term.year === year).map((t) => (
                <TermCard key={`${t.term.year}-${t.term.season}`} t={t} />
              ))}
            </div>
          </div>
        ))
      )}

      {result.unplaced.length > 0 && (
        <Panel className="mt-3">
          <SectionHeader title="배치하지 못한 과목" />
          {result.unplaced.map((u) => (
            <p key={u.code} className="text-xs">
              {u.name} <span className="text-muted">— {u.reason}</span>
            </p>
          ))}
        </Panel>
      )}

      {!result.error && (
        <Sub className="mt-3 mb-6">
          미배정 학점은 실제 과목이 아닌 학점 슬롯입니다. 미래 개설 유지 가정을 포함하며, 졸업요건·복학 승인은 별도로 확인해야 합니다.
        </Sub>
      )}
      {result.error && <div className="mb-6" />}

      <Panel>
        <SectionHeader title="지금 준비할 일" aside={<span className="text-xs text-muted">선택과 일정에 맞춰 갱신</span>} />
        {guidance.items.map((g) => (
          <label key={g.id} className="flex items-start gap-3 border-b border-line py-3 text-xs last:border-0 last:pb-0">
            <input type="checkbox" checked={!!checked[g.id]} onChange={() => onToggle(g.id)} />
            <span className={`grid gap-0.5 ${checked[g.id] ? "line-through opacity-60" : ""}`}>
              {g.title}
              <small className="text-[11px] text-muted">{g.detail}</small>
            </span>
          </label>
        ))}
      </Panel>
    </>
  );
}

function TermCard({ t }: { t: PlannedTerm }) {
  if (t.status === "break")
    return (
      <div className="flex min-h-[65px] items-center justify-between gap-2 rounded-[9px] bg-break p-3 text-xs">
        <span>{t.term.season}학기</span>
        <span>군 복무·휴학</span>
        <Pause size={16} aria-hidden />
      </div>
    );

  const assumed = t.courses.some((c) => c.assumptions.length > 0);
  return (
    <article className="min-w-0 rounded-[9px] border border-line bg-panel p-3">
      <div className="mb-2.5 flex items-center justify-between gap-2 text-xs">
        <strong className="font-medium">{t.term.season}학기</strong>
        <Badge>{t.plannedCredits}학점 계획</Badge>
      </div>
      {t.courses.map((c) => (
        <div key={c.code} className="my-1 flex items-center justify-between gap-2 text-xs">
          <span className="break-words">{c.name}</span>
          <em className="text-[11px] whitespace-nowrap text-muted not-italic">{c.credits}학점</em>
        </div>
      ))}
      {t.slotCredits > 0 && <p className="mt-2 text-[11px] text-muted">미배정 전공·교양 {t.slotCredits}학점</p>}
      {t.courses.length === 0 && t.slotCredits === 0 && <Sub>학업 계획 검토</Sub>}
      {assumed && <p className="mt-2 text-[11px] text-warm-ink">개설 학기·종료연도 확인 필요</p>}
    </article>
  );
}
