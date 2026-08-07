"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useParams } from "next/navigation";
import { PageShell, PageHeader, StepIndicator, Card, PrimaryButton, DataTable, Spinner, Badge } from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import { NetworkMap } from "@/components/NetworkMap";

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

export default function NetworkSetupPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [scenario, setScenario] = useState<ScenarioPublic | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/scenario")
      .then((r) => r.json())
      .then(setScenario);
  }, []);

  const totalFixedCost = useMemo(() => {
    if (!scenario) return 0;
    return scenario.candidate_facilities
      .filter((f) => selected.has(f.id))
      .reduce((sum, f) => sum + f.fixed_cost_to_open, 0);
  }, [scenario, selected]);

  function toggle(facilityId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(facilityId)) next.delete(facilityId);
      else next.add(facilityId);
      return next;
    });
  }

  async function handleContinue() {
    if (selected.size === 0) return;
    setSubmitting(true);
    await fetch(`/api/sessions/${params.id}/network`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openedFacilities: Array.from(selected) }),
    });
    router.push(`/session/${params.id}/forecast`);
  }

  if (!scenario) {
    return (
      <>
        <AppHeader activeStep="network" />
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
      <AppHeader activeStep="network" />
      <PageShell>
        <StepIndicator current={1} total={2} label="Facility Network Design" />
        <PageHeader
          title="Design Your Facility Network"
          subtitle="Select which candidate facilities to open. Your choice affects fixed costs and how efficiently customer demand can be served."
        />

        <Card className="mb-5 p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-[var(--navy)]">Network Map</h2>
              <p className="mt-1 text-xs text-[var(--slate)]">
                Select facility markers to preview how customers would be assigned to their lowest-cost open facility.
              </p>
            </div>
            <Badge tone="navy">6 customers · 5 candidates</Badge>
          </div>
          <NetworkMap
            facilities={scenario.candidate_facilities}
            customers={scenario.customers}
            transportCosts={scenario.transport_cost_matrix}
            selected={selected}
            onToggle={toggle}
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
                        "flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 transition-colors",
                        isSelected
                          ? "border-[var(--navy)]/40 bg-[var(--navy)]/[0.04]"
                          : "border-[var(--card-border)] hover:bg-slate-50",
                      ].join(" ")}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(f.id)}
                          className="h-4 w-4 accent-[var(--navy)]"
                        />
                        <span>
                          <span className="block text-sm font-medium text-[var(--foreground)]">{f.id} · {f.name}</span>
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
          <div className="flex items-center gap-3 text-sm text-[var(--foreground)]">
            <Badge tone="navy">{selected.size} facilities selected</Badge>
            <span className="text-[var(--slate)]">
              Total Fixed Cost: <span className="font-semibold text-[var(--navy)]">${totalFixedCost.toLocaleString()}</span>
            </span>
          </div>
          <PrimaryButton onClick={handleContinue} disabled={selected.size === 0 || submitting}>
            {submitting ? "Saving..." : "Continue"}
          </PrimaryButton>
        </div>
      </PageShell>
    </>
  );
}
