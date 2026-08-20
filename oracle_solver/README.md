# Oracle Solver (standalone, not yet wired into the simulation)

A PuLP-based rolling, no-lookahead solver, loading the same
`shared_schema/scenario_data.json` the live simulation loads for players.
**Not imported by or merged into `simulation/`** -- this is a standalone,
independently runnable and testable package, per the top-level README's
framing of the Oracle Solver as its own deliverable.

## Run it

```bash
cd oracle_solver
pip install -r requirements.txt
python3 main.py              # THE Oracle answer: genuinely no-lookahead, one committed path
python3 full_comparison.py   # hindsight/sensitivity tool: all 25 networks x 6 methods, for context only
```

## What it is, and why it has to work this way

This is meant to eventually benchmark a human player, so it has to play by
the same rules a player does at EVERY decision point, not just the weekly
ordering ones: **it never sees next week's demand before deciding this
week's order, and it never sees how a choice will pan out before making
that choice.** Three decisions, each made with only what's knowable at the
time:

1. **Network design** -- chosen from static fixed + transport cost alone
   (`network.py:cheapest_static_network`), exactly the numbers the network
   design page shows a player. No ordering-cost simulation is run across
   candidate networks to inform this choice -- a player can't preview that
   either before committing.
2. **Forecasting method** -- backtested once against pre-simulation
   historical demand (`forecasting_selection.py`), the same "last 20
   weeks" chart a player sees on the forecast page before locking in.
3. **Weekly orders** -- decided one week at a time (`oracle_rolling.py`),
   using only state carried over from previous weeks, its own pipeline of
   not-yet-arrived past orders, this week's revealed disruptions, and a
   forecast built only from revealed history.

Actual demand is revealed only *after* each order is committed, purely to
score what already happened via the same realized-cost recursion the live
app uses (`recursion.py`).

**An earlier version of this solver picked the network (and cross-checked
the forecasting method) by simulating every candidate all the way through
the 10 weeks and picking whichever realized the lowest total cost.** That
is itself a lookahead violation: it uses the actual future demand outcome
to make a decision that has to be made before that future is known, even
though the per-week ordering decisions inside each simulation were
already honest. That comparison is still useful as a hindsight/sensitivity
tool (`full_comparison.py`) but is explicitly labeled as NOT the Oracle's
answer. (A separate earlier perfect-foresight mode, which saw the whole
10-week demand path before deciding anything at all, was removed entirely
for the same reason -- see git history.)

## The model

### Network design (`network.py:cheapest_static_network`)

Same deterministic cheapest-open-facility assignment rule as the live app:
each customer is served by whichever open facility is cheapest to ship to
(static `transport_cost_matrix`, baseline `weekly_demand`). Up to 3 of the
5 candidate facilities may be opened, matching the app's own
`MAX_OPEN_FACILITIES` rule. The network is chosen by minimizing
`fixed_cost + transport_cost`, restricted to networks that pass a static
feasibility check (`facility_demand_violations`). Both the cost
minimization and the feasibility check are pure functions of numbers
published before week 1 (facility fixed costs, the transport matrix,
baseline `weekly_demand`, and supplier `capacity_per_facility_per_week`),
so neither is a lookahead violation, unlike comparing candidates by their
REALIZED 10-week cost (see "What it is" above).

**The feasibility check itself, and its history through three iterations:**

1. **v1 -- fastest supplier alone must cover average demand.** Required a
   facility's FASTEST supplier (shortest lead time -- `domestic_fab`,
   900/week) to cover its average demand, alone. Far too conservative: it
   rejected every single 2-facility network without exception, forcing a
   3-facility answer even though most 2-facility networks actually REALIZE
   LOWER cost than any 3-facility one. Wrong yardstick -- a facility never
   actually depends on its fastest supplier alone, since the per-week
   ordering LP already blends all three suppliers' lead times every week
   via its checkpoint mechanism (`rolling_ordering.py`).

2. **v2 -- total capacity must exceed demand by an empirically-calibrated
   margin.** Replaced "fastest supplier alone" with "total combined
   capacity (900+700+800 = 2400/week) >= demand x 1.5". The 1.5x came from
   comparing `total_capacity / max_facility_demand` against every
   candidate's REALIZED cost under skilled ordering and finding a clean
   gap between the one genuinely bad network (F1+F2, ratio 1.39, $1.03M
   even under skilled ordering) and the cheapest one that wasn't (F4+F5,
   ratio 1.68, $744,885). Better, but summing all three suppliers'
   capacity as if it were available starting week 1 silently assumes
   STEADY-STATE throughput, which overstates what's actually deliverable
   during ramp-up -- e.g. nothing at all arrives in week 1 here, since even
   the fastest supplier takes 2 weeks. This was flagged directly: "2400/wk
   might not be true, since the lead times are different" -- correct, and
   worth fixing properly rather than patching the multiplier.

3. **v3 -- current: exact lead-time-aware ramp-up bound, no calibration
   constant at all.** `max_sustainable_average_demand()` computes the
   actual physical upper bound on cumulative deliverable supply week by
   week -- ordering at full capacity from every supplier starting week 1,
   respecting each supplier's own `lead_time_weeks` for when that capacity
   can actually arrive -- and finds the single most binding week. In this
   scenario that's week 2 (only `initial_on_hand_inventory_units` plus the
   fastest supplier's first delivery has landed by then), capping
   sustainable average demand at **1,250/week**, well below the naive
   2,400/week steady-state total. This is derived directly from the
   model's own mechanics (lead times, capacities, initial inventory, all
   published pre-week-1 numbers) rather than approximated and tuned, so
   there's no arbitrary constant to justify or re-calibrate if the
   scenario's numbers change.

The practical effect of the v2->v3 fix: **F3+F4 (max facility demand 1,030)
passes comfortably; F1+F4 (max facility demand 1,280) -- v2's answer --
now correctly fails**, since 1,280 exceeds the 1,250 physical ceiling. The
Oracle's static-only reasoning now lands on **exactly** the hindsight-
optimal network -- see Results below.

With `fixed_cost_to_open` flat at $125,000/facility, minimizing
fixed+transport with NO feasibility check at all always prefers fewer
facilities, landing on a single facility -- e.g. F5 alone, which is
capacity-starved and realizes a catastrophic $1,141,010 (see the "Full
comparison" grid below, where every single-facility network scores over
$1.1M for exactly this reason). The feasibility check is what prevents
the static minimization from landing there.

### Forecasting method selection (`forecasting.py`, `forecasting_selection.py`)

Per the design brief Section 6.2: the Oracle backtests every method in the
same fixed 6-method menu players get (`forecasting.py`, a 1:1 port of
`simulation/lib/forecasting.ts`) against the pre-simulation historical
demand (20 weeks per customer, `historical_demand_last_20_weeks` --
already 20 in `scenario_data.json`; an "8-week" figure that came up is a
stale, unrelated comment in `simulation/lib/forecasting.ts`, not a real
data or solver limitation), picks whichever has the lowest one-step-ahead
MAE, and commits to that choice for the entire run -- exactly the same
one-time lock-in rule given to human participants. This is done once,
globally, independent of which network ends up chosen (each customer's
historical series doesn't depend on facility assignment).

### Per-week ordering decision (`rolling_ordering.py`)

Per `shared_schema/hand_worked_test_cases.md`'s checkpoint methodology:
feasibility/cost is evaluated at every checkpoint k = 1..max_lead_time,
using the flat forecast held constant across the window (none of the 6
menu methods model a trend). For checkpoint k:

```
supply_k        = pipeline arriving by week t+k-1  +  this week's order
                   (counting only suppliers whose lead time reaches k)
net_position_k  = (on_hand_start - backlog_start) + supply_k - forecast*k
overage_k       = max(0,  net_position_k)   -- projected on-hand at k
shortage_k       = max(0, -net_position_k)   -- projected backlog at k
overage_k <= max_inventory_ceiling_units     (HARD)
```

**Why the forecast-coverage requirement is priced, not a hard constraint:**
an earlier version made "cover the cumulative forecast" a hard lower bound.
That turned out to be genuinely infeasible on its own terms for several
networks: e.g. a facility serving all 6 customers can see a week-1 forecast
near ~2,000 units, but no supplier delivers within 1 week (fastest lead
time is 2), and even the 2-week checkpoint is capped by domestic_fab's
900/week capacity alone -- no order at any price can out-run that. A hard
requirement there wasn't "the Oracle is disciplined" (the trait
`hand_worked_test_cases.md` Test Case 6 actually documents), it was just
mathematically impossible, and made most networks report INFEASIBLE for a
reason that had nothing to do with decision quality. So `shortage_k` is
priced at `backorder_cost_per_unit_per_week` and `overage_k` at
`holding_cost_per_unit_per_week`, both summed across every checkpoint
(matching design brief Section 4.1's "projected holding cost and projected
backorder cost, summed across the full lead-time window -- not just the
next period"). **The inventory floor itself is not modeled at all** (removed
by explicit instruction); **the ceiling remains a genuine hard constraint.**

**Hard 60% supplier diversification cap:** no single supplier may supply
more than 60% of a facility's order in any week -- flat across all three
suppliers, a solver-only risk-management rule (`scenario.py:
HARD_SUPPLIER_SHARE_CAP`). This is explicitly **not** applied to players in
the live simulation, who only ever see `suggested_share_pct` /
`allocation_guidance` as soft, non-blocking guidance
(`decisions/route.ts`'s own comment: "Supplier share limits are soft
guidance only for players -- do not block submit"). It's also not the same
number as each supplier's individual `suggested_share_pct` (70/50/25),
which described risk-TIER guidance for humans, not the Oracle's own
risk-management policy.

**Newsvendor safety margin (`safety_stock.py`):** pricing overage/shortage
against the raw forecast (as above) implicitly targets only the 50th
percentile of demand -- but with `holding_cost_per_unit_per_week=2` and
`backorder_cost_per_unit_per_week=20`, that's provably not cost-minimizing
whenever there's real demand variance (this scenario has +/-75% weekly
noise). The classical newsvendor result: for demand ~ Normal(mean, sigma),
the cost-minimizing order-up-to level is `mean + z*sigma`, where
`z = Phi^-1(backorder_rate / (holding_rate + backorder_rate))` -- here the
critical fractile is 20/22 = 0.9091, i.e. z ~= 1.335 (roughly the 91st
percentile, not the 50th). So the checkpoint's cost-pricing target
(overage_k/shortage_k) is buffered up by `z * demand_stddev * sqrt(k)`,
where `demand_stddev` is the facility's combined per-week demand stddev,
estimated from customers' revealed history (same no-lookahead window the
forecast itself uses; customer demands assumed independent, so stddevs
combine as `sqrt(sum of variances)`). **The hard ceiling constraint is
still checked against the RAW, unbuffered forecast** -- the safety margin
only shifts the cost-pricing target, never weakens the physical ceiling.
Verified impact on the winning network (F1+F4+F5): backorder cost dropped
from $70,780 to $13,440, holding cost rose from $16,728 to $32,800,
procurement rose slightly (more ordered overall); net effect **-$25,388
(-3.1%)** on total cost. `use_safety_margin=False` reproduces the original
zero-margin behavior exactly, for comparison.

**Objective per week:** minimize procurement cost of this week's order plus
the summed holding/backorder proxy above (using the safety-buffered target).

**Why no MOQ constraint:** `shared_schema/README.md` documents that a
minimum-order-quantity constraint was considered and deliberately dropped
in favor of plain integer order quantities, because MOQ's disjunctive
feasible region (`{0} ∪ [MOQ, capacity]`) could genuinely conflict with the
diversification cap. This solver follows that same decision.

### After the decision: realized-cost recursion (`recursion.py`)

Once a week's order is committed, actual (disruption-adjusted) demand is
revealed and run through `recursion.py` -- a direct Python port of
`simulation/lib/recursion.ts`, the same accounting the live app itself
uses -- to produce next week's starting on-hand/backlog and this week's
true procurement/holding/backorder cost. This is what actually scores the
decision; the checkpoint model above only ever sees the forecast.

## Results

**`main.py` (the actual Oracle answer): network F3+F4, `exp_smoothing`
forecasting -- total cost $681,295** ($250,000 fixed + $10,170 transport +
$421,125 ordering, of which $377,275 is procurement, $22,390 holding,
$21,460 backorder). F3+F4 is the cheapest fixed+transport network among
those passing the lead-time-aware capacity feasibility check -- a genuine
**2-facility** answer.

**This is an exact match with `full_comparison.py`'s hindsight-optimal --
$0 gap.** The no-lookahead Oracle, reasoning only from information
published before week 1, lands on precisely the same network and method a
search with full 10-week hindsight would pick. That's the end state of the
network-design check's three iterations documented above: v1 (fastest-
supplier-alone) produced a 14.6% hindsight gap by wrongly forcing a
3-facility answer; v2 (capacity ratio, empirically calibrated) narrowed it
to 1.6% but still picked the wrong 2-facility network (F1+F4 instead of
F3+F4) because it overstated early-week deliverable supply; v3 (exact
ramp-up bound) closes the gap completely.

## Full comparison (`full_comparison.py`) -- hindsight/sensitivity tool, NOT the Oracle's answer

`main.py` makes one honest, no-lookahead pass. `full_comparison.py`
instead solves EVERY candidate network (all 25, 1-3 open facilities) x
every one of the 6 forecasting methods -- 150 combinations -- and prints
the full cost matrix, so you can see how much both network choice and
method choice actually matter, and where the true no-lookahead answer
sits within that range. It also cross-checks whether the backtest-chosen
method really was the best one for this scenario's actual outcome
(backtesting only ever sees pre-simulation history, so it's a prediction,
not a guarantee -- checked explicitly, and for this scenario it does
match: `exp_smoothing` is both the backtest winner and the
lowest-realized-cost winner for the hindsight-optimal network).

**`naive` is infeasible for 16 of the 25 networks.** Not a bug: `naive`
(this week's forecast = last week's actual) reacts violently to noisy
demand, placing a large order right after a demand spike; by the time that
order's pipeline arrives 2-3 weeks later demand has cooled off, and the
resulting projected inventory position breaches the hard ceiling in week
10 -- *even ordering zero that week* can't fix it, since it's forced
entirely by an earlier week's already-committed, no-longer-reversible
order. `full_comparison.py` diagnoses and prints exactly which
facility/week/checkpoint is unavoidably over, rather than silently
reporting `$inf`. This is itself a legitimate finding about
forecast-method risk, not just a missing data point. Single-facility
networks (F1..F5 alone) are so capacity/diversification-saturated every
week that the forecasting method stops mattering at all -- all 6 methods
land on the exact same cost for a given single facility.

## Verification (`verify_rolling.py`, run automatically by `main.py` and `full_comparison.py`)

For every feasible network: every week's order is re-checked against
capacity and the hard 60% diversification cap directly from the raw
output; ceiling/backlog sign conventions are re-checked the same way; and
the full committed order sequence is replayed from scratch through
`recursion.py`, confirming the resulting on-hand/backlog/cost trace matches
what the rolling walk-forward already computed (mainly guards against
state-carryover bugs in `oracle_rolling.py`'s loop).

## Data parity note

`shared_schema/schema.py`'s `actual_demand()` and
`demand_history_available_for_forecast()` return raw, un-spiked values. The
live simulation's TypeScript loader (`scenarioData.ts`) additionally applies
`demand_spike` disruption multipliers before a player ever sees them.
`scenario.py:actual_demand_with_disruptions` / `demand_history_for_forecast`
replicate that exact behavior in Python (including matching JavaScript's
round-half-up `Math.round`, which differs from Python's banker's-rounding
`round()` on exact .5 ties), so the Oracle is scored against precisely the
demand path -- and forecasts from precisely the history -- a participant
would actually face.

## Recent parameter changes reflected here

- `backorder_cost_per_unit_per_week`: 8 -> **20**
- `fixed_cost_to_open`: was $4,000-$7,000 varying per facility -> **$125,000
  for every facility**, updated in both `shared_schema/scenario_data.json`
  and `simulation/data/scenario_data.json`.
- `network_design_reference_solution` in `scenario_data.json` was
  re-brute-forced and updated for the new fixed cost.
- Minimum inventory floor: removed from the model entirely (ceiling still
  hard).
- Supplier diversification cap: flat 60% for every supplier (solver-only),
  replacing the earlier per-supplier `suggested_share_pct` (70/50/25) cap.
- Removed the earlier perfect-foresight solver mode entirely -- it saw the
  whole 10-week demand path in advance, which isn't a legitimate stand-in
  for what a player faces and was never wired into anything downstream.
- Added a newsvendor safety margin to the checkpoint target (see above).
- **Network design and forecasting method selection made genuinely
  no-lookahead**, per explicit instruction: `main.py` no longer picks
  whichever (network, method) combination realizes the lowest cost after
  simulating all of them -- it now picks the network from static
  fixed+transport cost alone and the method from historical backtest
  alone, then runs that ONE committed path. The hindsight-optimal result
  is now clearly relabeled as a sensitivity-analysis result in
  `full_comparison.py`, not the Oracle's answer.
- The static network-design feasibility check went through four
  iterations: (1) fastest-supplier-alone-must-cover-average-demand, tried
  then removed on the theory it might be a lookahead violation; (2)
  reinstated once removing it showed the static-cost minimizer collapses
  to a single, capacity-starved facility ($1,141,010); (3) recalibrated to
  "total capacity >= 1.5x average demand" (empirically tuned) after
  testing showed "fastest supplier alone" rejected every 2-facility
  network unconditionally, even ones realizing lower cost than the
  3-facility answer it forced; (4) **replaced the empirical ratio with an
  exact lead-time-aware ramp-up bound** (`max_sustainable_average_demand`)
  after being flagged that summing all suppliers' capacity as "2400/week"
  silently assumes steady-state throughput available from week 1, which
  isn't true once lead times differ -- no supplier delivers anything in
  week 1 here at all. The exact bound is 1,250/week (binding at week 2),
  not 1,600 (2400/1.5). See "Network design" above for the full
  derivation. Current answer: **F3+F4, exp_smoothing, $681,295** -- an
  EXACT match with the hindsight-optimal, $0 gap.
