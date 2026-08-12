export interface FillRateStateRow {
  week: number | string;
  facility_id: string;
  on_hand_start: number | string;
  arriving: number | string;
  actual_demand: number | string;
  on_hand_end: number | string;
  backlog: number | string;
}

export interface WeeklyFillRate {
  week: number;
  shipped: number;
  demand: number;
  due: number;
  fillRatePct: number;
}

export interface FillRateSummary {
  cumulativeShipped: number;
  cumulativeDemand: number;
  cumulativeFillRatePct: number | null;
  weekly: WeeklyFillRate[];
  weeklyVariance: number | null;
  weeklyStdDev: number | null;
}

/**
 * Fill rate definitions:
 * - Cumulative: all units shipped / all new customer demand.
 * - Weekly: units shipped / (new demand + backlog entering that week).
 *
 * The weekly denominator includes backlog so a catch-up week cannot report
 * more than 100%. All inputs already exist in period_state; no extra DB
 * snapshot is required.
 */
export function summarizeFillRate(rows: FillRateStateRow[]): FillRateSummary {
  const sorted = [...rows].sort(
    (a, b) =>
      Number(a.week) - Number(b.week) ||
      String(a.facility_id).localeCompare(String(b.facility_id))
  );
  const previousBacklog = new Map<string, number>();
  const byWeek = new Map<
    number,
    { shipped: number; demand: number; due: number }
  >();

  for (const row of sorted) {
    const facilityId = String(row.facility_id);
    const week = Number(row.week);
    const backlogStart = previousBacklog.get(facilityId) ?? 0;
    const demand = Number(row.actual_demand);
    const due = backlogStart + demand;
    const shipped = Math.max(
      0,
      Number(row.on_hand_start) +
        Number(row.arriving) -
        Number(row.on_hand_end)
    );
    const weekly = byWeek.get(week) ?? { shipped: 0, demand: 0, due: 0 };
    weekly.shipped += shipped;
    weekly.demand += demand;
    weekly.due += due;
    byWeek.set(week, weekly);
    previousBacklog.set(facilityId, Number(row.backlog));
  }

  const weekly = Array.from(byWeek.entries()).map(([week, values]) => ({
    week,
    ...values,
    fillRatePct:
      values.due > 0 ? Math.min(100, (values.shipped / values.due) * 100) : 100,
  }));
  const cumulativeShipped = weekly.reduce(
    (sum, row) => sum + row.shipped,
    0
  );
  const cumulativeDemand = weekly.reduce(
    (sum, row) => sum + row.demand,
    0
  );
  const cumulativeFillRatePct =
    cumulativeDemand > 0
      ? Math.min(100, (cumulativeShipped / cumulativeDemand) * 100)
      : null;
  const weeklyMean =
    weekly.length > 0
      ? weekly.reduce((sum, row) => sum + row.fillRatePct, 0) / weekly.length
      : null;
  const weeklyVariance =
    weeklyMean === null
      ? null
      : weekly.reduce(
          (sum, row) => sum + (row.fillRatePct - weeklyMean) ** 2,
          0
        ) / weekly.length;

  return {
    cumulativeShipped,
    cumulativeDemand,
    cumulativeFillRatePct,
    weekly,
    weeklyVariance,
    weeklyStdDev:
      weeklyVariance === null ? null : Math.sqrt(weeklyVariance),
  };
}

export function summarizeFacilityFillRates(
  rows: FillRateStateRow[]
): Map<string, FillRateSummary> {
  const facilityIds = Array.from(
    new Set(rows.map((row) => String(row.facility_id)))
  );
  return new Map(
    facilityIds.map((facilityId) => [
      facilityId,
      summarizeFillRate(
        rows.filter((row) => String(row.facility_id) === facilityId)
      ),
    ])
  );
}
