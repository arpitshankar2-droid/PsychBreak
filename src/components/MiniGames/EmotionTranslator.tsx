"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { mergeEmotionTranslator, advanceStage, clearMoods } from "@/lib/firebaseUtils";
import {
  computeEmotionInsightLine,
  pickClosingTalkFromEmotions,
  pickPrivateReflectionQuestion,
} from "@/lib/emotionDebrief";
import {
  EMOTION_GRID_WORDS,
  GRID_SELECT_MS,
  PRIVATE_WRITE_MS,
  type EmotionTranslatorV2,
  createInitialEmotionTranslatorState,
} from "@/lib/emotionTranslatorState";
import { Loader2 } from "lucide-react";

type SessionShape = { gameData?: Record<string, unknown> };

const GRID_ORDER = new Map(EMOTION_GRID_WORDS.map((w, i) => [w, i]));

function sortEmotionsForDisplay(words: string[]) {
  return [...words].sort((a, b) => (GRID_ORDER.get(a as (typeof EMOTION_GRID_WORDS)[number]) ?? 99) - (GRID_ORDER.get(b as (typeof EMOTION_GRID_WORDS)[number]) ?? 99));
}

function fmtClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function BreathingWait() {
  return (
    <div className="flex flex-col items-center justify-center gap-8 py-12">
      <motion.div
        className="w-28 h-28 rounded-full bg-primary/15 border-2 border-primary/30"
        animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />
      <div className="text-center space-y-2 max-w-sm">
        <p className="text-lg font-semibold text-foreground">Your partner is still reflecting…</p>
        <p className="text-sm text-muted-foreground">No rush. This screen will move on its own when you&apos;re both ready.</p>
      </div>
    </div>
  );
}

export default function EmotionTranslator({
  sessionId,
  session,
  role,
}: {
  sessionId: string;
  session: SessionShape;
  role: string;
}) {
  const r = role as "userA" | "userB";
  const gameData = session.gameData || {};
  const rawEt = gameData.emotionTranslator as EmotionTranslatorV2 | undefined;
  const legacyA = gameData.userA;
  const legacyB = gameData.userB;

  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const migrateRef = useRef(false);
  const seedRef = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), 400);
    return () => window.clearInterval(id);
  }, []);

  /** Migrate legacy `gameData.userA` / `userB` string arrays into v2. */
  useEffect(() => {
    if (migrateRef.current || r !== "userA") return;
    if (rawEt?.v === 2) return;
    if (!Array.isArray(legacyA) || !Array.isArray(legacyB)) return;
    if (legacyA.length !== 5 || legacyB.length !== 5) return;
    migrateRef.current = true;
    const a = legacyA as string[];
    const b = legacyB as string[];
    const closing = pickClosingTalkFromEmotions(a, b);
    void mergeEmotionTranslator(sessionId, {
      v: 2,
      phase: "emotion_reveal",
      gridEndsAt: Date.now(),
      selections: { userA: a, userB: b },
      emotionRevealAck: { userA: false, userB: false },
      insightLine: computeEmotionInsightLine(a, b),
      privateQuestion: pickPrivateReflectionQuestion(a, b),
      closingTalkQuestion: closing.question,
      closingTalkSubtitle: closing.subtitle,
      privateWriteEndsAt: null,
      privateAnswers: { userA: null, userB: null },
    });
  }, [legacyA, legacyB, rawEt, r, sessionId]);

  useEffect(() => {
    if (migrateRef.current || seedRef.current || r !== "userA") return;
    if (rawEt?.v === 2) return;
    if (Array.isArray(legacyA)) return;
    seedRef.current = true;
    void mergeEmotionTranslator(sessionId, createInitialEmotionTranslatorState() as unknown as Record<string, unknown>);
  }, [legacyA, rawEt, r, sessionId]);

  const now = Date.now();
  const et = rawEt?.v === 2 ? rawEt : null;

  useEffect(() => {
    if (!et || et.phase !== "grid") return;
    const a = et.selections.userA;
    const b = et.selections.userB;
    if (!a || !b || a.length !== 5 || b.length !== 5) return;
    const closing = pickClosingTalkFromEmotions(a, b);
    void mergeEmotionTranslator(sessionId, {
      phase: "emotion_reveal",
      insightLine: computeEmotionInsightLine(a, b),
      privateQuestion: pickPrivateReflectionQuestion(a, b),
      closingTalkQuestion: closing.question,
      closingTalkSubtitle: closing.subtitle,
    });
  }, [et?.phase, et?.selections?.userA, et?.selections?.userB, sessionId]);

  useEffect(() => {
    if (!et || et.phase !== "emotion_reveal") return;
    if (!et.emotionRevealAck.userA || !et.emotionRevealAck.userB) return;
    void mergeEmotionTranslator(sessionId, {
      phase: "private_write",
      privateWriteEndsAt: Date.now() + PRIVATE_WRITE_MS,
      emotionRevealAck: { userA: false, userB: false },
    });
  }, [et?.phase, et?.emotionRevealAck?.userA, et?.emotionRevealAck?.userB, sessionId]);

  useEffect(() => {
    if (!et || et.phase !== "private_write") return;
    const a = et.privateAnswers.userA?.trim();
    const b = et.privateAnswers.userB?.trim();
    if (!a || !b) return;
    void mergeEmotionTranslator(sessionId, { phase: "closing" });
  }, [et?.phase, et?.privateAnswers?.userA, et?.privateAnswers?.userB, sessionId]);

  if (!et) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  const fixSelections = et.selections;

  const toggleEmotion = (e: string) => {
    if (selected.includes(e)) setSelected(selected.filter((x) => x !== e));
    else if (selected.length < 5) setSelected([...selected, e]);
  };

  const submitGrid = async () => {
    if (selected.length !== 5) return;
    if (!selected.every((w) => EMOTION_GRID_WORDS.includes(w as (typeof EMOTION_GRID_WORDS)[number]))) return;
    setBusy(true);
    await mergeEmotionTranslator(sessionId, {
      selections: r === "userA" ? { userA: [...selected] } : { userB: [...selected] },
    });
    setBusy(false);
  };

  const ackRevealContinue = async () => {
    setBusy(true);
    await mergeEmotionTranslator(sessionId, {
      emotionRevealAck: r === "userA" ? { userA: true } : { userB: true },
    });
    setBusy(false);
  };

  const submitPrivate = async () => {
    const t = draft.trim();
    if (!t) return;
    setBusy(true);
    await mergeEmotionTranslator(sessionId, {
      privateAnswers: r === "userA" ? { userA: t } : { userB: t },
    });
    setDraft("");
    setBusy(false);
  };

  const finishMood = async () => {
    await clearMoods(sessionId);
    await advanceStage(sessionId, "return");
  };

  // ——— Grid ———
  if (et.phase === "grid") {
    const mine = r === "userA" ? fixSelections.userA : fixSelections.userB;
    const theirs = r === "userA" ? fixSelections.userB : fixSelections.userA;
    const iSubmitted = mine != null && mine.length === 5;
    const gridLeft = Math.max(0, et.gridEndsAt - now);

    if (iSubmitted && (!theirs || theirs.length < 5)) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 max-w-lg mx-auto w-full">
          <h2 className="text-xl font-bold text-foreground mb-2">Emotion translator</h2>
          <BreathingWait />
        </div>
      );
    }

    if (iSubmitted && theirs && theirs.length === 5) {
      return (
        <div className="flex h-screen items-center justify-center p-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      );
    }

    return (
      <div className="min-h-screen p-4 py-6 max-w-2xl mx-auto w-full space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-foreground">How do you feel right now?</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Not only about the argument — in general. Tap <span className="font-semibold text-foreground">exactly five</span>{" "}
            words.
          </p>
          <p className="text-3xl font-mono font-bold text-violet-700 tabular-nums">{fmtClock(gridLeft)}</p>
          <p className="text-sm font-medium text-violet-800 bg-violet-100 inline-block px-3 py-1 rounded-full">
            {selected.length} of 5 selected
          </p>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 sm:gap-3">
          {EMOTION_GRID_WORDS.map((word) => {
            const on = selected.includes(word);
            return (
              <button
                key={word}
                type="button"
                onClick={() => toggleEmotion(word)}
                className={`min-h-[3rem] px-2 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all border-2 ${
                  on
                    ? "bg-violet-600 text-white border-violet-700 shadow-md scale-[1.02]"
                    : "bg-white text-foreground border-violet-200/60 hover:border-violet-400"
                }`}
              >
                {word}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={busy || selected.length !== 5}
          onClick={submitGrid}
          className="w-full py-4 rounded-2xl bg-primary text-white font-bold disabled:opacity-45"
        >
          {busy ? <Loader2 className="animate-spin mx-auto w-6 h-6" /> : "Lock in my five words"}
        </button>
      </div>
    );
  }

  const myWords = sortEmotionsForDisplay((r === "userA" ? fixSelections.userA : fixSelections.userB) || []);
  const partnerWords = sortEmotionsForDisplay((r === "userA" ? fixSelections.userB : fixSelections.userA) || []);
  const fullA = fixSelections.userA || [];
  const fullB = fixSelections.userB || [];
  const setA = new Set(fullA);
  const setB = new Set(fullB);
  const shared = fullA.filter((e) => setB.has(e));

  const chipYou = (word: string) => {
    const isShared = shared.includes(word);
    const isUnique = !isShared;
    return (
      <span
        key={word}
        className={`flex flex-col gap-1 px-3 py-2 rounded-xl text-sm font-medium ${
          isShared
            ? "bg-emerald-100 text-emerald-950 ring-2 ring-emerald-300/80"
            : isUnique
              ? "bg-white text-foreground ring-2 ring-amber-400 ring-offset-1"
              : "bg-gray-50 border border-gray-100"
        }`}
      >
        <span>{word}</span>
        {isUnique && (
          <span className="text-[9px] uppercase text-amber-800 font-bold leading-tight">They didn&apos;t pick this</span>
        )}
      </span>
    );
  };

  const chipPartner = (word: string) => {
    const isShared = shared.includes(word);
    const isUnique = !isShared;
    return (
      <span
        key={word}
        className={`flex flex-col gap-1 px-3 py-2 rounded-xl text-sm font-medium ${
          isShared
            ? "bg-emerald-100 text-emerald-950 ring-2 ring-emerald-300/80"
            : isUnique
              ? "bg-white text-foreground ring-2 ring-amber-400 ring-offset-1"
              : "bg-gray-50 border border-gray-100"
        }`}
      >
        <span>{word}</span>
        {isUnique && (
          <span className="text-[9px] uppercase text-amber-800 font-bold leading-tight">You didn&apos;t expect this</span>
        )}
      </span>
    );
  };

  // ——— Emotion reveal ———
  if (et.phase === "emotion_reveal" && myWords.length === 5 && partnerWords.length === 5) {
    return (
      <div className="min-h-screen p-4 py-8 max-w-4xl mx-auto w-full space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold text-foreground">The reveal</h2>
          <p className="text-muted-foreground text-sm">Both lists, side by side — shared feelings in green; surprises ringed in amber.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <div className="rounded-[1.5rem] border border-primary/15 bg-white p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-lg text-violet-800 border-b border-violet-100 pb-2">You felt</h3>
            <div className="flex flex-wrap gap-2">{myWords.map(chipYou)}</div>
          </div>
          <div className="rounded-[1.5rem] border border-primary/15 bg-white p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-lg text-violet-800 border-b border-violet-100 pb-2">Your partner felt</h3>
            <div className="flex flex-wrap gap-2">{partnerWords.map(chipPartner)}</div>
          </div>
        </div>

        {shared.length > 0 && (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-center">
            <p className="text-sm font-medium text-emerald-950">
              You both felt: <span className="font-bold">{shared.join(", ")}</span>
            </p>
          </div>
        )}

        <div className="rounded-2xl bg-violet-50 border border-violet-200 p-5 text-center">
          <p className="text-xs font-bold text-violet-700 uppercase tracking-wide mb-2">Insight</p>
          <p className="text-foreground text-base leading-relaxed font-medium">{et.insightLine}</p>
        </div>

        <button
          type="button"
          disabled={
            busy || (r === "userA" ? et.emotionRevealAck.userA : et.emotionRevealAck.userB)
          }
          onClick={ackRevealContinue}
          className="w-full py-4 rounded-2xl bg-primary text-white font-bold disabled:opacity-50"
        >
          {(r === "userA" ? et.emotionRevealAck.userA : et.emotionRevealAck.userB)
            ? "Waiting for partner…"
            : "Continue"}
        </button>
      </div>
    );
  }

  // ——— Private write ———
  if (et.phase === "private_write") {
    const ends = et.privateWriteEndsAt ?? now;
    const left = Math.max(0, ends - now);
    const mineAns = r === "userA" ? et.privateAnswers.userA : et.privateAnswers.userB;
    const partnerAns = r === "userA" ? et.privateAnswers.userB : et.privateAnswers.userA;

    if (mineAns) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 max-w-lg mx-auto text-center space-y-6">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
          <p className="text-foreground font-medium">Your answer is locked in.</p>
          <p className="text-sm text-muted-foreground">We&apos;ll show both responses together when your partner finishes — you won&apos;t see theirs early.</p>
          {!partnerAns && <BreathingWait />}
        </div>
      );
    }

    return (
      <div className="min-h-screen p-4 py-8 max-w-lg mx-auto w-full space-y-6">
        <p className="text-3xl font-mono font-bold text-violet-700 text-center tabular-nums">{fmtClock(left)}</p>
        <div className="rounded-2xl border-2 border-violet-200 bg-violet-50/50 p-5">
          <p className="text-xs font-bold text-violet-800 uppercase mb-2">Your private prompt</p>
          <p className="text-lg font-semibold text-foreground leading-snug">{et.privateQuestion}</p>
        </div>
        <p className="text-xs text-muted-foreground text-center">Only you see what you type until you both submit.</p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={6}
          placeholder="Answer in your own words…"
          className="w-full rounded-2xl border border-violet-200 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-violet-300 resize-none bg-white"
        />
        <button
          type="button"
          disabled={busy || !draft.trim()}
          onClick={submitPrivate}
          className="w-full py-4 rounded-2xl bg-primary text-white font-bold disabled:opacity-50"
        >
          {busy ? <Loader2 className="animate-spin mx-auto w-6 h-6" /> : "Submit answer"}
        </button>
      </div>
    );
  }

  // ——— Closing ———
  if (et.phase === "closing") {
    const myText = r === "userA" ? et.privateAnswers.userA : et.privateAnswers.userB;
    const partnerText = r === "userA" ? et.privateAnswers.userB : et.privateAnswers.userA;
    return (
      <div className="min-h-screen p-4 py-10 max-w-4xl mx-auto w-full space-y-8 pb-24">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold text-foreground">Together</h2>
          <p className="text-sm text-muted-foreground">Two answers. No judgement — just honesty.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-primary/10 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-bold text-violet-700 uppercase mb-2">You</p>
            <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">{myText || "—"}</p>
          </div>
          <div className="rounded-2xl border border-primary/10 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-bold text-violet-700 uppercase mb-2">Your partner</p>
            <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">{partnerText || "—"}</p>
          </div>
        </div>

        <div className="rounded-2xl bg-violet-50 border border-violet-200 p-5 text-center">
          <p className="text-xs font-bold text-violet-700 uppercase mb-1">Anchor</p>
          <p className="text-foreground font-medium leading-relaxed">{et.insightLine}</p>
        </div>

        <div className="rounded-2xl bg-white border border-primary/15 p-5 shadow-sm space-y-2">
          <p className="text-xs font-bold text-muted-foreground uppercase">Talk about this</p>
          <p className="text-foreground font-semibold leading-relaxed">{et.closingTalkQuestion}</p>
          <p className="text-sm text-muted-foreground">{et.closingTalkSubtitle}</p>
        </div>

        <button
          type="button"
          onClick={finishMood}
          className="w-full py-5 rounded-[1.5rem] bg-primary text-white font-bold shadow-md"
        >
          Continue to mood check-in
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="w-10 h-10 animate-spin text-primary" />
    </div>
  );
}
