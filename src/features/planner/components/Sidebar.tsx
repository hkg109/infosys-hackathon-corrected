import { BookOpen, Columns2, Database, Route } from "lucide-react";

export type View = "roadmap" | "courses" | "compare" | "sources";

const NAV: Array<[View, string, typeof Route]> = [
  ["roadmap", "나의 로드맵", Route],
  ["courses", "전공 탐색", BookOpen],
  ["compare", "플랜 비교", Columns2],
  ["sources", "데이터 출처", Database],
];

export function Sidebar({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <aside className="border-b border-line bg-panel p-4 md:border-r md:border-b-0 md:px-4 md:py-7">
      <div className="pb-4 text-xl font-medium tracking-tight md:px-2 md:pb-7 md:text-[23px] md:leading-snug">
        아 맞다,
        <br className="hidden md:block" /> 인생!
        <small className="mt-2.5 hidden text-[11px] font-normal tracking-widest text-muted md:block">
          정보시스템학과 플래너
        </small>
      </div>
      <nav className="flex flex-wrap gap-1 md:grid md:gap-1.5">
        {NAV.map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            aria-current={view === id ? "page" : undefined}
            onClick={() => onChange(id)}
            className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] md:w-full md:py-2.5 ${
              view === id ? "bg-active font-medium text-brand" : ""
            }`}
          >
            <Icon size={16} aria-hidden className="hidden sm:block" />
            {label}
          </button>
        ))}
      </nav>
      <p className="mt-9 hidden border-t border-line px-2 pt-3.5 text-[11px] text-muted md:block">
        계획은 이 브라우저에만 저장됩니다. 졸업 확정 판정이 아닙니다.
      </p>
    </aside>
  );
}
