"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { PageShell, PageHeader, Card, MetricCard, NeutralAlert, Spinner } from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";

interface PeriodStateRow {
  week: number;
  facility_id: string;
  on_hand_end: string;
  backlog: string;
  procurement_cost: string;
  holding_cost: string;
  backorder_cost: string;
}
interface DecisionRow {
  week: number;
  facility_id: string;
  supplier_id: string;
  order_quantity: number;
}
interface ResultsResponse {
  session: { participant_name: string; opened_facilities: string[]; forecasting_method_id: string };
  periodState: PeriodStateRow[];
  decisions: DecisionRow[];
  totals: {
    totalProcurementCost: number;
    totalHoldingCost: number;
    totalBackorderCost: number;
    totalCost: number;
    totalBackorderedUnits: number;
  };
  community: {
    completedPlayers: number;
    averageCost: number | null;
  };
  solverBenchmark: {
    status: "illustrative_placeholder";
    notice: string;
    cumulativeCostByWeek: { week: number; cost: number }[];
    sensitivityInsights: {
      lever: string;
      method: string;
      value: string;
      impact: string;
    }[];
  };
}

export default function ResultsPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<ResultsResponse | null>(null);

  useEffect(() => {
    fetch(`/api/sessions/${params.id}/results`)
      .then((r) => r.json())
      .then(setData);
  }, [params.id]);

  if (!data) {
    return (
      <>
        <AppHeader activeStep="results" />
        <PageShell>
          <Spinner />
        </PageShell>
      </>
    );
  }

  const weeks = Array.from(new Set(data.periodState.map((r) => r.week))).sort((a, b) => a - b);
  const costByWeek = weeks.map((w) => {
    const rows = data.periodState.filter((r) => r.week === w);
    const cost = rows.reduce(
      (s, r) => s + Number(r.procurement_cost) + Number(r.holding_cost) + Number(r.backorder_cost),
      0
    );
    return { week: `Wk ${w}`, cost: Math.round(cost) };
  });
  const cumulativeComparison = costByWeek.map((row, index) => {
    const cumulativePlayerCost = costByWeek
      .slice(0, index + 1)
      .reduce((sum, period) => sum + period.cost, 0);
    return {
      week: row.week,
      player: cumulativePlayerCost,
      solver: data.solverBenchmark.cumulativeCostByWeek[index]?.cost ?? 0,
    };
  });

  const inventoryByWeek = weeks.map((w) => {
    const rows = data.periodState.filter((r) => r.week === w);
    return {
      week: `Wk ${w}`,
      onHand: rows.reduce((s, r) => s + Number(r.on_hand_end), 0),
      backlog: rows.reduce((s, r) => s + Number(r.backlog), 0),
    };
  });

  const supplierIds = Array.from(new Set(data.decisions.map((d) => d.supplier_id)));
  const orderPatternByWeek = weeks.map((w) => {
    const entry: Record<string, number | string> = { week: `Wk ${w}` };
    for (const s of supplierIds) {
      entry[s] = data.decisions
        .filter((d) => d.week === w && d.supplier_id === s)
        .reduce((sum, d) => sum + Number(d.order_quantity), 0);
    }
    return entry;
  });
  const supplierColors: Record<string, string> = {
    domestic_fab: "#1f3a5f",
    regional_partner: "#64748b",
    overseas_manufacturer: "#d97706",
  };

  const chartAxisStyle = { fontSize: 12, fill: "#64748b" };
  const tooltipStyle = { borderRadius: 8, borderColor: "#e5e8ee", fontSize: 13 };

  return (
    <>
      <AppHeader activeStep="results" />
      <PageShell>
        <PageHeader
          title="Simulation Complete"
          subtitle={`${data.session.participant_name ?? "Participant"} · Results Summary`}
        />

        <NeutralAlert>
          <strong>Illustrative solver benchmark:</strong> {data.solverBenchmark.notice}
        </NeutralAlert>

        <div className="mt-6 mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MetricCard label="Total Cost" value={`$${Math.round(data.totals.totalCost).toLocaleString()}`} accent />
          <MetricCard label="Procurement Cost" value={`$${Math.round(data.totals.totalProcurementCost).toLocaleString()}`} />
          <MetricCard label="Holding Cost" value={`$${Math.round(data.totals.totalHoldingCost).toLocaleString()}`} />
          <MetricCard label="Backorder Cost" value={`$${Math.round(data.totals.totalBackorderCost).toLocaleString()}`} />
        </div>

        <Card className="mb-8 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--slate-light)]">
              Community benchmark
            </div>
            <div className="mt-1 text-sm text-[var(--slate)]">
              Based on {data.community.completedPlayers.toLocaleString()} completed simulation
              {data.community.completedPlayers === 1 ? "" : "s"}.
            </div>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-xs text-[var(--slate)]">Average player cost</span>
            <span className="text-2xl font-semibold tabular-nums text-[var(--navy)]">
              {data.community.averageCost === null
                ? "—"
                : `$${Math.round(data.community.averageCost).toLocaleString()}`}
            </span>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card className="p-5 lg:col-span-2">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[var(--navy)]">Cumulative Cost: You vs. Solver</h2>
                <p className="mt-1 text-xs text-[var(--slate)]">
                  The solver line is illustrative until the validated Oracle is integrated.
                </p>
              </div>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                Placeholder solver data
              </span>
            </div>
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <LineChart data={cumulativeComparison} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e8ee" vertical={false} />
                  <XAxis dataKey="week" tick={chartAxisStyle} axisLine={{ stroke: "#e5e8ee" }} tickLine={false} />
                  <YAxis tick={chartAxisStyle} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="player" name="Your cumulative cost" stroke="#1e3a5f" strokeWidth={2.5} dot={{ r: 3.5, fill: "#1e3a5f" }} />
                  <Line type="monotone" dataKey="solver" name="Illustrative solver" stroke="#b45309" strokeDasharray="6 4" strokeWidth={2.5} dot={{ r: 3.5, fill: "#b45309" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-[var(--navy)]">On-Hand Inventory &amp; Backlog</h2>
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <LineChart data={inventoryByWeek} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e8ee" vertical={false} />
                  <XAxis dataKey="week" tick={chartAxisStyle} axisLine={{ stroke: "#e5e8ee" }} tickLine={false} />
                  <YAxis tick={chartAxisStyle} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="onHand" name="On-Hand" stroke="#1e3a5f" strokeWidth={2.5} dot={{ r: 3.5 }} />
                  <Line type="monotone" dataKey="backlog" name="Backlog" stroke="#b45309" strokeWidth={2.5} dot={{ r: 3.5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5 lg:col-span-2">
            <h2 className="mb-4 text-sm font-semibold text-[var(--navy)]">Order Quantity by Supplier, Per Week</h2>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={orderPatternByWeek} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e8ee" vertical={false} />
                  <XAxis dataKey="week" tick={chartAxisStyle} axisLine={{ stroke: "#e5e8ee" }} tickLine={false} />
                  <YAxis tick={chartAxisStyle} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {supplierIds.map((s) => (
                    <Bar key={s} dataKey={s} name={s} fill={supplierColors[s] ?? "#94a3b8"} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="overflow-hidden lg:col-span-2">
            <div className="border-b border-[var(--card-border)] px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--navy)]">Solver Sensitivity &amp; Dual Insights</h2>
                  <p className="mt-1 text-xs text-[var(--slate)]">
                    Illustrative examples of how the final Oracle will explain which constraints and business levers matter.
                  </p>
                </div>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  Placeholder values
                </span>
              </div>
            </div>
            <div className="thin-scrollbar overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--slate)]">
                    <th className="px-5 py-3">Business lever</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Marginal value</th>
                    <th className="px-5 py-3">Decision impact</th>
                  </tr>
                </thead>
                <tbody>
                  {data.solverBenchmark.sensitivityInsights.map((insight) => (
                    <tr key={insight.lever} className="border-t border-[var(--card-border)] align-top">
                      <td className="whitespace-nowrap px-5 py-3 font-medium text-[var(--navy)]">{insight.lever}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--slate)]">{insight.method}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-[var(--foreground)]">{insight.value}</td>
                      <td className="min-w-80 px-5 py-3 text-xs leading-relaxed text-[var(--slate)]">{insight.impact}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </PageShell>
    </>
  );
}
