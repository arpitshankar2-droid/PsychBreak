"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  mergeSyncSwitch,
  advanceStage,
  clearMoods,
  setSyncSwitchPick,
  setSyncSwitchIntroReady,
  setSyncSwitchBreathingAck,
  setSyncSwitchPrivateAnswer,
} from "@/lib/firebaseUtils";
import {
  NUDGE_SHOW_MS,
  SILENT_MISS_ADVANCE_MS,
  VICTORY_PAUSE_MS,
  PRIVATE_WRITE_MS,
  type PickSide,
  type SyncSwitchV2,
  closingInsight,
  computeSemanticMatch,
  createInitialSyncSwitchState,
  startRoundPatch,
  swapForUser,
  wordForPick,
} from "@/lib/syncSwitchState";
import { Loader2 } from "lucide-react";

type SessionShape = { gameData?: Record<string, unknown> };

function promptTierLabel(c: SyncSwitchV2["promptCategory"]): string {
  switch (c) {
    case "directional":
      return "Baseline";
    case "preference":
      return "Preference";
    case "absurd":
      return "Playful";
    case "final":
      return "Final sync";
    default:
      return c;
  }
}

function vibe(ms: number) {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    if (ms > 40) navigator.vibrate([12, 24, 12, 24, 12]);
    else navigator.vibrate(35);
  }
}

function GentleBloom() {
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <motion.span
          key={i}
          className="absolute w-3 h-3 rounded-full bg-primary/40"
          initial={{ scale: 0, opacity: 0.8 }}
          animate={{ scale: 6 + i, opacity: 0 }}
          transition={{ duration: 1.4, delay: i * 0.08, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

/** Canvas confetti — dynamic import so SSR never touches `document`. */
function VictoryConfetti() {
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    let cancelled = false;
    void import("canvas-confetti").then((mod) => {
      if (cancelled) return;
      const confetti = mod.default;
      const colors = ["#34d399", "#fbbf24", "#a78bfa", "#f472b6", "#38bdf8", "#4ade80"];
      confetti({
        particleCount: 95,
        spread: 68,
        origin: { y: 0.55 },
        colors,
        scalar: 0.95,
        ticks: 220,
      });
      window.setTimeout(() => {
        if (cancelled) return;
        confetti({ particleCount: 45, angle: 60, spread: 58, origin: { x: 0, y: 0.62 }, colors });
        confetti({ particleCount: 45, angle: 120, spread: 58, origin: { x: 1, y: 0.62 }, colors });
      }, 320);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}

export default function SynchronizationSwitch({
  sessionId,
  session,
  role,
}: {
  sessionId: string;
  session: SessionShape;
  role: string;
}) {
  const r = role as "userA" | "userB";
  const raw = session.gameData?.syncSwitch as SyncSwitchV2 | undefined;
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const seedRef = useRef(false);
  const resolvedRoundRef = useRef<string | null>(null);
  const celebratedRef = useRef(false);
  const revealAdvanceKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), 100);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (seedRef.current || r !== "userA") return;
    if (raw?.v === 2) return;
    seedRef.current = true;
    void mergeSyncSwitch(sessionId, createInitialSyncSwitchState() as unknown as Record<string, unknown>);
  }, [raw, r, sessionId]);

  const ss = raw?.v === 2 ? raw : null;
  const now = Date.now();

  const submitPick = async (side: PickSide) => {
    if (!ss || ss.phase !== "round_active") return;
    if (r === "userA" && ss.picks.userA) return;
    if (r === "userB" && ss.picks.userB) return;
    try {
      await setSyncSwitchPick(sessionId, r, side);
    } catch (e) {
      console.error("setSyncSwitchPick", e);
    }
  };

  const resolveRound = useCallback(async () => {
    if (!ss || ss.phase !== "round_active") return;
    const t = Date.now();
    const deadline = ss.roundStartedAt + ss.windowMs;
    const timedOut = t >= deadline;
    const pa = ss.picks.userA;
    const pb = ss.picks.userB;
    if (!timedOut && (pa == null || pb == null)) return;

    if (resolvedRoundRef.current === ss.roundId) return;
    resolvedRoundRef.current = ss.roundId;

    const swapA = swapForUser("userA", ss);
    const swapB = swapForUser("userB", ss);
    const match = computeSemanticMatch(pa, pb, swapA, swapB, ss.optionLeft, ss.optionRight);
    const pickedWord =
      match && pa ? wordForPick(pa, swapA, ss.optionLeft, ss.optionRight) : "";

    let newStreak = match ? ss.streak + 1 : 0;
    let newMiss = match ? 0 : ss.consecutiveMisses + 1;
    const showWarmNudge = !match && newMiss >= 3 && newMiss <= 4;
    const toBreathing = !match && newMiss >= 5;

    const nextHistory =
      match && pickedWord
        ? [...ss.matchHistory, { title: ss.title, choice: pickedWord }]
        : ss.matchHistory;

    const lastAbsurd =
      match && ss.promptCategory === "absurd"
        ? `${ss.title}: ${ss.optionLeft} / ${ss.optionRight}`
        : ss.lastAbsurdTitle;

    const revealAdvanceAt = t + (showWarmNudge ? NUDGE_SHOW_MS : SILENT_MISS_ADVANCE_MS);

    if (match && newStreak >= 5) {
      vibe(80);
      const insight = closingInsight(ss.title, ss.optionLeft, ss.optionRight, pickedWord);
      await mergeSyncSwitch(sessionId, {
        phase: "victory_pause",
        streak: newStreak,
        consecutiveMisses: 0,
        revealMatch: true,
        revealPickA: pa,
        revealPickB: pb,
        showWarmNudge: false,
        revealAdvanceAt: null,
        matchHistory: nextHistory,
        victoryStartedAt: t,
        insightLine: insight,
        talkQuestion:
          ss.lastAbsurdTitle || lastAbsurd
            ? "Which absurd one made you laugh — and did matching on it feel easier or harder than the serious picks?"
            : "Which one surprised you — that you matched on something, or that you almost didn’t?",
        lastAbsurdTitle: lastAbsurd || ss.lastAbsurdTitle,
      });
      return;
    }

    vibe(match ? 30 : 50);

    if (toBreathing) {
      await mergeSyncSwitch(sessionId, {
        phase: "round_reveal",
        revealMatch: match,
        revealPickA: pa,
        revealPickB: pb,
        showWarmNudge,
        revealAdvanceAt: t + SILENT_MISS_ADVANCE_MS,
        streak: newStreak,
        consecutiveMisses: newMiss,
        matchHistory: nextHistory,
        lastAbsurdTitle: lastAbsurd ?? ss.lastAbsurdTitle,
      });
      return;
    }

    await mergeSyncSwitch(sessionId, {
      phase: "round_reveal",
      revealMatch: match,
      revealPickA: pa,
      revealPickB: pb,
      showWarmNudge,
      revealAdvanceAt,
      streak: newStreak,
      consecutiveMisses: newMiss,
      matchHistory: nextHistory,
      lastAbsurdTitle: lastAbsurd ?? ss.lastAbsurdTitle,
    });
  }, [ss, sessionId]);

  useEffect(() => {
    if (!ss || ss.phase !== "round_active") return;
    void resolveRound();
  }, [ss, ss?.phase, ss?.roundId, ss?.picks?.userA, ss?.picks?.userB, ss?.roundStartedAt, tick, resolveRound]);

  useEffect(() => {
    if (!ss || ss.phase !== "intro") return;
    if (!ss.introReady.userA || !ss.introReady.userB) return;
    if (r !== "userA") return;
    const patch = startRoundPatch(0, ss.usedPromptIds, ss.roundSeq);
    void mergeSyncSwitch(sessionId, patch);
  }, [ss?.phase, ss?.introReady?.userA, ss?.introReady?.userB, r, sessionId, ss?.usedPromptIds, ss?.roundSeq]);

  useEffect(() => {
    if (!ss || ss.phase !== "round_reveal" || ss.revealAdvanceAt == null) return;
    const t = Date.now();
    if (t < ss.revealAdvanceAt) return;
    if (r !== "userA") return;
    const advKey = `${ss.roundId}-${ss.revealAdvanceAt}`;
    if (revealAdvanceKeyRef.current === advKey) return;
    revealAdvanceKeyRef.current = advKey;

    const newMiss = ss.consecutiveMisses;
    if (newMiss >= 5 && !ss.revealMatch) {
      void mergeSyncSwitch(sessionId, {
        phase: "breathing_pause",
        breathingAck: { userA: false, userB: false },
        revealMatch: null,
        revealPickA: null,
        revealPickB: null,
        showWarmNudge: false,
        revealAdvanceAt: null,
      });
      return;
    }

    if (ss.revealMatch && ss.streak >= 5) return;

    const patch = startRoundPatch(ss.streak, ss.usedPromptIds, ss.roundSeq);
    void mergeSyncSwitch(sessionId, {
      ...patch,
      revealMatch: null,
      revealPickA: null,
      revealPickB: null,
      showWarmNudge: false,
      revealAdvanceAt: null,
    });
  }, [ss, r, sessionId, tick]);

  useEffect(() => {
    if (ss?.phase !== "round_reveal") revealAdvanceKeyRef.current = null;
  }, [ss?.phase]);

  useEffect(() => {
    if (!ss || ss.phase !== "victory_pause" || !ss.victoryStartedAt) return;
    if (Date.now() < ss.victoryStartedAt + VICTORY_PAUSE_MS) return;
    if (r !== "userA") return;
    if (celebratedRef.current) return;
    celebratedRef.current = true;
    void mergeSyncSwitch(sessionId, {
      phase: "private_write",
      privateWriteEndsAt: Date.now() + PRIVATE_WRITE_MS,
      victoryStartedAt: null,
    });
  }, [ss, r, sessionId, tick]);

  useEffect(() => {
    if (!ss || ss.phase !== "private_write") return;
    const a = ss.privateAnswers.userA?.trim();
    const b = ss.privateAnswers.userB?.trim();
    if (!a || !b) return;
    void mergeSyncSwitch(sessionId, { phase: "closing" });
  }, [ss?.phase, ss?.privateAnswers?.userA, ss?.privateAnswers?.userB, sessionId]);

  useEffect(() => {
    if (!ss || ss.phase !== "round_active") {
      resolvedRoundRef.current = null;
    }
  }, [ss?.phase, ss?.roundId]);

  useEffect(() => {
    if (ss?.phase !== "victory_pause") celebratedRef.current = false;
  }, [ss?.phase]);

  if (!ss) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  const introSecs = Math.max(0, Math.ceil((ss.introReadyAfter - now) / 1000));

  const ackIntro = async () => {
    if (now < ss.introReadyAfter) return;
    setBusy(true);
    try {
      await setSyncSwitchIntroReady(sessionId, r, true);
    } catch (e) {
      console.error("setSyncSwitchIntroReady", e);
    }
    setBusy(false);
  };

  const ackBreathing = async () => {
    setBusy(true);
    try {
      await setSyncSwitchBreathingAck(sessionId, r, true);
    } catch (e) {
      console.error("setSyncSwitchBreathingAck", e);
    }
    setBusy(false);
  };

  useEffect(() => {
    if (!ss || ss.phase !== "breathing_pause") return;
    if (!ss.breathingAck.userA || !ss.breathingAck.userB) return;
    if (r !== "userA") return;
    void mergeSyncSwitch(sessionId, {
      consecutiveMisses: 0,
      breathingAck: { userA: false, userB: false },
      ...startRoundPatch(0, ss.usedPromptIds, ss.roundSeq),
    });
  }, [ss?.phase, ss?.breathingAck?.userA, ss?.breathingAck?.userB, r, sessionId, ss?.usedPromptIds, ss?.roundSeq]);

  const submitPrivate = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    try {
      await setSyncSwitchPrivateAnswer(sessionId, r, t);
    } catch (e) {
      console.error("setSyncSwitchPrivateAnswer", e);
    }
  };

  const finishMood = async () => {
    await clearMoods(sessionId);
    await advanceStage(sessionId, "return");
  };

  // ——— Intro ———
  if (ss.phase === "intro") {
    const both = ss.introReady.userA && ss.introReady.userB;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 max-w-md mx-auto w-full space-y-8">
        <p className="text-xs font-bold text-primary uppercase tracking-widest text-center">Synchronization Switch</p>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl font-bold text-foreground text-center leading-snug"
        >
          Pick the same answer as your partner at the same time. That's it.
        </motion.p>
        <motion.div
          className="flex justify-center gap-4 items-end h-28"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <motion.div
            className="w-14 h-20 rounded-xl bg-white border-2 border-primary/20 shadow-md flex flex-col items-center justify-end pb-2"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 1.2, repeat: 3, repeatDelay: 0.4 }}
          >
            <span className="text-[10px] text-muted-foreground mb-1">A</span>
            <span className="w-8 h-3 rounded bg-primary/80" />
          </motion.div>
          <motion.div
            className="w-14 h-20 rounded-xl bg-white border-2 border-primary/20 shadow-md flex flex-col items-center justify-end pb-2"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 1.2, repeat: 3, repeatDelay: 0.4, delay: 0.05 }}
          >
            <span className="text-[10px] text-muted-foreground mb-1">B</span>
            <span className="w-8 h-3 rounded bg-primary/80" />
          </motion.div>
        </motion.div>
        <div className="flex gap-1 justify-center">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-primary/25"
              animate={{ backgroundColor: i < 2 ? "var(--color-primary)" : "rgba(56, 161, 105, 0.25)" }}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center">
          {now < ss.introReadyAfter ? `Read & watch (${introSecs}s)` : "Tap when you're ready."}
        </p>
        {both ? (
          <p className="text-primary font-medium flex items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Starting…
          </p>
        ) : (
          <button
            type="button"
            disabled={busy || now < ss.introReadyAfter || (r === "userA" ? ss.introReady.userA : ss.introReady.userB)}
            onClick={ackIntro}
            className="w-full py-4 rounded-2xl bg-primary text-white font-bold disabled:opacity-50"
          >
            {r === "userA" && ss.introReady.userA
              ? "Ready — waiting for partner"
              : r === "userB" && ss.introReady.userB
                ? "Ready — waiting for partner"
                : "I'm ready"}
          </button>
        )}
      </div>
    );
  }

  const deadline = ss.roundStartedAt + ss.windowMs;
  const timeLeft = Math.max(0, deadline - now);
  const pipFilled = ss.windowMs > 0 ? Math.min(4, Math.floor((1 - timeLeft / ss.windowMs) * 4)) : 0;

  // ——— Active round ———
  if (ss.phase === "round_active" && ss.roundStartedAt > 0) {
    const mine = r === "userA" ? ss.picks.userA : ss.picks.userB;
    const partnerWaiting = r === "userA" ? !ss.picks.userB : !ss.picks.userA;
    const mySwap = swapForUser(r, ss);
    const leftLabel = mySwap ? ss.optionRight : ss.optionLeft;
    const rightLabel = mySwap ? ss.optionLeft : ss.optionRight;
    return (
      <div className="min-h-screen flex flex-col p-4 max-w-lg mx-auto w-full pb-8">
        <p className="text-center text-xs font-bold text-violet-700 uppercase mb-1">The Synchronization Switch</p>
        <p className="text-center text-sm text-muted-foreground mb-2">
          Streak: {ss.streak} of 5 · {promptTierLabel(ss.promptCategory)}
        </p>
        <div className="flex justify-center gap-1.5 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-2.5 h-2.5 rounded-sm ${i < pipFilled ? "bg-primary" : "bg-primary/20"}`}
            />
          ))}
        </div>
        <h2 className="text-xl font-bold text-foreground text-center mb-6">{ss.title}</h2>
        <div className="grid grid-cols-2 gap-3 flex-1 content-start">
          <button
            type="button"
            disabled={!!mine}
            onClick={() => submitPick("left")}
            className={`min-h-[5.5rem] rounded-2xl font-semibold text-base border-2 transition ${
              mine === "left"
                ? "border-primary bg-primary/15 text-foreground"
                : "border-primary/20 bg-white hover:border-primary/50"
            } disabled:opacity-70`}
          >
            {leftLabel}
          </button>
          <button
            type="button"
            disabled={!!mine}
            onClick={() => submitPick("right")}
            className={`min-h-[5.5rem] rounded-2xl font-semibold text-base border-2 transition ${
              mine === "right"
                ? "border-primary bg-primary/15 text-foreground"
                : "border-primary/20 bg-white hover:border-primary/50"
            } disabled:opacity-70`}
          >
            {rightLabel}
          </button>
        </div>
        {mine && partnerWaiting && (
          <p className="text-center text-sm text-muted-foreground mt-4">Locked in — waiting for partner's tap…</p>
        )}
      </div>
    );
  }

  // ——— Reveal ———
  if (ss.phase === "round_reveal" && ss.revealMatch !== null) {
    const match = ss.revealMatch;
    const mySwap = swapForUser(r, ss);
    const theirSwap = swapForUser(r === "userA" ? "userB" : "userA", ss);
    const myRevealPick = r === "userA" ? ss.revealPickA : ss.revealPickB;
    const theirRevealPick = r === "userA" ? ss.revealPickB : ss.revealPickA;
    const myWord = wordForPick(myRevealPick, mySwap, ss.optionLeft, ss.optionRight) || "—";
    const theirWord = wordForPick(theirRevealPick, theirSwap, ss.optionLeft, ss.optionRight) || "—";
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 max-w-lg mx-auto w-full space-y-6">
        <div className="grid grid-cols-2 gap-3 w-full">
          <div
            className={`rounded-2xl p-4 text-center font-medium border-2 ${
              match ? "border-emerald-400 bg-emerald-50 text-emerald-950" : "border-primary/10 bg-muted/40 text-muted-foreground"
            }`}
          >
            You: {myWord}
          </div>
          <div
            className={`rounded-2xl p-4 text-center font-medium border-2 ${
              match ? "border-emerald-400 bg-emerald-50 text-emerald-950" : "border-primary/10 bg-muted/40 text-muted-foreground"
            }`}
          >
            Partner: {theirWord}
          </div>
        </div>
        {ss.showWarmNudge && !match && (
          <p className="text-center text-violet-800 bg-violet-100 border border-violet-200 rounded-2xl px-4 py-3 text-sm font-medium">
            Almost — you're finding each other's rhythm.
          </p>
        )}
      </div>
    );
  }

  // ——— Breathing pause ———
  if (ss.phase === "breathing_pause") {
    const both = ss.breathingAck.userA && ss.breathingAck.userB;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 max-w-md mx-auto text-center space-y-8">
        <motion.div
          className="w-32 h-32 rounded-full bg-primary/15 border-2 border-primary/30"
          animate={{ scale: [1, 1.15, 1], opacity: [0.75, 1, 0.75] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        <p className="text-lg font-semibold text-foreground leading-relaxed">
          Take a breath together. Tap when you're both ready.
        </p>
        {both ? (
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        ) : (
          <button
            type="button"
            disabled={busy || (r === "userA" ? ss.breathingAck.userA : ss.breathingAck.userB)}
            onClick={ackBreathing}
            className="w-full py-4 rounded-2xl bg-primary text-white font-bold disabled:opacity-50"
          >
            {(r === "userA" ? ss.breathingAck.userA : ss.breathingAck.userB) ? "Waiting…" : "We're ready"}
          </button>
        )}
      </div>
    );
  }

  // ——— Victory ———
  if (ss.phase === "victory_pause") {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center p-6 max-w-md mx-auto text-center space-y-6 overflow-x-hidden bg-gradient-to-b from-emerald-50 via-amber-50/40 to-white">
        <VictoryConfetti />
        <AnimatePresence>
          <GentleBloom />
        </AnimatePresence>
        <motion.div
          className="text-6xl select-none"
          aria-hidden
          initial={{ scale: 0.5, opacity: 0, rotate: -12 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 16 }}
        >
          🎉
        </motion.div>
        <div className="flex gap-2 justify-center">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              className="w-3.5 h-3.5 rounded-full bg-emerald-500 shadow-md shadow-emerald-200"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.08 * i, type: "spring", stiffness: 400, damping: 12 }}
            />
          ))}
        </div>
        <motion.p
          className="text-2xl sm:text-3xl font-bold text-emerald-900 leading-tight px-2"
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.12, duration: 0.35 }}
        >
          You found each other's rhythm.
        </motion.p>
        <p className="text-base font-medium text-emerald-800/90">
          5 perfect matches in a row — amazing sync!
        </p>
      </div>
    );
  }

  // ——— Private ———
  if (ss.phase === "private_write") {
    return (
      <PrivateWritePhase
        ss={ss}
        r={r}
        now={now}
        onSubmit={(t) => void submitPrivate(t)}
      />
    );
  }

  // ——— Closing ———
  if (ss.phase === "closing") {
    return (
      <div className="min-h-screen p-4 py-10 max-w-lg mx-auto w-full space-y-8 pb-24">
        <h2 className="text-2xl font-bold text-foreground text-center">Your five syncs</h2>
        <ul className="space-y-3">
          {ss.matchHistory.map((item, i) => (
            <li key={i} className="rounded-2xl border border-primary/15 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold text-muted-foreground uppercase mb-1">{item.title}</p>
              <p className="text-foreground font-medium">
                {item.choice} / {item.choice}
              </p>
            </li>
          ))}
        </ul>
        <div className="rounded-2xl bg-violet-50 border border-violet-200 p-4">
          <p className="text-sm font-medium text-foreground">{ss.insightLine}</p>
        </div>
        <div className="rounded-2xl bg-white border border-primary/15 p-4 shadow-sm">
          <p className="text-xs font-bold text-muted-foreground uppercase mb-2">Talk about this</p>
          <p className="text-foreground">{ss.talkQuestion}</p>
        </div>
        <ClosingPrivateAnswers r={r} ss={ss} onDone={finishMood} />
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="w-10 h-10 animate-spin text-primary" />
    </div>
  );
}

function PrivateWritePhase({
  ss,
  r,
  now,
  onSubmit,
}: {
  ss: SyncSwitchV2;
  r: "userA" | "userB";
  now: number;
  onSubmit: (t: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const mine = r === "userA" ? ss.privateAnswers.userA : ss.privateAnswers.userB;
  const partnerDone = r === "userA" ? ss.privateAnswers.userB : ss.privateAnswers.userA;
  const ends = ss.privateWriteEndsAt ?? now;
  const leftMs = Math.max(0, ends - now);
  const s = Math.ceil(leftMs / 1000);

  if (mine) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
        <p className="font-medium">Your answer is in.</p>
        {!partnerDone && <p className="text-sm text-muted-foreground">Waiting for partner…</p>}
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 py-8 max-w-lg mx-auto w-full space-y-4">
      <p className="text-center font-mono text-2xl text-primary tabular-nums">
        {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
      </p>
      <p className="text-lg font-semibold text-center">{ss.privateQuestion}</p>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={5}
        className="w-full rounded-2xl border border-primary/20 p-4 text-base"
        placeholder="Answer privately…"
      />
      <button
        type="button"
        disabled={!draft.trim()}
        onClick={() => onSubmit(draft)}
        className="w-full py-4 rounded-2xl bg-primary text-white font-bold disabled:opacity-50"
      >
        Submit
      </button>
    </div>
  );
}

function ClosingPrivateAnswers({
  r,
  ss,
  onDone,
}: {
  r: "userA" | "userB";
  ss: SyncSwitchV2;
  onDone: () => void;
}) {
  const my = r === "userA" ? ss.privateAnswers.userA : ss.privateAnswers.userB;
  const theirs = r === "userA" ? ss.privateAnswers.userB : ss.privateAnswers.userA;
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-2xl border p-4 bg-white">
          <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">You</p>
          <p className="text-sm whitespace-pre-wrap">{my}</p>
        </div>
        <div className="rounded-2xl border p-4 bg-white">
          <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Partner</p>
          <p className="text-sm whitespace-pre-wrap">{theirs}</p>
        </div>
      </div>
      <button type="button" onClick={onDone} className="w-full py-5 rounded-2xl bg-primary text-white font-bold">
        Continue to mood check-in
      </button>
    </>
  );
}
