import { Flag } from "lucide-react";
import type { PlanDiff, PlanInput, PlannedTerm, PlanResult, SavedPlan, Term } from "@/contracts/types";
import { formatTerm, nextTerm, termIndex } from "@/engine";
import { endDateToMonth, startDateToMonth } from "../dates";
import { breakLabel, breakLabelFor, TRACK_NAME } from "../labels";
import { Badge, Button, Panel, Sub } from "./ui";

export function CompareView({
  planA,
  input,
  result,
  diff,
  onSaveA,
}: {
  planA: SavedPlan | null;
  input: PlanInput;
  result: PlanResult;
  diff: PlanDiff | null;
  onSaveA: () => void;
}) {
  if (!planA || !diff)
    return (
      <Panel>
        <p className="mb-1 text-[15px] font-semibold">아직 저장한 플랜 A가 없어요</p>
        <Sub className="mb-4">지금 계획을 A로 저장한 뒤 진로나 쉬는 기간을 바꾸면, 두 계획을 학기별로 나란히 비교해 보여줍니다.</Sub>
        <Button primary onClick={onSaveA}>지금 계획을 A로 저장</Button>
      </Panel>
    );

  const delta = diff.completionDeltaTerms;
  const names = courseNames(planA.result, result);
  const label = (codes: string[]) => (codes.length ? codes.map((c) => names.get(c) ?? c).join(", ") : "없음");

  return (
    <>
      <Panel className="mb-5">
        <div className="grid gap-x-8 gap-y-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <div>
            <p className="text-xs text-muted">계획 완료 시점</p>
            <p className="mt-0.5 text-[24px] font-semibold tracking-tight text-brand">
              {delta === null ? "비교할 수 없음" : delta === 0 ? "변화 없음" : `${Math.abs(delta)}학기 ${delta > 0 ? "늦어짐" : "앞당겨짐"}`}
            </p>
            <p className="mt-1 text-xs text-muted">
              A {formatTerm(planA.result.expectedCompletion)} → 지금 {formatTerm(result.expectedCompletion)}
            </p>
          </div>
          <dl className="grid gap-1.5 text-[13px]">
            <Row k="새로 들어온 과목" v={label(diff.addedCourses)} />
            <Row k="빠진 과목" v={label(diff.removedCourses)} />
            <Row k="새로 생긴 확인 항목" v={`${diff.newWarnings.length}개`} />
          </dl>
        </div>
      </Panel>

      <CompareTimeline a={planA} input={input} result={result} />

      <div className="mt-4 flex items-center justify-between gap-3">
        <Sub>자료 버전 A {planA.catalogVersion} / 지금 {result.catalogVersion}</Sub>
        <Button onClick={onSaveA}>지금 계획으로 A 바꾸기</Button>
      </div>
    </>
  );
}

/** 두 계획의 학기를 같은 줄에 맞춰 놓고, 달라진 학기를 강조한다. 표시만 하며 계산하지 않는다. */
function CompareTimeline({ a, input, result }: { a: SavedPlan; input: PlanInput; result: PlanResult }) {
  const all = [...a.result.terms, ...result.terms];
  if (all.length === 0) return null;
  const first = all.reduce((m, t) => (termIndex(t.term) < termIndex(m) ? t.term : m), all[0].term);
  const lastIdx = Math.max(...all.map((t) => termIndex(t.term)));
  const rows: Term[] = [];
  for (let t = first; termIndex(t) <= lastIdx; t = nextTerm(t)) rows.push(t);

  const find = (terms: PlannedTerm[], t: Term) => terms.find((x) => termIndex(x.term) === termIndex(t)) ?? null;
  const same = (x: PlannedTerm | null, y: PlannedTerm | null) =>
    !!x && !!y && x.status === y.status && x.plannedCredits === y.plannedCredits &&
    x.courses.map((c) => c.code).join() === y.courses.map((c) => c.code).join();
  const isEnd = (r: PlanResult, t: Term) => !!r.expectedCompletion && termIndex(r.expectedCompletion) === termIndex(t);

  return (
    <section aria-label="학기별 비교" className="overflow-hidden rounded-xl border border-line bg-panel">
      <div className="grid grid-cols-[92px_minmax(0,1fr)_minmax(0,1fr)] border-b border-line bg-bg/60 text-xs">
        <span className="px-3 py-2.5 text-muted">학기</span>
        <PlanHead label="플랜 A · 저장" input={a.input} />
        <PlanHead label="지금" input={input} current />
      </div>
      {rows.map((t) => {
        const x = find(a.result.terms, t);
        const y = find(result.terms, t);
        const changed = !same(x, y);
        return (
          <div
            key={termIndex(t)}
            className={`grid grid-cols-[92px_minmax(0,1fr)_minmax(0,1fr)] border-b border-line last:border-0 ${changed ? "bg-active/50" : ""}`}
          >
            <div className={`px-3 py-2.5 text-xs ${changed ? "border-l-[3px] border-brand pl-[9px]" : ""}`}>
              <span className="font-semibold tabular-nums">{t.year}</span> <span className="text-muted">{t.season}학기</span>
              {changed && <span className="mt-0.5 block text-[11px] text-brand">달라짐</span>}
            </div>
            <Cell term={x} input={a.input} end={isEnd(a.result, t)} />
            <Cell term={y} input={input} end={isEnd(result, t)} />
          </div>
        );
      })}
    </section>
  );
}

function PlanHead({ label, input, current }: { label: string; input: PlanInput; current?: boolean }) {
  return (
    <div className="border-l border-line px-3 py-2.5">
      <Badge tone={current ? "brand" : "muted"}>{label}</Badge>
      <p className="mt-1.5 text-[13px] font-medium">
        {TRACK_NAME[input.track]} · 상한 {input.creditCap}학점 · 목표 {input.targetCredits ?? "미입력"}
      </p>
      <p className="text-[11px] text-muted">{breaksText(input)}</p>
    </div>
  );
}

function Cell({ term, input, end }: { term: PlannedTerm | null; input: PlanInput; end: boolean }) {
  if (!term) return <div className="border-l border-line px-3 py-2.5 text-xs text-muted">—</div>;
  if (term.status === "break")
    return (
      <div className="hatch flex items-center border-l border-line px-3 py-2.5 text-xs font-medium">{breakLabelFor(term.term, input.breaks)}</div>
    );
  return (
    <div className="min-w-0 border-l border-line px-3 py-2.5 text-xs">
      <div className="mb-0.5 flex items-center gap-2">
        <span className="font-semibold tabular-nums">{term.plannedCredits}학점</span>
        {end && (
          <span className="flex items-center gap-1 text-brand">
            <Flag size={11} aria-hidden /> 완료
          </span>
        )}
      </div>
      <p className="text-muted">{term.courses.map((c) => c.name).join(", ") || "전공 과목 없음"}</p>
    </div>
  );
}

function breaksText(input: PlanInput): string {
  if (input.breaks.length === 0) return "쉬는 기간 없음";
  return input.breaks
    .map((b) => `${breakLabel([b])} ${monthLabel(startDateToMonth(b.startDate))}~${monthLabel(endDateToMonth(b.endDate))}`)
    .join(", ");
}

/** 두 결과에 나온 과목의 학수번호 → 이름. 화면 표시용이며 계산에 쓰지 않는다. */
function courseNames(...results: PlanResult[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of results) {
    r.terms.forEach((t) => t.courses.forEach((c) => map.set(c.code, c.name)));
    r.unplaced.forEach((u) => map.set(u.code, u.name));
  }
  return map;
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b border-line pb-1.5 last:border-0">
      <dt className="text-muted">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

/** "2028-04" → "2028.4". 마지막 월은 포함 기준으로 보여준다. */
function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${y}.${m}`;
}
