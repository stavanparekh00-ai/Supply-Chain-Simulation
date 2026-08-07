"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
import { PageShell, PageHeader, StepIndicator, Card, PrimaryButton, Spinner } from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";

interface Customer {
  id: string;
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

  const totalDemandByWeek = Array.from({ length: 8 }, (_, i) =>
    scenario.customers.reduce((sum, c) => sum + c.historical_demand_last_8_weeks[i], 0)
  );
  const chartData = totalDemandByWeek.map((v, i) => ({ week: `-${8 - i}`, demand: v }));

  return (
    <>
      <AppHeader activeStep="forecast" />
      <PageShell>
        <StepIndicator current={2} total={2} label="Forecasting Method" />
        <PageHeader
          title="Choose Your Forecasting Method"
          subtitle="This will be used to project demand each week. Once selected, it is locked for the rest of the simulation."
        />

        <Card className="mb-6 p-5">
          <h2 className="mb-4 text-sm font-semibold text-[var(--navy)]">
            Historical Demand (Last 8 Weeks, All Customers Combined)
          </h2>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="demandFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1e3a5f" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#1e3a5f" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e8ee" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e5e8ee" }} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, borderColor: "#e5e8ee", fontSize: 13 }} />
                <Line type="monotone" dataKey="demand" stroke="#1e3a5f" strokeWidth={2.5} dot={{ r: 3.5, fill: "#1e3a5f" }} />
              </LineChart>
            </ResponsiveContainer>
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
