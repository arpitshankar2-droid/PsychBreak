/** Two Truths & a Dream — v2 structured session state (Firestore: gameData.sharedFuture). */

export const INTRO_READ_MS = 15_000;
export const WRITE_PHASE_MS = 120_000;
export const DISCUSSION_MS = 30_000;
export const MAX_DREAM_LEN = 120;

export type SharedFuturePhase =
  | "intro"
  | "a_write"
  | "b_guess_a"
  | "reveal_a"
  | "b_write"
  | "a_guess_b"
  | "reveal_b"
  | "closing";

export type SharedFutureV2 = {
  v: 2;
  phase: SharedFuturePhase;
  introReady: { userA: boolean; userB: boolean };
  /** Earliest time the "I'm ready" button activates (~15s read). */
  introReadyAfter: number;
  aSubmitted: boolean;
  aDreams: [string, string, string] | null;
  /** Index 0–2 of the invented dream. */
  aFakeIndex: number | null;
  aWriteEndsAt: number | null;
  bGuessA: number | null;
  discussAEndsAt: number | null;
  bSubmitted: boolean;
  bDreams: [string, string, string] | null;
  bFakeIndex: number | null;
  bWriteEndsAt: number | null;
  aGuessB: number | null;
  discussBEndsAt: number | null;
  journalAck: { userA: boolean; userB: boolean };
};

export function createInitialSharedFutureState(): SharedFutureV2 {
  const now = Date.now();
  return {
    v: 2,
    phase: "intro",
    introReady: { userA: false, userB: false },
    introReadyAfter: now + INTRO_READ_MS,
    aSubmitted: false,
    aDreams: null,
    aFakeIndex: null,
    aWriteEndsAt: null,
    bGuessA: null,
    discussAEndsAt: null,
    bSubmitted: false,
    bDreams: null,
    bFakeIndex: null,
    bWriteEndsAt: null,
    aGuessB: null,
    discussBEndsAt: null,
    journalAck: { userA: false, userB: false },
  };
}

const THEME_KEYWORDS: { label: string; words: string[] }[] = [
  { label: "adventure and travel", words: ["travel", "trip", "abroad", "vacation", "explore", "wander", "backpack", "move abroad"] },
  { label: "family and home", words: ["family", "kids", "children", "parent", "home", "house", "partner", "marriage", "together"] },
  { label: "career and craft", words: ["career", "job", "business", "startup", "promotion", "work", "lead", "build", "learn", "degree", "study"] },
  { label: "health and peace", words: ["health", "peace", "calm", "therapy", "strong", "rest", "heal", "mindful"] },
  { label: "creativity", words: ["write", "book", "art", "music", "film", "design", "create", "perform"] },
  { label: "community", words: ["community", "friends", "volunteer", "help", "mentor", "teach"] },
];

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function textMatchesTheme(text: string, words: string[]) {
  const t = norm(text);
  return words.some((w) => t.includes(w));
}

/** If both players' real dreams mention the same theme bucket, return a short overlap line. */
export function findSharedFutureThemeOverlap(
  aReal: string[],
  bReal: string[]
): string | null {
  const aBlob = aReal.join(" ");
  const bBlob = bReal.join(" ");
  for (const { label, words } of THEME_KEYWORDS) {
    if (textMatchesTheme(aBlob, words) && textMatchesTheme(bBlob, words)) {
      return `You both want something around ${label}.`;
    }
  }
  return null;
}

export function realDreams(dreams: [string, string, string], fakeIndex: number): string[] {
  return dreams.filter((_, i) => i !== fakeIndex);
}
