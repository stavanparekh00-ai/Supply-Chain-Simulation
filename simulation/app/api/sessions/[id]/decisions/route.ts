import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { loadScenarioData, facilityActualDemand, disruptionsInWeek } from "@/lib/scenarioData";
import { getFacilityStateBeforeWeek, getPastDecisions, getSupplierLandedCostMap } from "@/lib/gameEngine";
import { arrivingInWeek, runRecursion } from "@/lib/recursion";

interface OrderInput {
  facilityId: string;
  supplierId: string;
  quantity: number;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const orders: OrderInput[] = body.orders;

  if (!Array.isArray(orders)) {
    return NextResponse.json({ error: "orders must be an array" }, { status: 400 });
  }
  for (const o of orders) {
    if (!Number.isInteger(o.quantity) || o.quantity < 0) {
      return NextResponse.json({ error: `Order quantity must be a non-negative whole number (got ${o.quantity})` }, { status: 400 });
    }
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const sessionRes = await client.query(`SELECT * FROM sessions WHERE id = $1 FOR UPDATE`, [id]);
    if (sessionRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const session = sessionRes.rows[0];
    if (session.status !== "playing") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: `Session is not in a playable state (status=${session.status})` }, { status: 409 });
    }

    const data = loadScenarioData();
    const week: number = session.current_week;
    const openedFacilities: string[] = session.opened_facilities;
    const landedCostMap = getSupplierLandedCostMap(data, week);
    const supplierById = new Map(data.suppliers.map((supplier) => [supplier.id, supplier]));
    const capacityCut = disruptionsInWeek(data, week).find(
      (disruption) => disruption.type === "supplier_capacity_cut"
    );
    const leadTimeBySupplier: Record<string, number> = {};
    for (const s of data.suppliers) leadTimeBySupplier[s.id] = s.lead_time_weeks;

    for (const facilityId of openedFacilities) {
      const facilityOrders = orders.filter((order) => order.facilityId === facilityId);
      const seenSuppliers = new Set<string>();

      for (const order of facilityOrders) {
        const supplier = supplierById.get(order.supplierId);
        if (!supplier) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: `Unknown supplier: ${order.supplierId}` }, { status: 400 });
        }
        if (seenSuppliers.has(order.supplierId)) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: `Duplicate order for ${supplier.name} at facility ${facilityId}` },
            { status: 400 }
          );
        }
        seenSuppliers.add(order.supplierId);

        const capacityMultiplier =
          capacityCut?.target_supplier_id === supplier.id
            ? Number(capacityCut.effect.capacity_multiplier)
            : 1;
        const availableCapacity = Math.floor(
          supplier.capacity_per_facility_per_week * capacityMultiplier
        );
        if (order.quantity > availableCapacity) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            {
              error: `${supplier.name} can supply at most ${availableCapacity.toLocaleString()} units to ${facilityId} this week.`,
            },
            { status: 400 }
          );
        }
        // Supplier share limits are soft guidance only for players -- do not block submit.
      }
    }

    // Insert this week's decisions first (idempotent-ish: rely on UNIQUE constraint / prior validation).
    for (const o of orders) {
      if (!openedFacilities.includes(o.facilityId)) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: `Facility ${o.facilityId} is not open in this session` }, { status: 400 });
      }
      await client.query(
        `INSERT INTO decisions (session_id, week, facility_id, supplier_id, order_quantity)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (session_id, week, facility_id, supplier_id) DO UPDATE SET order_quantity = EXCLUDED.order_quantity`,
        [id, week, o.facilityId, o.supplierId, o.quantity]
      );
    }

    const results: Record<string, unknown>[] = [];

    for (const facilityId of openedFacilities) {
      const { onHand, backlog } = await getFacilityStateBeforeWeek(
        client,
        id,
        facilityId,
        week,
        data.per_period_cost_parameters.initial_on_hand_inventory_units
      );

      // Include this week's just-inserted decisions when computing arrivals (a Domestic order arrives same week).
      const pastDecisionsBefore = await getPastDecisions(client, id, facilityId);
      const arriving = arrivingInWeek(pastDecisionsBefore, week, leadTimeBySupplier);

      const actualDemand = facilityActualDemand(data, openedFacilities, facilityId, week);

      const thisWeeksOrders = orders
        .filter((o) => o.facilityId === facilityId)
        .map((o) => ({ supplierId: o.supplierId, quantity: o.quantity, landedUnitCost: landedCostMap[o.supplierId] }));

      const recursionResult = runRecursion({
        onHandStart: onHand,
        backlogStart: backlog,
        arriving,
        actualDemand,
        thisWeeksOrders,
        holdingCostPerUnit: data.per_period_cost_parameters.holding_cost_per_unit_per_week,
        backorderCostPerUnit: data.per_period_cost_parameters.backorder_cost_per_unit_per_week,
      });

      await client.query(
        `INSERT INTO period_state
           (session_id, week, facility_id, on_hand_start, arriving, actual_demand, on_hand_end, backlog, procurement_cost, holding_cost, backorder_cost)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (session_id, week, facility_id) DO UPDATE SET
           on_hand_start = EXCLUDED.on_hand_start, arriving = EXCLUDED.arriving, actual_demand = EXCLUDED.actual_demand,
           on_hand_end = EXCLUDED.on_hand_end, backlog = EXCLUDED.backlog, procurement_cost = EXCLUDED.procurement_cost,
           holding_cost = EXCLUDED.holding_cost, backorder_cost = EXCLUDED.backorder_cost`,
        [
          id,
          week,
          facilityId,
          onHand,
          recursionResult.arriving,
          actualDemand,
          recursionResult.onHandEnd,
          recursionResult.backlogEnd,
          recursionResult.procurementCost,
          recursionResult.holdingCost,
          recursionResult.backorderCost,
        ]
      );

      results.push({
        facilityId,
        actualDemand,
        onHandStart: onHand,
        backlogStart: backlog,
        ...recursionResult,
      });
    }

    const horizon = data.scenario_metadata.horizon_periods;
    const isLastWeek = week >= horizon;
    await client.query(
      `UPDATE sessions SET current_week = $1, status = $2 WHERE id = $3`,
      [isLastWeek ? week : week + 1, isLastWeek ? "completed" : "playing", id]
    );

    await client.query("COMMIT");
    return NextResponse.json({ week, results, completed: isLastWeek });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return NextResponse.json({ error: "Failed to process decision" }, { status: 500 });
  } finally {
    client.release();
  }
}
