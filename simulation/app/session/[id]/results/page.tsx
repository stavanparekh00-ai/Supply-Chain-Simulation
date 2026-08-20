"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Badge,
  Card,
  DataTable,
  MetricCard,
  PageHeader,
  PageShell,
  SecondaryButton,
  Spinner,
} from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import { useSessionGate } from "@/hooks/useSessionGate";
import { clearActiveSessionId } from "@/lib/activeSession";

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

interface ComparisonWeek {
  week: number;
  cumulativeCost: number | null;
  onHand: number | null;
  backlog: number | null;
  fillRatePct: number | null;
}

interface ResultsResponse {
  session: {
    participant_name: string;
    opened_facilities: string[];
    forecasting_method_id: string;
  };
  periodState: PeriodStateRow[];
  decisions: DecisionRow[];
  totals: {
    totalFixedCost: number;
    totalTransportCost: number;
    totalProcurementCost: number;
    totalHoldingCost: number;
    totalBackorderCost: number;
    totalCost: number;
    totalBackorderedUnits: number;
  };
  fillRate: {
    cumulativeShipped: number;
    cumulativeDemand: number;
    cumulativeFillRatePct: number | null;
    weekly: {
      week: number;
      shipped: number;
      demand: number;
      due: number;
      fillRatePct: number;
    }[];
    weeklyVariance: number | null;
    weeklyStdDev: number | null;
  };
  community: {
    completedPlayers: number;
    averageCost: number | null;
    averageBreakdown: {
      networkCost: number | null;
      procurementCost: number | null;
      holdingCost: number | null;
      backorderCost: number | null;
    };
    byWeek: ComparisonWeek[];
    costPercentile: {
      rank: number;
      totalPlayers: number;
      betterThanPercent: number;
    } | null;
  };
  forecastAccuracy: {
    methodId: string;
    methodName: string;
    observations: number;
    mae: number;
    mse: number;
    rmse: number;
    mapePct: number | null;
    bias: number;
    byWeek: {
      week: number;
      forecast: number;
      actual: number;
      absError: number;
    }[];
    peers: {
      completedWithSameMethod: number;
      averageMae: number | null;
      averageMse: number | null;
      averageRmse: number | null;
    };
    milp: {
      methodId: string;
      methodName: string;
      mae: number;
      mse: number;
      rmse: number;
      byWeek: {
        week: number;
        forecast: number;
        actual: number;
        absError: number;
      }[];
    };
  };
  solverBenchmark: {
    status: "verified_precomputed";
    notice: string;
    openedFacilities: string[];
    totals: {
      fixedCost: number;
      transportCost: number;
      procurementCost: number;
      holdingCost: number;
      backorderCost: number;
      totalCost: number;
    };
    byWeek: {
      week: number;
      procurementCost: number;
      holdingCost: number;
      backorderCost: number;
      totalCost: number;
      cumulativeCost: number;
      onHand: number;
      backlog: number;
      shipped: number;
      demand: number;
      fillRatePct: number;
    }[];
  };
}

const PLAYER_COLOR = "#1e3a5f";
const MILP_COLOR = "#b45309";
const COMMUNITY_COLOR = "#0f766e";
const ACTUAL_COLOR = "#64748b";
const GRID_COLOR = "#e5e8ee";
const chartAxisStyle = { fontSize: 11, fill: "#64748b" };
const tooltipStyle = {
  borderRadius: 10,
  borderColor: GRID_COLOR,
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
};

const money = (value: number) => `$${Math.round(value).toLocaleString()}`;

export default function ResultsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const gate = useSessionGate(params.id, "results");
  const [data, setData] = useState<ResultsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showMilp, setShowMilp] = useState(true);
  const [showCommunity, setShowCommunity] = useState(true);
  const [tab, setTab] = useState<"results" | "solver">("results");

  useEffect(() => {
    if (!gate.ready) return;
    fetch(`/api/sessions/${params.id}/results`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          setLoadError(body.error ?? "Results are not available yet.");
          return;
        }
        setData(body);
      })
      .catch(() => setLoadError("Results are not available yet."));
  }, [gate.ready, params.id]);

  if (!gate.ready || (!data && !loadError)) {
    return (
      <>
        <AppHeader
          activeStep="results"
          sessionId={params.id}
          unlockedSteps={gate.unlocked}
        />
        <PageShell>
          <Spinner />
        </PageShell>
      </>
    );
  }

  if (loadError || !data) {
    return (
      <>
        <AppHeader
          activeStep="results"
          sessionId={params.id}
          unlockedSteps={gate.unlocked}
        />
        <PageShell>
          <p className="text-sm text-red-700">
            {loadError ?? "Results are not available yet."}
          </p>
        </PageShell>
      </>
    );
  }

  return (
    <>
      <AppHeader
        activeStep="results"
        sessionId={params.id}
        unlockedSteps={gate.unlocked}
      />
      <PageShell>
        <PageHeader
          title="Simulation Complete"
          subtitle={`${data.session.participant_name ?? "Participant"} · Results Summary`}
        />

        <TabSwitcher tab={tab} onChange={setTab} />

        {tab === "results" ? (
          <>
            <PerformanceHero data={data} />

            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-7">
              <MetricCard
                label="Total Cost"
                value={money(data.totals.totalCost)}
                highlight
              />
              <MetricCard
                label="Network Cost"
                value={money(data.totals.totalFixedCost + data.totals.totalTransportCost)}
                sublabel={`${data.session.opened_facilities.length} facilit${data.session.opened_facilities.length === 1 ? "y" : "ies"} opened`}
              />
              <MetricCard
                label="Procurement"
                value={money(data.totals.totalProcurementCost)}
              />
              <MetricCard
                label="Inventory Cost"
                value={money(data.totals.totalHoldingCost)}
              />
              <MetricCard
                label="Backorder Cost"
                value={money(data.totals.totalBackorderCost)}
                accent={data.totals.totalBackorderCost > 0}
              />
              <MetricCard
                label="Forecast MAE"
                value={Math.round(data.forecastAccuracy.mae).toLocaleString()}
                sublabel={data.forecastAccuracy.methodName}
              />
              <MetricCard
                label="Percentile"
                value={
                  data.community.costPercentile
                    ? `Better than ${data.community.costPercentile.betterThanPercent}%`
                    : "—"
                }
                sublabel={
                  data.community.costPercentile
                    ? `Rank ${data.community.costPercentile.rank} of ${data.community.costPercentile.totalPlayers}`
                    : "Needs at least two completed runs"
                }
              />
            </div>

            <ComparisonControls
              showMilp={showMilp}
              showCommunity={showCommunity}
              communityPlayers={data.community.completedPlayers}
              onMilp={() => setShowMilp((value) => !value)}
              onCommunity={() => setShowCommunity((value) => !value)}
            />

            <ResultsCharts
              data={data}
              showMilp={showMilp}
              showCommunity={
                showCommunity && data.community.completedPlayers > 0
              }
            />

            <div className="mt-8 flex justify-center border-t border-[var(--card-border)] pt-6">
              <SecondaryButton
                onClick={() => {
                  clearActiveSessionId();
                  router.replace("/");
                }}
              >
                Finish &amp; Start a New Run
              </SecondaryButton>
            </div>
          </>
        ) : (
          <OracleSolverExplainer data={data} />
        )}
      </PageShell>
    </>
  );
}

function PerformanceHero({ data }: { data: ResultsResponse }) {
  const averageDelta =
    data.community.averageCost === null
      ? null
      : data.totals.totalCost - data.community.averageCost;
  const milpDelta =
    data.totals.totalCost - data.solverBenchmark.totals.totalCost;

  return (
    <Card className="overflow-hidden border-[var(--navy)]/20">
      <div className="grid gap-0 lg:grid-cols-[1.4fr_1fr]">
        <div className="p-6 sm:p-7">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--slate)]">
            Overall performance
          </div>
          <div className="mt-2 text-4xl font-semibold tabular-nums text-[var(--navy)]">
            {money(data.totals.totalCost)}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--slate)]">
            <span className="rounded-full bg-slate-100 px-3 py-1.5">
              {milpDelta >= 0
                ? `${money(milpDelta)} above the Oracle`
                : `${money(Math.abs(milpDelta))} below the Oracle`}
            </span>
            {averageDelta !== null && (
              <span className="rounded-full bg-slate-100 px-3 py-1.5">
                {averageDelta <= 0
                  ? `${money(Math.abs(averageDelta))} below player average`
                  : `${money(averageDelta)} above player average`}
              </span>
            )}
          </div>
        </div>
        <div className="border-t border-[var(--card-border)] bg-slate-50 p-6 lg:border-l lg:border-t-0 flex flex-col justify-center">
          {data.community.costPercentile ? (
            <>
              <div className="text-3xl font-semibold tabular-nums text-[var(--navy)]">
                Better than {data.community.costPercentile.betterThanPercent}%
              </div>
              <div className="mt-2 text-sm text-[var(--slate)]">
                Rank {data.community.costPercentile.rank} of{" "}
                {data.community.costPercentile.totalPlayers} by total cost
              </div>
            </>
          ) : (
            <div className="text-sm text-[var(--slate)]">
              Percentile available after another completed run
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function TabSwitcher({
  tab,
  onChange,
}: {
  tab: "results" | "solver";
  onChange: (tab: "results" | "solver") => void;
}) {
  const tabs: { id: "results" | "solver"; label: string }[] = [
    { id: "results", label: "Your Results" },
    { id: "solver", label: "How the Oracle Was Built" },
  ];
  return (
    <div className="mb-6 flex gap-1 border-b border-[var(--card-border)]">
      {tabs.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={[
            "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
            tab === item.id
              ? "border-[var(--navy)] text-[var(--navy)]"
              : "border-transparent text-[var(--slate)] hover:text-[var(--navy)]",
          ].join(" ")}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function ComparisonControls({
  showMilp,
  showCommunity,
  communityPlayers,
  onMilp,
  onCommunity,
}: {
  showMilp: boolean;
  showCommunity: boolean;
  communityPlayers: number;
  onMilp: () => void;
  onCommunity: () => void;
}) {
  const communityAvailable = communityPlayers > 0;
  return (
    <Card className="my-6 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-[var(--slate)]">
          Chart comparisons
        </div>
        <div className="mt-0.5 text-[11px] text-[var(--slate-light)]">
          Your result is always shown.
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <ToggleChip
          active={showMilp}
          label="Oracle"
          color={MILP_COLOR}
          onClick={onMilp}
        />
        <ToggleChip
          active={showCommunity && communityAvailable}
          label={
            communityAvailable
              ? `Other players avg (${communityPlayers})`
              : "Other players (none yet)"
          }
          color={COMMUNITY_COLOR}
          disabled={!communityAvailable}
          onClick={onCommunity}
        />
      </div>
    </Card>
  );
}

function ToggleChip({
  active,
  label,
  color,
  disabled = false,
  onClick,
}: {
  active: boolean;
  label: string;
  color: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
        active
          ? "border-transparent bg-slate-100 text-[var(--navy)]"
          : "border-[var(--card-border)] bg-white text-[var(--slate)]",
        disabled ? "cursor-not-allowed opacity-40" : "hover:bg-slate-50",
      ].join(" ")}
    >
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{
          background: active ? color : "transparent",
          border: `1.5px solid ${color}`,
        }}
      />
      {label}
    </button>
  );
}

function ResultsCharts({
  data,
  showMilp,
  showCommunity,
}: {
  data: ResultsResponse;
  showMilp: boolean;
  showCommunity: boolean;
}) {
  const datasets = useMemo(
    () => buildChartData(data),
    [data]
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard
          title="Cost breakdown"
          subtitle="Operating cost by component and total"
        >
          <BarChart
            data={datasets.costBreakdown}
            margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={GRID_COLOR}
              vertical={false}
            />
            <XAxis
              dataKey="category"
              tick={chartAxisStyle}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={chartAxisStyle}
              tickFormatter={(value) => `$${Math.round(value / 1000)}k`}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip
              formatter={(value) => money(Number(value))}
              contentStyle={tooltipStyle}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar
              dataKey="Player"
              fill={PLAYER_COLOR}
              radius={[3, 3, 0, 0]}
            />
            {showMilp && (
              <Bar
                dataKey="Oracle"
                fill={MILP_COLOR}
                radius={[3, 3, 0, 0]}
              />
            )}
            {showCommunity && (
              <Bar
                dataKey="Player average"
                fill={COMMUNITY_COLOR}
                radius={[3, 3, 0, 0]}
              />
            )}
          </BarChart>
        </ChartCard>

        <ChartCard
          title="Cumulative cost"
          subtitle="How operating cost accumulated over ten weeks"
        >
          <LineChart
            data={datasets.byWeek}
            margin={{ top: 8, right: 10, left: 8, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={GRID_COLOR}
              vertical={false}
            />
            <XAxis
              dataKey="week"
              tick={chartAxisStyle}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={chartAxisStyle}
              tickFormatter={(value) => `$${Math.round(value / 1000)}k`}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip
              formatter={(value) => money(Number(value))}
              contentStyle={tooltipStyle}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ComparisonLines
              showMilp={showMilp}
              showCommunity={showCommunity}
              playerKey="playerCumulative"
              milpKey="milpCumulative"
              communityKey="communityCumulative"
            />
          </LineChart>
        </ChartCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard
          title="Ending inventory"
          subtitle="Combined on-hand inventory across open facilities"
        >
          <LineChart
            data={datasets.byWeek}
            margin={{ top: 8, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={GRID_COLOR}
              vertical={false}
            />
            <XAxis
              dataKey="week"
              tick={chartAxisStyle}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={chartAxisStyle}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ComparisonLines
              showMilp={showMilp}
              showCommunity={showCommunity}
              playerKey="playerInventory"
              milpKey="milpInventory"
              communityKey="communityInventory"
            />
          </LineChart>
        </ChartCard>

        <ChartCard
          title="Backlog"
          subtitle="Unfilled customer demand at the end of each week"
        >
          <LineChart
            data={datasets.byWeek}
            margin={{ top: 8, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={GRID_COLOR}
              vertical={false}
            />
            <XAxis
              dataKey="week"
              tick={chartAxisStyle}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={chartAxisStyle}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ComparisonLines
              showMilp={showMilp}
              showCommunity={showCommunity}
              playerKey="playerBacklog"
              milpKey="milpBacklog"
              communityKey="communityBacklog"
            />
          </LineChart>
        </ChartCard>
      </div>

      <ChartCard
        title="Weekly fill rate"
        subtitle="Units shipped divided by demand due each week; cumulative fill rate is shown above"
      >
        <LineChart
          data={datasets.byWeek}
          margin={{ top: 8, right: 10, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={GRID_COLOR}
            vertical={false}
          />
          <XAxis
            dataKey="week"
            tick={chartAxisStyle}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={chartAxisStyle}
            tickFormatter={(value) => `${value}%`}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip
            formatter={(value) => `${Number(value).toFixed(1)}%`}
            contentStyle={tooltipStyle}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <ComparisonLines
            showMilp={showMilp}
            showCommunity={showCommunity}
            playerKey="playerFillRate"
            milpKey="milpFillRate"
            communityKey="communityFillRate"
          />
        </LineChart>
      </ChartCard>

      <ForecastCharts
        data={data}
        showMilp={showMilp}
        showCommunity={showCommunity}
      />
      <SupplierOrdersChart data={data} />
    </div>
  );
}

function ComparisonLines({
  showMilp,
  showCommunity,
  playerKey,
  milpKey,
  communityKey,
}: {
  showMilp: boolean;
  showCommunity: boolean;
  playerKey: string;
  milpKey: string;
  communityKey: string;
}) {
  return (
    <>
      <Line
        type="monotone"
        dataKey={playerKey}
        name="You"
        stroke={PLAYER_COLOR}
        strokeWidth={2.7}
        dot={{ r: 3 }}
      />
      {showMilp && (
        <Line
          type="monotone"
          dataKey={milpKey}
          name="Oracle"
          stroke={MILP_COLOR}
          strokeWidth={2.3}
          strokeDasharray="6 4"
          dot={{ r: 2.5 }}
          connectNulls
        />
      )}
      {showCommunity && (
        <Line
          type="monotone"
          dataKey={communityKey}
          name="Player average"
          stroke={COMMUNITY_COLOR}
          strokeWidth={2.3}
          strokeDasharray="3 3"
          dot={{ r: 2.5 }}
          connectNulls
        />
      )}
    </>
  );
}

function ForecastCharts({
  data,
  showMilp,
  showCommunity,
}: {
  data: ResultsResponse;
  showMilp: boolean;
  showCommunity: boolean;
}) {
  const milpByWeek = new Map(
    data.forecastAccuracy.milp.byWeek.map((row) => [row.week, row.forecast])
  );
  const weekly = data.forecastAccuracy.byWeek.map((row) => ({
    week: `W${row.week}`,
    "Your forecast": row.forecast,
    Actual: row.actual,
    "Oracle forecast": milpByWeek.get(row.week) ?? null,
  }));
  const showPeerBars =
    showCommunity && data.forecastAccuracy.peers.completedWithSameMethod > 0;
  const errors = [
    {
      metric: "MAE",
      You: Math.round(data.forecastAccuracy.mae),
      Oracle: Math.round(data.forecastAccuracy.milp.mae),
      "Same-method average":
        data.forecastAccuracy.peers.averageMae === null
          ? null
          : Math.round(data.forecastAccuracy.peers.averageMae),
    },
    {
      metric: "RMSE",
      You: Math.round(data.forecastAccuracy.rmse),
      Oracle: Math.round(data.forecastAccuracy.milp.rmse),
      "Same-method average":
        data.forecastAccuracy.peers.averageRmse === null
          ? null
          : Math.round(data.forecastAccuracy.peers.averageRmse),
    },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-[var(--card-border)] bg-slate-50/70 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--navy)]">
              Forecast accuracy · {data.forecastAccuracy.methodName}
            </h2>
            <p className="mt-1 text-xs text-[var(--slate)]">
              Actual demand, your forecast
              {showMilp
                ? `, and the Oracle's (${data.forecastAccuracy.milp.methodName.toLowerCase()})`
                : ""}{" "}
              across {data.forecastAccuracy.observations} facility-weeks.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full bg-white px-2.5 py-1 text-[var(--slate)] shadow-sm">
              MAE {Math.round(data.forecastAccuracy.mae).toLocaleString()}
            </span>
            <span className="rounded-full bg-white px-2.5 py-1 text-[var(--slate)] shadow-sm">
              RMSE {Math.round(data.forecastAccuracy.rmse).toLocaleString()}
            </span>
            <span className="rounded-full bg-white px-2.5 py-1 text-[var(--slate)] shadow-sm">
              MSE {Math.round(data.forecastAccuracy.mse).toLocaleString()}
            </span>
            <span className="rounded-full bg-white px-2.5 py-1 text-[var(--slate)] shadow-sm">
              MAPE{" "}
              {data.forecastAccuracy.mapePct === null
                ? "—"
                : `${data.forecastAccuracy.mapePct.toFixed(1)}%`}
            </span>
            <span className="rounded-full bg-white px-2.5 py-1 text-[var(--slate)] shadow-sm">
              Bias {data.forecastAccuracy.bias >= 0 ? "+" : ""}
              {Math.round(data.forecastAccuracy.bias).toLocaleString()}
            </span>
            {showMilp && (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800 shadow-sm">
                Oracle MAE {Math.round(data.forecastAccuracy.milp.mae)} · RMSE{" "}
                {Math.round(data.forecastAccuracy.milp.rmse)}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="grid gap-0 lg:grid-cols-[1.5fr_1fr]">
        <div className="border-b border-[var(--card-border)] p-5 lg:border-b-0 lg:border-r">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--slate)]">
            Weekly forecast vs actual
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart
                data={weekly}
                margin={{ top: 8, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={GRID_COLOR}
                  vertical={false}
                />
                <XAxis
                  dataKey="week"
                  tick={chartAxisStyle}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={chartAxisStyle}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="Your forecast"
                  stroke={PLAYER_COLOR}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="Actual"
                  stroke={ACTUAL_COLOR}
                  strokeWidth={2.5}
                  strokeDasharray="5 4"
                  dot={{ r: 3 }}
                />
                {showMilp && (
                  <Line
                    type="monotone"
                    dataKey="Oracle forecast"
                    stroke={MILP_COLOR}
                    strokeWidth={2}
                    strokeDasharray="2 2"
                    dot={{ r: 4, fill: MILP_COLOR }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {showMilp && (
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--slate-light)]">
              The Oracle picks its forecasting method the same way you can -- by checking
              which method fit historical demand best -- and never sees a week&apos;s actual
              demand before deciding that week&apos;s order.
            </p>
          )}
        </div>
        <div className="p-5">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--slate)]">
            Error comparison
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart
                data={errors}
                margin={{ top: 18, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={GRID_COLOR}
                  vertical={false}
                />
                <XAxis
                  dataKey="metric"
                  tick={chartAxisStyle}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={chartAxisStyle}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey="You"
                  fill={PLAYER_COLOR}
                  radius={[4, 4, 0, 0]}
                  minPointSize={3}
                >
                  <LabelList
                    dataKey="You"
                    position="top"
                    style={{ fontSize: 10, fill: "#64748b" }}
                  />
                </Bar>
                {showMilp && (
                  <Bar
                    dataKey="Oracle"
                    fill={MILP_COLOR}
                    radius={[4, 4, 0, 0]}
                    minPointSize={3}
                  >
                    <LabelList
                      dataKey="Oracle"
                      position="top"
                      style={{ fontSize: 10, fill: "#92400e" }}
                    />
                  </Bar>
                )}
                {showPeerBars && (
                  <Bar
                    dataKey="Same-method average"
                    fill={COMMUNITY_COLOR}
                    radius={[4, 4, 0, 0]}
                    minPointSize={3}
                  >
                    <LabelList
                      dataKey="Same-method average"
                      position="top"
                      style={{ fontSize: 10, fill: "#0f766e" }}
                    />
                  </Bar>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--slate-light)]">
            Lower error is better.
            {showMilp
              ? " The Oracle's error comes from the same forecast uncertainty you face -- it's not zero."
              : ""}
            {showPeerBars
              ? " Same-method average compares peers who chose your forecasting method."
              : ""}
          </p>
        </div>
      </div>
    </Card>
  );
}

function SupplierOrdersChart({ data }: { data: ResultsResponse }) {
  const supplierIds = Array.from(
    new Set(data.decisions.map((decision) => decision.supplier_id))
  );
  const names: Record<string, string> = {
    domestic_fab: "Domestic",
    regional_partner: "Regional",
    overseas_manufacturer: "Overseas",
  };
  const colors: Record<string, string> = {
    domestic_fab: PLAYER_COLOR,
    regional_partner: COMMUNITY_COLOR,
    overseas_manufacturer: MILP_COLOR,
  };
  const weeks = Array.from(
    new Set(data.decisions.map((decision) => Number(decision.week)))
  ).sort((a, b) => a - b);
  const rows = weeks.map((week) => {
    const row: Record<string, number | string> = { week: `W${week}` };
    for (const supplier of supplierIds) {
      row[supplier] = data.decisions
        .filter(
          (decision) =>
            Number(decision.week) === week &&
            decision.supplier_id === supplier
        )
        .reduce(
          (sum, decision) => sum + Number(decision.order_quantity),
          0
        );
    }
    return row;
  });

  return (
    <ChartCard
      title="Orders by supplier"
      subtitle="Total units ordered across your open facilities each week"
    >
      <BarChart
        data={rows}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={GRID_COLOR}
          vertical={false}
        />
        <XAxis
          dataKey="week"
          tick={chartAxisStyle}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={chartAxisStyle}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {supplierIds.map((supplier) => (
          <Bar
            key={supplier}
            dataKey={supplier}
            name={names[supplier] ?? supplier}
            fill={colors[supplier] ?? "#94a3b8"}
            stackId="orders"
            radius={[3, 3, 0, 0]}
          />
        ))}
      </BarChart>
    </ChartCard>
  );
}

const SUPPLIER_FACTS: {
  name: string;
  leadTime: string;
  capacity: string;
  unitCost: string;
}[] = [
  {
    name: "Domestic Fab",
    leadTime: "2 weeks",
    capacity: "900 units / week / facility",
    unitCost: "$20 / unit",
  },
  {
    name: "Regional Partner",
    leadTime: "3 weeks",
    capacity: "700 units / week / facility",
    unitCost: "$15 / unit",
  },
  {
    name: "Overseas Manufacturer",
    leadTime: "3 weeks",
    capacity: "800 units / week / facility",
    unitCost: "$10 / unit",
  },
];

const CONSTRAINTS: {
  name: string;
  type: string;
  appliesTo: string;
  what: string;
  why: string;
}[] = [
  {
    name: "Non-negative orders",
    type: "Hard",
    appliesTo: "Everyone",
    what: "Every order quantity placed with a supplier in a given week must be 0 or greater.",
    why: "You cannot un-order units that were never ordered -- this just keeps the model physically meaningful.",
  },
  {
    name: "Supplier weekly capacity",
    type: "Hard",
    appliesTo: "Everyone",
    what: "An order to a supplier in one week cannot exceed that supplier's stated weekly capacity per facility (900 / 700 / 800 units).",
    why: "Suppliers are real production and shipping operations with finite throughput -- you cannot buy your way past their ceiling in a single week no matter how much you're willing to pay.",
  },
  {
    name: "Lead-time-respecting arrivals",
    type: "Hard (mechanics)",
    appliesTo: "Everyone",
    what: "An order placed in week w from a supplier with lead time L physically arrives no earlier than week w + L. Nothing the solver or a player does can make a shipment arrive faster.",
    why: "This is what makes the game (and the Oracle) genuinely about planning ahead -- if every order arrived instantly, there would be nothing to optimize.",
  },
  {
    name: "Max inventory ceiling",
    type: "Hard",
    appliesTo: "Everyone (Oracle and players)",
    what: "For players, if what's already on hand plus what's already arriving this week (from orders placed weeks ago) has reached the 2,500-unit cap, no new order can be placed at that facility this week -- since every supplier's lead time is at least 2 weeks, nothing ordered now could land this week anyway, so it's this week's existing position that's checked, not the new order itself. The Oracle applies the same 2,500-unit cap forward-looking, at each future checkpoint by which its current order would have actually arrived.",
    why: "Warehouses have finite physical space. This is enforced for players too, with a live warning and a hard block before you can submit an order at a facility that's already full, so nobody can win by hoarding infinite stock.",
  },
  {
    name: "60% single-supplier diversification cap",
    type: "Hard, Oracle-only",
    appliesTo: "Oracle only",
    what: "Across the whole run, no single supplier may account for more than 60% of a facility's total ordered volume.",
    why: "Sourcing risk management: a facility that puts 100% of its volume on one supplier is one disruption away from a stockout. This is a deliberate benchmark design choice, not a law of the simulation -- players are free to concentrate their sourcing however they judge best, since exploring that tradeoff is part of the exercise.",
  },
  {
    name: "No-lookahead information rule",
    type: "Hard, decision-timing",
    appliesTo: "Oracle only (players are naturally bound by this already)",
    what: "Every decision -- which facilities to open, which forecasting method to use, and every week's order -- is made using only information available at or before the moment that decision has to be made. The Oracle never peeks at a week's actual demand before deciding that week's order, and it never picks a network or forecasting method by simulating candidates forward and choosing whichever happened to score lowest.",
    why: "This is the whole point of the benchmark. An optimizer that gets to see the future isn't a fair comparison for a player who can't -- it would just prove hindsight is powerful, not that the plan was good. Every number the Oracle produces was earned under the same fog of war you play under.",
  },
];

const REMOVED_CONSTRAINT_NOTE =
  "An earlier version of this model also enforced a minimum inventory floor (400 units). It was removed: with a hard floor, the solver could treat a single week of cheap backlog as a “free pass” to relax the floor, which is a modeling artifact, not a real business rule. The holding cost ($2/unit/week) and backorder cost ($20/unit/week) already price the tradeoff between carrying too much and too little stock directly into the objective function -- a separate floor constraint was redundant at best and gameable at worst.";

function OracleSolverExplainer({ data }: { data: ResultsResponse }) {
  const totals = data.solverBenchmark.totals;
  const facilities = data.solverBenchmark.openedFacilities.join(" + ");

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-[var(--navy)]">
            The Oracle Solver
          </h2>
          <Badge tone="navy">No-lookahead benchmark</Badge>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--slate)]">
          The Oracle is a standalone optimization model that plays this exact
          scenario under the exact same rules a human player does: it does
          not know next week&apos;s demand, it cannot see disruptions before
          they happen, and it cannot pick a plan by simulating outcomes and
          keeping whichever worked out best. It makes three kinds of
          decisions -- which facilities to open, which forecasting method to
          trust, and how much to order each week -- and every one of them
          uses only information that would genuinely be available at the
          moment that decision has to be made. Its result on this scenario:{" "}
          <strong className="text-[var(--navy)]">{money(totals.totalCost)}</strong>{" "}
          total cost, opening <strong className="text-[var(--navy)]">{facilities}</strong>.
        </p>
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--slate)]">
          Objective function
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-[var(--slate)]">
          The Oracle minimizes total landed cost across the whole 10-week
          horizon:
        </p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--card-border)] bg-slate-50/70 p-4">
          <code className="text-xs leading-relaxed text-[var(--navy)] sm:text-sm">
            minimize&nbsp; Fixed Cost + Transport Cost + &Sigma;<sub>weeks</sub> &Sigma;<sub>facilities</sub>{" "}
            [ Procurement + Holding + Backorder ]
          </code>
        </div>
        <div className="mt-4">
          <DataTable
            headers={["Cost component", "How it's computed", "Rate in this scenario"]}
            rows={[
              [
                "Fixed cost",
                "Sum of the one-time cost to open each selected facility",
                "$125,000 / facility",
              ],
              [
                "Transport cost",
                "Each customer's weekly demand × the shipping rate from whichever open facility is cheapest for that customer",
                "Set once at network design, paid every week",
              ],
              [
                "Procurement cost",
                "Order quantity × landed unit cost, summed across suppliers and facilities",
                "$10–$20 / unit depending on supplier",
              ],
              [
                "Holding cost",
                "Units left on-hand at the end of the week × holding rate",
                "$2 / unit / week",
              ],
              [
                "Backorder cost",
                "Unfilled demand carried into the next week × backorder rate",
                "$20 / unit / week",
              ],
            ]}
          />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-[var(--slate-light)]">
          Backorder cost is set 10x holding cost on purpose -- it should
          always be cheaper to carry a bit of extra stock than to leave a
          customer unfilled, which is what makes the ordering tradeoff below
          meaningful instead of degenerate.
        </p>
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--slate)]">
          Stage 1 &middot; Network design (static, before week 1)
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-[var(--slate)]">
          Before any week is played, the Oracle picks which facilities to
          open using only information that exists before week 1 -- nothing
          about how the 10 weeks will actually unfold.
        </p>
        <ol className="mt-3 space-y-2.5 text-sm leading-relaxed text-[var(--slate)]">
          <li>
            <strong className="text-[var(--navy)]">1. Generate candidates.</strong>{" "}
            Every combination of facilities is a candidate network.
          </li>
          <li>
            <strong className="text-[var(--navy)]">2. Filter for feasibility.</strong>{" "}
            A candidate is discarded if its suppliers cannot realistically
            keep up with its assigned demand once real lead-time ramp-up is
            accounted for -- nothing arrives in week 1 in this scenario, so
            the binding constraint is how much can accumulate by week 2 and
            beyond, not the naive steady-state weekly total. This check uses
            only supplier lead times, capacities, and starting inventory --
            all known before week 1 -- never a simulated outcome.
          </li>
          <li>
            <strong className="text-[var(--navy)]">3. Minimize static cost.</strong>{" "}
            Among the feasible candidates, the Oracle opens whichever has the
            lowest fixed cost + transport cost. It does not simulate any
            candidate through the 10 weeks to make this choice.
          </li>
        </ol>
        <p className="mt-3 text-xs leading-relaxed text-[var(--slate-light)]">
          Why the feasibility filter exists: without it, the cost-minimizing
          answer could be a network that is structurally unable to meet
          demand -- cheap on paper, but only because it's already sunk the
          fixed cost before revealing it can't deliver. This mirrors a real
          planning risk: committing capital to a network before checking it
          can actually be supplied.
        </p>
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--slate)]">
          Stage 2 &middot; Forecasting method selection (static, before week 1)
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-[var(--slate)]">
          The Oracle chooses its forecasting method the same way a careful
          player can: it backtests all six available methods (naive, 2/3/4-week
          moving average, weighted moving average, exponential smoothing)
          against the 20 weeks of historical demand shown on the forecast
          page, and locks in whichever produced the lowest mean absolute
          error (MAE). For this scenario, that was{" "}
          <strong className="text-[var(--navy)]">exponential smoothing</strong>. The
          method is fixed for the entire run -- it is never swapped mid-game
          based on how the actual weeks turn out.
        </p>
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--slate)]">
          Stage 3 &middot; Weekly ordering (rolling, one week at a time)
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-[var(--slate)]">
          This is where the &quot;no-lookahead&quot; principle matters most.
          Each week, for each open facility, the Oracle re-solves a small
          optimization problem using only what it could actually know at
          that moment: current on-hand inventory, current backlog, what&apos;s
          already in transit, and its forecast of demand -- never that
          week&apos;s or any future week&apos;s actual demand.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--slate)]">
          For every future week a checkpoint (one per lead time a supplier
          could reach), it projects: <em>&quot;if I order nothing more, will my
          on-hand position plus what&apos;s already arriving cover forecast
          demand by then, with a safety margin?&quot;</em> The safety margin comes
          from the newsvendor critical-fractile rule -- a classic inventory
          formula that weighs the cost of holding one extra unit against the
          cost of being one unit short:
        </p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--card-border)] bg-slate-50/70 p-4">
          <code className="text-xs leading-relaxed text-[var(--navy)] sm:text-sm">
            z = &Phi;<sup>-1</sup>( backorder rate / (holding rate + backorder rate) ) = &Phi;<sup>-1</sup>(20 / 22) &asymp; 1.335
            <br />
            safety margin<sub>k</sub> = z &times; &sigma; &times; &radic;k
          </code>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[var(--slate)]">
          where &sigma; is that facility&apos;s demand volatility, estimated
          only from history that has actually been revealed so far. Any
          shortfall against that padded target becomes this week&apos;s order,
          split across suppliers by cost (subject to the constraints below).
          Once decided, the order is locked in -- next week starts the whole
          process over with newly revealed information.
        </p>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-[var(--card-border)] px-6 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--slate)]">
            Every constraint, and why it exists
          </h3>
        </div>
        <div className="p-6">
          <DataTable
            headers={["Constraint", "Type", "Applies to", "What it does", "Why it exists"]}
            rows={CONSTRAINTS.map((c) => [c.name, c.type, c.appliesTo, c.what, c.why])}
          />
          <p className="mt-4 text-xs leading-relaxed text-[var(--slate-light)]">
            {REMOVED_CONSTRAINT_NOTE}
          </p>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--slate)]">
          Suppliers the Oracle chooses between
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-[var(--slate)]">
          The same three suppliers available to every player -- the Oracle
          gets no exclusive access or better pricing.
        </p>
        <div className="mt-3">
          <DataTable
            headers={["Supplier", "Lead time", "Capacity", "Unit cost"]}
            rows={SUPPLIER_FACTS.map((s) => [s.name, s.leadTime, s.capacity, s.unitCost])}
          />
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--slate)]">
          The Oracle&apos;s final answer on this scenario
        </h3>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard label="Network" value={facilities} />
          <MetricCard label="Forecast method" value="Exp. smoothing" />
          <MetricCard label="Fixed + transport" value={money(totals.fixedCost + totals.transportCost)} />
          <MetricCard label="Procurement" value={money(totals.procurementCost)} />
          <MetricCard label="Holding" value={money(totals.holdingCost)} />
          <MetricCard label="Backorder" value={money(totals.backorderCost)} accent={totals.backorderCost > 0} />
        </div>
        <p className="mt-4 text-xs leading-relaxed text-[var(--slate-light)]">
          {data.solverBenchmark.notice}
        </p>
      </Card>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactElement;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-[var(--card-border)] px-5 py-4">
        <h2 className="text-sm font-semibold text-[var(--navy)]">{title}</h2>
        <p className="mt-1 text-xs text-[var(--slate)]">{subtitle}</p>
      </div>
      <div className="h-72 p-4">
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </Card>
  );
}

function buildChartData(data: ResultsResponse) {
  const community = data.community.averageBreakdown;
  const communityTotal =
    community.networkCost === null ||
    community.procurementCost === null ||
    community.holdingCost === null ||
    community.backorderCost === null
      ? null
      : community.networkCost +
        community.procurementCost +
        community.holdingCost +
        community.backorderCost;
  const costBreakdown = [
    {
      category: "Network",
      Player: data.totals.totalFixedCost + data.totals.totalTransportCost,
      Oracle: data.solverBenchmark.totals.fixedCost + data.solverBenchmark.totals.transportCost,
      "Player average": community.networkCost,
    },
    {
      category: "Procurement",
      Player: data.totals.totalProcurementCost,
      Oracle: data.solverBenchmark.totals.procurementCost,
      "Player average": community.procurementCost,
    },
    {
      category: "Inventory",
      Player: data.totals.totalHoldingCost,
      Oracle: data.solverBenchmark.totals.holdingCost,
      "Player average": community.holdingCost,
    },
    {
      category: "Backorder",
      Player: data.totals.totalBackorderCost,
      Oracle: data.solverBenchmark.totals.backorderCost,
      "Player average": community.backorderCost,
    },
    {
      category: "Total",
      Player: data.totals.totalCost,
      Oracle: data.solverBenchmark.totals.totalCost,
      "Player average": communityTotal,
    },
  ];

  const playerByWeek = new Map<
    number,
    { cost: number; onHand: number; backlog: number }
  >();
  for (const row of data.periodState) {
    const week = Number(row.week);
    const current = playerByWeek.get(week) ?? {
      cost: 0,
      onHand: 0,
      backlog: 0,
    };
    current.cost +=
      Number(row.procurement_cost) +
      Number(row.holding_cost) +
      Number(row.backorder_cost);
    current.onHand += Number(row.on_hand_end);
    current.backlog += Number(row.backlog);
    playerByWeek.set(week, current);
  }

  const playerFillByWeek = new Map(
    data.fillRate.weekly.map((row) => [row.week, row.fillRatePct])
  );
  let playerCumulative = data.totals.totalFixedCost + data.totals.totalTransportCost;
  const byWeek = Array.from(
    { length: data.solverBenchmark.byWeek.length },
    (_, index) => {
      const week = index + 1;
      const player = playerByWeek.get(week) ?? {
        cost: 0,
        onHand: 0,
        backlog: 0,
      };
      playerCumulative += player.cost;
      const milp = data.solverBenchmark.byWeek.find(
        (row) => row.week === week
      );
      const communityWeek = data.community.byWeek.find(
        (row) => row.week === week
      );
      return {
        week: `W${week}`,
        playerCumulative,
        milpCumulative: milp?.cumulativeCost ?? null,
        communityCumulative: communityWeek?.cumulativeCost ?? null,
        playerInventory: player.onHand,
        milpInventory: milp?.onHand ?? null,
        communityInventory: communityWeek?.onHand ?? null,
        playerBacklog: player.backlog,
        milpBacklog: milp?.backlog ?? null,
        communityBacklog: communityWeek?.backlog ?? null,
        playerFillRate: playerFillByWeek.get(week) ?? null,
        milpFillRate: milp?.fillRatePct ?? null,
        communityFillRate: communityWeek?.fillRatePct ?? null,
      };
    }
  );

  return { costBreakdown, byWeek };
}
