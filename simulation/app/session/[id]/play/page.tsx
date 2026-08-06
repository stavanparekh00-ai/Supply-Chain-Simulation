"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { PageShell, PageHeader, Card, MetricCard, PrimaryButton, NeutralAlert } from "@/components/ui";

interface SupplierInfo {
  id: string;
  name: string;
  leadTimeWeeks: number;
  landedUnitCost: number;
  capacityThisWeek: number;
  diversificationCapPct: number;
}
interface FacilityWeekInfo {
  facilityId: string;
  onHandStart: number;
  backlogStart: number;
  forecast: number;
  arrivingThisWeek: number;
  suppliers: SupplierInfo[];
}
interface DisruptionEvent {
  week: number;
  type: string;
  description: string;
}
interface PeriodInfo {
  week: number;
  horizonWeeks: number;
  minInventoryFloor: number;
  maxInventoryCeiling: number;
  disruptionsThisWeek: DisruptionEvent[];
  facilities: FacilityWeekInfo[];
}

export default function PlayPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [period, setPeriod] = useState<PeriodInfo | null>(null);
  const [orders, setOrders] = useState<Record<string, Record<string, number>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPeriod = useCallback(async () => {
    const res = await fetch(`/api/sessions/${params.id}/period`);
    if (!res.ok) {
      setError("Could not load this week's data.");
      return;
    }
    const data: PeriodInfo = await res.json();
    setPeriod(data);
    const initial: Record<string, Record<string, number>> = {};
    for (const f of data.facilities) {
      initial[f.facilityId] = {};
      for (const s of f.suppliers) initial[f.facilityId][s.id] = 0;
    }
    setOrders(initial);
  }, [params.id]);

  useEffect(() => {
    loadPeriod();
  }, [loadPeriod]);

  function setOrder(facilityId: string, supplierId: string, value: string) {
    const qty = Math.max(0, Math.floor(Number(value) || 0));
    setOrders((prev) => ({ ...prev, [facilityId]: { ...prev[facilityId], [supplierId]: qty } }));
  }

  async function handleSubmit() {
    if (!period) return;
    setSubmitting(true);
    setError(null);
    const orderList = Object.entries(orders).flatMap(([facilityId, bySupplier]) =>
      Object.entries(bySupplier).map(([supplierId, quantity]) => ({ facilityId, supplierId, quantity }))
    );
    const res = await fetch(`/api/sessions/${params.id}/decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orders: orderList }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Failed to submit this week's decisions.");
      setSubmitting(false);
      return;
    }
    const result = await res.json();
    setSubmitting(false);
    if (result.completed) {
      router.push(`/session/${params.id}/results`);
    } else {
      loadPeriod();
    }
  }

  if (error && !period) {
    return (
      <PageShell>
        <p className="text-sm text-red-700">{error}</p>
      </PageShell>
    );
  }
  if (!period) {
    return (
      <PageShell>
        <p className="text-sm text-[var(--slate)]">Loading...</p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="mb-4 flex items-center justify-between text-sm text-[var(--slate)]">
        <span>Period {period.week} of {period.horizonWeeks}</span>
      </div>
      <PageHeader title="Place Your Orders" />

      {period.disruptionsThisWeek.length > 0 && (
        <div className="mb-6 space-y-2">
          {period.disruptionsThisWeek.map((d, i) => (
            <NeutralAlert key={i}>Notice: {d.description}</NeutralAlert>
          ))}
        </div>
      )}

      {error && <div className="mb-4 text-sm text-red-700">{error}</div>}

      <div className="space-y-8">
        {period.facilities.map((f) => (
          <Card key={f.facilityId} className="p-5">
            <h2 className="text-sm font-semibold text-[var(--navy)] mb-4">Facility {f.facilityId}</h2>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-5">
              <MetricCard label="On-Hand Inventory" value={f.onHandStart.toLocaleString()} />
              <MetricCard label="Backlog" value={f.backlogStart.toLocaleString()} />
              <MetricCard label="Forecasted Demand" value={f.forecast.toLocaleString()} />
              <MetricCard label="Arriving This Week" value={f.arrivingThisWeek.toLocaleString()} />
            </div>

            <div className="overflow-x-auto rounded-md border border-[var(--card-border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-[var(--slate)]">
                    <th className="px-3 py-2 font-medium">Supplier</th>
                    <th className="px-3 py-2 font-medium">Unit Cost</th>
                    <th className="px-3 py-2 font-medium">Lead Time</th>
                    <th className="px-3 py-2 font-medium">Capacity</th>
                    <th className="px-3 py-2 font-medium">Max Share</th>
                    <th className="px-3 py-2 font-medium">Order Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {f.suppliers.map((s) => (
                    <tr key={s.id} className="border-t border-[var(--card-border)]">
                      <td className="px-3 py-2 font-medium">{s.name}</td>
                      <td className="px-3 py-2">${s.landedUnitCost.toFixed(2)}</td>
                      <td className="px-3 py-2">{s.leadTimeWeeks} wk</td>
                      <td className="px-3 py-2">{s.capacityThisWeek.toLocaleString()}</td>
                      <td className="px-3 py-2">{s.diversificationCapPct}%</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={orders[f.facilityId]?.[s.id] ?? 0}
                          onChange={(e) => setOrder(f.facilityId, s.id, e.target.value)}
                          className="w-28 rounded-md border border-[var(--card-border)] px-2 py-1 text-sm"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <PrimaryButton onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Submitting..." : "Submit Order"}
        </PrimaryButton>
      </div>
    </PageShell>
  );
}
