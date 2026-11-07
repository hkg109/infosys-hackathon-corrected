"use client";

import { Save, UserRoundPen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PlanInput, PlanResult, SavedPlan } from "@/contracts/types";
import { diffPlans, ENGINE_VERSION, formatTerm, simulatePlan, termIndex } from "@/engine";
import { buildGuidance } from "@/features/guidance/buildGuidance";
import { CatalogBar, CatalogNotice, CatalogProblem } from "./components/CatalogStatus";
import { CompareView } from "./components/CompareView";
import { Controls } from "./components/Controls";
import { CoursesView } from "./components/CoursesView";
import { Onboarding } from "./components/Onboarding";
import { RoadmapView } from "./components/RoadmapView";
import { Sidebar, type View } from "./components/Sidebar";
import { SourcesView } from "./components/SourcesView";
import { Button } from "./components/ui";
import { clearInput, loadChecked, loadInput, loadPlanA, saveChecked, saveInput, savePlanA } from "./storage";
import { useCatalog } from "./useCatalog";

const TITLES: Record<View, [string, string]> = {
  roadmap: ["나의 학기 로드맵", "진로와 일정에 맞춰 학기별로 무엇을 들을지 배치했어요"],
  courses: ["진로에 맞는 전공 과목", "학과 교육과정에 서비스의 진로 추천을 연결했어요"],
  compare: ["플랜 A와 지금 비교", "조건을 바꾸기 전과 후에 무엇이 달라지는지 보여줘요"],
  sources: ["자료와 출처", "계획에 쓰인 학과 자료가 어디서 왔는지 확인하세요"],
};

export function PlannerApp() {
  const [view, setView] = useState<View>("roadmap");
  const { catalog, loading, reload } = useCatalog();
  const [mounted, setMounted] = useState(false);
  const [input, setInput] = useState<PlanInput | null>(null);
  const [revision, setRevision] = useState(0);
  const [planA, setPlanA] = useState<SavedPlan | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  // localStorage는 브라우저 시작 후에만 읽는다.
  useEffect(() => {
    setInput(loadInput());
    setPlanA(loadPlanA());
    setChecked(loadChecked() ?? {});
    setMounted(true);
    reload();
  }, [reload]);

  const updateInput = (next: PlanInput) => {
    setInput(next);
    saveInput(next);
  };

  const restart = () => {
    clearInput();
    setInput(null);
    setRevision((r) => r + 1);
    setView("roadmap");
  };

  const dataset = catalog?.dataset ?? null;
  const result = useMemo(() => (dataset && input ? simulatePlan(input, dataset) : null), [input, dataset]);
  const guidance = useMemo(
    () => (dataset && input && result ? buildGuidance(input, result, dataset) : { items: [] }),
    [input, result, dataset],
  );
  const diff = useMemo(() => (planA && result ? diffPlans(planA.result, result) : null), [planA, result]);

  const saveA = () => {
    if (!result || !input) return;
    const snapshot: SavedPlan = {
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      input: structuredClone(input),
      result: structuredClone(result),
      catalogVersion: result.catalogVersion,
      engineVersion: ENGINE_VERSION,
    };
    setPlanA(snapshot);
    savePlanA(snapshot);
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

  const onboarding = mounted && !input;
  const [title, desc] = TITLES[view];

  return (
    <div className="mx-auto max-w-[1240px] sm:p-4">
      <div className="grid min-h-dvh overflow-clip bg-bg sm:min-h-0 sm:rounded-2xl sm:border sm:border-line md:grid-cols-[188px_minmax(0,1fr)]">
        <Sidebar view={view} onChange={setView} disabled={onboarding} />
        <main className="min-w-0 px-4 py-5 sm:px-7 sm:py-6">
          <CatalogBar catalog={catalog} loading={loading} />

          {!mounted ? (
            <Skeleton />
          ) : onboarding ? (
            <div className="mt-6">
              {catalog && !dataset && <CatalogProblem catalog={catalog} onReload={reload} />}
              <Onboarding dataset={dataset} onDone={(next) => { updateInput(next); setRevision((r) => r + 1); }} />
            </div>
          ) : (
            input && (
              <>
                <header className="mt-4 mb-5 flex flex-wrap items-end justify-between gap-3.5">
                  <div>
                    <h1 className="text-[24px] font-semibold tracking-tight text-ink sm:text-[28px]">{title}</h1>
                    <p className="mt-1 text-[13px] text-muted">{desc}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={restart}>
                      <UserRoundPen size={15} aria-hidden /> 처음부터 다시 입력
                    </Button>
                    <Button primary onClick={saveA} disabled={!result || !!result.error}>
                      <Save size={15} aria-hidden /> 플랜 A로 저장
                    </Button>
                  </div>
                </header>

                {view !== "sources" && <Controls input={input} revision={revision} onChange={updateInput} />}

                {!catalog ? (
                  <Skeleton />
                ) : !dataset || !result ? (
                  view !== "sources" && <CatalogProblem catalog={catalog} onReload={reload} />
                ) : (
                  <>
                    <CatalogNotice catalog={catalog} />
                    {view !== "sources" && <Summary result={result} input={input} planA={planA} />}
                    {view === "roadmap" && (
                      <RoadmapView input={input} result={result} guidance={guidance} checked={checked} onToggle={toggleChecked} />
                    )}
                    {view === "courses" && <CoursesView input={input} dataset={dataset} onToggleCompleted={toggleCompleted} />}
                    {view === "compare" && <CompareView planA={planA} input={input} result={result} diff={diff} onSaveA={saveA} />}
                  </>
                )}
                {view === "sources" && catalog && <SourcesView catalog={catalog} onReload={reload} loading={loading} />}
              </>
            )
          )}

          <footer className="mt-10 border-t border-line pt-3 text-[11px] text-muted">
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
        <dt className="text-xs text-muted">플랜 A 대비</dt>
        <dd className="mt-0.5 text-lg font-semibold tabular-nums">
          {!planA ? "저장 전" : delta === null ? "비교 불가" : delta === 0 ? "같음" : `${delta > 0 ? "+" : ""}${delta}학기`}
        </dd>
      </div>
    </dl>
  );
}
