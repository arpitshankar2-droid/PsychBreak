import {
  advanceStage,
  mergeBlindArchitect,
  mergeEmotionTranslator,
  mergeGratitudeVolley,
  mergeSharedFuture,
  updateGameData,
  updateSelectedGame,
} from "@/lib/firebaseUtils";
import { createInitialBlindArchitectState } from "@/lib/blindArchitectState";
import { createInitialSharedFutureState } from "@/lib/sharedFutureState";
import { createInitialGratitudeVolleyState } from "@/lib/gratitudeVolleyState";
import { createInitialEmotionTranslatorState } from "@/lib/emotionTranslatorState";

export default function GameSelect({ sessionId, role }: { sessionId: string, role: string }) {
  const selectGame = async (gameId: string) => {
    if (role !== "userA") return;
    await updateGameData(sessionId, { debriefFromEmotions: null });
    if (gameId === "blind_architect") {
      await mergeBlindArchitect(sessionId, createInitialBlindArchitectState() as unknown as Record<string, unknown>);
    }
    if (gameId === "two_truths") {
      await mergeSharedFuture(sessionId, createInitialSharedFutureState() as unknown as Record<string, unknown>);
    }
    if (gameId === "gratitude_volley") {
      await mergeGratitudeVolley(sessionId, createInitialGratitudeVolleyState() as unknown as Record<string, unknown>);
    }
    if (gameId === "emotion_translator") {
      await mergeEmotionTranslator(sessionId, createInitialEmotionTranslatorState() as unknown as Record<string, unknown>);
    }
    await updateSelectedGame(sessionId, gameId);
    await advanceStage(sessionId, "playing");
  };

  return (
    <div className="flex h-screen items-center justify-center flex-col px-4 w-full max-w-4xl mx-auto space-y-12">
      <div className="text-center space-y-4">
        <h2 className="text-4xl font-bold text-foreground tracking-tight">Choose a Path</h2>
        <p className="text-muted-foreground text-lg">Select a structured exercise to help break the pattern.</p>
      </div>

      {role === "userA" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          <button 
            onClick={() => selectGame("two_truths")}
            className="p-8 bg-white rounded-[2rem] shadow-sm border border-primary/10 hover:border-primary hover:shadow-xl transition-all text-left space-y-4 group relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-2 h-full bg-primary/20 group-hover:bg-primary transition-colors" />
            <h3 className="text-2xl font-bold text-foreground group-hover:text-primary transition-colors">Two Truths & a Dream</h3>
            <p className="text-muted-foreground text-base leading-relaxed">
              Shift focus from the past to the future you share. Write two real goals and one fake dream.
            </p>
          </button>
          
          <button 
            onClick={() => selectGame("emotion_translator")}
            className="p-8 bg-white rounded-[2rem] shadow-sm border border-primary/10 hover:border-primary hover:shadow-xl transition-all text-left space-y-4 group relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-2 h-full bg-primary/20 group-hover:bg-primary transition-colors" />
            <h3 className="text-2xl font-bold text-foreground group-hover:text-primary transition-colors">The Emotion Translator</h3>
            <p className="text-muted-foreground text-base leading-relaxed">
              Find the exact word for how you feel right now. Select from a grid of specific emotions privately, then reveal together.
            </p>
          </button>

          <button 
            onClick={() => selectGame("gratitude_volley")}
            className="p-8 bg-white rounded-[2rem] shadow-sm border border-primary/10 hover:border-primary hover:shadow-xl transition-all text-left space-y-4 group relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-2 h-full bg-primary/20 group-hover:bg-primary transition-colors" />
            <h3 className="text-2xl font-bold text-foreground group-hover:text-primary transition-colors">Gratitude Volley</h3>
            <p className="text-muted-foreground text-base leading-relaxed">
              Take turns naming one specific thing you are grateful for about each other — eight volleys total.
            </p>
          </button>

          <button 
            onClick={() => selectGame("blind_architect")}
            className="p-8 bg-white rounded-[2rem] shadow-sm border border-primary/10 hover:border-primary hover:shadow-xl transition-all text-left space-y-4 group relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-2 h-full bg-primary/20 group-hover:bg-primary transition-colors" />
            <h3 className="text-2xl font-bold text-foreground group-hover:text-primary transition-colors">Blind Architect</h3>
            <p className="text-muted-foreground text-base leading-relaxed">
              One of you describes a shape blueprint with positions only; the other draws from your words — then compare.
            </p>
          </button>
        </div>
      ) : (
        <div className="p-12 bg-white/60 rounded-[2rem] border border-primary/10 text-center w-full shadow-sm max-w-xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-primary font-medium text-lg">Waiting for your partner to select an exercise...</p>
          </div>
        </div>
      )}
    </div>
  );
}
