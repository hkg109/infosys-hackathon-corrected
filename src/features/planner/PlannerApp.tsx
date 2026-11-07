"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CatalogResponse, DatasetV2 } from "@/contracts/types";
import { type Draft, todayISO } from "./plan";
import { loadChecked, loadDraft, loadPlan, type PlanState, saveChecked, saveDraft, savePlan } from "./storage";
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
  plan: PlanState | null;
  setPlan: (p: PlanState | null) => void;
  checked: Record<string, boolean>;
  toggleChecked: (id: string) => void;
  resetAll: () => void;
}

const Ctx = createContext<PlannerContext | null>(null);

export function usePlanner(): PlannerContext {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePlanner는 PlannerApp 안에서만 쓸 수 있어요.");
  return v;
}

/**
 * 플래너 최상위. 모든 화면(home·input·processing·output·feedback)이 같은 상태와 학과 자료를 공유한다.
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
    setDraftState(loadDraft());
    setPlanState(loadPlan());
    setChecked(loadChecked());
    setToday(todayISO());
    setMounted(true);
    reload();
  }, [reload]);

  const setDraft = useCallback((d: Draft | null) => {
    setDraftState(d);
    saveDraft(d);
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

  const value = useMemo<PlannerContext>(
    () => ({
      mounted,
      today,
      catalog,
      dataset: catalog?.dataset ?? null,
      loading,
      reload,
      draft,
      setDraft,
      plan,
      setPlan,
      checked,
      toggleChecked,
      resetAll,
    }),
    [mounted, today, catalog, loading, reload, draft, setDraft, plan, setPlan, checked, toggleChecked, resetAll],
  );

  return (
    <Ctx.Provider value={value}>
      <Notebook>{children}</Notebook>
    </Ctx.Provider>
  );
}

const TABS = [
  { href: "/", label: "표지", color: "bg-tab-home", needs: null },
  { href: "/input", label: "아 맞다 · 내 정보", color: "bg-tab-input", needs: null },
  { href: "/processing", label: "맞춰가기 · 구체화", color: "bg-tab-proc", needs: "draft" },
  { href: "/output", label: "다 했다 · 로드맵", color: "bg-tab-out", needs: "plan" },
] as const;

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
function dateLine(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${y}. ${String(m).padStart(2, "0")}. ${String(d).padStart(2, "0")} (${WEEKDAY[new Date(y, m - 1, d).getDay()]})`;
}

function Notebook({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { draft, plan, mounted, today, catalog } = usePlanner();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const ds = catalog?.dataset;

  return (
    <div className="min-h-dvh px-8 pt-6 pb-10 print:p-0">
      <div className="mx-auto max-w-[1220px] min-w-[1024px] print:min-w-0">
        <nav aria-label="플래너 목차" className="flex items-end gap-1.5 pl-[68px] print:hidden">
          {TABS.map((t, i) => {
            const locked = mounted && ((t.needs === "draft" && !draft) || (t.needs === "plan" && !plan));
            const on = active(t.href);
            const cls = `relative block rounded-t-[10px] px-5 text-[13px] transition-[padding] ${t.color} ${
              on ? "pt-3 pb-2.5 font-semibold text-ink" : "pt-2 pb-1.5 text-ink-soft/80 hover:pt-2.5"
            }`;
            const body = (
              <>
                <span className="mr-1.5 font-serif text-[11px] text-ink-soft/70 tabular-nums">0{i}</span>
                {t.label}
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

        <div className="relative flex overflow-clip rounded-[6px_14px_14px_6px] shadow-[0_1px_0_rgba(0,0,0,0.05),0_24px_40px_-24px_rgba(60,48,20,0.5)] print:overflow-visible print:rounded-none print:shadow-none">
          <div className="binding w-[52px] shrink-0 print:hidden" aria-hidden />
          <div className="paper min-h-[calc(100dvh-110px)] min-w-0 flex-1 border-l border-black/10 px-14 pt-8 pb-12 print:min-h-0 print:border-0 print:p-0">
            <header className="mb-8 flex items-end justify-between border-b-[3px] border-double border-line pb-3 print:hidden">
              <Link href="/" className="group flex items-baseline gap-3">
                <span className="font-serif text-[22px] font-bold tracking-tight text-ink">아 맞다, 인생!</span>
                <span className="text-xs text-muted">정보시스템학과 학기 플래너</span>
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
              계획·추정 결과이며 졸업 확정 판정이 아닙니다. 과목 정보는 학과 교육과정표(S1), 진로 분류와 추천은 서비스가 정한 것입니다.
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
