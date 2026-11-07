import { BookOpen, Columns2, Database, Route } from "lucide-react";

export type View = "roadmap" | "courses" | "compare" | "sources";

const NAV: Array<[View, string, typeof Route]> = [
  ["roadmap", "로드맵", Route],
  ["courses", "전공 과목", BookOpen],
  ["compare", "플랜 비교", Columns2],
  ["sources", "자료 출처", Database],
];

export function Sidebar({ view, onChange, disabled }: { view: View; onChange: (v: View) => void; disabled?: boolean }) {
  return (
    <aside className="border-b border-line bg-panel px-4 pt-4 pb-3 md:border-r md:border-b-0 md:px-4 md:py-7">
      <div className="pb-3 md:px-2 md:pb-8">
        <p className="text-[19px] leading-tight font-bold tracking-tight text-brand md:text-[22px]">
          아 맞다,
          <br className="hidden md:block" /> 인생!
        </p>
        <p className="mt-1.5 hidden text-xs text-muted md:block">정보시스템학과 학기 플래너</p>
      </div>
      <nav aria-label="화면" className="-mx-1 flex gap-1 overflow-x-auto md:mx-0 md:grid">
        {NAV.map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            disabled={disabled}
            aria-current={view === id ? "page" : undefined}
            onClick={() => onChange(id)}
            className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] disabled:cursor-default disabled:opacity-40 md:w-full md:py-2.5 ${
              view === id && !disabled ? "bg-active font-semibold text-brand" : "text-muted hover:text-ink"
            }`}
          >
            <Icon size={16} aria-hidden className="hidden sm:block" />
            {label}
          </button>
        ))}
      </nav>
      <p className="mt-10 hidden border-t border-line px-2 pt-4 text-[11px] leading-relaxed text-muted md:block">
        입력한 계획은 이 브라우저에만 저장돼요. 졸업 확정 판정이 아닙니다.
      </p>
    </aside>
  );
}
