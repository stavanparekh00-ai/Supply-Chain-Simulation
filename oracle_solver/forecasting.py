"""
Python port of simulation/lib/forecasting.ts -- the exact fixed menu of
forecasting methods offered to human players. The rolling Oracle picks from
this same menu (see oracle_rolling.py), never a method players don't have
access to, so the "identical information" fairness principle in
shared_schema/README.md holds for forecasting choice too, not just demand
visibility.
"""

import math
from typing import Callable, Dict, List

METHOD_IDS = ["naive", "ma_2", "ma_3", "ma_4", "weighted_ma", "exp_smoothing"]


def _js_round(x: float) -> int:
    """Round-half-up, matching JavaScript's Math.round."""
    return math.floor(x + 0.5)


def _moving_average(history: List[float], window: int) -> int:
    window_slice = history[-window:]
    return _js_round(sum(window_slice) / len(window_slice))


def compute_forecast(method_id: str, history: List[float]) -> int:
    if len(history) == 0:
        return 0

    if method_id == "naive":
        return _js_round(history[-1])

    if method_id == "ma_2":
        return _moving_average(history, 2)

    if method_id == "ma_3":
        return _moving_average(history, 3)

    if method_id == "ma_4":
        return _moving_average(history, 4)

    if method_id == "weighted_ma":
        weights = [3, 2, 1]  # most recent period weighted highest
        window = history[-len(weights):]
        aligned_weights = weights[len(weights) - len(window):]
        weighted_sum = sum(v * w for v, w in zip(window, aligned_weights))
        return _js_round(weighted_sum / sum(aligned_weights))

    if method_id == "exp_smoothing":
        alpha = 0.3
        s = history[0]
        for v in history[1:]:
            s = alpha * v + (1 - alpha) * s
        return _js_round(s)

    raise ValueError(f"Unknown forecasting method: {method_id}")
