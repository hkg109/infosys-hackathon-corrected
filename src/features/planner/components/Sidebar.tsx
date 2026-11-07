import { BookOpen, Check, Database } from "lucide-react";
import type { PlanInput } from "@/contracts/types";
import { TRACK_NAME } from "../labels";
import { completedTermsLabel, type Profile } from "../profile";

/** 맞·다 단계와 보조 화면. 아 단계(내 정보 입력)는 별도 상태로 연다. */
export type View = "mat" | "da" | "courses" | "sources";

const STAGES: Array<{ id: "a" | "mat" | "da"; mark: string; name: string; hint: string }> = [
  { id: "a", mark: "아", name: "아 맞다", hint: "내 정보 입력" },
  { id: "mat", mark: "맞", name: "맞춰가기", hint: "비교하고 고치기" },
  { id: "da", mark: "다", name: "다 했다", hint: "최종 로드맵" },
];

const EXTRA: Array<[View, string, typeof BookOpen]> = [
  ["courses", "전공 과목", BookOpen],
  ["sources", "자료 출처", Database],
];

export function Sidebar({
  view,
  onboarding,
  confirmed,
  onChange,
  onOpenInput,
  profile,
  input,
  onRestart,
}: {
  view: View;
  /** 아 단계(내 정보 입력)가 열려 있는지 */
  onboarding: boolean;
  /** "맞다!"로 확정했는지 */
  confirmed: boolean;
  onChange: (v: View) => void;
  onOpenInput?: () => void;
  profile: Profile | null;
  input: PlanInput | null;
  onRestart?: () => void;
}) {
  const current = onboarding ? "a" : view;
  const done = { a: !!input, mat: confirmed, da: false };

  return (
    <aside className="flex flex-col border-r border-line bg-panel px-4 py-7 print:hidden">
      <div className="px-2 pb-7">
        <p className="text-[22px] leading-tight font-bold tracking-tight text-brand">
          아 맞다,
          <br /> 인생!
        </p>
        <p className="mt-1.5 text-xs text-muted">정보시스템학과 학기 플래너</p>
      </div>

      <nav aria-label="단계" className="grid gap-1">
        {STAGES.map((s) => {
          const active = current === s.id;
          const disabled = onboarding ? s.id !== "a" : s.id === "a" ? !onOpenInput : false;
          return (
            <button
              key={s.id}
              type="button"
              disabled={disabled}
              aria-current={active ? "step" : undefined}
              onClick={() => (s.id === "a" ? onOpenInput?.() : onChange(s.id))}
              className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left disabled:cursor-default ${
                active ? "bg-active" : "hover:bg-bg"
              } ${disabled && !active ? "opacity-40" : ""}`}
            >
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-bold ${
                  active ? "bg-brand text-contrast" : done[s.id] ? "bg-ok text-ok-ink" : "bg-bg text-muted"
                }`}
              >
                {done[s.id] && !active ? <Check size={14} aria-label="완료" /> : s.mark}
              </span>
              <span className="min-w-0">
                <span className={`block text-[13px] ${active ? "font-semibold text-brand" : "text-ink"}`}>{s.name}</span>
                <span className="block text-[11px] text-muted">{s.hint}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <nav aria-label="더 보기" className="mt-5 grid gap-1 border-t border-line pt-4">
        {EXTRA.map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            disabled={onboarding}
            aria-current={!onboarding && view === id ? "page" : undefined}
            onClick={() => onChange(id)}
            className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] disabled:cursor-default disabled:opacity-40 ${
              !onboarding && view === id ? "bg-active font-semibold text-brand" : "text-muted hover:text-ink"
            }`}
          >
            <Icon size={15} aria-hidden />
            {label}
          </button>
        ))}
      </nav>

      {input && !onboarding && (
        <section aria-label="내 정보" className="mt-6 rounded-xl bg-bg px-3 py-3 text-xs">
          <p className="text-[14px] font-semibold text-ink">{profile?.name ? `${profile.name}님` : "내 정보"}</p>
          <dl className="mt-1.5 grid gap-0.5 text-muted">
            {profile?.admissionYear && <dd>{String(profile.admissionYear).slice(2)}학번</dd>}
            <dd>{completedTermsLabel(input.completedTerms)} 마침</dd>
            <dd>{TRACK_NAME[input.track]} 진로</dd>
            {profile?.military === "planned" && <dd>군 복무 예정</dd>}
          </dl>
        </section>
      )}

      <div className="mt-auto border-t border-line px-2 pt-4 text-[11px] leading-relaxed text-muted">
        <p>입력한 정보와 계획은 이 브라우저에만 저장돼요. 졸업 확정 판정이 아닙니다.</p>
        {onRestart && !onboarding && (
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
