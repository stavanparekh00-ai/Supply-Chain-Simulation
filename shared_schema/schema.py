"""
Shared data schema for the Supply Chain project.

This module is the ONE coordination point between the two independent
deliverables:
  1. The Oracle Solver (Phase 1 -- portfolio piece)
  2. The Simulation / Case Study (Phase 2 -- side project)

Both projects should import from this module (or copy it verbatim) rather
than each defining their own version of these shapes. This is what makes
the "identical information" fairness guarantee between the player and the
Oracle structurally provable rather than just claimed: if both sides load
the exact same `ScenarioData` object, there is no code path by which one
side could accidentally see something the other doesn't.

This module intentionally contains ONLY data shapes and a loader -- no
optimization logic, no simulation/game logic. That logic belongs in each
project's own codebase, not here.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional


# ---------------------------------------------------------------------------
# Suppliers
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Supplier:
    id: str
    name: str
    origin_country: str
    tier: str  # "High" | "Medium" | "Low"
    suggested_share_pct: float  # soft risk-tier guidance for players (e.g. 70 / 50 / 25)
    base_unit_cost: float
    baseline_tariff_pct: float  # 0 for domestic/nearshore suppliers with no tariff exposure
    lead_time_weeks: int
    reliability_pct: float
    defect_rate_pct: float
    capacity_per_facility_per_week: float

    def landed_unit_cost(self, tariff_pct_override: Optional[float] = None) -> float:
        """Unit cost including tariff. Pass tariff_pct_override during a Tariff
        Spike disruption to compute the temporarily-elevated landed cost."""
        tariff_pct = self.baseline_tariff_pct if tariff_pct_override is None else tariff_pct_override
        return self.base_unit_cost * (1 + tariff_pct / 100)


# ---------------------------------------------------------------------------
# Network Design (Stage 0)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class CandidateFacility:
    id: str
    name: str
    city: str
    map_x: float
    map_y: float
    fixed_cost_to_open: float


@dataclass(frozen=True)
class Customer:
    id: str
    name: str
    city: str
    map_x: float
    map_y: float
    weekly_demand: float
    historical_demand_last_20_weeks: List[float]
    actual_demand_ground_truth_by_week: List[float]
    """Fixed, frozen ground-truth demand for the simulation horizon (one value
    per week). Generated independently of any forecasting method so that
    every participant and every forecast choice is scored against the same
    underlying reality. This must never be exposed to a player or to the
    Oracle's decision-time logic before that week has actually played out --
    it exists here only for the realized-cost recursion (see the model doc,
    Section 4: "The Realized-Cost Recursion")."""


@dataclass(frozen=True)
class NetworkDesignRunnerUp:
    opened_facilities: List[str]
    total_cost: float
    note: str


@dataclass(frozen=True)
class NetworkDesignReferenceSolution:
    """Ground-truth answer to the Stage 0 facility-location problem, computed
    independently (brute-force verified). Use this to validate the Oracle's
    own network design output before trusting it -- do NOT hardcode this as
    the Oracle's answer; the Oracle must derive it itself from the inputs
    above (candidate_facilities, customers, transport_cost_matrix)."""
    description: str
    opened_facilities: List[str]
    closed_facilities: List[str]
    customer_assignment: Dict[str, str]
    total_cost: float
    fixed_cost_component: float
    transport_cost_component: float
    runner_up: NetworkDesignRunnerUp


# ---------------------------------------------------------------------------
# Per-period ordering model parameters
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class PerPeriodCostParameters:
    holding_cost_per_unit_per_week: float
    backorder_cost_per_unit_per_week: float
    min_inventory_floor_units: float
    max_inventory_ceiling_units: float
    initial_on_hand_inventory_units: float
    note: str = ""


# ---------------------------------------------------------------------------
# Disruption events
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class DisruptionEvent:
    week: int
    type: str  # "tariff_spike" | "demand_spike" | "supplier_capacity_cut" | "supplier_partial_fill"
    description: str
    target_supplier_id: Optional[str] = None
    target_customer_id: Optional[str] = None
    effect: Dict[str, float] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Forecasting menu
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ForecastingMethod:
    id: str
    name: str
    params: Dict[str, object] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Top-level container
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ScenarioMetadata:
    product: str
    period_unit: str
    horizon_periods: int
    notes: str = ""


@dataclass(frozen=True)
class ScenarioData:
    metadata: ScenarioMetadata
    suppliers: List[Supplier]
    candidate_facilities: List[CandidateFacility]
    customers: List[Customer]
    transport_cost_matrix: Dict[str, Dict[str, float]]
    network_design_reference_solution: NetworkDesignReferenceSolution
    per_period_cost_parameters: PerPeriodCostParameters
    disruption_schedule: List[DisruptionEvent]
    forecasting_methods_menu: List[ForecastingMethod]

    def supplier_by_id(self, supplier_id: str) -> Supplier:
        for s in self.suppliers:
            if s.id == supplier_id:
                return s
        raise KeyError(f"No supplier with id={supplier_id!r}")

    def customer_by_id(self, customer_id: str) -> Customer:
        for c in self.customers:
            if c.id == customer_id:
                return c
        raise KeyError(f"No customer with id={customer_id!r}")

    # -----------------------------------------------------------------
    # SAFE, no-lookahead accessors.
    #
    # `Customer.actual_demand_ground_truth_by_week` and `disruption_schedule`
    # must never be read directly by decision-time code (the Oracle's
    # optimization logic, or anything feeding a player's screen) -- only
    # through the methods below. This is a deliberate structural guardrail,
    # not just a convention to remember: this project already caught one
    # real bug from exactly this category (the Oracle originally used
    # perfect hindsight before being corrected to same-information,
    # no-lookahead). These methods make that mistake impossible to repeat
    # by construction, since they physically cannot return data past the
    # requested week.
    # -----------------------------------------------------------------

    def demand_history_available_for_forecast(self, customer_id: str, current_week: int) -> List[float]:
        """Demand history usable for forecasting BEFORE deciding orders in
        `current_week`: the pre-simulation historical window, plus every
        week's actual demand already revealed by having lived through weeks
        1..current_week-1. Does NOT include current_week's own actual demand
        (it hasn't happened yet at decision time) or any future week.

        This is the only demand-history input either the player or the
        Oracle's forecasting logic should ever receive. As the simulation
        progresses, this window grows -- e.g. by week 5, it includes the
        original historical weeks plus the actual outcomes of weeks 1-4,
        letting forecasts improve/adapt with more revealed data, never with
        data from the future.
        """
        if current_week < 1:
            raise ValueError("current_week must be >= 1")
        customer = self.customer_by_id(customer_id)
        already_revealed = customer.actual_demand_ground_truth_by_week[: current_week - 1]
        return customer.historical_demand_last_20_weeks + already_revealed

    def disruptions_in_week(self, week: int) -> List[DisruptionEvent]:
        """Disruption(s), if any, that occur exactly in this week -- use this
        to decide what disruption alert (if any) to surface on a period's
        decision screen. Never iterate `self.disruption_schedule` directly
        from decision-time or player-facing code, since that would expose
        future disruptions before they happen."""
        return [d for d in self.disruption_schedule if d.week == week]

    def disruptions_revealed_through(self, current_week: int) -> List[DisruptionEvent]:
        """All disruptions a participant could know about by having lived
        through weeks 1..current_week (inclusive) -- e.g. for an end-of-run
        or "disruptions so far" summary. Never includes future disruptions."""
        return [d for d in self.disruption_schedule if d.week <= current_week]

    def actual_demand(self, customer_id: str, week: int) -> float:
        """Ground-truth demand for a customer in a given week (1-indexed).
        Only for use in the realized-cost recursion, AFTER that week's
        decisions have already been made and the week has played out --
        never as a decision-time or forecasting input. Use
        `demand_history_available_for_forecast` instead for anything
        forecasting- or decision-related."""
        series = self.customer_by_id(customer_id).actual_demand_ground_truth_by_week
        return series[week - 1]


# ---------------------------------------------------------------------------
# Loader
# ---------------------------------------------------------------------------

DEFAULT_SCENARIO_PATH = Path(__file__).parent / "scenario_data.json"


def load_scenario_data(path: Path | str = DEFAULT_SCENARIO_PATH) -> ScenarioData:
    """Load and validate the shared scenario dataset into typed dataclasses.

    Both the Oracle Solver and the Simulation should call this exact
    function against this exact file, so both sides are provably working
    from identical data -- this is the structural fairness guarantee, not
    just a claim in a README.
    """
    with open(path, "r") as f:
        raw = json.load(f)

    metadata = ScenarioMetadata(**raw["scenario_metadata"])

    suppliers = [Supplier(**s) for s in raw["suppliers"]]
    candidate_facilities = [CandidateFacility(**f) for f in raw["candidate_facilities"]]
    customers = [Customer(**c) for c in raw["customers"]]
    transport_cost_matrix = raw["transport_cost_matrix"]

    nd_raw = raw["network_design_reference_solution"]
    runner_up = NetworkDesignRunnerUp(**nd_raw["runner_up"])
    network_design_reference_solution = NetworkDesignReferenceSolution(
        description=nd_raw["description"],
        opened_facilities=nd_raw["opened_facilities"],
        closed_facilities=nd_raw["closed_facilities"],
        customer_assignment=nd_raw["customer_assignment"],
        total_cost=nd_raw["total_cost"],
        fixed_cost_component=nd_raw["fixed_cost_component"],
        transport_cost_component=nd_raw["transport_cost_component"],
        runner_up=runner_up,
    )

    per_period_cost_parameters = PerPeriodCostParameters(**raw["per_period_cost_parameters"])

    disruption_schedule = [DisruptionEvent(**d) for d in raw["disruption_schedule"]]

    forecasting_methods_menu = [ForecastingMethod(**m) for m in raw["forecasting_methods_menu"]]

    return ScenarioData(
        metadata=metadata,
        suppliers=suppliers,
        candidate_facilities=candidate_facilities,
        customers=customers,
        transport_cost_matrix=transport_cost_matrix,
        network_design_reference_solution=network_design_reference_solution,
        per_period_cost_parameters=per_period_cost_parameters,
        disruption_schedule=disruption_schedule,
        forecasting_methods_menu=forecasting_methods_menu,
    )


if __name__ == "__main__":
    # Quick smoke test: load the data and print a short summary.
    data = load_scenario_data()
    print(f"Product: {data.metadata.product}")
    print(f"Horizon: {data.metadata.horizon_periods} {data.metadata.period_unit}s")
    print(f"Suppliers: {[s.name for s in data.suppliers]}")
    print(f"Candidate facilities: {[f.id for f in data.candidate_facilities]}")
    print(f"Reference network design: open {data.network_design_reference_solution.opened_facilities}, "
          f"total cost ${data.network_design_reference_solution.total_cost}")
    print(f"Disruptions: {[(d.week, d.type) for d in data.disruption_schedule]}")
    overseas = data.supplier_by_id("overseas_manufacturer")
    print(f"Overseas landed cost normally: ${overseas.landed_unit_cost()}, "
          f"during tariff spike: ${overseas.landed_unit_cost(tariff_pct_override=100)}")
    print(f"C5 actual demand, week 6: {data.actual_demand('C5', 6)}")
    print(f"C5 actual demand, week 5: {data.actual_demand('C5', 5)}")

    # No-lookahead safety checks
    hist_week1 = data.demand_history_available_for_forecast("C5", current_week=1)
    hist_week6 = data.demand_history_available_for_forecast("C5", current_week=6)
    week6_spike_value = data.actual_demand("C5", 6)
    print(f"\nC5 history available when deciding week 1 ({len(hist_week1)} points): {hist_week1}")
    print(f"C5 history available when deciding week 6 ({len(hist_week6)} points): {hist_week6}")
    assert week6_spike_value not in hist_week6[-1:], (
        "LOOKAHEAD BUG: week 6's own demand-spike value leaked into its own forecast history!"
    )
    assert len(hist_week6) == len(data.customer_by_id("C5").historical_demand_last_20_weeks) + 5, (
        "History length is wrong -- should be 8 historical + weeks 1-5 revealed (5 weeks), not including week 6 itself."
    )
    print("OK: week 6's forecast history does not contain week 6's own (not-yet-revealed) actual demand.")

    print(f"\nDisruptions visible going into week 3 (should be empty): {data.disruptions_revealed_through(3)}")
    print(f"Disruptions visible going into week 4 (tariff spike just happened): "
          f"{[(d.week, d.type) for d in data.disruptions_revealed_through(4)]}")
    print(f"Disruptions visible going into week 8 (should NOT include week 9's capacity cut): "
          f"{[(d.week, d.type) for d in data.disruptions_revealed_through(8)]}")
