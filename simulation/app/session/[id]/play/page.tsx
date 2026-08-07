"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageShell, PageHeader, Card, MetricCard, PrimaryButton, NeutralAlert, Spinner } from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import { SupplierOrderPanel, SupplierOrderInfo } from "@/components/SupplierOrderPanel";

interface FacilityWeekInfo {
  facilityId: string;
  onHandStart: number;
  backlogStart: number;
  forecast: number;
  arrivingThisWeek: number;
  suppliers: SupplierOrderInfo[];
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
  performance: {
    cumulativeCost: number;
    fillRatePct: number;
    currentBacklog: number;
    endingInventory: number;
    cumulativeCostByWeek: { week: number; cost: number }[];
  };
}
interface FacilityFeedback {
  facilityId: string;
  actualDemand: number;
  onHandStart: number;
  backlogStart: number;
  arriving: number;
  newServed: number;
  onHandEnd: number;
  backlogEnd: number;
  procurementCost: number;
  holdingCost: number;
  backorderCost: number;
  totalCost: number;
}
interface PeriodFeedback {
  week: number;
  results: FacilityFeedback[];
  completed: boolean;
}

export default function PlayPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [period, setPeriod] = useState<PeriodInfo | null>(null);
  const [orders, setOrders] = useState<Record<string, Record<string, number>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<PeriodFeedback | null>(null);

  const loadPeriod = useCallback(async () => {
    const res = await fetch(`/api/sessions/${params.id}/period`);
    if (!res.ok) {
      setError("Could not load this week's data.");
      return;
    }
    const data: PeriodInfo = await res.json();
    setPeriod(data);
    setFeedback(null);
    const initial: Record<string, Record<string, number>> = {};
    for (const f of data.facilities) {
      initial[f.facilityId] = {};
      for (const s of f.suppliers) initial[f.facilityId][s.id] = 0;
    }
    setOrders(initial);
  }, [params.id]);

  useEffect(() => {
    // The state updates happen after the asynchronous fetch resolves; this
    // is intentionally the initial synchronization with server session state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPeriod();
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
    const result: PeriodFeedback = await res.json();
    setSubmitting(false);
    setFeedback(result);
  }

  function handleContinue() {
    if (!feedback) return;
    if (feedback.completed) router.push(`/session/${params.id}/results`);
    else loadPeriod();
  }

  if (error && !period) {
    return (
      <>
        <AppHeader activeStep="play" />
        <PageShell>
          <p className="text-sm text-red-700">{error}</p>
        </PageShell>
      </>
    );
  }
  if (!period) {
    return (
      <>
        <AppHeader activeStep="play" />
        <PageShell>
          <Spinner />
        </PageShell>
      </>
    );
  }

  const orderIssues = period.facilities.flatMap((facility) => {
    const total = facility.suppliers.reduce(
      (sum, supplier) => sum + (orders[facility.facilityId]?.[supplier.id] ?? 0),
      0
    );
    return facility.suppliers.flatMap((supplier) => {
      const quantity = orders[facility.facilityId]?.[supplier.id] ?? 0;
      if (quantity > supplier.capacityThisWeek) {
        return [`${facility.facilityId}: ${supplier.name} exceeds available capacity.`];
      }
      if (total > 0 && (quantity / total) * 100 > supplier.diversificationCapPct + 1e-9) {
        return [
          `${facility.facilityId}: ${supplier.name} exceeds its ${supplier.diversificationCapPct}% maximum share.`,
        ];
      }
      return [];
    });
  });

  return (
    <>
      <AppHeader activeStep="play" weekProgress={{ current: period.week, total: period.horizonWeeks }} />
      <PageShell>
        <PageHeader title="Place Your Orders" subtitle={`Period ${period.week} of ${period.horizonWeeks}`} />

        {period.week > 1 && (
          <Card className="mb-6 overflow-hidden">
            <div className="grid grid-cols-2 border-b border-[var(--card-border)] sm:grid-cols-4">
              <Kpi label="Cumulative Cost" value={`$${period.performance.cumulativeCost.toLocaleString()}`} />
              <Kpi label="Fill Rate" value={`${period.performance.fillRatePct.toFixed(1)}%`} />
              <Kpi label="Current Backlog" value={period.performance.currentBacklog.toLocaleString()} />
              <Kpi label="Ending Inventory" value={period.performance.endingInventory.toLocaleString()} />
            </div>
            <div className="h-28 px-3 pt-3">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={period.performance.cumulativeCostByWeek} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="costArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1e3a5f" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#1e3a5f" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf0f4" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    formatter={(value) => [`$${Number(value).toLocaleString()}`, "Cumulative cost"]}
                    contentStyle={{ borderRadius: 8, borderColor: "#e5e8ee", fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="cost" stroke="#1e3a5f" strokeWidth={2} fill="url(#costArea)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {period.disruptionsThisWeek.length > 0 && (
          <div className="mb-6 space-y-2">
            {period.disruptionsThisWeek.map((d, i) => (
              <NeutralAlert key={i}>{d.description}</NeutralAlert>
            ))}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {period.facilities.map((f) => (
            <Card key={f.facilityId} className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--navy)] text-[11px] font-bold text-white">
                  {f.facilityId}
                </span>
                <h2 className="text-sm font-semibold text-[var(--navy)]">Facility {f.facilityId}</h2>
              </div>

              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard label="On-Hand Inventory" value={f.onHandStart.toLocaleString()} />
                <MetricCard label="Backlog" value={f.backlogStart.toLocaleString()} accent={f.backlogStart > 0} />
                <MetricCard label="Forecasted Demand" value={f.forecast.toLocaleString()} />
                <MetricCard label="Arriving This Week" value={f.arrivingThisWeek.toLocaleString()} />
              </div>

              <SupplierOrderPanel
                suppliers={f.suppliers}
                quantities={orders[f.facilityId] ?? {}}
                onChange={(supplierId, value) => setOrder(f.facilityId, supplierId, value)}
              />
            </Card>
          ))}
        </div>

        {feedback ? (
          <PeriodOutcome
            feedback={feedback}
            forecasts={Object.fromEntries(period.facilities.map((facility) => [facility.facilityId, facility.forecast]))}
            onContinue={handleContinue}
          />
        ) : (
          <div className="mt-6 flex flex-col items-end gap-3">
            {orderIssues.length > 0 && (
              <div className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                <div className="font-semibold">Rebalance orders before submitting</div>
                <ul className="mt-1 list-disc pl-4">
                  {orderIssues.map((issue) => <li key={issue}>{issue}</li>)}
                </ul>
              </div>
            )}
            <PrimaryButton onClick={handleSubmit} disabled={submitting || orderIssues.length > 0}>
              {submitting ? "Submitting..." : "Submit Orders & Reveal Actual Demand"}
            </PrimaryButton>
          </div>
        )}
      </PageShell>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-[var(--card-border)] px-4 py-3 last:border-r-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--slate-light)]">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--navy)]">{value}</div>
    </div>
  );
}

function PeriodOutcome({
  feedback,
  forecasts,
  onContinue,
}: {
  feedback: PeriodFeedback;
  forecasts: Record<string, number>;
  onContinue: () => void;
}) {
  const totalActual = feedback.results.reduce((sum, result) => sum + result.actualDemand, 0);
  const totalForecast = feedback.results.reduce((sum, result) => sum + (forecasts[result.facilityId] ?? 0), 0);
  const totalServed = feedback.results.reduce((sum, result) => sum + result.newServed, 0);
  const totalCost = feedback.results.reduce((sum, result) => sum + result.totalCost, 0);
  const fillRate = totalActual > 0 ? (totalServed / totalActual) * 100 : 100;

  return (
    <Card className="mt-6 overflow-hidden border-[var(--navy)]/20">
      <div className="border-b border-[var(--card-border)] bg-[var(--navy)] px-5 py-3.5 text-white">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/70">Period {feedback.week} complete</div>
        <div className="mt-1 text-lg font-semibold">Actual demand has been revealed</div>
      </div>

      <div className="grid grid-cols-2 border-b border-[var(--card-border)] sm:grid-cols-4">
        <OutcomeMetric label="Forecast" value={totalForecast.toLocaleString()} />
        <OutcomeMetric
          label="Actual Demand"
          value={totalActual.toLocaleString()}
          detail={`${totalActual >= totalForecast ? "+" : ""}${(((totalActual - totalForecast) / Math.max(1, totalForecast)) * 100).toFixed(1)}% vs forecast`}
        />
        <OutcomeMetric label="Period Fill Rate" value={`${fillRate.toFixed(1)}%`} />
        <OutcomeMetric label="Period Cost" value={`$${Math.round(totalCost).toLocaleString()}`} />
      </div>

      <div className="p-5">
        <div className="thin-scrollbar overflow-x-auto rounded-lg border border-[var(--card-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--slate)]">
                <th className="px-3 py-2.5">Facility</th>
                <th className="px-3 py-2.5">Forecast</th>
                <th className="px-3 py-2.5">Actual</th>
                <th className="px-3 py-2.5">Served</th>
                <th className="px-3 py-2.5">Ending Inventory</th>
                <th className="px-3 py-2.5">Backlog</th>
                <th className="px-3 py-2.5">Cost</th>
              </tr>
            </thead>
            <tbody>
              {feedback.results.map((result) => (
                <tr key={result.facilityId} className="border-t border-[var(--card-border)]">
                  <td className="px-3 py-2.5 font-semibold text-[var(--navy)]">{result.facilityId}</td>
                  <td className="px-3 py-2.5 tabular-nums">{forecasts[result.facilityId]?.toLocaleString()}</td>
                  <td className="px-3 py-2.5 font-medium tabular-nums">{result.actualDemand.toLocaleString()}</td>
                  <td className="px-3 py-2.5 tabular-nums">{result.newServed.toLocaleString()}</td>
                  <td className="px-3 py-2.5 tabular-nums">{result.onHandEnd.toLocaleString()}</td>
                  <td className={`px-3 py-2.5 font-medium tabular-nums ${result.backlogEnd > 0 ? "text-red-600" : ""}`}>
                    {result.backlogEnd.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">${Math.round(result.totalCost).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex justify-end">
          <PrimaryButton onClick={onContinue}>
            {feedback.completed ? "View Final Results" : "Continue to Next Period"}
          </PrimaryButton>
        </div>
      </div>
    </Card>
  );
}

function OutcomeMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="border-r border-[var(--card-border)] px-4 py-3 last:border-r-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--slate-light)]">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-[var(--navy)]">{value}</div>
      {detail && <div className="mt-0.5 text-[10px] text-[var(--slate)]">{detail}</div>}
    </div>
  );
}
