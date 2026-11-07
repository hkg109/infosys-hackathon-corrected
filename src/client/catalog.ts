import type { CatalogContext, CatalogResponse } from "@/contracts/types";

const CACHE_KEY = "infosys:catalog:last-good:v1";

/**
 * 화면은 이 함수로만 자료를 받는다(DB SDK·외부 사이트를 직접 부르지 않는다).
 * 조회 실패 시 마지막 정상 자료가 있으면 stale로 돌려준다.
 */
export async function getCatalog(context?: Partial<CatalogContext>): Promise<CatalogResponse> {
  const params = new URLSearchParams(
    Object.entries(context ?? {}).filter((e): e is [string, string] => typeof e[1] === "string"),
  );
  try {
    const res = await fetch(`/api/catalog?${params}`, { cache: "no-store" });
    const body = (await res.json()) as CatalogResponse;
    if (body.status === "ready" && body.dataset) {
      writeCache(body);
      return body;
    }
    return fallback(body);
  } catch {
    return fallback({
      status: "unavailable",
      dataset: null,
      origin: null,
      fetchedAt: new Date().toISOString(),
      warnings: ["자료 서버에 연결하지 못했습니다."],
    });
  }
}

function fallback(failed: CatalogResponse): CatalogResponse {
  const cached = readCache();
  if (!cached?.dataset) return failed;
  return {
    ...cached,
    status: "stale",
    origin: "cache",
    warnings: [...failed.warnings, `마지막 정상 자료(${cached.dataset.catalogVersion})를 표시합니다.`],
  };
}

function readCache(): CatalogResponse | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CatalogResponse) : null;
  } catch {
    return null;
  }
}

function writeCache(res: CatalogResponse) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(res));
  } catch {
    // 저장 실패는 화면 동작에 영향을 주지 않는다.
  }
}
