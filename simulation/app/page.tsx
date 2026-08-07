"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell, Card, PrimaryButton } from "@/components/ui";

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
      <div className="flex min-h-[80vh] flex-col items-center justify-center">
        <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--navy)] text-sm font-bold text-white shadow-sm">
          SC
        </div>
        <Card className="w-full p-8 sm:p-10">
          <h1 className="text-center text-2xl font-semibold tracking-tight text-[var(--navy)]">
            Supply Chain Decision Simulation
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-center text-sm leading-relaxed text-[var(--slate)]">
            You&apos;ll be making supply chain decisions for a manufacturer of automotive-grade
            microcontrollers across a 10-week planning horizon. Demand each week is uncertain,
            and a few supply disruptions will occur along the way. Your decisions will be
            compared to a mathematically optimal benchmark (&quot;the Oracle&quot;) only after
            the simulation is complete &mdash; nothing about the Oracle&apos;s behavior is shown
            while you&apos;re deciding.
          </p>

          <div className="mt-8 space-y-3 border-t border-[var(--card-border)] pt-6">
            {[
              { n: 1, title: "Design your facility network", desc: "Choose which candidate facilities to open." },
              { n: 2, title: "Choose a forecasting method", desc: "Locked in for the whole run once selected." },
              { n: 3, title: "Make ordering decisions", desc: "Each week, for 10 weeks." },
            ].map((step) => (
              <div key={step.n} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--navy)]/10 text-xs font-semibold text-[var(--navy)]">
                  {step.n}
                </span>
                <div>
                  <div className="text-sm font-medium text-[var(--foreground)]">{step.title}</div>
                  <div className="text-xs text-[var(--slate)]">{step.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex justify-center">
            <PrimaryButton onClick={handleStart} disabled={loading}>
              {loading ? "Starting..." : "Get Started"}
            </PrimaryButton>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
