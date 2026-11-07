"use client";

import { useCallback, useState } from "react";
import { getCatalog } from "@/client/catalog";
import type { CatalogResponse } from "@/contracts/types";

/**
 * GET /api/catalog 상태. 다시 불러오는 동안에는 이전 응답을 계속 보여준다.
 * 화면은 getCatalog()로만 자료를 받는다.
 */
export function useCatalog() {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    getCatalog()
      .then(setCatalog)
      .finally(() => setLoading(false));
  }, []);

  return { catalog, loading, reload };
}
