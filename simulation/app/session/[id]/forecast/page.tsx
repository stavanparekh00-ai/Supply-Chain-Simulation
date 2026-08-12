"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageShell, PageHeader, StepIndicator, Card, PrimaryButton, Spinner } from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import { useSessionGate } from "@/hooks/useSessionGate";
import {
  computeForecast,
  ForecastingMethodId,
} from "@/lib/forecasting";

interface Customer {
  id: string;
  name: string;
  weekly_demand: number;
  historical_demand_last_20_weeks: number[];
}
interface ForecastingMethod {
  id: ForecastingMethodId;
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
  const [selectedMethod, setSelectedMethod] =
    useState<ForecastingMethodId | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("all");
  const [submitting, setSubmitting] = useState(false);

  const lockedMethod = gate.session?.forecasting_method_id as
    | ForecastingMethodId
    | undefined;
  const locked = Boolean(lockedMethod);
  const activeMethod = lockedMethod ?? selectedMethod;

  useEffect(() => {
    fetch("/api/scenario")
      .then((r) => r.json())
      .then((data: ScenarioPublic) => {
        setScenario(data);
      });
  }, []);

  const chartData = useMemo(() => {
    if (!scenario) return [];
    const customers =
      selectedCustomerId === "all"
        ? scenario.customers
        : scenario.customers.filter(
            (customer) => customer.id === selectedCustomerId
          );
    const historyLength =
      customers[0]?.historical_demand_last_20_weeks.length ?? 0;

    const historicalRows = Array.from({ length: historyLength }, (_, index) => {
      const demand = customers.reduce(
        (sum, customer) =>
          sum + customer.historical_demand_last_20_weeks[index],
        0
      );
      const forecast =
        activeMethod && index > 0
          ? customers.reduce(
              (sum, customer) =>
                sum +
                computeForecast(
                  activeMethod,
                  customer.historical_demand_last_20_weeks.slice(0, index)
                ),
              0
            )
          : null;
      return {
        week: `W-${historyLength - index}`,
        demand,
        forecast,
      };
    });

    const nextForecast = activeMethod
      ? customers.reduce(
          (sum, customer) =>
            sum +
            computeForecast(
              activeMethod,
              customer.historical_demand_last_20_weeks
            ),
          0
        )
      : null;

    return [
      ...historicalRows,
      { week: "Next", demand: null, forecast: nextForecast },
    ];
  }, [scenario, selectedCustomerId, activeMethod]);

  async function handleBegin() {
    if (!activeMethod) return;
    if (locked) {
      router.replace(`/session/${params.id}/play`);
      return;
    }
    setSubmitting(true);
    const res = await fetch(`/api/sessions/${params.id}/forecast-method`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ methodId: activeMethod }),
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
  const activeMethodDetails = scenario.forecasting_methods_menu.find(
    (method) => method.id === activeMethod
  );
  const nextForecast = chartData.at(-1)?.forecast;

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
              : "During play, each customer is forecasted independently and then summed at its assigned facility. Review the last 20 weeks of history below, then lock in a method."
          }
        />

        <Card className="mb-6 overflow-hidden">
          <div className="border-b border-[var(--card-border)] px-5 py-4">
            <h2 className="text-sm font-semibold text-[var(--navy)]">
              Historical demand &amp; forecast preview
            </h2>
            <p className="mt-1 text-xs text-[var(--slate)]">
              View the network total or one customer. Select a method below
              to plot its rolling forecast.
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

          <div className="px-5 pb-2 pt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--slate)]">
              <span>
                {activeCustomer
                  ? `${activeCustomer.id} · ${activeCustomer.name} (baseline ${activeCustomer.weekly_demand.toLocaleString()}/wk)`
                  : "Combined demand across all six customers"}
              </span>
              {activeMethodDetails && nextForecast !== null && (
                <span className="rounded-full bg-[var(--navy)]/8 px-2.5 py-1 font-semibold text-[var(--navy)]">
                  {activeMethodDetails.name}: next forecast{" "}
                  {Number(nextForecast).toLocaleString()}
                </span>
              )}
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf0f4" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "#64748b" }} width={44} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(value, name) => [
                      Number(value).toLocaleString(),
                      name,
                    ]}
                    contentStyle={{ borderRadius: 8, borderColor: "#e5e8ee", fontSize: 13 }}
                  />
                  <Legend
                    iconType="circle"
                    wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="demand"
                    name="Historical demand"
                    stroke="#1e3a5f"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    connectNulls={false}
                  />
                  {activeMethod && (
                    <Line
                      type="monotone"
                      dataKey="forecast"
                      name="Forecast"
                      stroke="#b45309"
                      strokeWidth={2.5}
                      strokeDasharray="6 4"
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  )}
                </LineChart>
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
                  activeMethod === m.id
                    ? "border-[var(--navy)] bg-[var(--navy)]/[0.04] shadow-sm"
                    : "border-[var(--card-border)] hover:border-[var(--slate-light)] hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--navy)]">
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full border text-[9px] ${
                      activeMethod === m.id ? "border-[var(--navy)] bg-[var(--navy)] text-white" : "border-[var(--slate-light)]"
                    }`}
                  >
                    {activeMethod === m.id ? "✓" : ""}
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
          <PrimaryButton onClick={handleBegin} disabled={!activeMethod || submitting}>
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
