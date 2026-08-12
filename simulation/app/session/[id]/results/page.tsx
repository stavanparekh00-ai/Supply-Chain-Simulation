"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
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
import {
  Card,
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
    totalProcurementCost: number;
    totalHoldingCost: number;
    totalBackorderCost: number;
    totalCost: number;
    totalBackorderedUnits: number;
  };
  community: {
    completedPlayers: number;
    averageCost: number | null;
    averageBreakdown: {
      procurementCost: number | null;
      holdingCost: number | null;
      backorderCost: number | null;
    };
    byWeek: ComparisonWeek[];
    costPercentile: {
      rank: number;
      totalPlayers: number;
      topPercent: number;
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
  };
  solverBenchmark: {
    status: "verified_precomputed";
    notice: string;
    openedFacilities: string[];
    totals: {
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
    }[];
  };
}

const PLAYER_COLOR = "#1e3a5f";
const MILP_COLOR = "#b45309";
const COMMUNITY_COLOR = "#0f766e";
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

        <PerformanceHero data={data} />

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
          <MetricCard
            label="Total Cost"
            value={money(data.totals.totalCost)}
            highlight
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
            label="Cost Standing"
            value={
              data.community.costPercentile
                ? `Top ${data.community.costPercentile.topPercent}%`
                : "—"
            }
            sublabel={
              data.community.costPercentile
                ? `#${data.community.costPercentile.rank} of ${data.community.costPercentile.totalPlayers}`
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
    <Card className="overflow-hidden border-[var(--navy)] bg-[var(--navy)] text-white">
      <div className="grid gap-0 lg:grid-cols-[1.4fr_1fr]">
        <div className="p-6 sm:p-7">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
            Overall performance
          </div>
          <div className="mt-2 text-4xl font-semibold tabular-nums">
            {money(data.totals.totalCost)}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-white/10 px-3 py-1.5">
              {milpDelta >= 0
                ? `${money(milpDelta)} above MILP`
                : `${money(Math.abs(milpDelta))} below MILP`}
            </span>
            {averageDelta !== null && (
              <span className="rounded-full bg-white/10 px-3 py-1.5">
                {averageDelta <= 0
                  ? `${money(Math.abs(averageDelta))} below player average`
                  : `${money(averageDelta)} above player average`}
              </span>
            )}
          </div>
        </div>
        <div className="border-t border-white/15 bg-white/[0.06] p-6 lg:border-l lg:border-t-0">
          <div className="text-xs text-white/60">Your cost rank</div>
          <div className="mt-1 text-2xl font-semibold">
            {data.community.costPercentile
              ? `Top ${data.community.costPercentile.topPercent}%`
              : "More runs needed"}
          </div>
          <div className="mt-2 text-xs leading-relaxed text-white/65">
            {data.community.costPercentile
              ? `Rank ${data.community.costPercentile.rank} among ${data.community.costPercentile.totalPlayers} completed runs; lower cost ranks higher.`
              : "A percentile appears after another player completes the simulation."}
          </div>
        </div>
      </div>
    </Card>
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
          label="MILP model"
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
                dataKey="MILP"
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

      <ForecastCharts data={data} showCommunity={showCommunity} />
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
          name="MILP model"
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
  showCommunity,
}: {
  data: ResultsResponse;
  showCommunity: boolean;
}) {
  const weekly = data.forecastAccuracy.byWeek.map((row) => ({
    week: `W${row.week}`,
    Forecast: row.forecast,
    Actual: row.actual,
  }));
  const errors = [
    {
      metric: "MAE",
      You: Math.round(data.forecastAccuracy.mae),
      "Same-method average":
        data.forecastAccuracy.peers.averageMae === null
          ? null
          : Math.round(data.forecastAccuracy.peers.averageMae),
    },
    {
      metric: "RMSE",
      You: Math.round(data.forecastAccuracy.rmse),
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
              Actual demand, forecast, and error across{" "}
              {data.forecastAccuracy.observations} facility-weeks.
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
                  dataKey="Forecast"
                  stroke={PLAYER_COLOR}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="Actual"
                  stroke={MILP_COLOR}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="p-5">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--slate)]">
            Error comparison
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart
                data={errors}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
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
                />
                {showCommunity &&
                  data.forecastAccuracy.peers.completedWithSameMethod > 0 && (
                    <Bar
                      dataKey="Same-method average"
                      fill={COMMUNITY_COLOR}
                      radius={[4, 4, 0, 0]}
                    />
                  )}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--slate-light)]">
            Lower error is better. The MILP benchmark uses realized scenario
            demand, so forecast error is compared only with players using the
            same method.
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
    community.procurementCost === null ||
    community.holdingCost === null ||
    community.backorderCost === null
      ? null
      : community.procurementCost +
        community.holdingCost +
        community.backorderCost;
  const costBreakdown = [
    {
      category: "Procurement",
      Player: data.totals.totalProcurementCost,
      MILP: data.solverBenchmark.totals.procurementCost,
      "Player average": community.procurementCost,
    },
    {
      category: "Inventory",
      Player: data.totals.totalHoldingCost,
      MILP: data.solverBenchmark.totals.holdingCost,
      "Player average": community.holdingCost,
    },
    {
      category: "Backorder",
      Player: data.totals.totalBackorderCost,
      MILP: data.solverBenchmark.totals.backorderCost,
      "Player average": community.backorderCost,
    },
    {
      category: "Total",
      Player: data.totals.totalCost,
      MILP: data.solverBenchmark.totals.totalCost,
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

  let playerCumulative = 0;
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
      };
    }
  );

  return { costBreakdown, byWeek };
}
