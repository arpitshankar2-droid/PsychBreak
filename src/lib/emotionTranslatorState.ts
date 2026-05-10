/** Emotion Translator v2 — Firestore: gameData.emotionTranslator */

export const GRID_SELECT_MS = 90_000;
export const PRIVATE_WRITE_MS = 60_000;

/** 4×5 grid — mix of obvious and nuanced (order left-to-right, top-to-bottom). */
export const EMOTION_GRID_WORDS = [
  "Angry",
  "Sad",
  "Overlooked",
  "Nostalgic",
  "Conflicted",
  "Proud",
  "Anxious",
  "Exhausted",
  "Lonely",
  "Hopeful",
  "Frustrated",
  "Misunderstood",
  "Relieved",
  "Overwhelmed",
  "Appreciated",
  "Confused",
  "Secure",
  "Insecure",
  "Curious",
  "Defensive",
] as const;

export type EmotionTranslatorV2 = {
  v: 2;
  phase: "grid" | "emotion_reveal" | "private_write" | "closing";
  gridEndsAt: number;
  selections: { userA: string[] | null; userB: string[] | null };
  emotionRevealAck: { userA: boolean; userB: boolean };
  insightLine: string;
  privateQuestion: string;
  closingTalkQuestion: string;
  closingTalkSubtitle: string;
  privateWriteEndsAt: number | null;
  privateAnswers: { userA: string | null; userB: string | null };
};

export function createInitialEmotionTranslatorState(): EmotionTranslatorV2 {
  const now = Date.now();
  return {
    v: 2,
    phase: "grid",
    gridEndsAt: now + GRID_SELECT_MS,
    selections: { userA: null, userB: null },
    emotionRevealAck: { userA: false, userB: false },
    insightLine: "",
    privateQuestion: "",
    closingTalkQuestion: "",
    closingTalkSubtitle: "",
    privateWriteEndsAt: null,
    privateAnswers: { userA: null, userB: null },
  };
}
