import type { CatalogResponse } from "@/contracts/types";
import { Badge, Button, Panel, SectionHeader, Sub } from "./ui";

const STEPS = [
  ["공식 자료", "API 또는 공개 페이지"],
  ["추출·검토", "과목·학점·적용 범위"],
  ["DB 게시", "출처·수집일·버전"],
  ["계획 재계산", "현재 학생 조건 반영"],
];

export function SourcesView({ catalog, onReload, loading }: { catalog: CatalogResponse; onReload: () => void; loading: boolean }) {
  const ds = catalog.dataset;
  return (
    <>
      <Panel className="mb-3.5">
        <SectionHeader
          title="데이터가 들어오는 방식"
          aside={<Badge tone={catalog.origin === "db" ? "ok" : "warm"}>{catalog.origin === "db" ? "게시된 자료" : catalog.origin === "fixture" ? "개발용 fixture" : catalog.origin === "cache" ? "저장된 이전 자료" : "자료 없음"}</Badge>}
        />
        <div className="my-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STEPS.map(([t, s]) => (
            <div key={t} className="rounded-md bg-bg p-2.5 text-xs">
              {t}
              <small className="mt-1 block text-[11px] text-muted">{s}</small>
            </div>
          ))}
        </div>
        {ds && (
          <>
            <p className="text-xs">
              {ds.campus} · {ds.department} · 교육과정 {ds.curriculum} · 과목 {ds.courses.length}개
            </p>
            <Sub className="mt-1">
              버전 {ds.catalogVersion} · 수집일 {ds.collectedAt} · 게시일 {ds.publishedAt ?? "미게시"}
            </Sub>
          </>
        )}
        <div className="mt-4">
          <Button onClick={onReload} disabled={loading}>{loading ? "불러오는 중…" : "최신 자료 다시 불러오기"}</Button>
        </div>
      </Panel>

      {ds && (
        <Panel className="mb-3.5">
          <SectionHeader title="출처" />
          {ds.sources.map((s) => (
            <p key={s.id} className="text-xs">
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-brand underline">
                {s.title} ↗
              </a>{" "}
              <span className="text-muted">· 확인일 {s.checkedAt}</span>
            </p>
          ))}
        </Panel>
      )}

      {ds && ds.unknowns.length > 0 && (
        <Panel>
          <SectionHeader title="아직 확인하지 못한 항목" />
          <ul className="list-disc pl-5 text-xs">
            {ds.unknowns.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
