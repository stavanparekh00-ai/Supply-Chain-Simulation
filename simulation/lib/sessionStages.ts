export const SESSION_STAGES = ["network", "forecast", "play", "results"] as const;
export type SessionStage = (typeof SESSION_STAGES)[number];

export interface SessionProgressFields {
  status?: string | null;
  opened_facilities?: string[] | null;
  forecasting_method_id?: string | null;
  current_week?: number | null;
}

/** Earliest stage a player may revisit: network design. Welcome/name screen is outside the run. */
export function unlockedStages(session: SessionProgressFields): SessionStage[] {
  const unlocked: SessionStage[] = ["network"];

  const hasNetwork =
    Array.isArray(session.opened_facilities) && session.opened_facilities.length > 0;
  if (hasNetwork) unlocked.push("forecast");

  if (session.status === "completed") {
    unlocked.push("results");
    return unlocked;
  }

  if (session.forecasting_method_id || session.status === "playing") {
    unlocked.push("play");
  }

  return unlocked;
}

/** Best page for this session given current progress. */
export function currentStage(session: SessionProgressFields): SessionStage {
  if (session.status === "completed") return "results";
  if (session.forecasting_method_id || session.status === "playing") return "play";
  if (Array.isArray(session.opened_facilities) && session.opened_facilities.length > 0) {
    return "forecast";
  }
  return "network";
}

export function stagePath(sessionId: string, stage: SessionStage): string {
  return `/session/${sessionId}/${stage}`;
}

export function canVisitStage(session: SessionProgressFields, stage: SessionStage): boolean {
  return unlockedStages(session).includes(stage);
}
