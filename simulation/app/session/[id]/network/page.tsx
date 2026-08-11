"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { PageShell, PageHeader, StepIndicator, Card, PrimaryButton, DataTable, Spinner, Badge } from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import { NetworkMap } from "@/components/NetworkMap";
import { useSessionGate } from "@/hooks/useSessionGate";

interface CandidateFacility {
  id: string;
  name: string;
  city: string;
  map_x: number;
  map_y: number;
  fixed_cost_to_open: number;
}
interface Customer {
  id: string;
  name: string;
  city: string;
  map_x: number;
  map_y: number;
  weekly_demand: number;
}
interface ScenarioPublic {
  candidate_facilities: CandidateFacility[];
  customers: Customer[];
  transport_cost_matrix: Record<string, Record<string, number>>;
}

const MAX_OPEN_FACILITIES = 3;

export default function NetworkSetupPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const gate = useSessionGate(params.id, "network");
  const [scenario, setScenario] = useState<ScenarioPublic | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydratedSelection, setHydratedSelection] = useState(false);

  const locked = Boolean(
    gate.session?.forecasting_method_id ||
      gate.session?.status === "playing" ||
      gate.session?.status === "completed"
  );

  useEffect(() => {
    fetch("/api/scenario")
      .then((r) => r.json())
      .then(setScenario);
  }, []);

  useEffect(() => {
    if (!gate.ready || hydratedSelection) return;
    const opened = gate.session?.opened_facilities;
    if (Array.isArray(opened) && opened.length > 0) {
      setSelected(new Set(opened));
    }
    setHydratedSelection(true);
  }, [gate.ready, gate.session, hydratedSelection]);

  const totalFixedCost = useMemo(() => {
    if (!scenario) return 0;
    return scenario.candidate_facilities
      .filter((f) => selected.has(f.id))
      .reduce((sum, f) => sum + f.fixed_cost_to_open, 0);
  }, [scenario, selected]);

  function toggle(facilityId: string) {
    if (locked) return;
    setSelected((prev) => {
      if (prev.has(facilityId)) {
        const next = new Set(prev);
        next.delete(facilityId);
        return next;
      }
      if (prev.size >= MAX_OPEN_FACILITIES) {
        return prev;
      }
      const next = new Set(prev);
      next.add(facilityId);
      return next;
    });
  }

  function handleToggle(facilityId: string) {
    if (locked) return;
    const alreadySelected = selected.has(facilityId);
    if (!alreadySelected && selected.size >= MAX_OPEN_FACILITIES) {
      setError(`You can open at most ${MAX_OPEN_FACILITIES} facilities.`);
      return;
    }
    setError(null);
    toggle(facilityId);
  }

  async function handleContinue() {
    if (locked) {
      router.replace(`/session/${params.id}/forecast`);
      return;
    }
    if (selected.size === 0 || selected.size > MAX_OPEN_FACILITIES) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/sessions/${params.id}/network`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openedFacilities: Array.from(selected) }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Could not save your network.");
      setSubmitting(false);
      return;
    }
    router.replace(`/session/${params.id}/forecast`);
  }

  if (!gate.ready || !scenario) {
    return (
      <>
        <AppHeader activeStep="network" sessionId={params.id} unlockedSteps={gate.unlocked} />
        <PageShell>
          <Spinner />
        </PageShell>
      </>
    );
  }

  const tableHeaders = ["Facility", ...scenario.customers.map((c) => c.id)];
  const tableRows = scenario.candidate_facilities.map((f) => [
    selected.has(f.id) ? `${f.id} ●` : f.id,
    ...scenario.customers.map((c) => `$${scenario.transport_cost_matrix[f.id][c.id]}`),
  ]);

  return (
    <>
      <AppHeader activeStep="network" sessionId={params.id} unlockedSteps={gate.unlocked} />
      <PageShell>
        <StepIndicator current={1} total={2} label="Facility Network Design" />
        <PageHeader
          title="Design Your Facility Network"
          subtitle={
            locked
              ? "Your facility network is locked for this run. Use the tabs above to move between stages you have already reached."
              : `Select up to ${MAX_OPEN_FACILITIES} facilities to open. Your choice affects fixed costs and how efficiently customer demand can be served.`
          }
        />

        <Card className="mb-5 p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-[var(--navy)]">Network Map</h2>
              <p className="mt-1 text-xs text-[var(--slate)]">
                {locked
                  ? "Read-only view of the facilities you opened and how customers assign to them."
                  : `Select facility markers to preview how customers would be assigned to their lowest-cost open facility.`}
              </p>
            </div>
            <Badge tone="navy">6 customers · max {MAX_OPEN_FACILITIES} of 5 hubs</Badge>
          </div>
          <NetworkMap
            facilities={scenario.candidate_facilities}
            customers={scenario.customers}
            transportCosts={scenario.transport_cost_matrix}
            selected={selected}
            onToggle={handleToggle}
          />
        </Card>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-5">
          <Card className="p-4 md:col-span-2">
            <h2 className="mb-3 text-sm font-semibold text-[var(--navy)]">Candidate Facilities</h2>
            <ul className="space-y-2">
              {scenario.candidate_facilities.map((f) => {
                const isSelected = selected.has(f.id);
                return (
                  <li key={f.id}>
                    <label
                      className={[
                        "flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 transition-colors",
                        locked ? "cursor-default" : "cursor-pointer",
                        isSelected
                          ? "border-[var(--navy)]/40 bg-[var(--navy)]/[0.04]"
                          : "border-[var(--card-border)] hover:bg-slate-50",
                      ].join(" ")}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={locked || (!isSelected && selected.size >= MAX_OPEN_FACILITIES)}
                          onChange={() => handleToggle(f.id)}
                          className="h-4 w-4 accent-[var(--navy)] disabled:opacity-40"
                        />
                        <span>
                          <span className="block text-sm font-medium text-[var(--foreground)]">
                            {f.id} · {f.name}
                          </span>
                          <span className="block text-[11px] text-[var(--slate)]">{f.city}</span>
                        </span>
                      </span>
                      <span className="text-sm tabular-nums text-[var(--slate)]">
                        ${f.fixed_cost_to_open.toLocaleString()}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="p-4 md:col-span-3">
            <h2 className="mb-3 text-sm font-semibold text-[var(--navy)]">
              Transport Cost Per Unit, by Facility and Customer
            </h2>
            <DataTable headers={tableHeaders} rows={tableRows} />
            <p className="mt-3 text-xs leading-relaxed text-[var(--slate)]">
              Each customer will be served by whichever of your open facilities offers it the
              lowest transport cost. Weekly demand:{" "}
              {scenario.customers.map((c) => `${c.id}=${c.weekly_demand}`).join(", ")}.
            </p>
          </Card>
        </div>

        <div className="mt-6 flex flex-col-reverse items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-2 text-sm text-[var(--foreground)]">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="navy">
                {selected.size} / {MAX_OPEN_FACILITIES} facilities selected
              </Badge>
              <span className="text-[var(--slate)]">
                Total Fixed Cost:{" "}
                <span className="font-semibold text-[var(--navy)]">${totalFixedCost.toLocaleString()}</span>
              </span>
            </div>
            {error && <p className="text-xs text-red-700">{error}</p>}
            {!locked && selected.size >= MAX_OPEN_FACILITIES && !error && (
              <p className="text-xs text-[var(--slate)]">
                You already selected {MAX_OPEN_FACILITIES} facilities. Deselect one to choose a different hub.
              </p>
            )}
            {locked && (
              <p className="text-xs text-[var(--slate)]">
                Network changes are locked after forecasting begins. Use the stage tabs to navigate.
              </p>
            )}
          </div>
          <PrimaryButton
            onClick={handleContinue}
            disabled={!locked && (selected.size === 0 || selected.size > MAX_OPEN_FACILITIES || submitting)}
          >
            {locked ? "Back to Forecasting" : submitting ? "Saving..." : "Continue"}
          </PrimaryButton>
        </div>
      </PageShell>
    </>
  );
}
