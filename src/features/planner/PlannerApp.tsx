"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CatalogResponse, DatasetV2 } from "@/contracts/types";
import { type Draft, draftProblem, todayISO } from "./plan";
import { loadChecked, loadDraft, loadPlan, type PlanState, saveChecked, saveDraft, savePlan } from "./storage";
import type { TestProfile } from "./testProfiles";
import { buildTracks, type TrackSet } from "./tracks";
import { useCatalog } from "./useCatalog";

interface PlannerContext {
  /** localStorage를 읽은 뒤 true. 그 전에는 저장값을 믿지 않는다. */
  mounted: boolean;
  today: string;
  catalog: CatalogResponse | null;
  dataset: DatasetV2 | null;
  loading: boolean;
  reload: () => void;
  draft: Draft | null;
  setDraft: (d: Draft | null) => void;
  /** 이전 값 기준으로 고친다(빠른 연속 입력에도 덮어쓰지 않음). 저장값이 없으면 아무것도 하지 않는다. */
  updateDraft: (fn: (d: Draft) => Draft) => void;
  /** 입력이 다 차면 계산한 트랙 목록. 아직이면 null */
  tracks: TrackSet | null;
  plan: PlanState | null;
  setPlan: (p: PlanState | null) => void;
  checked: Record<string, boolean>;
  toggleChecked: (id: string) => void;
  resetAll: () => void;
  /** 테스트 프로필 불러오기: 입력·선택 트랙·교양 자리·전후 비교·확정·체크리스트를 모두 초기화한 뒤 가상 입력으로 채운다 */
  loadProfile: (p: TestProfile) => void;
}

const Ctx = createContext<PlannerContext | null>(null);

export function usePlanner(): PlannerContext {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePlanner는 PlannerApp 안에서만 쓸 수 있어요.");
  return v;
}

/**
 * 플래너 최상위. 모든 화면이 같은 상태·학과 자료·트랙 계산을 공유한다.
 * 화면은 getCatalog()로만 자료를 받고, 저장은 이 브라우저의 localStorage에만 한다.
 */
export function PlannerApp({ children }: { children: ReactNode }) {
  const { catalog, loading, reload } = useCatalog();
  const [mounted, setMounted] = useState(false);
  const [today, setToday] = useState("");
  const [draft, setDraftState] = useState<Draft | null>(null);
  const [plan, setPlanState] = useState<PlanState | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const t = todayISO();
    setDraftState(loadDraft(t));
    setPlanState(loadPlan());
    setChecked(loadChecked());
    setToday(t);
    setMounted(true);
    reload();
  }, [reload]);

  const setDraft = useCallback((d: Draft | null) => {
    setDraftState(d);
    saveDraft(d);
  }, []);
  const updateDraft = useCallback((fn: (d: Draft) => Draft) => {
    setDraftState((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      saveDraft(next);
      return next;
    });
  }, []);
  const setPlan = useCallback((p: PlanState | null) => {
    setPlanState(p);
    savePlan(p);
  }, []);
  const toggleChecked = useCallback((id: string) => {
    setChecked((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveChecked(next);
      return next;
    });
  }, []);
  const resetAll = useCallback(() => {
    setDraft(null);
    setPlan(null);
    setChecked({});
    saveChecked(null);
  }, [setDraft, setPlan]);
  const loadProfile = useCallback(
    (p: TestProfile) => {
      resetAll();
      setDraft(p.draft(today || todayISO()));
    },
    [resetAll, setDraft, today],
  );

  const dataset = catalog?.dataset ?? null;
  const tracks = useMemo(
    () => (draft && dataset && !draftProblem(draft, dataset, today) ? buildTracks(draft, dataset, today) : null),
    [draft, dataset, today],
  );

  const value = useMemo<PlannerContext>(
    () => ({ mounted, today, catalog, dataset, loading, reload, draft, setDraft, updateDraft, tracks, plan, setPlan, checked, toggleChecked, resetAll, loadProfile }),
    [mounted, today, catalog, dataset, loading, reload, draft, setDraft, updateDraft, tracks, plan, setPlan, checked, toggleChecked, resetAll, loadProfile],
  );

  return (
    <Ctx.Provider value={value}>
      <Notebook>{children}</Notebook>
    </Ctx.Provider>
  );
}

const TABS = [
  { no: "00", href: "/", match: ["/"], syllable: "아맞다", label: "", color: "bg-tab-home", needs: null },
  { no: "01", href: "/input", match: ["/input", "/info"], syllable: "아", label: "내 정보", color: "bg-tab-input", needs: null },
  { no: "02", href: "/match", match: ["/match"], syllable: "맞", label: "맞춰가기", color: "bg-tab-proc", needs: "tracks" },
  { no: "03", href: "/output", match: ["/output"], syllable: "다", label: "다했다", color: "bg-tab-out", needs: "plan" },
] as const;

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
function dateLine(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${y}. ${String(m).padStart(2, "0")}. ${String(d).padStart(2, "0")} (${WEEKDAY[new Date(y, m - 1, d).getDay()]})`;
}

function Notebook({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { tracks, plan, mounted, today, catalog } = usePlanner();
  const active = (m: readonly string[]) => m.some((p) => (p === "/" ? path === "/" : path.startsWith(p)));
  const ds = catalog?.dataset;

  // 00 표지는 화면 전체를 채운다(노트 틀 없이).
  if (path === "/") return <div className="min-h-dvh min-w-[1100px] bg-desk">{children}</div>;

  return (
    <div className="flex min-h-dvh min-w-[1100px] flex-col print:block print:min-w-0">
      <nav aria-label="플래너 목차" className="flex h-[46px] shrink-0 items-end gap-1.5 bg-desk pl-[72px] print:hidden">
        {TABS.map((t) => {
          const locked = mounted && ((t.needs === "tracks" && !tracks) || (t.needs === "plan" && !plan));
          const on = active(t.match);
          const cls = `relative flex items-baseline gap-2 rounded-t-[10px] px-5 text-[14px] transition-[padding] ${t.color} ${
            on ? "pt-3 pb-2 font-semibold text-ink" : "pt-2 pb-1.5 text-ink-soft/80 hover:pt-2.5"
          }`;
          const body = (
            <>
              <span className="font-serif text-[11px] text-ink-soft/70 tabular-nums">{t.no}</span>
              <span className="font-serif text-[16px] font-bold">{t.syllable}</span>
              {t.label && <span className="text-[13px]">{t.label}</span>}
            </>
          );
          return locked ? (
            <span key={t.href} className={`${cls} cursor-not-allowed opacity-45`} title="앞 단계를 먼저 채워 주세요">
              {body}
            </span>
          ) : (
            <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className={cls}>
              {body}
            </Link>
          );
        })}
      </nav>

      <div className="relative flex flex-1 print:block">
        <div className="binding w-[52px] shrink-0 print:hidden" aria-hidden />
        <div className="paper min-w-0 flex-1 border-l border-black/10 px-12 pt-7 pb-12 print:border-0 print:p-0">
          <header className="mb-8 flex items-end justify-between border-b-[3px] border-double border-line pb-3 print:hidden">
            <Link href="/" className="flex items-baseline gap-3">
              <span className="font-serif text-[22px] font-bold tracking-tight text-ink">아 맞다</span>
              <span className="text-xs text-muted">
                <b className="font-semibold text-ink-soft">아</b>름다운 인생을 <b className="font-semibold text-ink-soft">맞</b>춰드립니<b className="font-semibold text-ink-soft">다</b> · 정보시스템학과 트랙 플래너
              </span>
            </Link>
            <div className="flex items-center gap-4 text-xs text-muted">
              {ds && (
                <span>
                  {ds.curriculum} 교육과정 · {catalog?.origin === "db" ? "게시 자료" : "검토용 자료"}
                </span>
              )}
              <span className="font-serif text-[13px] text-ink-soft tabular-nums">{dateLine(today)}</span>
            </div>
          </header>
          {children}
          <footer className="mt-14 border-t border-dashed border-line pt-3 text-[11px] text-muted print:mt-6">
            계획·추정 결과이며 졸업 확정 판정이 아닙니다. 과목 정보는 학과 교육과정표(S1), 진로·트랙 분류와 추천은 서비스가 정한 것입니다.
          </footer>
        </div>
      </div>
    </div>
  );
}
