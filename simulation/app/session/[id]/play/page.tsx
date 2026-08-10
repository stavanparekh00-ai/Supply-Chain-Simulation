"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageShell, PageHeader, Card, MetricCard, PrimaryButton, NeutralAlert, Spinner } from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import { SupplierOrderPanel, SupplierOrderInfo } from "@/components/SupplierOrderPanel";

interface CustomerForecast {
  customerId: string;
  customerName: string;
  forecast: number;
}
interface FacilityWeekInfo {
  facilityId: string;
  onHandStart: number;
  backlogStart: number;
  forecast: number;
  customerForecasts: CustomerForecast[];
  arrivingThisWeek: number;
  maxInventoryCeiling: number;
  minInventoryFloor: number;
  softMaxSharePct: number;
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
  softMaxSharePct: number;
  disruptionsThisWeek: DisruptionEvent[];
  facilities: FacilityWeekInfo[];
  charts: {
    cumulativeCostByWeek: { week: number; cost: number }[];
    backlogByWeek: { week: number; backlog: number }[];
    demandVsForecast: { week: number; demand: number; forecast: number }[];
    ordersByFacility: Record<string, number>[];
    openedFacilities: string[];
    currentWeekForecast: number;
  };
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

type OrderDraft = Record<string, Record<string, number | "">>;

export default function PlayPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [period, setPeriod] = useState<PeriodInfo | null>(null);
  const [orders, setOrders] = useState<OrderDraft>({});
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
    const initial: OrderDraft = {};
    for (const f of data.facilities) {
      initial[f.facilityId] = {};
      for (const s of f.suppliers) initial[f.facilityId][s.id] = "";
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
    if (value.trim() === "") {
      setOrders((prev) => ({ ...prev, [facilityId]: { ...prev[facilityId], [supplierId]: "" } }));
      return;
    }
    const qty = Math.max(0, Math.floor(Number(value) || 0));
    setOrders((prev) => ({ ...prev, [facilityId]: { ...prev[facilityId], [supplierId]: qty } }));
  }

  function qtyOf(facilityId: string, supplierId: string): number {
    const value = orders[facilityId]?.[supplierId];
    return typeof value === "number" ? value : 0;
  }

  async function handleSubmit() {
    if (!period) return;
    setSubmitting(true);
    setError(null);
    const orderList = period.facilities.flatMap((facility) =>
      facility.suppliers.map((supplier) => ({
        facilityId: facility.facilityId,
        supplierId: supplier.id,
        quantity: qtyOf(facility.facilityId, supplier.id),
      }))
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

  const hardIssues: string[] = [];
  const softWarnings: string[] = [];

  for (const facility of period.facilities) {
    const total = facility.suppliers.reduce((sum, supplier) => sum + qtyOf(facility.facilityId, supplier.id), 0);
    const projectedEnd =
      facility.onHandStart + facility.arrivingThisWeek + total - facility.forecast - facility.backlogStart;

    if (projectedEnd > facility.maxInventoryCeiling) {
      softWarnings.push(
        `${facility.facilityId}: projected ending inventory (~${Math.round(projectedEnd).toLocaleString()}) is above the ${facility.maxInventoryCeiling.toLocaleString()}-unit ceiling.`
      );
    }
    if (projectedEnd < facility.minInventoryFloor && total === 0) {
      softWarnings.push(
        `${facility.facilityId}: projected inventory may fall below the ${facility.minInventoryFloor.toLocaleString()}-unit floor.`
      );
    }

    for (const supplier of facility.suppliers) {
      const quantity = qtyOf(facility.facilityId, supplier.id);
      if (quantity > supplier.capacityThisWeek) {
        hardIssues.push(`${facility.facilityId}: ${supplier.name} exceeds available capacity.`);
      }
      if (total > 0) {
        const share = (quantity / total) * 100;
        if (share > period.softMaxSharePct + 1e-9) {
          softWarnings.push(
            `${facility.facilityId}: ${supplier.name} is ${share.toFixed(0)}% of this order (soft max ${period.softMaxSharePct}%).`
          );
        }
      }
    }
  }

  const facilityColors = ["#1e3a5f", "#b45309", "#0f766e", "#7c2d12", "#334155"];

  return (
    <>
      <AppHeader activeStep="play" weekProgress={{ current: period.week, total: period.horizonWeeks }} />
      <PageShell>
        <PageHeader title="Place Your Orders" subtitle={`Period ${period.week} of ${period.horizonWeeks}`} />

        {feedback && (
          <Card className="mb-6 overflow-hidden border-amber-300 bg-[var(--amber-bg)]">
            <div className="border-b border-amber-200 px-5 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-800">Actual demand revealed</div>
              <div className="mt-1 text-lg font-semibold text-amber-950">
                Period {feedback.week} demand:{" "}
                {feedback.results.reduce((sum, r) => sum + r.actualDemand, 0).toLocaleString()} units
              </div>
            </div>
            <div className="grid gap-0 sm:grid-cols-3">
              {feedback.results.map((result) => {
                const forecast = period.facilities.find((f) => f.facilityId === result.facilityId)?.forecast ?? 0;
                const delta = result.actualDemand - forecast;
                return (
                  <div key={result.facilityId} className="border-t border-amber-200 px-5 py-3 sm:border-t-0 sm:border-l first:border-l-0">
                    <div className="text-xs font-semibold text-amber-900">Facility {result.facilityId}</div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums text-amber-950">
                      {result.actualDemand.toLocaleString()}
                    </div>
                    <div className="mt-0.5 text-[11px] text-amber-800">
                      Forecast {forecast.toLocaleString()} ({delta >= 0 ? "+" : ""}
                      {delta.toLocaleString()})
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <Card className="mb-6 overflow-hidden">
          <div className="grid grid-cols-2 border-b border-[var(--card-border)] sm:grid-cols-4">
            <Kpi label="Cumulative Cost" value={`$${period.performance.cumulativeCost.toLocaleString()}`} />
            <Kpi label="Fill Rate" value={`${period.performance.fillRatePct.toFixed(1)}%`} />
            <Kpi label="Current Backlog" value={period.performance.currentBacklog.toLocaleString()} />
            <Kpi label="Ending Inventory" value={period.performance.endingInventory.toLocaleString()} />
          </div>

          <div className="grid gap-4 p-4 lg:grid-cols-3">
            <ChartPanel title="Backlog by week">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={
                    period.charts.backlogByWeek.length > 0
                      ? period.charts.backlogByWeek
                      : [{ week: period.week, backlog: period.facilities.reduce((s, f) => s + f.backlogStart, 0) }]
                  }
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf0f4" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} width={32} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, borderColor: "#e5e8ee", fontSize: 12 }} />
                  <Area type="monotone" dataKey="backlog" stroke="#b45309" fill="#fef6e7" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel title="Orders by facility">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={
                    period.charts.ordersByFacility.length > 0
                      ? period.charts.ordersByFacility
                      : [
                          {
                            week: period.week,
                            ...Object.fromEntries(period.facilities.map((f) => [f.facilityId, 0])),
                          },
                        ]
                  }
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf0f4" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} width={32} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, borderColor: "#e5e8ee", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {period.charts.openedFacilities.map((facilityId, index) => (
                    <Bar
                      key={facilityId}
                      dataKey={facilityId}
                      stackId="orders"
                      fill={facilityColors[index % facilityColors.length]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel title="Demand vs forecast">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={
                    (period.charts.demandVsForecast.length > 0
                      ? period.charts.demandVsForecast
                      : [{ week: period.week, forecast: period.charts.currentWeekForecast }]) as {
                      week: number;
                      forecast: number;
                      demand?: number;
                    }[]
                  }
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf0f4" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} width={36} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, borderColor: "#e5e8ee", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="forecast" stroke="#1e3a5f" strokeWidth={2} dot={{ r: 2.5 }} />
                  <Line type="monotone" dataKey="demand" stroke="#b45309" strokeWidth={2} dot={{ r: 2.5 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartPanel>
          </div>
        </Card>

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
          {period.facilities.map((f) => {
            const totalOrder = f.suppliers.reduce((sum, s) => sum + qtyOf(f.facilityId, s.id), 0);
            const projectedEnd = f.onHandStart + f.arrivingThisWeek + totalOrder - f.forecast - f.backlogStart;
            return (
              <Card key={f.facilityId} className="p-5">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--navy)] text-[11px] font-bold text-white">
                    {f.facilityId}
                  </span>
                  <h2 className="text-sm font-semibold text-[var(--navy)]">Facility {f.facilityId}</h2>
                  <span className="text-[11px] text-[var(--slate)]">
                    Inventory guide: floor {f.minInventoryFloor.toLocaleString()} · ceiling{" "}
                    {f.maxInventoryCeiling.toLocaleString()}
                  </span>
                </div>

                <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <MetricCard label="On-Hand Inventory" value={f.onHandStart.toLocaleString()} />
                  <MetricCard label="Backlog" value={f.backlogStart.toLocaleString()} accent={f.backlogStart > 0} />
                  <MetricCard label="Facility Forecast" value={f.forecast.toLocaleString()} />
                  <MetricCard label="Arriving This Week" value={f.arrivingThisWeek.toLocaleString()} />
                  <MetricCard
                    label="Projected End Inv."
                    value={Math.round(projectedEnd).toLocaleString()}
                    accent={projectedEnd > f.maxInventoryCeiling || projectedEnd < f.minInventoryFloor}
                  />
                </div>

                {f.customerForecasts.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {f.customerForecasts.map((customer) => (
                      <span
                        key={customer.customerId}
                        className="rounded border border-[var(--card-border)] bg-slate-50 px-2.5 py-1 text-[11px] text-[var(--slate)]"
                      >
                        <span className="font-semibold text-[var(--navy)]">{customer.customerId}</span>{" "}
                        {customer.customerName}: {customer.forecast.toLocaleString()}
                      </span>
                    ))}
                  </div>
                )}

                <SupplierOrderPanel
                  suppliers={f.suppliers}
                  quantities={orders[f.facilityId] ?? {}}
                  softMaxSharePct={period.softMaxSharePct}
                  onChange={(supplierId, value) => setOrder(f.facilityId, supplierId, value)}
                />
              </Card>
            );
          })}
        </div>

        {feedback ? (
          <PeriodOutcome
            feedback={feedback}
            forecasts={Object.fromEntries(period.facilities.map((facility) => [facility.facilityId, facility.forecast]))}
            onContinue={handleContinue}
          />
        ) : (
          <div className="mt-6 flex flex-col items-end gap-3">
            {hardIssues.length > 0 && (
              <div className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                <div className="font-semibold">Fix capacity issues before submitting</div>
                <ul className="mt-1 list-disc pl-4">
                  {hardIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
            {softWarnings.length > 0 && (
              <div className="w-full rounded-lg border border-amber-200 bg-[var(--amber-bg)] px-4 py-3 text-xs text-amber-900">
                <div className="font-semibold">Soft guidance (submission still allowed)</div>
                <ul className="mt-1 list-disc pl-4">
                  {softWarnings.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
            <PrimaryButton onClick={handleSubmit} disabled={submitting || hardIssues.length > 0}>
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

function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--slate)]">{title}</div>
      <div className="h-40">{children}</div>
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
        <div className="mt-1 text-lg font-semibold">Review results, then continue</div>
      </div>

      <div className="grid grid-cols-2 border-b border-[var(--card-border)] sm:grid-cols-4">
        <OutcomeMetric label="Forecast" value={totalForecast.toLocaleString()} />
        <OutcomeMetric
          label="Actual Demand"
          value={totalActual.toLocaleString()}
          detail={`${totalActual >= totalForecast ? "+" : ""}${(((totalActual - totalForecast) / Math.max(1, totalForecast)) * 100).toFixed(1)}% vs forecast`}
          emphasize
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
                  <td className="bg-[var(--amber-bg)] px-3 py-2.5 font-semibold tabular-nums text-amber-950">
                    {result.actualDemand.toLocaleString()}
                  </td>
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

function OutcomeMetric({
  label,
  value,
  detail,
  emphasize,
}: {
  label: string;
  value: string;
  detail?: string;
  emphasize?: boolean;
}) {
  return (
    <div className={`border-r border-[var(--card-border)] px-4 py-3 last:border-r-0 ${emphasize ? "bg-[var(--amber-bg)]" : ""}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--slate-light)]">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${emphasize ? "text-amber-950" : "text-[var(--navy)]"}`}>
        {value}
      </div>
      {detail && <div className="mt-0.5 text-[10px] text-[var(--slate)]">{detail}</div>}
    </div>
  );
}
