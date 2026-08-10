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
  ComposedChart,
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

const FACILITY_COLORS = ["#1e3a5f", "#0f766e", "#b45309", "#475569"];
const tooltipStyle = { borderRadius: 8, borderColor: "#e5e8ee", fontSize: 12, boxShadow: "0 4px 12px rgba(15,23,42,0.08)" };

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
  for (const facility of period.facilities) {
    for (const supplier of facility.suppliers) {
      const quantity = qtyOf(facility.facilityId, supplier.id);
      if (quantity > supplier.capacityThisWeek) {
        hardIssues.push(`${facility.facilityId}: ${supplier.name} exceeds available capacity.`);
      }
    }
  }

  const backlogData =
    period.charts.backlogByWeek.length > 0
      ? period.charts.backlogByWeek
      : [{ week: period.week, backlog: period.facilities.reduce((s, f) => s + f.backlogStart, 0) }];

  const ordersData =
    period.charts.ordersByFacility.length > 0
      ? period.charts.ordersByFacility
      : [
          {
            week: period.week,
            ...Object.fromEntries(period.facilities.map((f) => [f.facilityId, 0])),
          },
        ];

  const demandData =
    period.charts.demandVsForecast.length > 0
      ? period.charts.demandVsForecast
      : [{ week: period.week, forecast: period.charts.currentWeekForecast }];

  return (
    <>
      <AppHeader activeStep="play" weekProgress={{ current: period.week, total: period.horizonWeeks }} />
      <PageShell>
        <PageHeader title="Place Your Orders" subtitle={`Period ${period.week} of ${period.horizonWeeks}`} />

        {!feedback && (
          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            <ChartCard title="Backlog" subtitle="Open backorders after each week">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={backlogData} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="backlogFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#b45309" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#b45309" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf0f4" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} width={36} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="backlog" stroke="#b45309" fill="url(#backlogFill)" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Orders by facility" subtitle="Units ordered each week">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ordersData} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf0f4" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} width={36} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                  {period.charts.openedFacilities.map((facilityId, index) => (
                    <Bar
                      key={facilityId}
                      dataKey={facilityId}
                      stackId="orders"
                      fill={FACILITY_COLORS[index % FACILITY_COLORS.length]}
                      radius={index === period.charts.openedFacilities.length - 1 ? [3, 3, 0, 0] : undefined}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Demand vs forecast" subtitle="Revealed after each submit">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={demandData} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf0f4" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} width={40} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                  <Bar dataKey="demand" name="Actual" fill="#f2dcae" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Line type="monotone" dataKey="forecast" name="Forecast" stroke="#1e3a5f" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        )}

        {!feedback && (
          <Card className="mb-6 grid grid-cols-2 overflow-hidden sm:grid-cols-4">
            <Kpi label="Cumulative Cost" value={`$${period.performance.cumulativeCost.toLocaleString()}`} />
            <Kpi label="Fill Rate" value={`${period.performance.fillRatePct.toFixed(1)}%`} />
            <Kpi label="Current Backlog" value={period.performance.currentBacklog.toLocaleString()} />
            <Kpi label="Ending Inventory" value={period.performance.endingInventory.toLocaleString()} />
          </Card>
        )}

        {period.disruptionsThisWeek.length > 0 && !feedback && (
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

        {feedback ? (
          <PeriodOutcome
            feedback={feedback}
            forecasts={Object.fromEntries(period.facilities.map((facility) => [facility.facilityId, facility.forecast]))}
            onContinue={handleContinue}
          />
        ) : (
          <>
            <div className="space-y-6">
              {period.facilities.map((f) => (
                <Card key={f.facilityId} className="p-5">
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--navy)] text-[11px] font-bold text-white">
                      {f.facilityId}
                    </span>
                    <h2 className="text-sm font-semibold text-[var(--navy)]">Facility {f.facilityId}</h2>
                  </div>

                  <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <MetricCard label="On-Hand Inventory" value={f.onHandStart.toLocaleString()} />
                    <MetricCard label="Backlog" value={f.backlogStart.toLocaleString()} accent={f.backlogStart > 0} />
                    <MetricCard label="Facility Forecast" value={f.forecast.toLocaleString()} />
                    <MetricCard label="Arriving This Week" value={f.arrivingThisWeek.toLocaleString()} />
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
                    onChange={(supplierId, value) => setOrder(f.facilityId, supplierId, value)}
                  />
                </Card>
              ))}
            </div>

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
              <PrimaryButton onClick={handleSubmit} disabled={submitting || hardIssues.length > 0}>
                {submitting ? "Submitting..." : "Submit Orders & Reveal Actual Demand"}
              </PrimaryButton>
            </div>
          </>
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

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-[var(--card-border)] px-4 py-3">
        <div className="text-sm font-semibold text-[var(--navy)]">{title}</div>
        <div className="mt-0.5 text-[11px] text-[var(--slate)]">{subtitle}</div>
      </div>
      <div className="h-52 px-2 pb-2 pt-1">{children}</div>
    </Card>
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
  const deltaPct = ((totalActual - totalForecast) / Math.max(1, totalForecast)) * 100;

  return (
    <Card className="overflow-hidden">
      <div className="bg-[var(--amber-bg)] px-5 py-5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
          Period {feedback.week} · Actual demand revealed
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <div className="text-xs text-amber-800">Network actual demand</div>
            <div className="text-4xl font-semibold tabular-nums text-amber-950">{totalActual.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs text-amber-800">vs forecast {totalForecast.toLocaleString()}</div>
            <div className="text-xl font-semibold tabular-nums text-amber-900">
              {deltaPct >= 0 ? "+" : ""}
              {deltaPct.toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-xs text-amber-800">Fill rate</div>
            <div className="text-xl font-semibold tabular-nums text-amber-900">{fillRate.toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-xs text-amber-800">Period cost</div>
            <div className="text-xl font-semibold tabular-nums text-amber-900">${Math.round(totalCost).toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-0 border-b border-[var(--card-border)] sm:grid-cols-3">
        {feedback.results.map((result) => {
          const forecast = forecasts[result.facilityId] ?? 0;
          const delta = result.actualDemand - forecast;
          return (
            <div key={result.facilityId} className="border-t border-[var(--card-border)] px-5 py-4 sm:border-t-0 sm:border-l first:border-l-0">
              <div className="text-xs font-semibold text-[var(--navy)]">Facility {result.facilityId}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-amber-950">
                {result.actualDemand.toLocaleString()}
              </div>
              <div className="mt-1 text-[11px] text-[var(--slate)]">
                Forecast {forecast.toLocaleString()} ({delta >= 0 ? "+" : ""}
                {delta.toLocaleString()})
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <div className="text-[var(--slate-light)]">Served</div>
                  <div className="font-medium tabular-nums">{result.newServed.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[var(--slate-light)]">Ending inv.</div>
                  <div className="font-medium tabular-nums">{result.onHandEnd.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[var(--slate-light)]">Backlog</div>
                  <div className={`font-medium tabular-nums ${result.backlogEnd > 0 ? "text-red-600" : ""}`}>
                    {result.backlogEnd.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end px-5 py-4">
        <PrimaryButton onClick={onContinue}>
          {feedback.completed ? "View Final Results" : "Continue to Next Period"}
        </PrimaryButton>
      </div>
    </Card>
  );
}
