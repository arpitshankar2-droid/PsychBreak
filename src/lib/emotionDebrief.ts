/**
 * Picks a single debrief prompt from two players' Emotion Translator selections.
 * Priority: heavy negative → unexpected/salient mismatch → pos/neg mix → shared → default.
 */

const POSITIVE = new Set([
  "Proud",
  "Hopeful",
  "Relieved",
  "Appreciated",
  "Secure",
  "Calm",
  "Curious",
  "Nostalgic",
]);

const NEGATIVE = new Set([
  "Anxious",
  "Overlooked",
  "Exhausted",
  "Lonely",
  "Frustrated",
  "Misunderstood",
  "Angry",
  "Overwhelmed",
  "Confused",
  "Insecure",
  "Defensive",
  "Resentful",
  "Sad",
  "Conflicted",
]);

/** Unique picks that tend to signal “this wasn’t named by both” relational cues. */
const SALIENT_UNEXPECTED = [
  "Overlooked",
  "Misunderstood",
  "Frustrated",
  "Lonely",
  "Insecure",
  "Resentful",
  "Defensive",
  "Angry",
  "Anxious",
  "Exhausted",
] as const;

export type EmotionDebriefPick = {
  question: string;
  subtitle: string;
  category:
    | "both_negative"
    | "unexpected"
    | "mixed_valence"
    | "shared"
    | "default";
};

function hasPositive(emotions: string[]) {
  return emotions.some((e) => POSITIVE.has(e));
}

function hasNegative(emotions: string[]) {
  return emotions.some((e) => NEGATIVE.has(e));
}

function pickSalientUnexpected(onlyA: string[], onlyB: string[]): string | null {
  const rank = new Map<string, number>();
  SALIENT_UNEXPECTED.forEach((e, i) => rank.set(e, i));
  const pool = [...onlyA, ...onlyB];
  const scored = pool
    .filter((e) => rank.has(e))
    .sort((a, b) => (rank.get(a)! - rank.get(b)!));
  return scored[0] ?? null;
}

/** One-line insight from both players’ grids — rule-based, not generic advice. */
export function computeEmotionInsightLine(userA: string[], userB: string[]): string {
  const setA = new Set(userA);
  const setB = new Set(userB);
  const shared = userA.filter((e) => setB.has(e));
  const onlyA = userA.filter((e) => !setB.has(e));
  const onlyB = userB.filter((e) => !setA.has(e));

  const sharedNegative = shared.some((e) => NEGATIVE.has(e));
  const bothAllNegative = !hasPositive(userA) && !hasPositive(userB);
  if (bothAllNegative && sharedNegative) {
    return "You were both hurting. That's not nothing.";
  }

  const heardGap =
    onlyA.some((e) => e === "Overlooked" || e === "Misunderstood") ||
    onlyB.some((e) => e === "Overlooked" || e === "Misunderstood");
  if (heardGap || pickSalientUnexpected(onlyA, onlyB)) {
    return "Your partner was carrying something you didn't see.";
  }

  const union = new Set([...userA, ...userB]);
  const unionHasPos = [...union].some((e) => POSITIVE.has(e));
  const unionHasNeg = [...union].some((e) => NEGATIVE.has(e));
  if (unionHasPos && unionHasNeg) {
    return "There's more going on than the argument.";
  }

  if (shared.length >= 2) {
    return "You lined up more than you might have guessed — that's a place to start.";
  }

  return "Putting words on feelings is already a bridge.";
}

/** Prompt for the 60s private writing phase (same for both players). */
export function pickPrivateReflectionQuestion(userA: string[], userB: string[]): string {
  const setA = new Set(userA);
  const setB = new Set(userB);
  const shared = userA.filter((e) => setB.has(e));

  if (
    shared.some((e) => e === "Frustrated" || e === "Angry" || e === "Resentful") ||
    (userA.includes("Frustrated") && userB.includes("Frustrated"))
  ) {
    return "What were you hoping would happen that didn't?";
  }
  if (userA.includes("Overlooked") || userB.includes("Overlooked")) {
    return "What's one moment where you felt truly heard by them recently?";
  }
  if (userA.includes("Proud") && userB.includes("Proud")) {
    return "What made this hard even though you were both trying?";
  }
  if (userA.includes("Misunderstood") || userB.includes("Misunderstood")) {
    return "What did you wish they had understood without you having to spell it out?";
  }
  return pickEmotionDebriefQuestion(userA, userB).question;
}

/** Closing “talk about this” — tailored, shown again under answers. */
export function pickClosingTalkFromEmotions(
  userA: string[],
  userB: string[]
): { question: string; subtitle: string } {
  const setA = new Set(userA);
  const setB = new Set(userB);
  const shared = userA.filter((e) => setB.has(e));

  if (shared.includes("Frustrated") || shared.includes("Angry") || shared.includes("Resentful")) {
    return {
      question: "What were you hoping would happen that didn't?",
      subtitle: "Stay with hopes and needs, not who was right.",
    };
  }
  if (userA.includes("Overlooked") || userB.includes("Overlooked")) {
    return {
      question: "What's one moment where you felt truly heard by them recently?",
      subtitle: "Small specifics beat big summaries.",
    };
  }
  if (userA.includes("Proud") && userB.includes("Proud")) {
    return {
      question: "What made this hard even though you were both trying?",
      subtitle: "Pride and difficulty can sit side by side.",
    };
  }

  const d = pickEmotionDebriefQuestion(userA, userB);
  return { question: d.question, subtitle: d.subtitle };
}

export function pickEmotionDebriefQuestion(userA: string[], userB: string[]): EmotionDebriefPick {
  const a = [...userA];
  const b = [...userB];
  const setA = new Set(a);
  const setB = new Set(b);
  const shared = a.filter((e) => setB.has(e));
  const onlyA = a.filter((e) => !setB.has(e));
  const onlyB = b.filter((e) => !setA.has(e));

  const union = new Set([...a, ...b]);
  const unionHasPos = [...union].some((e) => POSITIVE.has(e));
  const unionHasNeg = [...union].some((e) => NEGATIVE.has(e));

  const bothAllNegative = !hasPositive(a) && !hasPositive(b);

  const listsIdentical =
    onlyA.length === 0 &&
    onlyB.length === 0 &&
    shared.length > 0 &&
    a.length === b.length;

  if (listsIdentical) {
    if (bothAllNegative && unionHasNeg) {
      return {
        category: "both_negative",
        question: "What's one small thing that would have made this easier for each of you?",
        subtitle:
          "You lined up on the same difficult feelings. This question is about needs, not blame.",
      };
    }
    return {
      category: "shared",
      question: "What were you both hoping for in this moment?",
      subtitle: `You named the same feelings: ${shared.join(", ")}. Start from that common ground.`,
    };
  }

  const salient = pickSalientUnexpected(onlyA, onlyB);
  if (salient && (onlyA.length > 0 || onlyB.length > 0)) {
    const heardish = salient === "Overlooked" || salient === "Misunderstood";
    return {
      category: "unexpected",
      question: heardish
        ? `One of you felt ${salient} without the other choosing that word — what would feeling fully heard have looked like in that moment?`
        : `What was making you feel ${salient} underneath it all — especially where your lists didn’t match?`,
      subtitle: "Stay curious about the gap between your words, not who is right.",
    };
  }

  if (bothAllNegative && unionHasNeg) {
    return {
      category: "both_negative",
      question: "What's one small thing that would have made this easier for each of you?",
      subtitle:
        "You both named difficult feelings. This question is about needs, not blame.",
    };
  }

  if (unionHasPos && unionHasNeg) {
    return {
      category: "mixed_valence",
      question: "When this started to heat up, what were you each trying to protect?",
      subtitle: "Mixed lighter and heavier feelings often point to care underneath the friction.",
    };
  }

  if (shared.length > 0) {
    return {
      category: "shared",
      question: "What were you both hoping for in this moment?",
      subtitle: `You shared: ${shared.join(", ")}. Start from what you have in common.`,
    };
  }

  return {
    category: "default",
    question: "What surprised you about how your partner described something?",
    subtitle: "Take a moment to discuss together. There is no right answer.",
  };
}
