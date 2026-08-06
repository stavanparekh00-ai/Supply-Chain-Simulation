"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useParams } from "next/navigation";
import { PageShell, PageHeader, StepIndicator, Card, PrimaryButton, DataTable } from "@/components/ui";

interface CandidateFacility {
  id: string;
  fixed_cost_to_open: number;
}
interface Customer {
  id: string;
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
      <PageShell>
        <p className="text-sm text-[var(--slate)]">Loading...</p>
      </PageShell>
    );
  }

  const tableHeaders = ["Facility", ...scenario.customers.map((c) => c.id)];
  const tableRows = scenario.candidate_facilities.map((f) => [
    f.id + (selected.has(f.id) ? " (selected)" : ""),
    ...scenario.customers.map((c) => `$${scenario.transport_cost_matrix[f.id][c.id]}`),
  ]);

  return (
    <PageShell>
      <StepIndicator current={1} total={2} label="Facility Network Design" />
      <PageHeader
        title="Design Your Facility Network"
        subtitle="Select which candidate facilities to open. Your choice affects fixed costs and how efficiently customer demand can be served."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-[var(--navy)] mb-3">Candidate Facilities</h2>
          <ul className="space-y-2">
            {scenario.candidate_facilities.map((f) => (
              <li key={f.id}>
                <label className="flex items-center justify-between gap-3 rounded-md border border-[var(--card-border)] px-3 py-2 cursor-pointer hover:bg-gray-50">
                  <span className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(f.id)}
                      onChange={() => toggle(f.id)}
                      className="h-4 w-4"
                    />
                    <span className="text-sm font-medium">{f.id}</span>
                  </span>
                  <span className="text-sm text-[var(--slate)]">${f.fixed_cost_to_open.toLocaleString()}</span>
                </label>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold text-[var(--navy)] mb-3">
            Transport Cost Per Unit, by Facility and Customer
          </h2>
          <DataTable headers={tableHeaders} rows={tableRows} />
          <p className="mt-3 text-xs text-[var(--slate)]">
            Each customer will be served by whichever of your open facilities offers it the
            lowest transport cost. Customer weekly demand:{" "}
            {scenario.customers.map((c) => `${c.id}=${c.weekly_demand}`).join(", ")}.
          </p>
        </Card>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div className="text-sm text-[var(--foreground)]">
          <span className="font-medium">Facilities Selected:</span> {selected.size}
          <span className="ml-4 font-medium">Total Fixed Cost:</span> ${totalFixedCost.toLocaleString()}
        </div>
        <PrimaryButton onClick={handleContinue} disabled={selected.size === 0 || submitting}>
          {submitting ? "Saving..." : "Continue"}
        </PrimaryButton>
      </div>
    </PageShell>
  );
}
