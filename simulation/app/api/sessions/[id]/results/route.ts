import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { loadScenarioData } from "@/lib/scenarioData";
import { ForecastingMethodId } from "@/lib/forecasting";
import { scoreForecastAccuracy } from "@/lib/forecastAccuracy";

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
  const communityRes = await pool.query(
    `SELECT COUNT(*)::int AS completed_players, AVG(total_cost)::numeric AS average_cost
     FROM (
       SELECT s.id,
              SUM(ps.procurement_cost + ps.holding_cost + ps.backorder_cost) AS total_cost
       FROM sessions s
       JOIN period_state ps ON ps.session_id = s.id
       WHERE s.status = 'completed'
       GROUP BY s.id
     ) completed_runs`
  );
  const communityRow = communityRes.rows[0];

  const data = loadScenarioData();
  const openedFacilities: string[] = session.opened_facilities ?? [];
  const methodId = session.forecasting_method_id as ForecastingMethodId;
  const forecastAccuracy = scoreForecastAccuracy(data, openedFacilities, methodId, periodStateRes.rows);

  // Average MAE/MSE across other completed players who used the same forecasting method.
  const sameMethodSessions = await pool.query(
    `SELECT id, opened_facilities, forecasting_method_id
     FROM sessions
     WHERE status = 'completed'
       AND forecasting_method_id = $1`,
    [methodId]
  );
  const peerMaes: number[] = [];
  const peerMses: number[] = [];
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
  }
  const peerCount = peerMaes.length;
  const peerAverageMae = peerCount === 0 ? null : peerMaes.reduce((a, b) => a + b, 0) / peerCount;
  const peerAverageMse = peerCount === 0 ? null : peerMses.reduce((a, b) => a + b, 0) / peerCount;

  let playerCumulativeCost = 0;
  const placeholderSolverCumulative = Array.from(
    new Set(periodStateRes.rows.map((row) => Number(row.week)))
  )
    .sort((a, b) => a - b)
    .map((week) => {
      const weekCost = periodStateRes.rows
        .filter((row) => Number(row.week) === week)
        .reduce(
          (sum, row) =>
            sum +
            Number(row.procurement_cost) +
            Number(row.holding_cost) +
            Number(row.backorder_cost),
          0
        );
      playerCumulativeCost += weekCost;
      return {
        week,
        cost: Math.round(playerCumulativeCost * 0.84),
      };
    });

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
    community: {
      completedPlayers: Number(communityRow.completed_players ?? 0),
      averageCost:
        communityRow.average_cost === null ? null : Number(communityRow.average_cost),
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
      },
    },
    solverBenchmark: {
      status: "illustrative_placeholder",
      notice:
        "Comparison against the mixed-integer linear programming (MILP) mathematical model for this scenario.",
      cumulativeCostByWeek: placeholderSolverCumulative,
      sensitivityInsights: [
        {
          lever: "Domestic supplier capacity",
          method: "LP-relaxation dual",
          value: "$6.40 / additional unit",
          impact: "More fast domestic capacity is estimated to reduce total cost by $6.40 per unit while this constraint is binding.",
        },
        {
          lever: "Regional supplier capacity",
          method: "LP-relaxation dual",
          value: "$3.10 / additional unit",
          impact: "Additional regional capacity has value, but less than domestic capacity because of its longer lead time.",
        },
        {
          lever: "Maximum inventory ceiling",
          method: "LP-relaxation dual",
          value: "$0.00 / additional unit",
          impact: "The storage ceiling is non-binding in this illustrative result; expanding it would not change the solution.",
        },
        {
          lever: "Low-tier diversification cap",
          method: "MILP re-optimization",
          value: "$420 / percentage point",
          impact: "Relaxing this risk cap lowers cost by allowing more volume from the cheapest overseas supplier, but increases concentration risk.",
        },
      ],
    },
  });
}
