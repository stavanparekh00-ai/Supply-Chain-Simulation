# Hand-Worked Test Cases

Reference solutions computed independently of any solver implementation,
used to validate the Oracle's per-period ordering model (and later stages)
once built. Each case is verified numerically here (via `scipy.optimize.linprog`
as an independent check, not the eventual PuLP implementation) so the
expected answer itself is trustworthy before any solver code exists.

---

## Test Case 1 — Facility F1, Period (Week) 1, Cold-Start Ordering Decision

### Setup

- **Facility:** F1 (one of the three opened in the network design stage)
- **Forecasted demand:** flat 75 units/week (F1 = C1 + C2 baseline demand, 30 + 45)
- **Minimum inventory floor:** 50 units
- **Starting on-hand inventory (week 1, before any order):** 100 units
- **No existing pipeline, no existing backlog** (this is the very first period)
- **No disruption active this period**

| Supplier | Landed Unit Cost | Lead Time | Capacity (this facility) | Diversification Cap |
|---|---|---|---|---|
| Domestic Fab | $18 | 1 week | 150/week | 70% |
| Regional Partner | $16 | 2 weeks | 120/week | 50% |
| Overseas Manufacturer | $15 | 4 weeks | 100/week | 25% |

### Important finding this test case revealed

**A true zero-inventory cold start is infeasible.** With `initial_on_hand_inventory_units = 0`, the Week-3 checkpoint requires 275 units of cumulative supply from only the two fastest suppliers (Domestic + Regional, since Overseas hasn't arrived by week 3) — but their combined capacity caps out at 150 + 120 = 270 units. **This is infeasible regardless of cost**, not just expensive. This is why `initial_on_hand_inventory_units = 100` was added to `scenario_data.json` — it wasn't an oversight to skip, it's a load-bearing parameter the model cannot function without, given the fast-supplier capacity limits already locked in.

### Checkpoint requirements (with starting inventory = 100)

| Checkpoint | Suppliers counted (lead time ≤ k) | Cumulative demand + floor | Minus starting inventory | Requirement |
|---|---|---|---|---|
| k=1 | Domestic only | 75(1)+50 = 125 | −100 | Domestic ≥ 25 |
| k=2 | Domestic + Regional | 75(2)+50 = 200 | −100 | Dom+Reg ≥ 100 |
| k=3 | Domestic + Regional | 75(3)+50 = 275 | −100 | **Dom+Reg ≥ 175** (dominates k=2) |
| k=4 | All three | 75(4)+50 = 350 | −100 | Dom+Reg+Over ≥ 250 |

### Reasoning toward the optimal answer

Overseas is the cheapest supplier ($15), so the solver wants to use as much of it as possible — but it can't help meet the k=1 or k=3 checkpoints (it hasn't arrived yet by week 3), so those must be met entirely by Domestic and Regional. Within that fast-supplier budget, Regional ($16) is preferred over Domestic ($18) wherever capacity allows.

The naive "just meet k=3 and k=4's minimums directly" allocation (Domestic=55, Regional=120, Overseas=75) **violates the diversification cap**: 75 units of Overseas out of a 250 total is 30%, exceeding its 25% ceiling. This forces the solver to buy *more than the bare minimum* from the fast suppliers, specifically to raise the total order size enough that Overseas's fixed 25% share can still cover what's needed at k=4 — a real, non-obvious tension between the lead-time checkpoint constraint and the risk-diversification constraint.

### Verified optimal solution

| Supplier | Order Quantity | Notes |
|---|---|---|
| Domestic Fab | **67.5 units** | Above its own k=1 minimum (25); makes up the balance needed once Regional is capped |
| Regional Partner | **120 units** | At its capacity ceiling (binding) |
| Overseas Manufacturer | **62.5 units** | Exactly 25% of the 250 total (diversification cap binding) |
| **Total** | **250 units** | Exactly meets the k=4 requirement (binding) |

**Total procurement cost: $4,072.50** ($18×67.5 + $16×120 + $15×62.5)

Binding (tight) constraints: Regional's capacity, the Overseas diversification cap, and the k=4 checkpoint. Non-binding (slack): the k=1 requirement (67.5 ≫ 25) and the k=3 requirement (187.5 vs. required 175).

**Caveat:** this figure reflects only the procurement-cost-minimizing solution subject to the feasibility constraints; it does not fully account for the projected-holding-cost term (Term 2 of the objective) across the k=1-4 window, which could shift the true LP optimum by a small amount. The solver's actual output should match this solution's *qualitative structure* exactly (Regional capacity-bound, Overseas diversification-bound, Domestic making up the residual) and should be very close in magnitude — meaningful divergence from this structure, not just small numeric differences, is the signal to investigate a bug.

### How to use this test case once the solver exists

Assert that, given this exact input state, the solver's per-period ordering model returns order quantities matching the structure above (Regional at 120, Overseas at exactly 25% of its own total order, Domestic making up the rest), with total procurement cost within a small tolerance of $4,072.50.
