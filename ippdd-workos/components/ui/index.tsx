import type { ReactNode } from "react";

/** Minimal accessible UI kit (D-010). Server-component friendly. */

export function Card({
  title,
  children,
  actions,
  className = "",
}: {
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

const BUTTON_VARIANTS = {
  primary: "bg-slate-900 text-white hover:bg-slate-700 focus-visible:ring-slate-400",
  secondary:
    "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus-visible:ring-slate-300",
  success: "bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-emerald-300",
  warning: "bg-amber-500 text-white hover:bg-amber-400 focus-visible:ring-amber-300",
  danger: "bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-300",
} as const;

export function Button({
  children,
  variant = "primary",
  type = "submit",
  small = false,
  name,
  value,
}: {
  children: ReactNode;
  variant?: keyof typeof BUTTON_VARIANTS;
  type?: "submit" | "button";
  small?: boolean;
  name?: string;
  value?: string;
}) {
  return (
    <button
      type={type}
      name={name}
      value={value}
      className={`inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 ${
        small ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm"
      } ${BUTTON_VARIANTS[variant]}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400";

export function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneCls =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "bad"
          ? "text-red-700"
          : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${toneCls}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

/** Simple derivation-explained progress bar (§31). */
export function Meter({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div title={label} aria-label={`${label}: ${v}%`}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-slate-500">{label}</span>
        <span className="font-semibold tabular-nums">{v}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
        <div
          className={`h-1.5 rounded-full ${v >= 100 ? "bg-emerald-500" : v >= 50 ? "bg-blue-500" : "bg-amber-500"}`}
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}
