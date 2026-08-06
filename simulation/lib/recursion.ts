/**
 * The realized-cost recursion (per the model doc, Section 4: "The
 * Realized-Cost Recursion"). Runs AFTER a week's order decisions are
 * already placed, using ACTUAL ground-truth demand -- never used to
 * inform the decision itself, only to score what already happened.
 */

export interface OrderDecision {
  week: number;
  supplierId: string;
  quantity: number;
}

export interface RecursionResult {
  arriving: number;
  available: number;
  backlogServed: number;
  remain: number;
  newServed: number;
  onHandEnd: number;
  backlogEnd: number;
  procurementCost: number;
  holdingCost: number;
  backorderCost: number;
  totalCost: number;
}

/**
 * How much arrives in `targetWeek` from all past orders, given each
 * supplier's lead time. An order placed in week `w` with lead time `L`
 * arrives at the start of week `w + L - 1`.
 */
export function arrivingInWeek(
  pastDecisions: OrderDecision[],
  targetWeek: number,
  leadTimeBySupplier: Record<string, number>
): number {
  return pastDecisions
    .filter((d) => d.week + leadTimeBySupplier[d.supplierId] - 1 === targetWeek)
    .reduce((sum, d) => sum + d.quantity, 0);
}

export function runRecursion(params: {
  onHandStart: number;
  backlogStart: number;
  arriving: number;
  actualDemand: number;
  thisWeeksOrders: { supplierId: string; quantity: number; landedUnitCost: number }[];
  holdingCostPerUnit: number;
  backorderCostPerUnit: number;
}): RecursionResult {
  const { onHandStart, backlogStart, arriving, actualDemand, thisWeeksOrders, holdingCostPerUnit, backorderCostPerUnit } =
    params;

  const available = onHandStart + arriving;
  const backlogServed = Math.min(available, backlogStart);
  const remain = available - backlogServed;
  const newServed = Math.min(remain, actualDemand);
  const backlogEnd = backlogStart - backlogServed + (actualDemand - newServed);
  const onHandEnd = remain - newServed;

  const procurementCost = thisWeeksOrders.reduce((sum, o) => sum + o.quantity * o.landedUnitCost, 0);
  const holdingCost = holdingCostPerUnit * onHandEnd;
  const backorderCost = backorderCostPerUnit * backlogEnd;

  return {
    arriving,
    available,
    backlogServed,
    remain,
    newServed,
    onHandEnd,
    backlogEnd,
    procurementCost,
    holdingCost,
    backorderCost,
    totalCost: procurementCost + holdingCost + backorderCost,
  };
}
