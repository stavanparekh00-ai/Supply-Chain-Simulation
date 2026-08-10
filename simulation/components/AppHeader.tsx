"use client";

import Link from "next/link";
import { SessionStage } from "@/lib/sessionStages";

const STEPS: { key: SessionStage; label: string }[] = [
  { key: "network", label: "Facility Network" },
  { key: "forecast", label: "Forecasting Method" },
  { key: "play", label: "Weekly Decisions" },
  { key: "results", label: "Results" },
];

export function AppHeader({
  activeStep,
  sessionId,
  unlockedSteps,
  weekProgress,
}: {
  activeStep?: SessionStage;
  sessionId?: string;
  unlockedSteps?: SessionStage[];
  weekProgress?: { current: number; total: number };
}) {
  const activeIndex = STEPS.findIndex((s) => s.key === activeStep);
  const unlocked = new Set(unlockedSteps ?? (activeStep ? [activeStep] : []));

  return (
    <header className="sticky top-0 z-10 border-b border-[var(--card-border)] bg-white/85 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--navy)] text-[11px] font-bold text-white">
            SC
          </div>
          <span className="text-sm font-semibold tracking-tight text-[var(--navy)]">
            Supply Chain Decision Simulation
          </span>
        </div>

        {activeStep && (
          <nav aria-label="Simulation stages" className="flex flex-wrap items-center gap-1">
            {STEPS.map((step, i) => {
              const isUnlocked = unlocked.has(step.key);
              const state =
                i < activeIndex ? "done" : i === activeIndex ? "active" : isUnlocked ? "reachable" : "upcoming";
              const label =
                step.key === "play" && weekProgress
                  ? `Weekly Decisions (${weekProgress.current}/${weekProgress.total})`
                  : step.label;

              const className = [
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                state === "active" && "bg-[var(--navy)] text-white",
                state === "done" && "text-[var(--navy)] hover:bg-[var(--navy)]/8",
                state === "reachable" && "text-[var(--navy)] hover:bg-[var(--navy)]/8",
                state === "upcoming" && "cursor-not-allowed text-[var(--slate-light)]",
              ]
                .filter(Boolean)
                .join(" ");

              const badge = (
                <span
                  className={[
                    "flex h-4 w-4 items-center justify-center rounded-full text-[10px]",
                    state === "active" && "bg-white text-[var(--navy)]",
                    (state === "done" || state === "reachable") && "bg-[var(--navy)] text-white",
                    state === "upcoming" && "border border-[var(--slate-light)]",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {state === "done" || (state === "reachable" && i < activeIndex) ? "✓" : i + 1}
                </span>
              );

              return (
                <div key={step.key} className="flex items-center gap-1">
                  {isUnlocked && sessionId ? (
                    <Link
                      href={`/session/${sessionId}/${step.key}`}
                      aria-current={state === "active" ? "page" : undefined}
                      className={className}
                      title={`Go to ${step.label}`}
                    >
                      {badge}
                      <span>{label}</span>
                    </Link>
                  ) : (
                    <div className={className} aria-disabled="true" title="Complete earlier steps first">
                      {badge}
                      <span>{label}</span>
                    </div>
                  )}
                  {i < STEPS.length - 1 && <div className="h-px w-3 bg-[var(--card-border)] sm:w-4" />}
                </div>
              );
            })}
          </nav>
        )}
      </div>
    </header>
  );
}
