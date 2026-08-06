"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
import { PageShell, PageHeader, StepIndicator, Card, PrimaryButton } from "@/components/ui";

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
      <PageShell>
        <p className="text-sm text-[var(--slate)]">Loading...</p>
      </PageShell>
    );
  }

  const totalDemandByWeek = Array.from({ length: 8 }, (_, i) =>
    scenario.customers.reduce((sum, c) => sum + c.historical_demand_last_8_weeks[i], 0)
  );
  const chartData = totalDemandByWeek.map((v, i) => ({ week: `-${8 - i}`, demand: v }));

  return (
    <PageShell>
      <StepIndicator current={2} total={2} label="Forecasting Method" />
      <PageHeader
        title="Choose Your Forecasting Method"
        subtitle="This will be used to project demand each week. Once selected, it is locked for the rest of the simulation."
      />

      <Card className="p-4 mb-6">
        <h2 className="text-sm font-semibold text-[var(--navy)] mb-3">
          Historical Demand (Last 8 Weeks, All Customers Combined)
        </h2>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e5ea" />
              <XAxis dataKey="week" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="demand" stroke="#1f3a5f" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-[var(--navy)] mb-3">Select a Method</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {scenario.forecasting_methods_menu.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedMethod(m.id)}
              className={`text-left rounded-md border px-4 py-3 transition-colors ${
                selectedMethod === m.id
                  ? "border-[var(--navy)] bg-blue-50"
                  : "border-[var(--card-border)] hover:bg-gray-50"
              }`}
            >
              <div className="text-sm font-medium text-[var(--navy)]">{m.name}</div>
              <div className="mt-1 text-xs text-[var(--slate)]">{m.description}</div>
            </button>
          ))}
        </div>
        <p className="mt-4 text-xs text-[var(--slate)]">
          Note: this method cannot be changed once the simulation begins.
        </p>
      </Card>

      <div className="mt-6 flex justify-end">
        <PrimaryButton onClick={handleBegin} disabled={!selectedMethod || submitting}>
          {submitting ? "Starting..." : "Begin Simulation"}
        </PrimaryButton>
      </div>
    </PageShell>
  );
}
