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

### Order quantities must be integers (modeling decision, not a rounding preference)

Order quantities are required to be whole numbers — this makes the per-period ordering model an **integer program**, not a pure LP. This is a different, safer kind of integrality than the MOQ binary that was dropped earlier: MOQ created a *disjunctive* feasible region (0, or ≥ MOQ, with a gap in between) that could genuinely conflict with the diversification cap. Plain integer-valued quantities don't have that problem — the feasible region is still one connected range, just restricted to whole numbers, so this doesn't reopen the earlier MOQ conflict.

**Practical consequence for the LP relaxation shown below:** the continuous (LP-relaxation) optimum is *not* the final answer — naively rounding it can produce an infeasible or suboptimal result (see below), so the integer program must be solved directly.

### LP relaxation (continuous, for reference only)

| Supplier | LP-Relaxed Quantity |
|---|---|
| Domestic Fab | 67.5 |
| Regional Partner | 120 |
| Overseas Manufacturer | 62.5 |
| **Total / Cost** | **250 / $4,072.50** |

Naively rounding this (e.g. Overseas 62.5 → 63) is unsafe: 63 units out of a 250 total is 25.2%, which **violates** the 25% diversification cap. Rounding must respect the constraints jointly, not each number independently — which is exactly why the integer program needs to be solved directly rather than post-hoc rounded.

### Verified integer-optimal solution

Solved as a genuine integer program (verified via `scipy.optimize.milp`, independent of the eventual PuLP implementation):

| Supplier | Order Quantity | Notes |
|---|---|---|
| Domestic Fab | **68 units** | Rounds up from the LP relaxation to keep the total at exactly 250 once Overseas rounds down |
| Regional Partner | **120 units** | At its capacity ceiling (binding), unchanged from the LP relaxation |
| Overseas Manufacturer | **62 units** | Rounds *down* from 62.5 — rounding up would violate the 25% diversification cap |
| **Total** | **250 units** | Exactly meets the k=4 requirement (binding) |

**Total procurement cost: $4,074.00** ($18×68 + $16×120 + $15×62) — only $1.50 more than the continuous LP relaxation's $4,072.50, a negligible "integrality gap" at this scale.

Binding (tight) constraints: Regional's capacity, the Overseas diversification cap (62/250 = 24.8%, just under the 25% ceiling — 63 would have exceeded it), and the k=4 checkpoint. Non-binding (slack): the k=1 requirement (68 ≫ 25) and the k=3 requirement (188 vs. required 175).

**Caveat:** this figure reflects only the procurement-cost-minimizing integer solution subject to the feasibility constraints; it does not fully account for the projected-holding-cost term (Term 2 of the objective) across the k=1-4 window, which could shift the true optimum by a small amount. The solver's actual output should match this solution's *qualitative structure* exactly (Regional capacity-bound, Overseas diversification-bound just under its cap, Domestic making up the residual, all quantities whole numbers) and should be very close in magnitude — meaningful divergence from this structure, not just small numeric differences, is the signal to investigate a bug.

### Sensitivity analysis implication

Because order quantities are now integer-constrained, classical LP dual values (shadow prices) aren't strictly rigorous for the per-period stage anymore, the same caveat that applied when MOQ was still in the model. In practice this barely matters here — the integrality gap is only $1.50 out of $4,074, so the LP relaxation's dual values remain a very good *approximate* sensitivity signal. The parameter-sweep re-optimization method (already the primary recommended approach) is unaffected and gives the fully correct answer regardless of integrality.

### How to use this test case once the solver exists

Assert that, given this exact input state, the solver's per-period ordering model returns **integer** order quantities matching this exact structure (Domestic=68, Regional=120, Overseas=62), with total procurement cost within a small tolerance of $4,074.00.
