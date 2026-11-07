"use client";

import { RotateCcw, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getCatalog } from "@/client/catalog";
import { sampleInput } from "@/contracts/mock-plan";
import type { CatalogResponse, PlanInput, SavedPlan } from "@/contracts/types";
import { diffPlans, ENGINE_VERSION, formatTerm, simulatePlan, termIndex } from "@/engine";
import { buildGuidance } from "@/features/guidance/buildGuidance";
import { CompareView } from "./components/CompareView";
import { Controls } from "./components/Controls";
import { CoursesView } from "./components/CoursesView";
import { RoadmapView } from "./components/RoadmapView";
import { Sidebar, type View } from "./components/Sidebar";
import { SourcesView } from "./components/SourcesView";
import { Badge, Button } from "./components/ui";
import { loadInput, loadPlanA, saveInput, savePlanA } from "./storage";

const TITLES: Record<View, [string, string]> = {
  roadmap: ["나의 대학생활 로드맵", "내 진로와 일정이 연결되는 학기별 계획"],
  courses: ["진로에 맞는 전공 탐색", "공식 교육과정에 서비스의 진로 추천을 연결합니다"],
  compare: ["플랜 A / B 비교", "바꾸기 전과 후, 무엇이 달라지는지 확인하세요"],
  sources: ["수집 데이터와 출처", "공식 자료 수집 → 검토 → DB 게시 → 계획에 반영"],
};

export function PlannerApp() {
  const [view, setView] = useState<View>("roadmap");
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [input, setInput] = useState<PlanInput>(sampleInput);
  const [planA, setPlanA] = useState<SavedPlan | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const reload = useCallback(() => {
    setCatalog(null);
    getCatalog().then(setCatalog);
  }, []);

  // localStorage는 브라우저 시작 후에만 읽는다.
  useEffect(() => {
    const saved = loadInput();
    if (saved) setInput(saved);
    setPlanA(loadPlanA());
    reload();
  }, [reload]);

  const updateInput = (next: PlanInput) => {
    setInput(next);
    saveInput(next);
  };

  const dataset = catalog?.dataset ?? null;
  const result = useMemo(() => (dataset ? simulatePlan(input, dataset) : null), [input, dataset]);
  const guidance = useMemo(
    () => (dataset && result ? buildGuidance(input, result, dataset) : { items: [] }),
    [input, result, dataset],
  );
  const diff = useMemo(() => (planA && result ? diffPlans(planA.result, result) : null), [planA, result]);

  const saveA = () => {
    if (!result) return;
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

  const toggleCompleted = (code: string) => {
    const has = input.completedCourseCodes.includes(code);
    updateInput({
      ...input,
      completedCourseCodes: has
        ? input.completedCourseCodes.filter((c) => c !== code)
        : [...input.completedCourseCodes, code],
    });
  };

  const [title, desc] = TITLES[view];

  return (
    <div className="mx-auto max-w-[1180px] p-0 sm:p-4">
      <div className="grid overflow-clip border-line bg-bg sm:rounded-2xl sm:border md:grid-cols-[166px_minmax(0,1fr)]">
        <Sidebar view={view} onChange={setView} />
        <main className="min-w-0 p-4 sm:p-6">
          <CatalogBar catalog={catalog} />

          <div className="my-4 flex flex-wrap items-center justify-between gap-3.5">
            <div>
              <h1 className="mb-1 text-[22px] font-medium tracking-tight sm:text-[25px]">{title}</h1>
              <p className="text-xs text-muted">{desc}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => updateInput(sampleInput)}>
                <RotateCcw size={15} aria-hidden /> 샘플로 시작
              </Button>
              <Button primary onClick={saveA} disabled={!result || !!result.error}>
                <Save size={15} aria-hidden /> 플랜 A로 저장
              </Button>
            </div>
          </div>

          {view !== "sources" && <Controls input={input} onChange={updateInput} />}

          {!catalog ? (
            <p className="text-xs text-muted">자료를 불러오는 중…</p>
          ) : !dataset || !result ? (
            <div className="rounded-lg bg-warm px-3 py-2.5 text-xs text-warm-ink">
              자료를 불러올 수 없습니다. {catalog.warnings.join(" ")}{" "}
              <button type="button" className="cursor-pointer underline" onClick={reload}>
                다시 시도
              </button>
            </div>
          ) : (
            <>
              {view !== "sources" && <Stats result={result} input={input} planA={planA} />}
              {view === "roadmap" && (
                <RoadmapView
                  input={input}
                  result={result}
                  guidance={guidance}
                  checked={checked}
                  onToggle={(id) => setChecked((c) => ({ ...c, [id]: !c[id] }))}
                />
              )}
              {view === "courses" && <CoursesView input={input} dataset={dataset} onToggleCompleted={toggleCompleted} />}
              {view === "compare" && <CompareView planA={planA} input={input} result={result} diff={diff} onSaveA={saveA} />}
            </>
          )}
          {view === "sources" && catalog && <SourcesView catalog={catalog} onReload={reload} />}

          <footer className="mt-6 border-t border-line pt-3 text-[11px] text-muted">
            계획·추정 결과이며 졸업 확정 판정이 아닙니다. 과목 정보는 공식 자료, 진로 분류는 서비스 추천입니다.
          </footer>
        </main>
      </div>
    </div>
  );
}

function CatalogBar({ catalog }: { catalog: CatalogResponse | null }) {
  if (!catalog) return <div className="text-xs text-muted">자료 확인 중…</div>;
  const ds = catalog.dataset;
  return (
    <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted">
      <span>
        <span className="mr-1.5 inline-block size-[7px] rounded-full bg-brand" />
        {ds ? `${ds.department} · ${ds.curriculum} · v${ds.catalogVersion}` : "자료 없음"}
      </span>
      {ds && <span>수집 {ds.collectedAt}</span>}
      {catalog.status === "stale" && <Badge tone="warm">이전 자료 표시 중</Badge>}
      {catalog.origin === "fixture" && <Badge tone="warm">개발용 자료</Badge>}
    </div>
  );
}

function Stats({ result, input, planA }: { result: NonNullable<ReturnType<typeof simulatePlan>>; input: PlanInput; planA: SavedPlan | null }) {
  const a = planA?.result.expectedCompletion;
  const b = result.expectedCompletion;
  const delta = a && b ? termIndex(b) - termIndex(a) : null;
  const remaining = input.targetCredits === null ? null : Math.max(0, input.targetCredits - input.earnedCredits);

  return (
    <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      <Stat label="예상 계획 완료" value={formatTerm(b)} note="졸업 확정 판정 아님" />
      <Stat
        label="목표까지 남은 학점"
        value={remaining === null ? "목표 미입력" : `${remaining}학점`}
        note={`이수 ${input.earnedCredits} / 목표 ${input.targetCredits ?? "?"}`}
      />
      <Stat
        label="저장된 A와 비교"
        value={delta === null ? "—" : delta === 0 ? "변화 없음" : `${delta > 0 ? "+" : ""}${delta}학기`}
        note="자료·일정을 반영한 차이"
        className="col-span-2 sm:col-span-1"
      />
    </div>
  );
}

function Stat({ label, value, note, className = "" }: { label: string; value: string; note: string; className?: string }) {
  return (
    <div className={`rounded-[9px] border border-line bg-panel px-4 py-3.5 ${className}`}>
      <p className="text-[11px] text-muted">{label}</p>
      <strong className="my-0.5 block text-xl font-medium tracking-tight tabular-nums sm:text-[23px]">{value}</strong>
      <small className="text-[11px] text-muted">{note}</small>
    </div>
  );
}
