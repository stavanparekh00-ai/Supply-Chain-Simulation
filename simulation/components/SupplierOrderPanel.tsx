"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";

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

export function SupplierOrderPanel({
  suppliers,
  quantities,
  softMaxSharePct,
  onChange,
}: {
  suppliers: SupplierOrderInfo[];
  quantities: Record<string, number | "">;
  softMaxSharePct: number;
  onChange: (supplierId: string, value: string) => void;
}) {
  const [activeId, setActiveId] = useState(suppliers[0]?.id);
  const active = suppliers.find((s) => s.id === activeId) ?? suppliers[0];
  const numericQty = (supplierId: string) => {
    const value = quantities[supplierId];
    return typeof value === "number" ? value : 0;
  };
  const total = suppliers.reduce((sum, s) => sum + numericQty(s.id), 0);

  if (!active) return null;

  const activeQty = quantities[active.id];
  const activeNumeric = numericQty(active.id);
  const activeShare = total > 0 ? (activeNumeric / total) * 100 : 0;

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--card-border)] bg-white">
      <div className="border-b border-[var(--card-border)] bg-slate-50 px-4 py-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--navy)]">
          Suppliers
        </div>
        <div className="mt-0.5 text-[11px] text-[var(--slate)]">
          Soft guidance only — suggested shares by risk tier; no supplier should exceed {softMaxSharePct}% of a facility order.
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-[var(--card-border)] bg-white p-2">
        {suppliers.map((supplier) => {
          const isActive = supplier.id === active.id;
          const qty = numericQty(supplier.id);
          const share = total > 0 ? (qty / total) * 100 : 0;
          return (
            <button
              key={supplier.id}
              type="button"
              onClick={() => setActiveId(supplier.id)}
              className={[
                "min-w-[10.5rem] flex-1 rounded-lg border px-3 py-2.5 text-left transition-colors",
                isActive
                  ? "border-[var(--navy)] bg-[var(--navy)] text-white"
                  : "border-[var(--card-border)] bg-slate-50 hover:border-[var(--slate-light)] hover:bg-white",
              ].join(" ")}
            >
              <span className={`block truncate text-xs font-semibold ${isActive ? "text-white" : "text-[var(--navy)]"}`}>
                {supplier.name}
              </span>
              <span className={`mt-1 block text-[11px] ${isActive ? "text-white/80" : "text-[var(--slate)]"}`}>
                ${supplier.landedUnitCost.toFixed(2)} · {supplier.leadTimeWeeks} wk LT
              </span>
              <span className={`mt-1.5 block text-[10px] ${isActive ? "text-white/75" : "text-[var(--slate-light)]"}`}>
                Suggested ~{supplier.suggestedSharePct}%
                {qty > 0 ? ` · now ${share.toFixed(0)}%` : ""}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-[var(--navy)]">{active.name}</h3>
            <Badge tone="navy">{active.tier} tier</Badge>
            <Badge>Suggested ~{active.suggestedSharePct}%</Badge>
            <Badge>Soft max {softMaxSharePct}%</Badge>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <SupplierMetric label="Landed cost" value={`$${active.landedUnitCost.toFixed(2)}`} />
            <SupplierMetric label="Lead time" value={`${active.leadTimeWeeks} week${active.leadTimeWeeks === 1 ? "" : "s"}`} />
            <SupplierMetric label="Reliability" value={`${active.reliabilityPct}%`} />
            <SupplierMetric label="Defect rate" value={`${active.defectRatePct}%`} />
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-[11px] text-[var(--slate)]">
              <span>Weekly capacity used</span>
              <span className="tabular-nums">
                {activeNumeric.toLocaleString()} / {active.capacityThisWeek.toLocaleString()}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-[var(--navy)] transition-all"
                style={{
                  width: `${Math.min(100, (activeNumeric / Math.max(1, active.capacityThisWeek)) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>

        <label className="block rounded-lg border border-[var(--card-border)] bg-slate-50 p-3 sm:w-48">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--slate)]">
            Order quantity
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <input
              type="number"
              min={0}
              max={active.capacityThisWeek}
              step={1}
              placeholder="Enter qty"
              value={activeQty === "" || activeQty === undefined ? "" : activeQty}
              onChange={(event) => onChange(active.id, event.target.value)}
              className="w-full border-0 bg-transparent p-0 text-2xl font-semibold tabular-nums text-[var(--navy)] outline-none placeholder:text-[var(--slate-light)] placeholder:text-base placeholder:font-normal"
            />
            <span className="text-xs text-[var(--slate)]">units</span>
          </div>
          {activeShare > softMaxSharePct && (
            <div className="mt-2 text-[10px] font-medium text-amber-700">
              Soft warning: {activeShare.toFixed(0)}% exceeds the {softMaxSharePct}% single-supplier guide.
            </div>
          )}
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--card-border)] bg-slate-50 px-4 py-2.5 text-xs">
        <span className="font-medium text-[var(--slate)]">Current allocation</span>
        {suppliers.map((supplier) => {
          const qty = numericQty(supplier.id);
          const share = total > 0 ? (qty / total) * 100 : 0;
          const overSoftMax = share > softMaxSharePct;
          return (
            <span key={supplier.id} className="text-[var(--slate)]">
              {supplier.name}:{" "}
              <strong className={overSoftMax ? "text-amber-700" : "text-[var(--foreground)]"}>
                {share.toFixed(1)}%
              </strong>
              <span className="text-[var(--slate-light)]"> / sug. {supplier.suggestedSharePct}%</span>
            </span>
          );
        })}
        <span className="ml-auto font-semibold tabular-nums text-[var(--navy)]">
          Total: {total.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

function SupplierMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--slate-light)]">{label}</div>
      <div className="mt-0.5 text-sm font-medium tabular-nums text-[var(--foreground)]">{value}</div>
    </div>
  );
}
