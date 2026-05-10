import { advanceStage } from "@/lib/firebaseUtils";

export default function DebriefPrompt({ sessionId, session, role }: { sessionId: string, session?: any, role: string }) {
  const custom = session?.gameData?.debriefFromEmotions as
    | { question?: string; subtitle?: string; category?: string }
    | null
    | undefined;
  const question =
    typeof custom?.question === "string" && custom.question.length > 0
      ? custom.question
      : "What surprised you about how your partner described something?";
  const subtitle =
    typeof custom?.subtitle === "string" && custom.subtitle.length > 0
      ? custom.subtitle
      : "Take a moment to discuss this together. There is no right answer.";

  return (
    <div className="flex h-screen items-center justify-center flex-col px-4 text-center max-w-3xl mx-auto space-y-12">
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-primary uppercase tracking-widest">Debrief</h2>
        <h3 className="text-4xl font-bold text-foreground leading-tight">
          {question}
        </h3>
      </div>
      
      <p className="text-xl text-muted-foreground">
        {subtitle}
      </p>

      {role === "userA" ? (
        <button 
          onClick={() => advanceStage(sessionId, "return")}
          className="mt-8 px-10 py-5 bg-primary text-white rounded-[1.5rem] font-bold shadow-md hover:bg-primary/90 transition text-lg"
        >
          We're ready to check in
        </button>
      ) : (
        <p className="text-sm font-medium text-primary uppercase tracking-widest animate-pulse mt-8">
          Waiting for partner to continue...
        </p>
      )}
    </div>
  );
}
