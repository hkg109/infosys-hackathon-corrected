"use client";

import { ArrowLeft, CheckCircle2 } from "lucide-react";
import type { CandidateSet, PlanDiff, PlanInput, PlanResult, PriorityKey, SavedPlan, TrackCandidate } from "@/contracts/types";
import { TRACK_NAME } from "../labels";
import { CandidateList } from "./CandidateList";
import { ChangeSummary } from "./CompareView";
import { Controls } from "./Controls";
import { Button } from "./ui";

const PRIORITY_CHOICES: Array<[PriorityKey, string]> = [
  ["fast_completion", "빨리 끝내기"],
  ["career_core", "진로 과목 먼저"],
  ["light_terms", "여유 있는 학기"],
];

/**
 * 맞 단계(FE-2). 한 화면에 한 가지 일만 보여준다.
 * 1) 고르기: 엔진이 계산한 후보 카드에서 하나를 고른다.
 * 2) 맞추기: 고른 후보(base)에서 조건을 고치고, 고르기 전과 비교한 뒤 "맞다!"로 확정한다.
 * 후보·차이는 엔진 결과(generateCandidates, diffPlans)이며 화면에서 다시 계산하지 않는다.
 */
export function MatchStage({
  input,
  result,
  base,
  diff,
  revision,
  candidateSet,
  firstPriority,
  onFirstPriority,
  onSelectCandidate,
  onChangeInput,
  onChooseAgain,
  onConfirm,
}: {
  input: PlanInput;
  result: PlanResult;
  /** 고른 후보의 스냅샷. 없으면 고르기 화면 */
  base: SavedPlan | null;
  diff: PlanDiff | null;
  revision: number;
  candidateSet: CandidateSet | null;
  firstPriority: PriorityKey;
  onFirstPriority: (p: PriorityKey) => void;
  onSelectCandidate: (c: TrackCandidate) => void;
  onChangeInput: (next: PlanInput) => void;
  onChooseAgain: () => void;
  onConfirm: () => void;
}) {
  if (!base || !diff)
    return (
      <section aria-label="계획 후보">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-muted">
            <span className="font-medium text-ink">1단계</span> 학기당 학점을 달리해 계산한 후보 중 하나를 고르세요.
          </p>
          <div role="radiogroup" aria-label="가장 중요한 것" className="flex items-center gap-1 text-xs">
            <span className="mr-1 text-muted">가장 중요한 것</span>
            {PRIORITY_CHOICES.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={firstPriority === key}
                onClick={() => onFirstPriority(key)}
                className={`cursor-pointer rounded-full border px-3 py-1 font-medium ${
                  firstPriority === key ? "border-brand bg-brand text-contrast" : "border-line bg-panel text-ink hover:bg-bg"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {candidateSet?.engineVersion === "example" && (
          <p className="mb-3 rounded-lg bg-warm px-4 py-2 text-xs text-warm-ink">
            개발용 예시 후보예요(가상 입력). 실제 입력으로 계산한 결과가 아니며 운영 화면에는 나오지 않아요.
          </p>
        )}
        {candidateSet && <CandidateList set={candidateSet} selectedId={null} onSelect={onSelectCandidate} />}
      </section>
    );

  return (
    <section aria-label="계획 맞추기">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted">
          <span className="font-medium text-ink">2단계</span> {TRACK_NAME[base.input.track]} · 학기당 {base.input.creditCap}학점 후보에서
          시작했어요. 조건을 고치면 고르기 전과 비교해 보여드려요.
        </p>
        <Button onClick={onChooseAgain}>
          <ArrowLeft size={15} aria-hidden /> 다른 후보 고르기
        </Button>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Controls input={input} revision={revision} onChange={onChangeInput} />
        <ChangeSummary base={base} input={input} result={result} diff={diff} />
      </div>

      <div className="sticky bottom-4 z-10 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-5 py-4 shadow-[0_8px_24px_-12px_rgba(20,34,56,0.35)] print:hidden">
        <p className="text-[13px] text-muted">
          {result.error ? `입력을 확인해 주세요: ${result.error}` : "이 계획이 마음에 들면 확정하세요. 확정한 뒤에도 “다시 맞추기”로 돌아올 수 있어요."}
        </p>
        <Button primary onClick={onConfirm} disabled={!!result.error} className="px-6 text-[15px]">
          <CheckCircle2 size={17} aria-hidden /> 맞다!
        </Button>
      </div>
    </section>
  );
}
