import { ScenarioData } from "@/lib/scenarioData";
import { ForecastingMethodId, FORECASTING_METHODS } from "@/lib/forecasting";
import { forecastFacilityDemand } from "@/lib/gameEngine";

export interface ForecastAccuracyPoint {
  week: number;
  facilityId: string;
  forecast: number;
  actual: number;
  error: number;
  absError: number;
  squaredError: number;
}

export interface ForecastAccuracySummary {
  methodId: string;
  methodName: string;
  observations: number;
  mae: number;
  mse: number;
  rmse: number;
  mapePct: number | null;
  bias: number;
  byWeek: { week: number; forecast: number; actual: number; absError: number }[];
  points: ForecastAccuracyPoint[];
}

/**
 * Reconstruct the facility-level forecasts the player saw at decision time,
 * then score them against the realized facility demand already stored in
 * period_state.actual_demand.
 */
export function scoreForecastAccuracy(
  data: ScenarioData,
  openedFacilities: string[],
  methodId: ForecastingMethodId,
  periodRows: { week: number | string; facility_id: string; actual_demand: number | string }[]
): ForecastAccuracySummary {
  const points: ForecastAccuracyPoint[] = [];

  for (const row of periodRows) {
    const week = Number(row.week);
    const facilityId = String(row.facility_id);
    const actual = Number(row.actual_demand);
    const { forecast } = forecastFacilityDemand(data, openedFacilities, facilityId, week, methodId);
    const error = forecast - actual;
    points.push({
      week,
      facilityId,
      forecast,
      actual,
      error,
      absError: Math.abs(error),
      squaredError: error * error,
    });
  }

  const n = points.length;
  const mae = n === 0 ? 0 : points.reduce((sum, p) => sum + p.absError, 0) / n;
  const mse = n === 0 ? 0 : points.reduce((sum, p) => sum + p.squaredError, 0) / n;
  const rmse = Math.sqrt(mse);
  const bias = n === 0 ? 0 : points.reduce((sum, p) => sum + p.error, 0) / n;

  const mapeEligible = points.filter((p) => p.actual !== 0);
  const mapePct =
    mapeEligible.length === 0
      ? null
      : (mapeEligible.reduce((sum, p) => sum + p.absError / p.actual, 0) / mapeEligible.length) * 100;

  const weeks = Array.from(new Set(points.map((p) => p.week))).sort((a, b) => a - b);
  const byWeek = weeks.map((week) => {
    const weekPoints = points.filter((p) => p.week === week);
    return {
      week,
      forecast: weekPoints.reduce((sum, p) => sum + p.forecast, 0),
      actual: weekPoints.reduce((sum, p) => sum + p.actual, 0),
      absError: weekPoints.reduce((sum, p) => sum + p.absError, 0),
    };
  });

  const methodName =
    FORECASTING_METHODS.find((m) => m.id === methodId)?.name ?? methodId;

  return {
    methodId,
    methodName,
    observations: n,
    mae,
    mse,
    rmse,
    mapePct,
    bias,
    byWeek,
    points,
  };
}
