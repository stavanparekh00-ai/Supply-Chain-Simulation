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
import { PageShell, PageHeader, Card, MetricCard, NeutralAlert } from "@/components/ui";

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
  session: { opened_facilities: string[]; forecasting_method_id: string };
  periodState: PeriodStateRow[];
  decisions: DecisionRow[];
  totals: {
    totalProcurementCost: number;
    totalHoldingCost: number;
    totalBackorderCost: number;
    totalCost: number;
    totalBackorderedUnits: number;
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
      <PageShell>
        <p className="text-sm text-[var(--slate)]">Loading...</p>
      </PageShell>
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

  return (
    <PageShell>
      <PageHeader title="Simulation Complete: Results Summary" />

      <NeutralAlert>
        Oracle comparison is not yet available &mdash; the optimization solver is being built
        separately. This page currently shows your own results only.
      </NeutralAlert>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-6 mb-8">
        <MetricCard label="Total Cost" value={`$${Math.round(data.totals.totalCost).toLocaleString()}`} />
        <MetricCard label="Procurement Cost" value={`$${Math.round(data.totals.totalProcurementCost).toLocaleString()}`} />
        <MetricCard label="Holding Cost" value={`$${Math.round(data.totals.totalHoldingCost).toLocaleString()}`} />
        <MetricCard label="Backorder Cost" value={`$${Math.round(data.totals.totalBackorderCost).toLocaleString()}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-[var(--navy)] mb-3">Cost Per Period</h2>
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={costByWeek}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e5ea" />
                <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="cost" stroke="#1f3a5f" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold text-[var(--navy)] mb-3">On-Hand Inventory &amp; Backlog</h2>
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={inventoryByWeek}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e5ea" />
                <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="onHand" name="On-Hand" stroke="#1f3a5f" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="backlog" name="Backlog" stroke="#d97706" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-[var(--navy)] mb-3">Order Quantity by Supplier, Per Week</h2>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={orderPatternByWeek}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e5ea" />
                <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                {supplierIds.map((s) => (
                  <Bar key={s} dataKey={s} name={s} fill={supplierColors[s] ?? "#94a3b8"} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
