"use client";

const STEPS = [
  { key: "network", label: "Facility Network" },
  { key: "forecast", label: "Forecasting Method" },
  { key: "play", label: "Weekly Decisions" },
  { key: "results", label: "Results" },
] as const;

export function AppHeader({
  activeStep,
  weekProgress,
}: {
  activeStep?: (typeof STEPS)[number]["key"];
  weekProgress?: { current: number; total: number };
}) {
  const activeIndex = STEPS.findIndex((s) => s.key === activeStep);

  return (
    <header className="sticky top-0 z-10 border-b border-[var(--card-border)] bg-white/85 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--navy)] text-[11px] font-bold text-white">
            SC
          </div>
          <span className="text-sm font-semibold tracking-tight text-[var(--navy)]">
            Supply Chain Decision Simulation
          </span>
        </div>

        {activeStep && (
          <nav className="hidden items-center gap-1 sm:flex">
            {STEPS.map((step, i) => {
              const state = i < activeIndex ? "done" : i === activeIndex ? "active" : "upcoming";
              return (
                <div key={step.key} className="flex items-center gap-1">
                  <div
                    className={[
                      "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                      state === "active" && "bg-[var(--navy)] text-white",
                      state === "done" && "text-[var(--navy)]",
                      state === "upcoming" && "text-[var(--slate-light)]",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span
                      className={[
                        "flex h-4 w-4 items-center justify-center rounded-full text-[10px]",
                        state === "active" && "bg-white text-[var(--navy)]",
                        state === "done" && "bg-[var(--navy)] text-white",
                        state === "upcoming" && "border border-[var(--slate-light)]",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {state === "done" ? "✓" : i + 1}
                    </span>
                    <span>
                      {step.key === "play" && weekProgress
                        ? `Weekly Decisions (${weekProgress.current}/${weekProgress.total})`
                        : step.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && <div className="h-px w-4 bg-[var(--card-border)]" />}
                </div>
              );
            })}
          </nav>
        )}
      </div>
    </header>
  );
}
