/**
 * Forecasting methods -- the fixed menu available to both the player and
 * (eventually) the Oracle. Every method takes only past/revealed demand
 * history and returns a single forecast value, held flat for future
 * checkpoints since none of these methods model a trend.
 */

export type ForecastingMethodId =
  | "naive"
  | "ma_2"
  | "ma_3"
  | "ma_4"
  | "weighted_ma"
  | "exp_smoothing";

export function computeForecast(methodId: ForecastingMethodId, history: number[]): number {
  if (history.length === 0) return 0;

  switch (methodId) {
    case "naive":
      return Math.round(history[history.length - 1]);

    case "ma_2":
      return movingAverage(history, 2);

    case "ma_3":
      return movingAverage(history, 3);

    case "ma_4":
      return movingAverage(history, 4);

    case "weighted_ma": {
      const weights = [3, 2, 1]; // most recent period weighted highest
      const window = history.slice(-weights.length);
      // pad if history shorter than weights (shouldn't happen given 8-week seed history)
      const alignedWeights = weights.slice(weights.length - window.length);
      const weightedSum = window.reduce((sum, v, i) => sum + v * alignedWeights[i], 0);
      const weightSum = alignedWeights.reduce((a, b) => a + b, 0);
      return Math.round(weightedSum / weightSum);
    }

    case "exp_smoothing": {
      const alpha = 0.3;
      let s = history[0];
      for (let i = 1; i < history.length; i++) {
        s = alpha * history[i] + (1 - alpha) * s;
      }
      return Math.round(s);
    }

    default:
      throw new Error(`Unknown forecasting method: ${methodId}`);
  }
}

function movingAverage(history: number[], window: number): number {
  const slice = history.slice(-window);
  return Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
}

export const FORECASTING_METHODS: { id: ForecastingMethodId; name: string; description: string }[] = [
  { id: "naive", name: "Naive (Last Period)", description: "Assumes next period equals the most recent known period." },
  { id: "ma_2", name: "2-Period Moving Average", description: "Average of the last 2 periods." },
  { id: "ma_3", name: "3-Period Moving Average", description: "Average of the last 3 periods." },
  { id: "ma_4", name: "4-Period Moving Average", description: "Average of the last 4 periods." },
  { id: "weighted_ma", name: "Weighted Moving Average", description: "Last 3 periods, with more recent periods weighted higher (3:2:1)." },
  { id: "exp_smoothing", name: "Exponential Smoothing", description: "Weights all history, with exponentially decaying influence for older periods." },
];
