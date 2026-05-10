import { useState } from "react";
import { updateMood, advanceStage } from "@/lib/firebaseUtils";
import { Loader2, RefreshCcw, Home } from "lucide-react";
import { useRouter } from "next/navigation";

const MOODS = [
  { score: 1, emoji: "🧊", label: "Still Frozen" },
  { score: 2, emoji: "🌧️", label: "Cloudy" },
  { score: 3, emoji: "🌥️", label: "Clearing" },
  { score: 4, emoji: "🌤️", label: "Warmer" },
  { score: 5, emoji: "☀️", label: "Ready" },
];

export default function MoodCheckIn({ sessionId, session, role }: { sessionId: string, session: any, role: string }) {
  const router = useRouter();
  
  const myMood = session.moods[role];
  const partnerRole = role === "userA" ? "userB" : "userA";
  const partnerMood = session.moods[partnerRole];

  const submitMood = async (score: number) => {
    await updateMood(sessionId, role as "userA"|"userB", score);
  };

  if (!myMood) {
    return (
      <div className="flex h-screen items-center justify-center flex-col px-4 text-center max-w-2xl mx-auto space-y-12">
        <div className="space-y-4">
          <h2 className="text-3xl font-bold text-foreground tracking-tight">How are you feeling now?</h2>
          <p className="text-muted-foreground text-lg">Be honest. It's okay if you need more time.</p>
        </div>

        <div className="grid grid-cols-5 gap-3 w-full">
          {MOODS.map(m => (
            <button
              key={m.score}
              onClick={() => submitMood(m.score)}
              className="flex flex-col items-center justify-center py-6 bg-white rounded-[1.5rem] shadow-sm border border-primary/10 hover:border-primary hover:shadow-md transition-all hover:-translate-y-1 gap-3"
            >
              <span className="text-5xl">{m.emoji}</span>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider hidden sm:block">{m.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!partnerMood) {
    return (
      <div className="flex h-screen items-center justify-center p-4 text-center">
        <div className="space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
          <h2 className="text-2xl font-bold text-foreground">Waiting for partner...</h2>
          <p className="text-muted-foreground text-lg">They are rating their readiness.</p>
        </div>
      </div>
    );
  }

  const readyToReturn = myMood >= 3 && partnerMood >= 3;

  return (
    <div className="flex min-h-screen items-center justify-center p-4 py-12 max-w-3xl mx-auto w-full">
      <div className="space-y-12 w-full text-center">
        
        <div className="space-y-4">
          <h2 className="text-4xl font-bold text-foreground tracking-tight">
            {readyToReturn ? "Ready to Return" : "More Time Needed"}
          </h2>
          <p className="text-muted-foreground text-xl max-w-xl mx-auto">
            {readyToReturn 
              ? "You both indicated you're feeling warmer. It's safe to return to the original conversation."
              : "At least one of you is still feeling raw. Do not return to the argument right now."}
          </p>
        </div>

        <div className="flex justify-center gap-12">
          <div className="text-center space-y-3">
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">You</p>
            <div className="w-28 h-28 bg-white rounded-full flex items-center justify-center text-6xl shadow-md border border-primary/10">
              {MOODS.find(m => m.score === myMood)?.emoji}
            </div>
          </div>
          <div className="text-center space-y-3">
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Partner</p>
            <div className="w-28 h-28 bg-white rounded-full flex items-center justify-center text-6xl shadow-md border border-primary/10">
              {MOODS.find(m => m.score === partnerMood)?.emoji}
            </div>
          </div>
        </div>

        {session.selectedGame === "emotion_translator" && (myMood <= 2 || partnerMood <= 2) && (
          <div className="max-w-lg mx-auto rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-left text-sm text-amber-950">
            <p className="font-semibold mb-1">Gentle suggestion</p>
            <p>
              Consider one more short exercise together, or take a ten-minute break before going back to the hardest part
              of the conversation.
            </p>
          </div>
        )}

        <div className="pt-8 flex flex-col gap-4 max-w-md mx-auto">
          {readyToReturn ? (
            <button 
              onClick={() => router.push("/")}
              className="w-full py-6 bg-primary text-white rounded-[1.5rem] text-lg font-bold shadow-md hover:bg-primary/90 transition flex items-center justify-center gap-3"
            >
              <Home className="w-6 h-6" /> Back to Home
            </button>
          ) : (
            <>
              {role === "userA" && (
                <button 
                  onClick={() => advanceStage(sessionId, "game_select")}
                  className="w-full py-6 bg-primary text-white rounded-[1.5rem] text-lg font-bold shadow-md hover:bg-primary/90 transition flex items-center justify-center gap-3"
                >
                  <RefreshCcw className="w-6 h-6" /> Try Another Exercise
                </button>
              )}
              <button 
                onClick={() => router.push("/")}
                className="w-full py-6 bg-white text-foreground border-2 border-primary/20 rounded-[1.5rem] text-lg font-bold shadow-sm hover:bg-gray-50 transition"
              >
                End Session for Now
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
