"use client";

export interface SupplierOrderInfo {
  id: string;
  name: string;
  tier: string;
  reliabilityPct: number;
  defectRatePct: number;
  leadTimeWeeks: number;
  landedUnitCost: number;
  capacityThisWeek: number;
  suggestedSharePct: number;
}

const SUPPLIER_THEME: Record<string, { accent: string; soft: string; bar: string }> = {
  domestic_fab: { accent: "#1e3a5f", soft: "#e8eef6", bar: "#1e3a5f" },
  regional_partner: { accent: "#0f766e", soft: "#e6f4f2", bar: "#0f766e" },
  overseas_manufacturer: { accent: "#b45309", soft: "#fef6e7", bar: "#b45309" },
};

function themeFor(id: string) {
  return SUPPLIER_THEME[id] ?? { accent: "#475569", soft: "#f1f5f9", bar: "#475569" };
}

export function SupplierOrderPanel({
  suppliers,
  quantities,
  onChange,
}: {
  suppliers: SupplierOrderInfo[];
  quantities: Record<string, number | "">;
  onChange: (supplierId: string, value: string) => void;
}) {
  const numericQty = (supplierId: string) => {
    const value = quantities[supplierId];
    return typeof value === "number" ? value : 0;
  };
  const total = suppliers.reduce((sum, s) => sum + numericQty(s.id), 0);

  return (
    <div>
      <div className="grid gap-3 md:grid-cols-3">
        {suppliers.map((supplier) => {
          const qty = quantities[supplier.id];
          const used = numericQty(supplier.id);
          const share = total > 0 ? (used / total) * 100 : 0;
          const theme = themeFor(supplier.id);
          return (
            <div
              key={supplier.id}
              className="flex flex-col rounded-xl border-2 bg-white p-4"
              style={{ borderColor: theme.accent, background: theme.soft }}
            >
              <div className="mb-3">
                <div className="text-sm font-semibold" style={{ color: theme.accent }}>
                  {supplier.name}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
                  <span
                    className="rounded px-1.5 py-0.5 font-semibold text-white"
                    style={{ background: theme.accent }}
                  >
                    {supplier.tier} tier
                  </span>
                  <span className="rounded bg-white/80 px-1.5 py-0.5 font-medium text-[var(--slate)]">
                    Suggested {supplier.suggestedSharePct}%
                  </span>
                </div>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <div className="text-[var(--slate-light)]">Landed cost</div>
                  <div className="font-semibold tabular-nums text-[var(--foreground)]">
                    ${supplier.landedUnitCost.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--slate-light)]">Lead time</div>
                  <div className="font-semibold tabular-nums text-[var(--foreground)]">
                    {supplier.leadTimeWeeks} wk
                  </div>
                </div>
                <div>
                  <div className="text-[var(--slate-light)]">Capacity</div>
                  <div className="font-semibold tabular-nums text-[var(--foreground)]">
                    {supplier.capacityThisWeek.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--slate-light)]">Reliability</div>
                  <div className="font-semibold tabular-nums text-[var(--foreground)]">
                    {supplier.reliabilityPct}%
                  </div>
                </div>
              </div>

              <label className="mt-auto block rounded-lg border border-white/80 bg-white p-3">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--slate)]">
                  Order quantity
                </span>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <input
                    type="number"
                    min={0}
                    max={supplier.capacityThisWeek}
                    step={1}
                    placeholder="0"
                    value={qty === "" || qty === undefined ? "" : qty}
                    onChange={(event) => onChange(supplier.id, event.target.value)}
                    className="w-full border-0 bg-transparent p-0 text-2xl font-semibold tabular-nums outline-none placeholder:text-[var(--slate-light)]"
                    style={{ color: theme.accent }}
                  />
                  <span className="text-xs text-[var(--slate)]">units</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/5">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (used / Math.max(1, supplier.capacityThisWeek)) * 100)}%`,
                      background: theme.bar,
                    }}
                  />
                </div>
                <div className="mt-1.5 text-[10px] text-[var(--slate)]">
                  Current share {share.toFixed(0)}% · suggested {supplier.suggestedSharePct}%
                </div>
              </label>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex flex-wrap gap-3 text-xs text-[var(--slate)]">
          {suppliers.map((s) => {
            const share = total > 0 ? (numericQty(s.id) / total) * 100 : 0;
            const theme = themeFor(s.id);
            return (
              <span key={s.id}>
                <span className="font-semibold" style={{ color: theme.accent }}>
                  {s.name}
                </span>
                : {share.toFixed(0)}%
              </span>
            );
          })}
        </div>
        <div className="font-semibold tabular-nums text-[var(--navy)]">
          Facility order total: {total.toLocaleString()}
        </div>
      </div>
    </div>
  );
}
