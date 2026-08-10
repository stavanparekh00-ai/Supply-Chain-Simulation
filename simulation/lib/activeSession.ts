const ACTIVE_SESSION_KEY = "sc_active_session_id";

export function getActiveSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(ACTIVE_SESSION_KEY);
  } catch {
    return null;
  }
}

export function setActiveSessionId(sessionId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
  } catch {
    // Ignore storage failures (private mode, etc.)
  }
}

export function clearActiveSessionId(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    // Ignore
  }
}
