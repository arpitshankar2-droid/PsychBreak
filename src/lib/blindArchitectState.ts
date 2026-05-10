/** Blind Architect v2 — turn-based chat, two rounds, shared Firestore state. */

export type BAChatMsg = {
  id: string;
  at: number;
  fromRole: "userA" | "userB";
  seat: "describer" | "drawer";
  kind: "instruction" | "clarify" | "answer" | "done" | "system" | "blocked_attempt";
  text: string;
  blockedWords?: string[];
};

export type BARoundArchive = {
  round: 1 | 2;
  blueprintIndex: number;
  messages: BAChatMsg[];
  drawingDataUrl: string | null;
  highlightMessageId: string | null;
  describerRole: "userA" | "userB";
  violationsRound: { userA: number; userB: number };
};

export type BlindArchitectV2 = {
  v: 2;
  phase:
    | "rules"
    | "study"
    | "chat"
    | "locking"
    | "reveal"
    | "closing"
    | "reflection_private"
    | "reflection_reveal"
    | "final_mood";
  round: 1 | 2;
  describerRole: "userA" | "userB";
  rulesAck: { userA: boolean; userB: boolean };
  studyEndsAt: number | null;
  roundTimerEndsAt: number | null;
  chatLocked: boolean;
  canvasLocked: boolean;
  messages: BAChatMsg[];
  chatSubphase: "instruction" | "after_instruction" | "awaiting_answer";
  lastInstructionAt: number | null;
  clarifyReceivedThisCycle: boolean;
  blueprintIndex: number;
  blueprintIndexR1: number;
  /** Picked at session start so round 2 does not reshuffle on reload. */
  blueprintIndexR2: number;
  roundDrawingDataUrl: string | null;
  round1Archive: BARoundArchive | null;
  round2Archive: BARoundArchive | null;
  violations: { userA: number; userB: number };
  lockingUntil: number | null;
  describerDone: boolean;
  reflectionText: { userA: string; userB: string };
  reflectionSubmitted: { userA: boolean; userB: boolean };
  reflectionEndsAt: number | null;
};

const BANNED_WORDS = [
  "house",
  "home",
  "door",
  "window",
  "roof",
  "tree",
  "sun",
  "moon",
  "star",
  "car",
  "road",
  "sign",
  "arrow",
  "face",
  "person",
  "people",
  "heart",
  "flower",
  "bird",
  "fish",
  "boat",
  "clock",
  "chair",
  "table",
  "book",
  "phone",
  "building",
  "tower",
  "bridge",
  "fence",
  "grass",
  "cloud",
  "smile",
  "hand",
  "foot",
  "animal",
  "dog",
  "cat",
];

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findObjectNameViolations(text: string): string[] {
  const found: string[] = [];
  const lower = text.toLowerCase();
  for (const w of BANNED_WORDS) {
    const re = new RegExp(`\\b${escapeRe(w)}\\b`, "i");
    if (re.test(lower)) found.push(w);
  }
  return [...new Set(found)];
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createInitialBlindArchitectState(): BlindArchitectV2 {
  const describerRole: "userA" | "userB" = Math.random() < 0.5 ? "userA" : "userB";
  const blueprintIndexR1 = Math.floor(Math.random() * 6);
  let blueprintIndexR2 = Math.floor(Math.random() * 6);
  if (blueprintIndexR2 === blueprintIndexR1) blueprintIndexR2 = (blueprintIndexR2 + 1) % 6;

  return {
    v: 2,
    phase: "rules",
    round: 1,
    describerRole,
    rulesAck: { userA: false, userB: false },
    studyEndsAt: null,
    roundTimerEndsAt: null,
    chatLocked: false,
    canvasLocked: false,
    messages: [],
    chatSubphase: "instruction",
    lastInstructionAt: null,
    clarifyReceivedThisCycle: false,
    blueprintIndex: blueprintIndexR1,
    blueprintIndexR1,
    blueprintIndexR2: blueprintIndexR2,
    roundDrawingDataUrl: null,
    round1Archive: null,
    round2Archive: null,
    violations: { userA: 0, userB: 0 },
    lockingUntil: null,
    describerDone: false,
    reflectionText: { userA: "", userB: "" },
    reflectionSubmitted: { userA: false, userB: false },
    reflectionEndsAt: null,
  };
}

/** Heuristic: prefer instruction followed by a clarify; else longest instruction. */
export function pickHighlightMessageId(messages: BAChatMsg[]): string | null {
  const instructions = messages.filter((m) => m.kind === "instruction");
  if (instructions.length === 0) return null;

  let best: BAChatMsg | null = null;
  let bestScore = -1;

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.kind !== "instruction") continue;
    const next = messages[i + 1];
    const followedByClarify = next?.kind === "clarify" ? 1 : 0;
    const score = followedByClarify * 100 + m.text.length;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }

  return best?.id ?? instructions[instructions.length - 1]?.id ?? null;
}

/**
 * Human-readable reason the UI highlighted this message (matches pickHighlightMessageId heuristics).
 */
export function explainHighlightMessage(messages: BAChatMsg[], highlightId: string | null): string | null {
  if (!highlightId) return null;
  const idx = messages.findIndex((m) => m.id === highlightId);
  if (idx < 0) return null;
  const m = messages[idx];
  if (m.kind !== "instruction") {
    return "This line was selected to anchor your debrief — compare it with the drawing and the rest of the thread.";
  }
  const next = messages[idx + 1];
  if (next?.kind === "clarify") {
    const q = next.text.length > 120 ? `${next.text.slice(0, 117)}…` : next.text;
    return `The drawer asked a clarifying question right after this (“${q}”). The app surfaces that moment as a useful spot to compare words and picture — not because this instruction was “wrong.”`;
  }
  return "Among the describer’s instructions, this one was highlighted as a longer line to revisit — useful for noticing small gaps between what was said and what appeared on the canvas.";
}

export function summarizeMiscommunicationLines(
  r1: BARoundArchive | null,
  r2: BARoundArchive | null,
  maxLines: number
): { text: string; messageId: string | null }[] {
  const scored: { text: string; messageId: string | null; score: number }[] = [];

  const scoreRound = (arc: BARoundArchive | null) => {
    if (!arc) return;
    for (let i = 0; i < arc.messages.length; i++) {
      const m = arc.messages[i];
      if (m.kind !== "instruction") continue;
      const next = arc.messages[i + 1];
      const followedByClarify = next?.kind === "clarify" ? 1 : 0;
      const score = followedByClarify * 100 + m.text.length + (arc.round === 2 ? 1 : 0);
      scored.push({ text: m.text, messageId: m.id, score });
    }
  };

  scoreRound(r1);
  scoreRound(r2);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxLines).map(({ text, messageId }) => ({ text, messageId }));
}

export function makeMessage(
  partial: Omit<BAChatMsg, "id" | "at"> & { id?: string; at?: number }
): BAChatMsg {
  const m: BAChatMsg = {
    id: partial.id ?? newId(),
    at: partial.at ?? Date.now(),
    fromRole: partial.fromRole,
    seat: partial.seat,
    kind: partial.kind,
    text: partial.text,
  };
  if (partial.blockedWords != null && partial.blockedWords.length > 0) {
    m.blockedWords = partial.blockedWords;
  }
  return m;
}

export { newId as baNewId };
