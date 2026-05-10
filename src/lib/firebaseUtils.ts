"use client";

import { doc, setDoc, getDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

let listeners: any = { messages: {} };

const sessionRef = (sessionId: string) => doc(db, "sessions", sessionId);

const newSessionPayload = () => ({
  status: "active",
  users: ["userA", "userB"],
  currentTurn: "userA",
  strikeCount: 0,
  geminiCallCount: 0,
  stage: "invite",
  userBJoined: false,
  selectedGame: null,
  gameData: {},
  moods: { userA: 0, userB: 0 },
});

// --- Messages (still localStorage: First Aid chat is same-browser oriented) ---

const getFromStorage = (key: string) => {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
};

const saveToStorage = (key: string, data: any) => {
  if (typeof window !== "undefined") {
    localStorage.setItem(key, JSON.stringify(data));
    window.dispatchEvent(new Event("storage_sync"));
  }
};

const notifyMessages = (id: string) => {
  const messages = getFromStorage("lets_fix_it_messages");
  if (listeners.messages[id]) {
    listeners.messages[id].forEach((cb: any) => cb([...(messages[id] || [])]));
  }
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", () => {
    Object.keys(listeners.messages).forEach(notifyMessages);
  });
  window.addEventListener("storage_sync", () => {
    Object.keys(listeners.messages).forEach(notifyMessages);
  });
}

// ---------------------------------------------
// Sessions (Firestore — shared across devices)
// ---------------------------------------------

export const createSession = async () => {
  const id = Math.random().toString(36).substring(2, 8).toUpperCase();
  await setDoc(sessionRef(id), newSessionPayload());

  const messages = getFromStorage("lets_fix_it_messages");
  messages[id] = [];
  saveToStorage("lets_fix_it_messages", messages);

  return id;
};

/** Partner joins: mark joined and move both clients into the breathing stage. */
export const joinSession = async (sessionId: string) => {
  const ref = sessionRef(sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  await updateDoc(ref, {
    userBJoined: true,
    stage: "breathe",
  });
  return true;
};

export const sendMessage = async (
  sessionId: string,
  senderId: string,
  rawText: string,
  processedText: string,
  mis: any
) => {
  const messages = getFromStorage("lets_fix_it_messages");
  if (!messages[sessionId]) messages[sessionId] = [];
  messages[sessionId].push({
    id: Math.random().toString(36).substring(7),
    senderId,
    rawText,
    processedText,
    mis,
    status: "pending_acceptance",
  });
  saveToStorage("lets_fix_it_messages", messages);

  const ref = sessionRef(sessionId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, {
      currentTurn: senderId === "userA" ? "userB" : "userA",
    });
  }
};

export const reviseMessage = async (
  sessionId: string,
  strikeCount: number,
  currentTurn: string,
  reason: string
) => {
  const ref = sessionRef(sessionId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const newStrikeCount = strikeCount + 1;
    const patch: Record<string, unknown> = {
      strikeCount: newStrikeCount,
      currentTurn: currentTurn === "userA" ? "userB" : "userA",
    };
    if (newStrikeCount >= 3) {
      patch.status = "breakout";
      patch.stage = "breathe";
    } else {
      patch.status = "active";
    }
    await updateDoc(ref, patch);
  }

  const messages = getFromStorage("lets_fix_it_messages");
  if (messages[sessionId]) {
    messages[sessionId].push({
      id: Math.random().toString(36).substring(7),
      senderId: currentTurn,
      type: "rejection",
      reason,
    });
    saveToStorage("lets_fix_it_messages", messages);
  }
};

export const acceptSolution = async (sessionId: string) => {
  const ref = sessionRef(sessionId);
  const snap = await getDoc(ref);
  if (snap.exists()) await updateDoc(ref, { status: "handshake" });
};

export const triggerCircuitBreaker = async (sessionId: string) => {
  const ref = sessionRef(sessionId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { status: "breakout", stage: "breathe" });
  }
};

export const incrementGeminiCall = async (sessionId: string) => {
  const ref = sessionRef(sessionId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const n = (snap.data().geminiCallCount || 0) + 1;
    await updateDoc(ref, { geminiCallCount: n });
  }
};

export const advanceStage = async (sessionId: string, newStage: string) => {
  const ref = sessionRef(sessionId);
  const snap = await getDoc(ref);
  if (snap.exists()) await updateDoc(ref, { stage: newStage });
};

export const updateSelectedGame = async (sessionId: string, gameId: string) => {
  const ref = sessionRef(sessionId);
  const snap = await getDoc(ref);
  if (snap.exists()) await updateDoc(ref, { selectedGame: gameId });
};

export const updateGameData = async (sessionId: string, newData: any) => {
  const ref = sessionRef(sessionId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const prev = (snap.data().gameData || {}) as Record<string, unknown>;
    await updateDoc(ref, { gameData: { ...prev, ...newData } });
  }
};

/** Firestore rejects `undefined`; strip recursively for nested maps and arrays. */
function stripUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)).filter((item) => item !== undefined);
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] = stripUndefinedDeep(v);
  }
  return out;
}

/** Deep-merge `gameData.blindArchitect` so nested fields are not wiped by a shallow gameData merge. */
export const mergeBlindArchitect = async (sessionId: string, patch: Record<string, unknown>) => {
  const ref = sessionRef(sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const prev = (snap.data().gameData || {}) as Record<string, unknown>;
  const prevBlind = (prev.blindArchitect || {}) as Record<string, unknown>;
  const nextBlind = stripUndefinedDeep({ ...prevBlind, ...patch }) as Record<string, unknown>;
  await updateDoc(ref, {
    gameData: {
      ...prev,
      blindArchitect: nextBlind,
    },
  });
};

/** Deep-merge `gameData.emotionTranslator` for Emotion Translator v2 (selections / answers merge per-field). */
export const mergeEmotionTranslator = async (sessionId: string, patch: Record<string, unknown>) => {
  const ref = sessionRef(sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const prev = (snap.data().gameData || {}) as Record<string, unknown>;
  const prevEt = (prev.emotionTranslator || {}) as Record<string, unknown>;
  const prevSel = (prevEt.selections || {}) as Record<string, unknown>;
  const prevAns = (prevEt.privateAnswers || {}) as Record<string, unknown>;
  const prevAck = (prevEt.emotionRevealAck || {}) as Record<string, unknown>;

  const nextEt: Record<string, unknown> = { ...prevEt, ...patch };

  if (patch.selections != null && typeof patch.selections === "object") {
    const p = patch.selections as Record<string, unknown>;
    nextEt.selections = {
      userA: p.userA !== undefined ? p.userA : prevSel.userA,
      userB: p.userB !== undefined ? p.userB : prevSel.userB,
    };
  }
  if (patch.privateAnswers != null && typeof patch.privateAnswers === "object") {
    const p = patch.privateAnswers as Record<string, unknown>;
    nextEt.privateAnswers = {
      userA: p.userA !== undefined ? p.userA : prevAns.userA,
      userB: p.userB !== undefined ? p.userB : prevAns.userB,
    };
  }
  if (patch.emotionRevealAck != null && typeof patch.emotionRevealAck === "object") {
    const p = patch.emotionRevealAck as Record<string, unknown>;
    nextEt.emotionRevealAck = {
      userA: p.userA !== undefined ? p.userA : prevAck.userA,
      userB: p.userB !== undefined ? p.userB : prevAck.userB,
    };
  }

  await updateDoc(ref, {
    gameData: {
      ...prev,
      emotionTranslator: stripUndefinedDeep(nextEt) as Record<string, unknown>,
    },
  });
};

/** Deep-merge `gameData.syncSwitch` (picks / acks / private answers per-field). */
export const mergeSyncSwitch = async (sessionId: string, patch: Record<string, unknown>) => {
  const ref = sessionRef(sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const prev = (snap.data().gameData || {}) as Record<string, unknown>;
  const prevSs = (prev.syncSwitch || {}) as Record<string, unknown>;
  const prevPicks = (prevSs.picks || {}) as Record<string, unknown>;
  const prevIntro = (prevSs.introReady || {}) as Record<string, unknown>;
  const prevBreath = (prevSs.breathingAck || {}) as Record<string, unknown>;
  const prevPriv = (prevSs.privateAnswers || {}) as Record<string, unknown>;

  const nextSs: Record<string, unknown> = { ...prevSs, ...patch };

  if (patch.picks != null && typeof patch.picks === "object") {
    const p = patch.picks as Record<string, unknown>;
    nextSs.picks = {
      userA: p.userA !== undefined ? p.userA : prevPicks.userA,
      userB: p.userB !== undefined ? p.userB : prevPicks.userB,
    };
  }
  if (patch.introReady != null && typeof patch.introReady === "object") {
    const p = patch.introReady as Record<string, unknown>;
    nextSs.introReady = {
      userA: p.userA !== undefined ? p.userA : prevIntro.userA,
      userB: p.userB !== undefined ? p.userB : prevIntro.userB,
    };
  }
  if (patch.breathingAck != null && typeof patch.breathingAck === "object") {
    const p = patch.breathingAck as Record<string, unknown>;
    nextSs.breathingAck = {
      userA: p.userA !== undefined ? p.userA : prevBreath.userA,
      userB: p.userB !== undefined ? p.userB : prevBreath.userB,
    };
  }
  if (patch.privateAnswers != null && typeof patch.privateAnswers === "object") {
    const p = patch.privateAnswers as Record<string, unknown>;
    nextSs.privateAnswers = {
      userA: p.userA !== undefined ? p.userA : prevPriv.userA,
      userB: p.userB !== undefined ? p.userB : prevPriv.userB,
    };
  }

  await updateDoc(ref, {
    gameData: {
      ...prev,
      syncSwitch: stripUndefinedDeep(nextSs) as Record<string, unknown>,
    },
  });
};

/** Deep-merge `gameData.gratitudeVolley` for Gratitude Volley v2. */
export const mergeGratitudeVolley = async (sessionId: string, patch: Record<string, unknown>) => {
  const ref = sessionRef(sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const prev = (snap.data().gameData || {}) as Record<string, unknown>;
  const prevGv = (prev.gratitudeVolley || {}) as Record<string, unknown>;
  const nextGv = stripUndefinedDeep({ ...prevGv, ...patch }) as Record<string, unknown>;
  await updateDoc(ref, {
    gameData: {
      ...prev,
      gratitudeVolley: nextGv,
    },
  });
};

/** Deep-merge `gameData.sharedFuture` for Two Truths & a Dream v2. */
export const mergeSharedFuture = async (sessionId: string, patch: Record<string, unknown>) => {
  const ref = sessionRef(sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const prev = (snap.data().gameData || {}) as Record<string, unknown>;
  const prevSf = (prev.sharedFuture || {}) as Record<string, unknown>;
  const nextSf = stripUndefinedDeep({ ...prevSf, ...patch }) as Record<string, unknown>;
  await updateDoc(ref, {
    gameData: {
      ...prev,
      sharedFuture: nextSf,
    },
  });
};

export const appendBlindChatMessages = async (
  sessionId: string,
  msgs: unknown[],
  patch: Record<string, unknown> = {}
) => {
  const ref = sessionRef(sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const prev = (snap.data().gameData || {}) as Record<string, unknown>;
  const prevBlind = (prev.blindArchitect || {}) as Record<string, unknown>;
  const existing = Array.isArray(prevBlind.messages) ? prevBlind.messages : [];
  const nextBlind = stripUndefinedDeep({
    ...prevBlind,
    ...patch,
    messages: [...existing, ...msgs],
  }) as Record<string, unknown>;
  await updateDoc(ref, {
    gameData: {
      ...prev,
      blindArchitect: nextBlind,
    },
  });
};

export const updateMood = async (sessionId: string, user: "userA" | "userB", score: number) => {
  const ref = sessionRef(sessionId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { [`moods.${user}`]: score });
  }
};

export const clearMoods = async (sessionId: string) => {
  const ref = sessionRef(sessionId);
  const snap = await getDoc(ref);
  if (snap.exists()) await updateDoc(ref, { moods: { userA: 0, userB: 0 } });
};

export const resetToConversation = async (sessionId: string) => {
  const ref = sessionRef(sessionId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, {
      status: "active",
      strikeCount: 0,
      moods: { userA: 0, userB: 0 },
    });
  }
};

export const subscribeToSession = (sessionId: string, callback: (data: any) => void) => {
  return onSnapshot(
    sessionRef(sessionId),
    (snap) => {
      if (!snap.exists()) callback("not_found");
      else callback({ id: sessionId, ...snap.data() });
    },
    () => callback("not_found")
  );
};

export const subscribeToMessages = (sessionId: string, callback: (msgs: any[]) => void) => {
  if (!listeners.messages[sessionId]) listeners.messages[sessionId] = [];
  listeners.messages[sessionId].push(callback);
  const messages = getFromStorage("lets_fix_it_messages");
  if (messages[sessionId]) setTimeout(() => callback([...messages[sessionId]]), 0);
  return () => {
    listeners.messages[sessionId] = listeners.messages[sessionId].filter((cb: any) => cb !== callback);
  };
};
