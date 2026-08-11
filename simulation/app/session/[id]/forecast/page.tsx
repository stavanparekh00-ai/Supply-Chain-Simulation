"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageShell, PageHeader, StepIndicator, Card, PrimaryButton, Spinner } from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import { useSessionGate } from "@/hooks/useSessionGate";

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

export default function ForecastSetupPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const gate = useSessionGate(params.id, "forecast");
  const [scenario, setScenario] = useState<ScenarioPublic | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("all");
  const [submitting, setSubmitting] = useState(false);

  const locked = Boolean(gate.session?.forecasting_method_id);

  useEffect(() => {
    fetch("/api/scenario")
      .then((r) => r.json())
      .then((data: ScenarioPublic) => {
        setScenario(data);
      });
  }, []);

  useEffect(() => {
    if (gate.session?.forecasting_method_id) {
      setSelectedMethod(gate.session.forecasting_method_id);
    }
  }, [gate.session]);
  const chartData = useMemo(() => {
    if (!scenario) return [];
    return Array.from({ length: 8 }, (_, i) => {
      if (selectedCustomerId === "all") {
        return {
          week: `W-${8 - i}`,
          demand: scenario.customers.reduce((sum, c) => sum + c.historical_demand_last_8_weeks[i], 0),
        };
      }
      const customer = scenario.customers.find((c) => c.id === selectedCustomerId);
      return {
        week: `W-${8 - i}`,
        demand: customer?.historical_demand_last_8_weeks[i] ?? 0,
      };
    });
  }, [scenario, selectedCustomerId]);

  async function handleBegin() {
    if (!selectedMethod) return;
    if (locked) {
      router.replace(`/session/${params.id}/play`);
      return;
    }
    setSubmitting(true);
    const res = await fetch(`/api/sessions/${params.id}/forecast-method`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ methodId: selectedMethod }),
    });
    if (!res.ok) {
      setSubmitting(false);
      return;
    }
    router.replace(`/session/${params.id}/play`);
  }

  if (!gate.ready || !scenario) {
    return (
      <>
        <AppHeader activeStep="forecast" sessionId={params.id} unlockedSteps={gate.unlocked} />
        <PageShell>
          <Spinner />
        </PageShell>
      </>
    );
  }
  const activeCustomer =
    selectedCustomerId === "all" ? null : scenario.customers.find((c) => c.id === selectedCustomerId);

  return (
    <>
      <AppHeader activeStep="forecast" sessionId={params.id} unlockedSteps={gate.unlocked} />
      <PageShell>
        <StepIndicator current={2} total={2} label="Forecasting Method" />
        <PageHeader
          title="Choose Your Forecasting Method"
          subtitle={
            locked
              ? "Your forecasting method is locked for this run. Use the stage tabs above to move between stages you have already reached."
              : "During play, each customer is forecasted independently and then summed at its assigned facility. Review the last 8 weeks of history below, then lock in a method."
          }
        />

        <Card className="mb-6 overflow-hidden">
          <div className="border-b border-[var(--card-border)] px-5 py-4">
            <h2 className="text-sm font-semibold text-[var(--navy)]">Historical demand (last 8 weeks)</h2>
            <p className="mt-1 text-xs text-[var(--slate)]">
              View network total, or pick one customer at a time.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <HistoryTab
                active={selectedCustomerId === "all"}
                label="All customers"
                onClick={() => setSelectedCustomerId("all")}
              />
              {scenario.customers.map((customer) => (
                <HistoryTab
                  key={customer.id}
                  active={selectedCustomerId === customer.id}
                  label={customer.id}
                  onClick={() => setSelectedCustomerId(customer.id)}
                />
              ))}
            </div>
          </div>

          <div className="px-5 pt-4 pb-2">
            <div className="mb-2 text-xs text-[var(--slate)]">
              {activeCustomer
                ? `${activeCustomer.id} · ${activeCustomer.name} (baseline ${activeCustomer.weekly_demand.toLocaleString()}/wk)`
                : "Combined demand across all six customers"}
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf0f4" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "#64748b" }} width={44} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(value) => [Number(value).toLocaleString(), "Demand"]}
                    contentStyle={{ borderRadius: 8, borderColor: "#e5e8ee", fontSize: 13 }}
                  />
                  <Bar dataKey="demand" fill="#1e3a5f" radius={[4, 4, 0, 0]} maxBarSize={42} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-[var(--navy)]">Select a Method</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {scenario.forecasting_methods_menu.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={locked}
                onClick={() => {
                  if (!locked) setSelectedMethod(m.id);
                }}
                className={`rounded-lg border px-4 py-3.5 text-left transition-all disabled:cursor-default ${
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
            {locked
              ? "Use the stage tabs to return to Weekly Decisions or Network Design."
              : "This method cannot be changed once the simulation begins."}
          </p>
        </Card>

        <div className="mt-6 flex justify-end">
          <PrimaryButton onClick={handleBegin} disabled={!selectedMethod || submitting}>
            {locked ? "Back to Weekly Decisions" : submitting ? "Starting..." : "Begin Simulation"}
          </PrimaryButton>
        </div>
      </PageShell>
    </>
  );
}

function HistoryTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-[var(--navy)] bg-[var(--navy)] text-white"
          : "border-[var(--card-border)] bg-white text-[var(--slate)] hover:border-[var(--slate-light)]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
