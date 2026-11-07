import type { ReactNode } from "react";

type Tone = "brand" | "warm" | "ok" | "muted";
const toneClass: Record<Tone, string> = {
  brand: "bg-active text-brand",
  warm: "bg-warm text-warm-ink",
  ok: "bg-ok text-ok-ink",
  muted: "bg-bg text-muted",
};

export function Badge({ tone = "brand", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${toneClass[tone]}`}>
      {children}
    </span>
  );
}

export function Panel({ className = "", children }: { className?: string; children: ReactNode }) {
  return <section className={`rounded-xl border border-line bg-panel p-4 sm:p-5 ${className}`}>{children}</section>;
}

export function SectionHeader({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
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
      className={`inline-flex min-h-[38px] cursor-pointer items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
        primary ? "border-brand bg-brand text-contrast hover:bg-brand-strong" : "border-line bg-panel text-ink hover:bg-bg"
      } ${className}`}
      {...props}
    />
  );
}

export const Sub = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <p className={`text-xs text-muted ${className}`}>{children}</p>
);

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 content-start gap-1.5 text-xs text-muted">
      {label}
      {children}
    </label>
  );
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<[T, string]>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-line bg-panel p-1" role="group" aria-label={label}>
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={`flex-1 cursor-pointer rounded-md px-3 py-2 text-[13px] ${
            value === id ? "bg-brand font-medium text-contrast" : "text-muted hover:text-ink"
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
