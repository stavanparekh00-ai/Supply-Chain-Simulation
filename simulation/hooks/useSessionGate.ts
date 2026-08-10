"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setActiveSessionId } from "@/lib/activeSession";
import {
  SessionProgressFields,
  SessionStage,
  canVisitStage,
  currentStage,
  stagePath,
  unlockedStages,
} from "@/lib/sessionStages";

interface GateState {
  ready: boolean;
  session: SessionProgressFields | null;
  unlocked: SessionStage[];
}

/**
 * Loads the session, claims it as the browser's active run, and redirects
 * if this page's stage is not unlocked yet (or if the run already finished
 * and the player opened an earlier play-only URL).
 */
export function useSessionGate(sessionId: string, stage: SessionStage): GateState {
  const router = useRouter();
  const [state, setState] = useState<GateState>({
    ready: false,
    session: null,
    unlocked: ["network"],
  });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setActiveSessionId(sessionId);
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (!res.ok) {
        router.replace("/");
        return;
      }
      const session = (await res.json()) as SessionProgressFields;
      if (cancelled) return;

      const unlocked = unlockedStages(session);
      if (!canVisitStage(session, stage)) {
        router.replace(stagePath(sessionId, currentStage(session)));
        return;
      }

      // Completed runs should land on results rather than keep playing.
      if (stage === "play" && session.status === "completed") {
        router.replace(stagePath(sessionId, "results"));
        return;
      }

      setState({ ready: true, session, unlocked });
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [sessionId, stage, router]);

  return state;
}
