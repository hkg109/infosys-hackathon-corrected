"use client";

import { Printer, RotateCcw, UserRoundPen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CandidateSet, PlanInput, PlanResult, PriorityKey, SavedPlan, Term, TrackCandidate } from "@/contracts/types";
import {
  DEFAULT_PRIORITIES,
  diffPlans,
  ENGINE_VERSION,
  formatTerm,
  generateCandidates,
  planInputFromV1,
  simulatePlan,
  termIndex,
} from "@/engine";
import { buildGuidance } from "@/features/guidance/buildGuidance";
import { CatalogBar, CatalogNotice, CatalogProblem } from "./components/CatalogStatus";
import { CoursesView } from "./components/CoursesView";
import { MatchStage } from "./components/MatchStage";
import { Onboarding } from "./components/Onboarding";
import { PrintHeader } from "./components/PrintHeader";
import { RoadmapView } from "./components/RoadmapView";
import { Sidebar, type View } from "./components/Sidebar";
import { SourcesView } from "./components/SourcesView";
import { Button } from "./components/ui";
import { todayISO } from "./defaults";
import { exampleCandidates } from "./dev/exampleCandidates";
import { completedTermsLabel, type Profile } from "./profile";
import {
  clearInput,
  loadChecked,
  loadInput,
  loadPlanA,
  loadProfile,
  loadStage,
  saveChecked,
  saveInput,
  savePlanA,
  saveProfile,
  saveStage,
} from "./storage";
import { useCatalog } from "./useCatalog";

const TITLES: Record<View, [string, string]> = {
  mat: ["계획 맞춰가기", "후보를 고르고 조건을 고친 뒤, 마음에 들면 \u201c맞다!\u201d로 확정하세요"],
  da: ["학기 로드맵", "확정한 계획을 학기별로 정리했어요"],
  courses: ["진로에 맞는 전공 과목", "학과 교육과정에 서비스의 진로 추천을 연결했어요"],
  sources: ["자료와 출처", "계획에 쓰인 학과 자료가 어디서 왔는지 확인하세요"],
};

export function PlannerApp() {
  const [view, setViewState] = useState<View>("mat");
  const [confirmed, setConfirmed] = useState(false);
  const { catalog, loading, reload } = useCatalog();
  const [mounted, setMounted] = useState(false);
  const [input, setInput] = useState<PlanInput | null>(null);
  const [revision, setRevision] = useState(0);
  const [planA, setPlanA] = useState<SavedPlan | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [focusTerm, setFocusTerm] = useState<Term | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  /** 개발 서버에서 `?example=normal|no-target|empty`일 때만 예시 후보로 엔진 결과를 대신한다(빈 상태 확인용). */
  const [exampleSet, setExampleSet] = useState<CandidateSet | null>(null);
  /** 후보 비교에서 가장 먼저 볼 기준. 나머지는 엔진의 기본 순서를 따른다. */
  const [firstPriority, setFirstPriority] = useState<PriorityKey>(DEFAULT_PRIORITIES[0]);

  // localStorage·URL은 브라우저 시작 후에만 읽는다.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      setExampleSet(exampleCandidates(new URLSearchParams(window.location.search).get("example")));
    }
    setInput(loadInput());
    setPlanA(loadPlanA());
    setChecked(loadChecked() ?? {});
    setProfile(loadProfile());
    const stage = loadStage();
    if (stage) {
      setViewState(stage.view);
      setConfirmed(stage.confirmed);
    }
    setMounted(true);
    reload();
  }, [reload]);

  const setStage = (nextView: View, nextConfirmed: boolean) => {
    setViewState(nextView);
    setConfirmed(nextConfirmed);
    saveStage({ view: nextView, confirmed: nextConfirmed });
  };
  const setView = (v: View) => setStage(v, confirmed);

  /** 계획 조건이 바뀌면 확정을 풀고 다시 맞춰가기로 본다. */
  const updateInput = (next: PlanInput) => {
    setInput(next);
    saveInput(next);
    if (confirmed) setStage(view, false);
  };

  const confirmPlan = () => setStage("da", true);

  /** 고른 후보 스냅샷(수정 전 기준). 브라우저에 저장해 새로고침 후에도 맞추기 화면을 복구한다. */
  const setBase = (plan: SavedPlan | null) => {
    setPlanA(plan);
    savePlanA(plan);
  };

  const finishProfile = (next: PlanInput, nextProfile: Profile) => {
    updateInput(next);
    setProfile(nextProfile);
    saveProfile(nextProfile);
    setEditing(false);
    setBase(null);
    setRevision((r) => r + 1);
    setStage("mat", false);
  };

  const restart = () => {
    clearInput();
    saveProfile(null);
    setInput(null);
    setProfile(null);
    setEditing(false);
    setBase(null);
    setRevision((r) => r + 1);
    setStage("mat", false);
  };

  const dataset = catalog?.dataset ?? null;
  const result = useMemo(() => (dataset && input ? simulatePlan(input, dataset) : null), [input, dataset]);
  const guidance = useMemo(
    () => (dataset && input && result ? buildGuidance(input, result, dataset) : { items: [] }),
    [input, result, dataset],
  );
  const diff = useMemo(() => (planA && result ? diffPlans(planA.result, result) : null), [planA, result]);

  /**
   * 후보: 지금 입력의 진로는 그대로 두고 학점 페이스만 비교로 펼쳐 엔진이 계산·정렬한다.
   * 화면은 결과를 그대로 보여주고 순위를 다시 계산하지 않는다.
   */
  const engineSet = useMemo(() => {
    if (!dataset || !input) return null;
    const v2 = planInputFromV1(input, { campus: dataset.campus, department: dataset.department });
    return generateCandidates(
      {
        ...v2,
        pace: { mode: "compare", options: null },
        priorities: [firstPriority, ...DEFAULT_PRIORITIES.filter((p) => p !== firstPriority)],
      },
      dataset,
    );
  }, [input, dataset, firstPriority]);
  const candidateSet = exampleSet ?? engineSet;

  /** "이 트랙으로 시작": 후보의 진로·학점 페이스를 지금 조건으로 가져오고, 그 계획을 수정 전 기준으로 저장한다. */
  const startFromCandidate = (c: TrackCandidate) => {
    if (!input || !dataset) return;
    const next = { ...input, track: c.key.career, creditCap: c.key.paceCredits };
    const planned = simulatePlan(next, dataset);
    setBase({
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      input: structuredClone(next),
      result: planned,
      catalogVersion: planned.catalogVersion,
      engineVersion: ENGINE_VERSION,
    });
    updateInput(next);
    setRevision((r) => r + 1);
  };

  /** 다른 후보 고르기: 기준을 지우고 고르기 화면으로. 지금 조건은 그대로 둔다. */
  const chooseAgain = () => {
    setBase(null);
    if (confirmed) setStage(view, false);
  };

  const jumpTo = (term: Term) => {
    setView("da");
    setFocusTerm({ ...term }); // 같은 학기를 다시 눌러도 이동하도록 새 객체로 둔다.
  };

  const toggleChecked = (id: string) => {
    const next = { ...checked, [id]: !checked[id] };
    setChecked(next);
    saveChecked(next);
  };

  const toggleCompleted = (code: string) => {
    if (!input) return;
    const has = input.completedCourseCodes.includes(code);
    updateInput({
      ...input,
      completedCourseCodes: has
        ? input.completedCourseCodes.filter((c) => c !== code)
        : [...input.completedCourseCodes, code],
    });
  };

  const onboarding = mounted && (!input || editing);
  const [title, desc] = TITLES[view];

  return (
    <div className="mx-auto max-w-[1240px] sm:p-4 print:max-w-none print:p-0">
      <div className="grid min-h-dvh overflow-clip bg-bg sm:min-h-0 sm:rounded-2xl sm:border sm:border-line grid-cols-[200px_minmax(0,1fr)] print:block print:min-h-0 print:border-0 print:bg-white">
        <Sidebar
          view={view}
          onboarding={onboarding}
          confirmed={confirmed}
          onChange={(v) => {
            setFocusTerm(null);
            setView(v);
          }}
          onOpenInput={input ? () => setEditing(true) : undefined}
          profile={profile}
          input={input}
          onRestart={input ? restart : undefined}
        />
        <main className="min-w-0 px-4 py-5 sm:px-7 sm:py-6 print:p-0">
          <div className="print:hidden">
            <CatalogBar catalog={catalog} loading={loading} />
          </div>

          {!mounted ? (
            <Skeleton />
          ) : onboarding ? (
            <div className="mt-6">
              {catalog && !dataset && <CatalogProblem catalog={catalog} onReload={reload} />}
              <Onboarding dataset={dataset} initialInput={editing ? input : null} initialProfile={profile} onDone={finishProfile} onCancel={editing ? () => setEditing(false) : undefined} />
            </div>
          ) : (
            input && (
              <>
                <PrintHeader input={input} profile={profile} catalog={catalog} printedAt={mounted ? todayISO() : ""} />
                <header className="mt-4 mb-5 flex flex-wrap items-end justify-between gap-3.5 print:hidden">
                  <div>
                    <h1 className="text-[28px] font-semibold tracking-tight text-ink">{profile?.name && (view === "mat" || view === "da") ? `${profile.name}님의 ${title}` : title}</h1>
                    <p className="mt-1 text-[13px] text-muted">{view === "da" ? `${input.completedTerms === 0 ? "신입생으로" : `${completedTermsLabel(input.completedTerms)} 마친 상태에서`} ${formatTerm(input.startTerm)}부터 계획했어요` : desc}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {view === "da" && result && !result.error && (
                      <Button onClick={() => window.print()}>
                        <Printer size={15} aria-hidden /> 인쇄·PDF 저장
                      </Button>
                    )}
                    {view === "da" && (
                      <Button onClick={() => setStage("mat", false)}>
                        <RotateCcw size={15} aria-hidden /> 다시 맞추기
                      </Button>
                    )}
                    {view === "mat" && (
                      <Button onClick={() => setEditing(true)}>
                        <UserRoundPen size={15} aria-hidden /> 내 정보 수정
                      </Button>
                    )}
                  </div>
                </header>

                {!catalog ? (
                  <Skeleton />
                ) : !dataset || !result ? (
                  view !== "sources" && <CatalogProblem catalog={catalog} onReload={reload} />
                ) : (
                  <>
                    <CatalogNotice catalog={catalog} />
                    {view === "mat" && (
                      <MatchStage
                        input={input}
                        result={result}
                        base={planA}
                        diff={diff}
                        revision={revision}
                        candidateSet={candidateSet}
                        firstPriority={firstPriority}
                        onFirstPriority={setFirstPriority}
                        onSelectCandidate={startFromCandidate}
                        onChangeInput={updateInput}
                        onChooseAgain={chooseAgain}
                        onConfirm={confirmPlan}
                      />
                    )}
                    {view === "da" && (
                      <>
                        {!confirmed && (
                          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warm px-4 py-3 text-[13px] text-warm-ink print:hidden">
                            아직 확정하지 않은 계획이에요. 맞춰가기에서 &ldquo;맞다!&rdquo;를 누르면 이 로드맵으로 확정됩니다.
                            <Button onClick={() => setView("mat")}>맞춰가기로 가기</Button>
                          </div>
                        )}
                        <Summary result={result} input={input} planA={planA} />
                        <RoadmapView input={input} result={result} guidance={guidance} checked={checked} onToggle={toggleChecked} focusTerm={focusTerm} />
                      </>
                    )}
                    {view === "courses" && <CoursesView input={input} dataset={dataset} result={result} onToggleCompleted={toggleCompleted} onJump={jumpTo} />}
                  </>
                )}
                {view === "sources" && catalog && <SourcesView catalog={catalog} onReload={reload} loading={loading} />}
              </>
            )
          )}

          <footer className="mt-10 border-t border-line pt-3 text-[11px] text-muted print:mt-6">
            계획·추정 결과이며 졸업 확정 판정이 아닙니다. 과목 정보는 학과 공식 자료, 진로 분류는 서비스 추천입니다.
          </footer>
        </main>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="mt-6 grid gap-3" aria-busy="true" aria-label="불러오는 중">
      <div className="h-8 w-56 animate-pulse rounded-md bg-line/60" />
      <div className="h-24 animate-pulse rounded-xl bg-line/40" />
      <div className="h-40 animate-pulse rounded-xl bg-line/40" />
    </div>
  );
}

/** 결과 요약 한 줄. 남은 학점은 입력값 차이일 뿐 새 계산을 하지 않는다. */
function Summary({ result, input, planA }: { result: PlanResult; input: PlanInput; planA: SavedPlan | null }) {
  const a = planA?.result.expectedCompletion;
  const b = result.expectedCompletion;
  const delta = a && b ? termIndex(b) - termIndex(a) : null;
  const remaining = input.targetCredits === null ? null : Math.max(0, input.targetCredits - input.earnedCredits);

  return (
    <dl className="mb-6 grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-panel sm:grid-cols-[1.4fr_1fr_1fr]">
      <div className="col-span-2 border-b border-line px-4 py-3.5 sm:col-span-1 sm:border-r sm:border-b-0">
        <dt className="text-xs text-muted">예상 계획 완료</dt>
        <dd className="mt-0.5 text-[22px] font-semibold tracking-tight text-brand tabular-nums sm:text-[26px]">
          {b ? formatTerm(b) : "목표학점 필요"}
        </dd>
      </div>
      <div className="border-r border-line px-4 py-3.5">
        <dt className="text-xs text-muted">목표까지 남은 학점</dt>
        <dd className="mt-0.5 text-lg font-semibold tabular-nums">{remaining === null ? "미입력" : `${remaining}학점`}</dd>
      </div>
      <div className="px-4 py-3.5">
        <dt className="text-xs text-muted">고른 후보 대비</dt>
        <dd className="mt-0.5 text-lg font-semibold tabular-nums">
          {!planA ? "고르기 전" : delta === null ? "비교 불가" : delta === 0 ? "같음" : `${delta > 0 ? "+" : ""}${delta}학기`}
        </dd>
      </div>
    </dl>
  );
}
