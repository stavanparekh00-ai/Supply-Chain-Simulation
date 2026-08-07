"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";

export interface SupplierOrderInfo {
  id: string;
  name: string;
  originCountry: string;
  tier: string;
  reliabilityPct: number;
  defectRatePct: number;
  leadTimeWeeks: number;
  landedUnitCost: number;
  capacityThisWeek: number;
  diversificationCapPct: number;
}

export function SupplierOrderPanel({
  suppliers,
  quantities,
  onChange,
}: {
  suppliers: SupplierOrderInfo[];
  quantities: Record<string, number>;
  onChange: (supplierId: string, value: string) => void;
}) {
  const [activeId, setActiveId] = useState(suppliers[0]?.id);
  const active = suppliers.find((s) => s.id === activeId) ?? suppliers[0];
  const total = suppliers.reduce((sum, s) => sum + (quantities[s.id] ?? 0), 0);

  if (!active) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--card-border)] bg-slate-50/40">
      <div className="grid grid-cols-3 border-b border-[var(--card-border)] bg-white">
        {suppliers.map((supplier) => {
          const isActive = supplier.id === active.id;
          const qty = quantities[supplier.id] ?? 0;
          return (
            <button
              key={supplier.id}
              type="button"
              onClick={() => setActiveId(supplier.id)}
              className={[
                "relative min-w-0 px-3 py-3 text-left transition-colors",
                isActive ? "bg-[var(--navy)]/[0.04]" : "hover:bg-slate-50",
              ].join(" ")}
            >
              {isActive && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--navy)]" />}
              <span className="block truncate text-xs font-semibold text-[var(--navy)]">{supplier.name}</span>
              <span className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--slate)]">
                ${supplier.landedUnitCost.toFixed(2)} · {supplier.leadTimeWeeks} wk
              </span>
              {qty > 0 && (
                <span className="mt-1.5 inline-flex rounded-full bg-[var(--navy)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
                  {qty.toLocaleString()} ordered
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-[var(--navy)]">{active.name}</h3>
            <Badge tone="navy">{active.tier} tier</Badge>
            <Badge>{active.originCountry}</Badge>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <SupplierMetric label="Landed cost" value={`$${active.landedUnitCost.toFixed(2)}`} />
            <SupplierMetric label="Lead time" value={`${active.leadTimeWeeks} week${active.leadTimeWeeks === 1 ? "" : "s"}`} />
            <SupplierMetric label="Reliability" value={`${active.reliabilityPct}%`} />
            <SupplierMetric label="Defect rate" value={`${active.defectRatePct}%`} />
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-[11px] text-[var(--slate)]">
              <span>Weekly capacity</span>
              <span className="tabular-nums">{active.capacityThisWeek.toLocaleString()} units</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-[var(--navy)] transition-all"
                style={{
                  width: `${Math.min(100, ((quantities[active.id] ?? 0) / active.capacityThisWeek) * 100)}%`,
                }}
              />
            </div>
            <div className="mt-1 text-[10px] text-[var(--slate-light)]">
              Maximum {active.diversificationCapPct}% of this facility&apos;s total order
            </div>
          </div>
        </div>

        <label className="block rounded-lg border border-[var(--card-border)] bg-white p-3 sm:w-44">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--slate)]">
            Order quantity
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <input
              type="number"
              min={0}
              max={active.capacityThisWeek}
              step={1}
              value={quantities[active.id] ?? 0}
              onChange={(event) => onChange(active.id, event.target.value)}
              className="w-full border-0 bg-transparent p-0 text-2xl font-semibold tabular-nums text-[var(--navy)] outline-none"
            />
            <span className="text-xs text-[var(--slate)]">units</span>
          </div>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--card-border)] bg-white px-4 py-2.5 text-xs">
        <span className="font-medium text-[var(--slate)]">Order allocation</span>
        {suppliers.map((supplier) => {
          const qty = quantities[supplier.id] ?? 0;
          const share = total > 0 ? (qty / total) * 100 : 0;
          return (
            <span key={supplier.id} className="text-[var(--slate)]">
              {supplier.name}:{" "}
              <strong className={share > supplier.diversificationCapPct ? "text-red-600" : "text-[var(--foreground)]"}>
                {share.toFixed(1)}%
              </strong>
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
