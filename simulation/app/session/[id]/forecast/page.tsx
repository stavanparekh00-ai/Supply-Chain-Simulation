"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { PageShell, PageHeader, StepIndicator, Card, PrimaryButton, Spinner } from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";

interface Customer {
  id: string;
  name: string;
  weekly_demand: number;
  historical_demand_last_8_weeks: number[];
}
interface ForecastingMethod {
  id: string;
  name: string;
  description: string;
}
interface ScenarioPublic {
  customers: Customer[];
  forecasting_methods_menu: ForecastingMethod[];
}

const CUSTOMER_COLORS = ["#1e3a5f", "#b45309", "#0f766e", "#7c2d12", "#475569", "#0369a1"];

export default function ForecastSetupPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [scenario, setScenario] = useState<ScenarioPublic | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/scenario")
      .then((r) => r.json())
      .then(setScenario);
  }, []);

  async function handleBegin() {
    if (!selectedMethod) return;
    setSubmitting(true);
    await fetch(`/api/sessions/${params.id}/forecast-method`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ methodId: selectedMethod }),
    });
    router.push(`/session/${params.id}/play`);
  }

  if (!scenario) {
    return (
      <>
        <AppHeader activeStep="forecast" />
        <PageShell>
          <Spinner />
        </PageShell>
      </>
    );
  }

  const chartData = Array.from({ length: 8 }, (_, i) => {
    const point: Record<string, number | string> = { week: `-${8 - i}` };
    for (const customer of scenario.customers) {
      point[customer.id] = customer.historical_demand_last_8_weeks[i];
    }
    point.total = scenario.customers.reduce((sum, c) => sum + c.historical_demand_last_8_weeks[i], 0);
    return point;
  });

  return (
    <>
      <AppHeader activeStep="forecast" />
      <PageShell>
        <StepIndicator current={2} total={2} label="Forecasting Method" />
        <PageHeader
          title="Choose Your Forecasting Method"
          subtitle="Forecasts are computed per customer, then aggregated to each facility. Once selected, the method is locked for the rest of the simulation."
        />

        <Card className="mb-6 p-5">
          <h2 className="mb-1 text-sm font-semibold text-[var(--navy)]">Historical Demand by Customer</h2>
          <p className="mb-4 text-xs text-[var(--slate)]">
            Last 8 weeks of frozen history. During play, each customer is forecasted independently and summed by assigned facility.
          </p>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e8ee" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e5e8ee" }} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, borderColor: "#e5e8ee", fontSize: 13 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {scenario.customers.map((customer, index) => (
                  <Line
                    key={customer.id}
                    type="monotone"
                    dataKey={customer.id}
                    name={`${customer.id} ${customer.name}`}
                    stroke={CUSTOMER_COLORS[index % CUSTOMER_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 2.5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 thin-scrollbar overflow-x-auto rounded-lg border border-[var(--card-border)]">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-[var(--slate)]">
                  <th className="px-3 py-2">Customer</th>
                  {Array.from({ length: 8 }, (_, i) => (
                    <th key={i} className="px-2 py-2 tabular-nums">
                      W-{8 - i}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scenario.customers.map((customer) => (
                  <tr key={customer.id} className="border-t border-[var(--card-border)]">
                    <td className="px-3 py-2 font-medium text-[var(--navy)]">
                      {customer.id} · {customer.name}
                    </td>
                    {customer.historical_demand_last_8_weeks.map((value, index) => (
                      <td key={index} className="px-2 py-2 tabular-nums text-[var(--slate)]">
                        {value.toLocaleString()}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-[var(--navy)]">Select a Method</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {scenario.forecasting_methods_menu.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMethod(m.id)}
                className={`rounded-lg border px-4 py-3.5 text-left transition-all ${
                  selectedMethod === m.id
                    ? "border-[var(--navy)] bg-[var(--navy)]/[0.04] shadow-sm"
                    : "border-[var(--card-border)] hover:border-[var(--slate-light)] hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--navy)]">
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full border text-[9px] ${
                      selectedMethod === m.id ? "border-[var(--navy)] bg-[var(--navy)] text-white" : "border-[var(--slate-light)]"
                    }`}
                  >
                    {selectedMethod === m.id ? "✓" : ""}
                  </span>
                  {m.name}
                </div>
                <div className="mt-1.5 pl-6 text-xs leading-relaxed text-[var(--slate)]">{m.description}</div>
              </button>
            ))}
          </div>
          <p className="mt-5 text-xs text-[var(--slate-light)]">
            Note: this method cannot be changed once the simulation begins.
          </p>
        </Card>

        <div className="mt-6 flex justify-end">
          <PrimaryButton onClick={handleBegin} disabled={!selectedMethod || submitting}>
            {submitting ? "Starting..." : "Begin Simulation"}
          </PrimaryButton>
        </div>
      </PageShell>
    </>
  );
}
