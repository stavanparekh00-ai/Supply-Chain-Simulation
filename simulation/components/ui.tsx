import { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`bg-white border border-[var(--card-border)] rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_1px_1px_rgba(15,23,42,0.03)] ${className}`}
    >
      {children}
    </div>
  );
}

export function PageShell({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return (
    <div className="min-h-screen pb-16">
      <div className={`mx-auto px-4 pt-8 ${narrow ? "max-w-2xl" : "max-w-5xl"}`}>{children}</div>
    </div>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-7">
      <h1 className="text-[1.5rem] font-semibold tracking-tight text-[var(--navy)]">{title}</h1>
      {subtitle && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--slate)]">{subtitle}</p>}
    </div>
  );
}

export function StepIndicator({ current, total, label }: { current: number; total: number; label: string }) {
  return (
    <div className="mb-5 flex items-center gap-2 text-xs font-semibold tracking-wide text-[var(--slate)] uppercase">
      <span className="rounded bg-[var(--navy)]/8 px-2 py-0.5 text-[var(--navy)]">
        Step {current} of {total}
      </span>
      <span>{label}</span>
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--navy)] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-[var(--navy-dark)] hover:shadow disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none active:scale-[0.98]"
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center rounded-lg border border-[var(--card-border)] bg-white px-5 py-2.5 text-sm font-medium text-[var(--navy)] transition-colors hover:bg-slate-50 active:scale-[0.98]"
    >
      {children}
    </button>
  );
}

export function MetricCard({
  label,
  value,
  sublabel,
  accent = false,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  accent?: boolean;
}) {
  return (
    <Card className={`p-4 ${accent ? "border-[var(--navy)]/25 bg-[var(--navy)]/[0.03]" : ""}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--slate)]">{label}</div>
      <div className="mt-1.5 text-[1.6rem] font-semibold tabular-nums leading-none text-[var(--navy)]">{value}</div>
      {sublabel && <div className="mt-1.5 text-xs text-[var(--slate-light)]">{sublabel}</div>}
    </Card>
  );
}

export function NeutralAlert({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-[var(--amber-border)] bg-[var(--amber-bg)] px-4 py-3 text-sm text-[var(--amber)]">
      <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-current text-[10px] font-bold">
        i
      </span>
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

export function DataTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="thin-scrollbar overflow-x-auto rounded-lg border border-[var(--card-border)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--slate)]">
            {headers.map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2.5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-[var(--card-border)] transition-colors hover:bg-slate-50/60">
              {row.map((cell, j) => (
                <td key={j} className="whitespace-nowrap px-3 py-2 tabular-nums text-[var(--foreground)]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center gap-2 text-sm text-[var(--slate)]">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--card-border)] border-t-[var(--navy)]" />
      Loading...
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "navy" }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "navy" ? "bg-[var(--navy)]/10 text-[var(--navy)]" : "bg-slate-100 text-[var(--slate)]",
      ].join(" ")}
    >
      {children}
    </span>
  );
}
