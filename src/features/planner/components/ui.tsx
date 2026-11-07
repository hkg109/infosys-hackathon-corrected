import Link from "next/link";
import type { ReactNode } from "react";
import type { CourseGroup } from "@/contracts/types";
import { CAREER_LABEL } from "@/contracts/careers";

type BtnKind = "ink" | "line" | "stamp" | "ghost";
const btn: Record<BtnKind, string> = {
  ink: "bg-ink text-paper hover:bg-ink-soft border-ink",
  line: "border-ink/70 bg-paper/60 text-ink hover:bg-paper-2",
  stamp: "border-red bg-red text-paper hover:brightness-95",
  ghost: "border-transparent text-ink-soft hover:text-ink hover:bg-paper-2",
};
const btnBase =
  "inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-[6px] border-[1.5px] px-4 py-2 text-[14px] font-medium disabled:cursor-not-allowed disabled:opacity-45";

export function Button({
  kind = "line",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind }) {
  return <button type="button" className={`${btnBase} ${btn[kind]} ${className}`} {...props} />;
}

export function LinkButton({
  href,
  kind = "line",
  className = "",
  children,
}: {
  href: string;
  kind?: BtnKind;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`${btnBase} ${btn[kind]} ${className}`}>
      {children}
    </Link>
  );
}

/** 페이지 제목: 손글씨 단계 표시 + 명조 제목 */
export function PageTitle({ step, title, sub, aside }: { step?: string; title: ReactNode; sub?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-6">
      <div>
        {step && <p className="font-hand text-[22px] leading-none text-pen">{step}</p>}
        <h1 className="mt-1 font-serif text-[34px] leading-tight font-bold tracking-tight text-ink">{title}</h1>
        {sub && <p className="mt-2 text-[14px] text-ink-soft">{sub}</p>}
      </div>
      {aside}
    </div>
  );
}

/** 입력 화면의 번호 붙은 칸 */
export function Section({ n, title, note, children }: { n: number; title: string; note?: string; children: ReactNode }) {
  return (
    <section className="grid grid-cols-[56px_minmax(0,1fr)] gap-4 border-t border-line pt-6 first:border-t-0 first:pt-0">
      <span className="font-serif text-[30px] leading-none text-red tabular-nums">{String(n).padStart(2, "0")}</span>
      <div className="min-w-0">
        <div className="mb-4 flex items-baseline gap-3">
          <h2 className="font-serif text-[20px] font-bold text-ink">{title}</h2>
          {note && <span className="font-hand text-[19px] text-pen">{note}</span>}
        </div>
        {children}
      </div>
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 content-start gap-0.5">
      <span className="text-[12px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

/** 동그라미 치는 선택지(라디오) */
export function Choice({
  selected,
  onClick,
  children,
  className = "",
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`group relative flex cursor-pointer items-center gap-2.5 rounded-[6px] border-[1.5px] px-3.5 py-2.5 text-left text-[14px] transition-colors ${
        selected ? "border-pen bg-pen/[0.06] text-ink" : "border-line bg-paper/70 text-ink-soft hover:border-ink/40 hover:text-ink"
      } ${className}`}
    >
      <span
        aria-hidden
        className={`grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] ${selected ? "border-pen" : "border-ink/30"}`}
      >
        {selected && <span className="size-2 rounded-full bg-pen" />}
      </span>
      <span className="min-w-0">{children}</span>
    </button>
  );
}

export function Tag({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "marker" | "red" | "sage" }) {
  const cls = {
    plain: "border border-line text-ink-soft",
    marker: "bg-marker text-ink",
    red: "bg-red-soft text-red",
    sage: "bg-sage text-sage-ink",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${cls}`}>{children}</span>;
}

export const GROUP_COLOR: Record<CourseGroup, string> = {
  common: "var(--g-common)",
  software: "var(--g-software)",
  data: "var(--g-data)",
  security: "var(--g-security)",
  consulting: "var(--g-consulting)",
  business: "var(--g-business)",
};

export const groupLabel = (g: CourseGroup) => (g === "common" ? "공통 기초" : CAREER_LABEL[g]);

export function GroupDot({ group, size = 9 }: { group: CourseGroup; size?: number }) {
  return <span aria-hidden className="inline-block shrink-0 rounded-[2px]" style={{ width: size, height: size, background: GROUP_COLOR[group] }} />;
}

/** 손글씨 메모 */
export const Hand = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <span className={`font-hand text-[19px] leading-snug text-pen ${className}`}>{children}</span>
);

export function Empty({ title, children, href, cta }: { title: string; children?: ReactNode; href: string; cta: string }) {
  return (
    <div className="mx-auto mt-10 max-w-md text-center">
      <p className="font-serif text-[22px] font-bold">{title}</p>
      {children && <p className="mt-2 text-[14px] text-ink-soft">{children}</p>}
      <LinkButton href={href} kind="ink" className="mt-6">
        {cta}
      </LinkButton>
    </div>
  );
}
