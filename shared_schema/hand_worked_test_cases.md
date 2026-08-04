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

---

## Test Case 2 — Facility F3, Period (Week) 1, With a Real Computed Forecast

Unlike Test Case 1 (which assumed a flat forecast for simplicity), this case walks through actually computing the forecast from historical data, and uses a lower-demand facility to exercise a different binding constraint.

### Step 1: Historical demand data (input)

F3 serves customers C3 and C5:

| Week | -7 | -6 | -5 | -4 | -3 | -2 | -1 | 0 |
|---|---|---|---|---|---|---|---|---|
| C3 | 25 | 23 | 28 | 21 | 21 | 24 | 29 | 26 |
| C5 | 30 | 24 | 27 | 30 | 31 | 32 | 27 | 29 |
| **F3 total** | 55 | 47 | 55 | 51 | 52 | 56 | 56 | 55 |

### Step 2: Forecast computed (3-period moving average)

Average of the last 3 known weeks (-2, -1, 0) = (56+56+55)/3 = 55.67 → **rounded to 56 units/week**, held flat across all future checkpoints.

### Step 3: Checkpoint requirements

Same starting inventory (100) and floor (50) as Test Case 1, forecast=56:

| Checkpoint | Suppliers counted | Requirement |
|---|---|---|
| k=1 | Domestic only | Domestic ≥ 6 |
| k=3 | Domestic + Regional (dominates k=2) | Dom+Reg ≥ 118 |
| k=4 | All three | Total ≥ 174 |

### Step 4: Verified integer-optimal order quantities

Solved as an integer program (verified via `scipy.optimize.milp`):

| Supplier | Order Quantity | Binding constraint |
|---|---|---|
| Domestic Fab | **44 units** | Residual (not itself binding) |
| Regional Partner | **87 units** | Exactly 50% of total — its **diversification cap**, not its 120-unit capacity |
| Overseas Manufacturer | **43 units** | 24.7% of total — just under its 25% diversification cap |
| **Total** | **174 units** | Exactly meets the k=4 requirement |

**Total procurement cost: $2,829.00**

### Why this test case matters alongside Test Case 1

Test Case 1 (higher-demand F1) had Regional Partner bound by its **absolute capacity** (120 units, hit its ceiling). This case (lower-demand F3) has Regional bound instead by its **percentage diversification cap** (50% of a smaller total, never approaching its 120-unit capacity). A correct solver implementation should reproduce this shift in which constraint binds as demand scale changes — if a future implementation always shows the same constraint binding regardless of facility scale, that's a signal to investigate a bug. Also notably, unlike Test Case 1, no "inflate the total order beyond the bare minimum" behavior was needed here to accommodate the diversification caps — everything fits naturally at the minimum feasible total.

### How to use this test case once the solver exists

Assert that, given F3's historical demand and this exact input state, the solver (a) computes the same 3-period moving average forecast (56/week), and (b) returns integer order quantities matching this structure (Domestic=44, Regional=87 at exactly 50% of total, Overseas=43), with total procurement cost within a small tolerance of $2,829.00.

---

## Test Case 3 — Facility F1, Weeks 1-5, Full Multi-Week Rolling-Horizon Trace

Unlike Test Cases 1 and 2 (single-period snapshots), this case walks the full rolling-horizon mechanics forward through 5 weeks: forecast recomputed each week from growing revealed history, existing pipeline tracked and factored into checkpoint requirements, and actual (not forecasted) demand used to update on-hand/backlog via the realized-cost recursion. Extended to Week 4 specifically to exercise the tariff-spike disruption.

### Week-by-week results

| Week | Forecast | Domestic | Regional | Overseas | Total Ordered | Overseas Landed Cost | On-Hand (start) | Arriving | Actual Demand | On-Hand (end) | Backlog |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 74 | 65 | 120 | 61 | 246 | $15 | 100 | 65 | 76 | 89 | 0 |
| 2 | 75 | 20 | 40 | 20 | 80 | $15 | 89 | 140 | 85 | 144 | 0 |
| 3 | 80 | 27 | 52 | 26 | 105 | $15 | 144 | 67 | 80 | 131 | 0 |
| 4 | 80 | 40 | 40 | **0** | 80 | **$20 (tariff spike)** | 131 | 153 | 71 | 213 | 0 |
| 5 | 79 | 18 | 33 | 16 | 67 | $15 | 213 | 78 | 85 | 206 | 0 |

### Key findings

- **Week 1's forecast (74) differs slightly from Test Case 1's assumed flat 75** because this trace computes the forecast live via 3-period moving average on real historical data, rather than assuming a round number for simplicity. This is expected and not a discrepancy to "fix."
- **Weeks 2-3 order far less than Week 1** because the large cold-start order is still arriving through the pipeline (Regional's 120 units land in Week 2; Overseas's 61 units are en route to land in Week 4), so less new ordering is needed to stay above the floor.
- **Week 4's Overseas order drops to exactly zero — the headline finding.** During the tariff spike, Overseas's landed cost rises from $15 to $20, making it temporarily *more expensive than Domestic ($18)*. The model correctly shifts the entire order to Domestic and Regional that week rather than continuing to use the now-worse option. This is precisely the behavior the tariff-spike disruption was designed to test.
- **On-hand inventory stays within [50, 400] the entire trace and backlog never exceeds zero** — the model remains feasible throughout using real (not forecasted) demand for scoring.

### How to use this test case once the solver exists

Run the solver across weeks 1-5 for Facility F1 with these exact inputs (starting inventory 100, the given historical/actual demand, the tariff-spike disruption active only in week 4) and assert: (a) the week-by-week order quantities match this table's structure, (b) Overseas drops to 0 specifically in week 4, and (c) on-hand/backlog trace matches within a small tolerance.

---

## Test Case 6 — Oracle vs. Naive Heuristic: When Does Backlog Actually Occur?

This test case answers a question raised during design discussion: does the Week 6 demand-spike disruption (Facility F3, C5 +50%) ever actually produce backorders? The answer depends entirely on *who* is deciding, not on the disruption's severity alone.

### Finding 1: widening demand noise from ±20% to ±50% did not, by itself, produce backlog

Against an Oracle-quality (full 4-week checkpoint lookahead) decision-maker, neither the original ±20% noise band nor a widened ±50% band was sufficient to cause backlog during the Week 6 spike. The checkpoint-based ordering discipline is structurally robust to demand noise magnitude, within reasonable bounds — this is a feature of the model, not a data-tuning problem to fix by cranking up noise further. **The demand data was still updated to ±50% (kept as the new standard) since it makes disruptions feel more consequential even without triggering backlog outright.**

### Finding 2: a genuinely naive decision-maker (no forward lookahead, no safety-buffer concept) does backorder

Two heuristic variants were tested against the identical demand and disruption data as the Oracle:

- **Floor-aware myopic heuristic** (plans only 1 week ahead, but still targets the 50-unit floor): dipped *below* its own floor in Week 1, but never triggered true backlog through Week 6.
- **No-floor naive heuristic** (reacts only to the forecast, no safety-buffer concept at all — `shortfall = max(0, forecast - on_hand)`): genuinely backordered, twice.

### Full comparison: Oracle vs. no-floor naive heuristic (Facility F3, Weeks 1-6)

**Oracle (full 4-week lookahead):**

| Week | Ordered (Total) | On-Hand (end) | Backlog |
|---|---|---|---|
| 1 | 130 | 82 | 0 |
| 2 | 63 | 108 | 0 |
| 3 | 64 | 113 | 0 |
| 4 | 42 | 137 | 0 |
| 5 | 51 | 136 | 0 |
| 6 (demand spike) | 43 | 105 | **0** |

**No-floor naive heuristic:**

| Week | Ordered (Total) | On-Hand (end) | Backlog |
|---|---|---|---|
| 1 | 0 | 49 | 0 |
| 2 | 0 | 0 | **7** |
| 3 | 72 | 1 | 0 |
| 4 | 70 | 3 | 0 |
| 5 | 68 | 3 | 0 |
| 6 (demand spike) | 65 | 0 | **14** |

### Why this matters for the project's central thesis

The naive heuristic backorders **twice** — once in Week 2 from ordinary forecast error alone (no disruption needed), and again, *worse* (14 vs. 7 units), specifically during the real disruption. The Oracle never backorders once on the identical demand data. This is exactly the kind of comparison the human case study is designed to surface: the value of disciplined, forward-looking decision-making isn't just lower cost — it's the difference between never stocking out and stocking out twice, with the gap widening specifically under disruption. This is a strong candidate for a headline finding once real human playthrough data exists to compare against this same naive baseline.

### How to use this test case once the solver and simulation exist

Implement the no-floor naive heuristic as one of the automated "player" stand-ins (per the many-runs harness plan), run it against the Oracle on identical scenario data, and assert that the naive heuristic's backlog is non-zero at least at Week 6, while the Oracle's remains zero throughout.
