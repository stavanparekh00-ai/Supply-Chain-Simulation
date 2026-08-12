import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { loadScenarioData } from "@/lib/scenarioData";
import { ForecastingMethodId } from "@/lib/forecasting";
import {
  scoreForecastAccuracy,
  scorePerfectForesightAccuracy,
} from "@/lib/forecastAccuracy";
import { buildMilpBenchmark } from "@/lib/milpBenchmark";
import {
  FillRateStateRow,
  summarizeFillRate,
} from "@/lib/fillRate";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pool = getPool();

  const sessionRes = await pool.query(`SELECT * FROM sessions WHERE id = $1`, [id]);
  if (sessionRes.rows.length === 0) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const session = sessionRes.rows[0];
  if (session.status !== "completed") {
    return NextResponse.json(
      { error: "Results are available only after this simulation run is completed." },
      { status: 409 }
    );
  }

  const periodStateRes = await pool.query(
    `SELECT * FROM period_state WHERE session_id = $1 ORDER BY week ASC, facility_id ASC`,
    [id]
  );
  const decisionsRes = await pool.query(
    `SELECT * FROM decisions WHERE session_id = $1 ORDER BY week ASC, facility_id ASC, supplier_id ASC`,
    [id]
  );

  const totalProcurementCost = periodStateRes.rows.reduce((s, r) => s + Number(r.procurement_cost), 0);
  const totalHoldingCost = periodStateRes.rows.reduce((s, r) => s + Number(r.holding_cost), 0);
  const totalBackorderCost = periodStateRes.rows.reduce((s, r) => s + Number(r.backorder_cost), 0);
  const totalCost = totalProcurementCost + totalHoldingCost + totalBackorderCost;
  const totalBackorderedUnits = periodStateRes.rows.reduce((s, r) => s + Number(r.backlog), 0);
  const data = loadScenarioData();
  const milpBenchmark = buildMilpBenchmark(data);
  const playerFillRate = summarizeFillRate(periodStateRes.rows);
  const openedFacilities: string[] = session.opened_facilities ?? [];
  const methodId = session.forecasting_method_id as ForecastingMethodId;
  const forecastAccuracy = scoreForecastAccuracy(data, openedFacilities, methodId, periodStateRes.rows);
  const milpForecastAccuracy = scorePerfectForesightAccuracy(periodStateRes.rows);

  const completedStateRes = await pool.query(
    `SELECT s.id AS session_id, ps.week, ps.facility_id, ps.on_hand_start,
            ps.arriving, ps.actual_demand, ps.on_hand_end, ps.backlog,
            ps.procurement_cost, ps.holding_cost, ps.backorder_cost
     FROM sessions s
     JOIN period_state ps ON ps.session_id = s.id
     WHERE s.status = 'completed'
     ORDER BY s.id, ps.week`
  );

  type WeeklySummary = {
    procurementCost: number;
    holdingCost: number;
    backorderCost: number;
    onHand: number;
    backlog: number;
  };
  type RunSummary = {
    procurementCost: number;
    holdingCost: number;
    backorderCost: number;
    totalCost: number;
    byWeek: Map<number, WeeklySummary>;
    fillRows: FillRateStateRow[];
  };

  const completedRuns = new Map<string, RunSummary>();
  for (const row of completedStateRes.rows) {
    const sessionId = String(row.session_id);
    const run =
      completedRuns.get(sessionId) ??
      {
        procurementCost: 0,
        holdingCost: 0,
        backorderCost: 0,
        totalCost: 0,
        byWeek: new Map<number, WeeklySummary>(),
        fillRows: [],
      };
    const week = Number(row.week);
    const weekly =
      run.byWeek.get(week) ??
      {
        procurementCost: 0,
        holdingCost: 0,
        backorderCost: 0,
        onHand: 0,
        backlog: 0,
      };
    const procurement = Number(row.procurement_cost);
    const holding = Number(row.holding_cost);
    const backorder = Number(row.backorder_cost);
    weekly.procurementCost += procurement;
    weekly.holdingCost += holding;
    weekly.backorderCost += backorder;
    weekly.onHand += Number(row.on_hand_end);
    weekly.backlog += Number(row.backlog);
    run.procurementCost += procurement;
    run.holdingCost += holding;
    run.backorderCost += backorder;
    run.totalCost += procurement + holding + backorder;
    run.fillRows.push(row);
    run.byWeek.set(week, weekly);
    completedRuns.set(sessionId, run);
  }

  const peerRuns = Array.from(completedRuns.entries())
    .filter(([sessionId]) => sessionId !== id)
    .map(([, run]) => run);
  const peerCountAll = peerRuns.length;
  const peerFillRates = peerRuns.map((run) =>
    summarizeFillRate(run.fillRows)
  );
  const average = (values: number[]) =>
    values.length === 0
      ? null
      : values.reduce((sum, value) => sum + value, 0) / values.length;

  const communityByWeek = Array.from(
    { length: data.scenario_metadata.horizon_periods },
    (_, index) => {
      const week = index + 1;
      const samples = peerRuns
        .map((run) => run.byWeek.get(week))
        .filter((row): row is WeeklySummary => Boolean(row));
      const cumulativeSamples = peerRuns.map((run) => {
        let cumulative = 0;
        for (let currentWeek = 1; currentWeek <= week; currentWeek += 1) {
          const row = run.byWeek.get(currentWeek);
          if (row) {
            cumulative +=
              row.procurementCost + row.holdingCost + row.backorderCost;
          }
        }
        return cumulative;
      });
      return {
        week,
        cumulativeCost: average(cumulativeSamples),
        onHand: average(samples.map((row) => row.onHand)),
        backlog: average(samples.map((row) => row.backlog)),
        fillRatePct: average(
          peerFillRates
            .map(
              (summary) =>
                summary.weekly.find((row) => row.week === week)?.fillRatePct
            )
            .filter((value): value is number => value !== undefined)
        ),
      };
    }
  );

  const rankedRuns = Array.from(completedRuns.values());
  const costRank =
    rankedRuns.length < 2
      ? null
      : 1 + rankedRuns.filter((run) => run.totalCost < totalCost).length;
  const costPercentile =
    costRank === null
      ? null
      : {
          rank: costRank,
          totalPlayers: rankedRuns.length,
          topPercent: Math.max(
            1,
            Math.ceil((costRank / rankedRuns.length) * 100)
          ),
        };

  // Average MAE/MSE across other completed players who used the same forecasting method.
  const sameMethodSessions = await pool.query(
    `SELECT id, opened_facilities, forecasting_method_id
     FROM sessions
     WHERE status = 'completed'
       AND forecasting_method_id = $1
       AND id <> $2`,
    [methodId, id]
  );
  const peerMaes: number[] = [];
  const peerMses: number[] = [];
  const peerRmses: number[] = [];
  for (const peer of sameMethodSessions.rows) {
    const peerState = await pool.query(
      `SELECT week, facility_id, actual_demand
       FROM period_state
       WHERE session_id = $1
       ORDER BY week ASC, facility_id ASC`,
      [peer.id]
    );
    if (peerState.rows.length === 0) continue;
    const scored = scoreForecastAccuracy(
      data,
      peer.opened_facilities ?? [],
      peer.forecasting_method_id as ForecastingMethodId,
      peerState.rows
    );
    peerMaes.push(scored.mae);
    peerMses.push(scored.mse);
    peerRmses.push(scored.rmse);
  }
  const peerCount = peerMaes.length;
  const peerAverageMae = peerCount === 0 ? null : peerMaes.reduce((a, b) => a + b, 0) / peerCount;
  const peerAverageMse = peerCount === 0 ? null : peerMses.reduce((a, b) => a + b, 0) / peerCount;
  const peerAverageRmse =
    peerCount === 0 ? null : peerRmses.reduce((a, b) => a + b, 0) / peerCount;

  return NextResponse.json({
    session,
    periodState: periodStateRes.rows,
    decisions: decisionsRes.rows,
    totals: {
      totalProcurementCost,
      totalHoldingCost,
      totalBackorderCost,
      totalCost,
      totalBackorderedUnits,
    },
    fillRate: playerFillRate,
    community: {
      completedPlayers: peerCountAll,
      averageCost: average(peerRuns.map((run) => run.totalCost)),
      averageBreakdown: {
        procurementCost: average(peerRuns.map((run) => run.procurementCost)),
        holdingCost: average(peerRuns.map((run) => run.holdingCost)),
        backorderCost: average(peerRuns.map((run) => run.backorderCost)),
      },
      byWeek: communityByWeek,
      costPercentile,
    },
    forecastAccuracy: {
      methodId: forecastAccuracy.methodId,
      methodName: forecastAccuracy.methodName,
      observations: forecastAccuracy.observations,
      mae: forecastAccuracy.mae,
      mse: forecastAccuracy.mse,
      rmse: forecastAccuracy.rmse,
      mapePct: forecastAccuracy.mapePct,
      bias: forecastAccuracy.bias,
      byWeek: forecastAccuracy.byWeek,
      peers: {
        completedWithSameMethod: peerCount,
        averageMae: peerAverageMae,
        averageMse: peerAverageMse,
        averageRmse: peerAverageRmse,
      },
      milp: {
        methodId: milpForecastAccuracy.methodId,
        methodName: milpForecastAccuracy.methodName,
        mae: milpForecastAccuracy.mae,
        mse: milpForecastAccuracy.mse,
        rmse: milpForecastAccuracy.rmse,
        byWeek: milpForecastAccuracy.byWeek,
      },
    },
    solverBenchmark: milpBenchmark,
  });
}
