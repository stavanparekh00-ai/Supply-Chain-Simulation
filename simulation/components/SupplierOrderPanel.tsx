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
          return (
            <div
              key={supplier.id}
              className="flex flex-col rounded-xl border border-[var(--card-border)] bg-slate-50/60 p-4"
            >
              <div className="mb-3">
                <div className="text-sm font-semibold text-[var(--navy)]">{supplier.name}</div>
                <div className="mt-1 text-[11px] text-[var(--slate)]">
                  {supplier.tier} tier · {supplier.leadTimeWeeks} wk lead time
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
                <div>
                  <div className="text-[var(--slate-light)]">Defect rate</div>
                  <div className="font-semibold tabular-nums text-[var(--foreground)]">
                    {supplier.defectRatePct}%
                  </div>
                </div>
              </div>

              <label className="mt-auto block rounded-lg border border-[var(--card-border)] bg-white p-3">
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
                    className="w-full border-0 bg-transparent p-0 text-2xl font-semibold tabular-nums text-[var(--navy)] outline-none placeholder:text-[var(--slate-light)]"
                  />
                  <span className="text-xs text-[var(--slate)]">units</span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-[var(--navy)] transition-all"
                    style={{
                      width: `${Math.min(100, (used / Math.max(1, supplier.capacityThisWeek)) * 100)}%`,
                    }}
                  />
                </div>
              </label>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex justify-end text-sm font-semibold tabular-nums text-[var(--navy)]">
        Facility order total: {total.toLocaleString()}
      </div>
    </div>
  );
}
