import { BookOpen, Columns2, Database, Route } from "lucide-react";
import type { PlanInput } from "@/contracts/types";
import { TRACK_NAME } from "../labels";
import { completedTermsLabel, type Profile } from "../profile";

export type View = "roadmap" | "courses" | "compare" | "sources";

const NAV: Array<[View, string, typeof Route]> = [
  ["roadmap", "로드맵", Route],
  ["courses", "전공 과목", BookOpen],
  ["compare", "플랜 비교", Columns2],
  ["sources", "자료 출처", Database],
];

export function Sidebar({
  view,
  onChange,
  disabled,
  profile,
  input,
  onEditProfile,
  onRestart,
}: {
  view: View;
  onChange: (v: View) => void;
  disabled?: boolean;
  profile: Profile | null;
  input: PlanInput | null;
  onEditProfile?: () => void;
  onRestart?: () => void;
}) {
  return (
    <aside className="flex flex-col border-r border-line bg-panel px-4 py-7">
      <div className="px-2 pb-7">
        <p className="text-[22px] leading-tight font-bold tracking-tight text-brand">
          아 맞다,
          <br /> 인생!
        </p>
        <p className="mt-1.5 text-xs text-muted">정보시스템학과 학기 플래너</p>
      </div>

      {input && !disabled && (
        <section aria-label="내 정보" className="mb-6 rounded-xl bg-bg px-3 py-3 text-xs">
          <p className="text-[14px] font-semibold text-ink">{profile?.name ? `${profile.name}님` : "내 정보"}</p>
          <dl className="mt-1.5 grid gap-0.5 text-muted">
            {profile?.admissionYear && <dd>{String(profile.admissionYear).slice(2)}학번</dd>}
            <dd>{completedTermsLabel(input.completedTerms)} 마침</dd>
            <dd>{TRACK_NAME[input.track]} 진로</dd>
            {profile?.military === "planned" && <dd>군 복무 예정</dd>}
          </dl>
          {onEditProfile && (
            <button type="button" onClick={onEditProfile} className="mt-2 cursor-pointer font-medium text-brand hover:underline">
              내 정보 수정
            </button>
          )}
        </section>
      )}

      <nav aria-label="화면" className="grid gap-1.5">
        {NAV.map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            disabled={disabled}
            aria-current={view === id ? "page" : undefined}
            onClick={() => onChange(id)}
            className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[13px] disabled:cursor-default disabled:opacity-40 ${
              view === id && !disabled ? "bg-active font-semibold text-brand" : "text-muted hover:text-ink"
            }`}
          >
            <Icon size={16} aria-hidden />
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-auto border-t border-line px-2 pt-4 text-[11px] leading-relaxed text-muted">
        <p>입력한 정보와 계획은 이 브라우저에만 저장돼요. 졸업 확정 판정이 아닙니다.</p>
        {onRestart && !disabled && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("입력한 내 정보와 계획을 지우고 처음부터 다시 입력할까요?")) onRestart();
            }}
            className="mt-2 cursor-pointer underline hover:text-ink"
          >
            모두 지우고 처음부터
          </button>
        )}
      </div>
    </aside>
  );
}
