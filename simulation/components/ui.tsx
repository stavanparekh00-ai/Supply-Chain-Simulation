import { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-[var(--card-border)] rounded-lg shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function PageShell({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return (
    <div className="min-h-screen bg-[var(--background)] py-10 px-4">
      <div className={`mx-auto ${narrow ? "max-w-2xl" : "max-w-5xl"}`}>{children}</div>
    </div>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-semibold text-[var(--navy)]">{title}</h1>
      {subtitle && <p className="mt-2 text-sm text-[var(--slate)]">{subtitle}</p>}
    </div>
  );
}

export function StepIndicator({ current, total, label }: { current: number; total: number; label: string }) {
  return (
    <div className="mb-6 text-xs font-medium tracking-wide uppercase text-[var(--slate)]">
      Step {current} of {total}: {label}
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
      className="px-5 py-2.5 rounded-md bg-[var(--navy)] text-white text-sm font-medium hover:bg-[#16304d] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
      className="px-5 py-2.5 rounded-md border border-[var(--card-border)] text-sm font-medium text-[var(--navy)] hover:bg-gray-50 transition-colors"
    >
      {children}
    </button>
  );
}

export function MetricCard({ label, value, sublabel }: { label: string; value: string | number; sublabel?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--slate)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-[var(--navy)]">{value}</div>
      {sublabel && <div className="mt-1 text-xs text-[var(--slate)]">{sublabel}</div>}
    </Card>
  );
}

export function NeutralAlert({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {children}
    </div>
  );
}

export function DataTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-[var(--card-border)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-[var(--slate)]">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-[var(--card-border)]">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-[var(--foreground)]">
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
