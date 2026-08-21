# Supply Chain Decision Simulation

A 10-week supply chain planning exercise, paired with a from-scratch MILP
solver benchmark that plays by the exact same rules a human does.

**Try it live: [supply-chain-simulation-nu.vercel.app](https://supply-chain-simulation-nu.vercel.app)**

## The problem

You're planning a facility network and weekly procurement for a
microcontroller manufacturer: which of 5 candidate facilities to open,
which of 3 suppliers to buy from (different cost/speed/reliability
tradeoffs), and how much to order every week for 10 weeks -- under
uncertain demand and scripted disruptions (a tariff spike, correlated
demand surges, a supplier capacity cut). Every decision is scored against
a real cost model: fixed facility cost, transport, procurement, holding,
and backorder cost.

## The benchmark, and why it's harder than it sounds

The natural instinct is to build an optimizer with perfect knowledge of
the future and call it the "ideal" answer. That's not what this is --
and deliberately so. A solver that gets to see next week's demand before
deciding this week's order isn't proving anything about good decision-making,
just that hindsight is powerful.

The MILP Solver here (`oracle_solver/`) makes every decision -- network
design, forecasting method, and every week's order -- using **only
information available at the moment that decision has to be made**,
exactly like a player:

- **Network design**: chosen from static fixed + transport cost, filtered
  to networks where suppliers can realistically keep up with demand once
  true lead-time ramp-up is accounted for (nothing arrives before week 2
  here) -- never by simulating candidates forward and picking whichever
  scored best in hindsight.
- **Forecasting method**: backtested against historical demand only, the
  same menu and the same pre-simulation data a player sees.
- **Weekly ordering**: a checkpoint-based rolling MILP with a newsvendor
  safety margin, re-solved fresh every week using only what's already
  known -- current inventory, current backlog, and forecasted demand.

Enforcing this honestly took several iterations documented in
[`oracle_solver/README.md`](./oracle_solver/README.md) -- including
catching and removing more than one subtle lookahead violation that crept
in during development (e.g. picking a network by comparing candidates'
*realized* 10-week outcomes, which uses information that wouldn't
actually be available yet).

## Results

| | Total cost | vs. solver |
|---|---|---|
| **MILP Solver** | $681,295 | -- |
| Live community average (12 real + competent test runs) | ~$815,700 | +20% |

Even disciplined, well-executed play consistently lands short of the true
optimum -- which is the point: the gap is real, not an artifact of a
strawman comparison. The live app's **"How the MILP Solver Was Built"**
tab breaks down the full objective function, every constraint (with its
actual equation), and a few concrete findings from testing the model
against different sourcing and network strategies.

## What this demonstrates

- Operations research: MILP formulation, newsvendor safety stock, rolling
  no-lookahead optimization under uncertainty.
- Rigor under self-scrutiny: the no-lookahead constraint was tightened
  multiple times after finding it had been subtly violated -- verified,
  not just asserted.
- Full-stack engineering: Next.js + Postgres (Neon) + Vercel, a real
  multi-step decision flow, live constraint enforcement, and a results
  page that explains its own benchmark's math to a non-technical reader.

## Repo structure

- [`oracle_solver/`](./oracle_solver) -- the standalone Python solver
  (the portfolio piece). Runnable independently of the web app.
- [`simulation/`](./simulation) -- the participant-facing Next.js app. See
  [`simulation/README.md`](./simulation/README.md) for local setup and
  deployment.
- [`shared_schema/`](./shared_schema) -- the common data contract both
  sides use, plus hand-worked test cases.
- [`docs/`](./docs) -- the original project design brief.
