import type { PlanDiff, PlanInput, PlanResult, SavedPlan } from "@/contracts/types";
import { formatTerm } from "@/engine";
import { Badge, Button, Panel, Sub } from "./ui";

const TRACK_NAME = { security: "정보보안", data: "데이터 분석" } as const;

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
        <p className="mb-3 text-sm">저장된 플랜 A가 없습니다.</p>
        <Sub className="mb-4">현재 조건을 A로 저장한 뒤 진로·일정·상한을 바꾸면 B와의 차이를 보여줍니다.</Sub>
        <Button primary onClick={onSaveA}>현재 계획을 A로 저장</Button>
      </Panel>
    );

  const delta = diff.completionDeltaTerms;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <PlanCard label="플랜 A · 저장된 기준" input={planA.input} result={planA.result} version={planA.catalogVersion} />
        <PlanCard label="플랜 B · 현재 조건" input={input} result={result} version={result.catalogVersion} current />
      </div>
      <Panel className="mt-4 text-xs">
        <h2 className="mb-2.5 text-base font-medium">이번 선택으로 달라진 점</h2>
        <Row k="계획 완료 시점" v={delta === null ? "비교할 수 없음" : delta === 0 ? "변화 없음" : `${Math.abs(delta)}학기 ${delta > 0 ? "뒤로 이동" : "앞당김"}`} />
        <Row k="추가된 과목" v={diff.addedCourses.length ? diff.addedCourses.join(", ") : "없음"} />
        <Row k="빠진 과목" v={diff.removedCourses.length ? diff.removedCourses.join(", ") : "없음"} />
        <Row k="학점이 달라진 학기" v={`${diff.creditDiffByTerm.length}개`} />
        <Row k="새 경고" v={`${diff.newWarnings.length}개`} />
        <Row k="자료 버전" v={`A ${planA.catalogVersion} / B ${result.catalogVersion}`} />
      </Panel>
      <div className="mt-3">
        <Button onClick={onSaveA}>현재 계획으로 A 다시 저장</Button>
      </div>
    </>
  );
}

function PlanCard({
  label,
  input,
  result,
  version,
  current,
}: {
  label: string;
  input: PlanInput;
  result: PlanResult;
  version: string;
  current?: boolean;
}) {
  const brk = input.breaks[0];
  return (
    <section className={`min-w-0 rounded-[11px] border bg-panel p-4 ${current ? "border-brand" : "border-line"}`}>
      <Badge>{label}</Badge>
      <h3 className="mt-3 text-sm font-medium">
        {TRACK_NAME[input.track]} · {brk ? "군 복무·휴학 포함" : "학업 유지"}
      </h3>
      <strong className="my-3 block text-2xl font-medium tracking-tight">{formatTerm(result.expectedCompletion)}</strong>
      <dl className="text-xs">
        <Row k="학기당 상한" v={`${input.creditCap}학점`} />
        <Row k="중단 기간" v={brk ? `${brk.startDate} ~ ${brk.endDate}` : "없음"} />
        <Row k="목표학점" v={input.targetCredits === null ? "미입력" : `${input.targetCredits}학점`} />
        <Row k="자료 버전" v={version} />
      </dl>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2 last:border-0">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}
