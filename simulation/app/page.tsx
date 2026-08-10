"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell, Card, PrimaryButton, Spinner } from "@/components/ui";
import {
  clearActiveSessionId,
  getActiveSessionId,
  setActiveSessionId,
} from "@/lib/activeSession";
import { currentStage, stagePath } from "@/lib/sessionStages";

export default function WelcomePage() {
  const router = useRouter();
  const [participantName, setParticipantName] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingResume, setCheckingResume] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mid-run players who hit the name screen (browser back) are bounced
  // back into their session. Network design is the furthest back allowed.
  useEffect(() => {
    let cancelled = false;

    async function resumeIfNeeded() {
      const activeId = getActiveSessionId();
      if (!activeId) {
        setCheckingResume(false);
        return;
      }

      try {
        const res = await fetch(`/api/sessions/${activeId}`);
        if (!res.ok) {
          clearActiveSessionId();
          if (!cancelled) setCheckingResume(false);
          return;
        }
        const session = await res.json();
        if (session.status === "completed") {
          // Finished runs may exit to the name screen to start fresh.
          if (!cancelled) setCheckingResume(false);
          return;
        }
        router.replace(stagePath(activeId, currentStage(session)));
      } catch {
        if (!cancelled) setCheckingResume(false);
      }
    }

    void resumeIfNeeded();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleStart() {
    const cleanedName = participantName.trim();
    if (cleanedName.length < 2) {
      setError("Please enter your name to continue.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantName: cleanedName }),
    });
    const session = await res.json();
    if (!res.ok) {
      setError(session.error ?? "Could not start the simulation.");
      setLoading(false);
      return;
    }
    setActiveSessionId(session.id);
    // Replace so the name screen is not sitting behind network in history.
    router.replace(`/session/${session.id}/network`);
  }

  if (checkingResume) {
    return (
      <PageShell narrow>
        <div className="flex min-h-[80vh] items-center justify-center">
          <Spinner />
        </div>
      </PageShell>
    );
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

          <div className="mt-8 border-t border-[var(--card-border)] pt-6">
            <div>
              <label
                htmlFor="participant-name"
                className="text-xs font-semibold uppercase tracking-wider text-[var(--slate)]"
              >
                Participant name
              </label>
              <input
                id="participant-name"
                type="text"
                name="participant-name"
                value={participantName}
                onChange={(event) => setParticipantName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleStart();
                }}
                maxLength={60}
                autoComplete="name"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Enter your name"
                className="mt-2 w-full rounded-lg border border-[var(--card-border)] bg-white px-3.5 py-2.5 text-sm text-[var(--foreground)] shadow-sm transition-colors placeholder:text-[var(--slate-light)] focus:border-[var(--navy)]"
              />
              <p className="mt-1.5 text-[11px] text-[var(--slate-light)]">
                No password required. Your name is used only to identify this simulation run.
              </p>
            </div>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

            <div className="mt-5 flex justify-center">
              <PrimaryButton onClick={handleStart} disabled={loading || participantName.trim().length < 2}>
                {loading ? "Starting..." : "Enter Simulation"}
              </PrimaryButton>
            </div>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
