"use client";

import { useEffect, useState, useRef } from "react";
import { subscribeToSession } from "@/lib/firebaseUtils";
import { Loader2 } from "lucide-react";
import InviteScreen from "./InviteScreen";
import BreathingRoom from "./BreathingRoom";
import GameSelect from "./GameSelect";
import DebriefPrompt from "./DebriefPrompt";
import MoodCheckIn from "./MoodCheckIn";
import TwoTruths from "../MiniGames/TwoTruths";
import EmotionTranslator from "../MiniGames/EmotionTranslator";
import GratitudeVolley from "../MiniGames/GratitudeVolley";
import BlindArchitect from "../MiniGames/BlindArchitect";

export default function SessionOrchestrator({ sessionId, initialRole }: { sessionId: string, initialRole: "userA" | "userB" }) {
  const [session, setSession] = useState<any>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled && !hasLoadedRef.current) setSession("not_found");
    }, 8000);

    const unsubSession = subscribeToSession(sessionId, (data) => {
      hasLoadedRef.current = true;
      clearTimeout(timeout);
      if (!cancelled) setSession(data);
    });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      unsubSession();
    };
  }, [sessionId]);

  useEffect(() => {
    if (!session || session === "not_found") return;
    
    if (session.stage === "invite") {
      document.body.className = "theme-amber";
    } else if (session.stage === "breathe") {
      document.body.className = "theme-white";
    } else {
      document.body.className = ""; 
    }
  }, [session?.stage]);

  if (session === "not_found") {
    return (
      <div className="flex flex-col h-screen items-center justify-center space-y-4 text-center px-4">
        <h2 className="text-2xl font-bold text-red-500">Session Not Found</h2>
        <p className="text-muted-foreground max-w-md">
          This code does not exist yet, or the app cannot reach Firestore. For local development, start the Firestore emulator on port 8080 before running the app.
        </p>
      </div>
    );
  }

  if (!session) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>;
  }

  switch (session.stage) {
    case "invite":
      return <InviteScreen sessionId={sessionId} role={initialRole} />;
    case "breathe":
      return <BreathingRoom sessionId={sessionId} role={initialRole} />;
    case "game_select":
      return <GameSelect sessionId={sessionId} role={initialRole} />;
    case "playing":
      if (session.selectedGame === "two_truths") return <TwoTruths sessionId={sessionId} session={session} role={initialRole} />;
      if (session.selectedGame === "emotion_translator") return <EmotionTranslator sessionId={sessionId} session={session} role={initialRole} />;
      if (session.selectedGame === "gratitude_volley") return <GratitudeVolley sessionId={sessionId} session={session} role={initialRole} />;
      if (session.selectedGame === "blind_architect") return <BlindArchitect sessionId={sessionId} session={session} role={initialRole} />;
      return <div>Game Error</div>;
    case "reflect":
      return <DebriefPrompt sessionId={sessionId} session={session} role={initialRole} />;
    case "return":
      return <MoodCheckIn sessionId={sessionId} session={session} role={initialRole} />;
    default:
      return <div>Stage coming soon: {session.stage}</div>;
  }
}
