/** Gratitude Volley v2 — Firestore: gameData.gratitudeVolley */

export const INTRO_READ_MS = 10_000;
export const TURN_MS = 60_000;
export const FINAL_PAUSE_MS = 5_000;
export const MIN_CHARS = 12;
export const SOFT_MIN_WORDS = 10;
export const AIM_MIN_WORDS = 15;
export const AIM_MAX_WORDS = 40;

export type GratitudeLine = {
  id: string;
  author: "userA" | "userB";
  text: string;
};

export type GratitudeVolleyV2 = {
  v: 2;
  phase: "intro" | "playing" | "final_pause" | "closing";
  introAck: { userA: boolean; userB: boolean };
  introProceedAfter: number;
  lines: GratitudeLine[];
  turnDeadline: number | null;
  finalMomentStartedAt: number | null;
  spotlightAId: string | null;
  spotlightBId: string | null;
  archiveAck: { userA: boolean; userB: boolean };
};

export const TOTAL_VOLLEYS = 8;

export function createInitialGratitudeVolleyState(): GratitudeVolleyV2 {
  const now = Date.now();
  return {
    v: 2,
    phase: "intro",
    introAck: { userA: false, userB: false },
    introProceedAfter: now + INTRO_READ_MS,
    lines: [],
    turnDeadline: null,
    finalMomentStartedAt: null,
    spotlightAId: null,
    spotlightBId: null,
    archiveAck: { userA: false, userB: false },
  };
}

export function getVolleyTurn(lines: GratitudeLine[]): "userA" | "userB" {
  if (lines.length >= TOTAL_VOLLEYS) return "userA";
  return lines.length % 2 === 0 ? "userA" : "userB";
}

function newLineId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function lineId() {
  return newLineId();
}

/** Reject obvious generic / non-specific praise (not exhaustive). */
export function isGenericGratitude(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length < MIN_CHARS) return true;
  const collapsed = t.replace(/\s+/g, " ");

  const banned = [
    /^i love you[.!]?$/,
    /^love you[.!]?$/,
    /^i love u\b/,
    /^thank you for everything/,
    /^thanks for everything/,
    /^you'?re (the )?best[.!]?$/,
    /^you are (the )?best[.!]?$/,
    /^you'?re amazing[.!]?$/,
    /^you'?re wonderful[.!]?$/,
    /^you mean (the world|everything)/,
    /^grateful for you[.!]?$/,
    /^so grateful for you/,
    /^thanks for being you/,
    /^you do so much for me$/,
    /^i appreciate you[.!]?$/,
  ];
  if (banned.some((re) => re.test(collapsed))) return true;

  // Very short vague lines (few words, no concrete detail cues)
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 5) return true;
  if (words.length <= SOFT_MIN_WORDS && !/\d/.test(t) && !/(when|after|before|yesterday|today|last week|remember|noticed|brought|made|said|helped|showed)/i.test(t)) {
    return true;
  }

  return false;
}

export function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Migrate legacy flat gratitudeLines to v2 shape. */
export function migrateLegacyLines(
  legacy: { author: "userA" | "userB"; text: string }[]
): GratitudeLine[] {
  return legacy.map((l, i) => ({
    id: `mig-${i}-${newLineId()}`,
    author: l.author,
    text: l.text,
  }));
}

/** Same inputs ⇒ same id on both devices (for closing highlights). */
export function spotlightIdForAuthor(
  lines: GratitudeLine[],
  author: "userA" | "userB",
  sessionId: string
): string | null {
  const subset = lines.filter((l) => l.author === author);
  if (subset.length === 0) return null;
  const sorted = [...subset].sort((a, b) => `${a.text}\0${a.id}`.localeCompare(`${b.text}\0${b.id}`));
  let h = 0;
  const seed = `${sessionId}\0${author}`;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return sorted[h % sorted.length]!.id;
}
