import type { ReactNode } from "react";

type Tone = "brand" | "warm" | "ok";
const toneClass: Record<Tone, string> = {
  brand: "bg-active text-brand",
  warm: "bg-warm text-warm-ink",
  ok: "bg-ok text-ok-ink",
};

export function Badge({ tone = "brand", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-[5px] px-2 py-0.5 text-[11px] ${toneClass[tone]}`}>{children}</span>;
}

export function Panel({ className = "", children }: { className?: string; children: ReactNode }) {
  return <section className={`rounded-[11px] border border-line bg-panel p-4 ${className}`}>{children}</section>;
}

export function SectionHeader({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-base font-medium">{title}</h2>
      {aside}
    </div>
  );
}

export function Button({
  primary,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-[38px] cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-[13px] disabled:cursor-not-allowed disabled:opacity-50 ${
        primary ? "border-brand bg-brand text-contrast" : "border-line bg-panel"
      } ${className}`}
      {...props}
    />
  );
}

export const Sub = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <p className={`text-xs text-muted ${className}`}>{children}</p>
);
