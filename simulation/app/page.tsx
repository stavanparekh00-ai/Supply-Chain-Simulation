"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell, PageHeader, Card, PrimaryButton } from "@/components/ui";

export default function WelcomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleStart() {
    setLoading(true);
    const res = await fetch("/api/sessions", { method: "POST" });
    const session = await res.json();
    router.push(`/session/${session.id}/network`);
  }

  return (
    <PageShell narrow>
      <Card className="p-8">
        <PageHeader title="Supply Chain Decision Simulation" />
        <p className="text-sm leading-6 text-[var(--foreground)]">
          You&apos;ll be making supply chain decisions for a manufacturer of automotive-grade
          microcontrollers across a 10-week planning horizon. Demand each week is uncertain, and
          a few supply disruptions will occur along the way. Your decisions will be compared to a
          mathematically optimal benchmark (&quot;the Oracle&quot;) only after the simulation is
          complete &mdash; nothing about the Oracle&apos;s behavior is shown while you&apos;re
          deciding.
        </p>
        <ol className="mt-6 space-y-2 text-sm text-[var(--foreground)]">
          <li className="flex gap-2">
            <span className="font-semibold text-[var(--navy)]">1.</span> Design your facility
            network &mdash; choose which candidate facilities to open.
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-[var(--navy)]">2.</span> Choose a forecasting
            method &mdash; locked in for the whole run once selected.
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-[var(--navy)]">3.</span> Make ordering decisions
            each week, for 10 weeks.
          </li>
        </ol>
        <div className="mt-8">
          <PrimaryButton onClick={handleStart} disabled={loading}>
            {loading ? "Starting..." : "Get Started"}
          </PrimaryButton>
        </div>
      </Card>
    </PageShell>
  );
}
