"""
Forecasting-method selection for the rolling Oracle, per the design brief
Section 6.2: "The Oracle backtests every method in the same fixed menu
against the available historical demand data and selects whichever
produced the lowest historical error, then commits to that choice for the
full run." Because the Oracle picks from the SAME menu offered to players
(forecasting.py, ported 1:1 from simulation/lib/forecasting.ts), any
advantage it gets is from disciplined selection, not a hidden technique.

Selection is done ONCE, globally, before any facility/network is
considered: each customer's historical_demand_last_20_weeks is fixed
regardless of which facilities end up open, so there's no need (and no
correctness reason) to redo this per network.
"""

from typing import Dict, List, Tuple

from forecasting import METHOD_IDS, compute_forecast
from scenario import ScenarioData

# Backtest starting index: guarantees every method (including ma_4, which
# needs 4 points) has enough history for a fair, identical-length comparison
# across all 6 candidate methods.
BACKTEST_START = 4


def method_backtest_mae(history: List[float]) -> Dict[str, float]:
    """One-step-ahead MAE for every candidate method against a single
    demand history, walking forward from BACKTEST_START."""
    scores: Dict[str, float] = {}
    for method_id in METHOD_IDS:
        errors = []
        for i in range(BACKTEST_START, len(history)):
            forecast = compute_forecast(method_id, history[:i])
            errors.append(abs(forecast - history[i]))
        scores[method_id] = sum(errors) / len(errors) if errors else float("inf")
    return scores


def select_best_forecasting_method(data: ScenarioData) -> Tuple[str, Dict[str, float]]:
    """Aggregate MAE across all 6 customers (summed error / summed count,
    matching how the app applies one locked-in method uniformly across
    every customer for the whole run), returns (best_method_id, all_scores)."""
    total_error: Dict[str, float] = {m: 0.0 for m in METHOD_IDS}
    total_count: Dict[str, int] = {m: 0 for m in METHOD_IDS}

    for customer in data.customers:
        history = customer.historical_demand_last_20_weeks
        for method_id in METHOD_IDS:
            for i in range(BACKTEST_START, len(history)):
                forecast = compute_forecast(method_id, history[:i])
                total_error[method_id] += abs(forecast - history[i])
                total_count[method_id] += 1

    aggregate_mae = {
        m: (total_error[m] / total_count[m] if total_count[m] else float("inf"))
        for m in METHOD_IDS
    }
    best = min(aggregate_mae, key=aggregate_mae.get)
    return best, aggregate_mae
