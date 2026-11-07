import { RefreshCw } from "lucide-react";
import type { CatalogResponse } from "@/contracts/types";
import { Badge, Button } from "./ui";

const ORIGIN: Record<NonNullable<CatalogResponse["origin"]>, [string, "ok" | "warm"]> = {
  db: ["게시된 자료", "ok"],
  fixture: ["개발용 자료", "warm"],
  cache: ["이전에 받은 자료", "warm"],
};

/** 상단 한 줄: 지금 화면이 어떤 자료로 계산되는지. */
export function CatalogBar({ catalog, loading }: { catalog: CatalogResponse | null; loading: boolean }) {
  if (!catalog) return <p className="text-xs text-muted">{loading ? "학과 자료를 불러오는 중…" : ""}</p>;
  const ds = catalog.dataset;
  const origin = catalog.origin ? ORIGIN[catalog.origin] : null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
      {ds ? (
        <span>
          {ds.department} {ds.curriculum} 교육과정, {ds.collectedAt} 수집
        </span>
      ) : (
        <span>학과 자료 없음</span>
      )}
      {origin && <Badge tone={origin[1]}>{origin[0]}</Badge>}
      {loading && <span aria-live="polite">새로 불러오는 중…</span>}
    </div>
  );
}

/** 자료가 없어서 계산할 수 없을 때. 무엇이 문제인지와 다음 행동을 보여준다. */
export function CatalogProblem({ catalog, onReload }: { catalog: CatalogResponse; onReload: () => void }) {
  const title =
    catalog.status === "empty"
      ? "아직 게시된 학과 자료가 없습니다"
      : "학과 자료를 불러오지 못했습니다";
  const detail =
    catalog.status === "empty"
      ? "자료가 검토를 거쳐 게시되면 계획을 계산할 수 있습니다."
      : "자료 서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
  return (
    <div role="alert" className="rounded-xl border border-line bg-panel p-5">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <p className="mt-1 text-[13px] text-muted">{detail}</p>
      {catalog.warnings.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-xs text-muted">
          {catalog.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <Button className="mt-4" onClick={onReload}>
        <RefreshCw size={14} aria-hidden /> 다시 불러오기
      </Button>
    </div>
  );
}

/** 이전 자료로 계산 중이거나 서버가 경고를 보낼 때. */
export function CatalogNotice({ catalog }: { catalog: CatalogResponse }) {
  if (catalog.status !== "stale") return null;
  return (
    <p className="mb-4 rounded-lg bg-warm px-3.5 py-2.5 text-[13px] text-warm-ink">
      최신 자료를 받지 못해 이전에 받은 자료로 계산했습니다. {catalog.warnings.join(" ")}
    </p>
  );
}
