"""
Newsvendor-style safety margin for the rolling Oracle's checkpoint target.

Why this exists: with holding_cost_per_unit_per_week=2 and
backorder_cost_per_unit_per_week=20, ordering to hit the raw point forecast
exactly is not cost-minimizing whenever there's real demand variance --
that's the classical newsvendor result. The cost-minimizing order-up-to
level for demand ~ Normal(mean, sigma) is:

    Q* = mean + z * sigma,   z = Phi^-1( backorder_rate / (holding_rate + backorder_rate) )

Here that critical fractile is 20/(20+2) = 0.9091, i.e. z ~= 1.335 --
roughly the 91st percentile of demand, not the 50th (the forecast alone).
z is computed numerically (bisection on the standard normal CDF via
math.erf) rather than hardcoded, so it stays correct if the cost rates
ever change.

sigma is estimated per facility, per week, from the SAME revealed-history
window the forecast itself uses (no lookahead: only weeks already played
out), assuming customer demands are independent (their stddevs combine as
sqrt(sum of variances)). For a k-week cumulative checkpoint, the combined
stddev scales as sigma * sqrt(k) (variance of k i.i.d. weeks sums).
"""

import math
import statistics
from typing import List


def _standard_normal_cdf(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def inverse_normal_cdf(p: float) -> float:
    if not (0 < p < 1):
        raise ValueError("p must be strictly between 0 and 1")
    lo, hi = -8.0, 8.0
    for _ in range(100):
        mid = (lo + hi) / 2
        if _standard_normal_cdf(mid) < p:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def critical_fractile_z(holding_rate: float, backorder_rate: float) -> float:
    fractile = backorder_rate / (holding_rate + backorder_rate)
    return inverse_normal_cdf(fractile)


def demand_stddev(history: List[float]) -> float:
    if len(history) < 2:
        return 0.0
    return statistics.pstdev(history)
