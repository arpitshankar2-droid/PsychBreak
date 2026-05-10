"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { mergeSharedFuture, advanceStage, clearMoods } from "@/lib/firebaseUtils";
import {
  type SharedFutureV2,
  createInitialSharedFutureState,
  DISCUSSION_MS,
  findSharedFutureThemeOverlap,
  INTRO_READ_MS,
  MAX_DREAM_LEN,
  realDreams,
  WRITE_PHASE_MS,
} from "@/lib/sharedFutureState";
import { Loader2, Sparkles } from "lucide-react";

type SessionShape = {
  gameData?: Record<string, unknown>;
};

function fmtMs(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function ConfettiBurst() {
  const pieces = Array.from({ length: 14 }, (_, i) => i);
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center overflow-hidden">
      {pieces.map((i) => (
        <motion.span
          key={i}
          className="absolute text-lg"
          initial={{ y: -20, x: 0, opacity: 1, rotate: 0 }}
          animate={{
            y: 320 + Math.random() * 120,
            x: (Math.random() - 0.5) * 280,
            opacity: 0,
            rotate: Math.random() * 360,
          }}
          transition={{ duration: 1.8 + Math.random() * 0.4, ease: "easeOut", delay: i * 0.03 }}
          style={{ left: `${45 + Math.random() * 10}%` }}
        >
          {["✨", "🎉", "⭐", "💫"][i % 4]}
        </motion.span>
      ))}
    </div>
  );
}

function saveDreamJournalLocal(sessionId: string, role: string, lines: string[]) {
  if (typeof window === "undefined") return;
  try {
    const key = "lets_fix_it_dream_journal";
    const prev = JSON.parse(localStorage.getItem(key) || "[]") as unknown[];
    prev.push({
      at: Date.now(),
      sessionId,
      role,
      dreams: lines,
    });
    localStorage.setItem(key, JSON.stringify(prev));
  } catch {
    /* ignore */
  }
}

export default function TwoTruths({
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
  const rawSf = gameData.sharedFuture as SharedFutureV2 | undefined;
  const [tick, setTick] = useState(0);
  const [inputs, setInputs] = useState<[string, string, string]>(["", "", ""]);
  const [fakePick, setFakePick] = useState<0 | 1 | 2>(0);
  const [guessPick, setGuessPick] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const seededRef = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), 400);
    return () => window.clearInterval(id);
  }, []);

  /** Legacy sessions: host seeds v2 state once. */
  useEffect(() => {
    if (seededRef.current || r !== "userA") return;
    if (rawSf && rawSf.v === 2) return;
    seededRef.current = true;
    mergeSharedFuture(sessionId, createInitialSharedFutureState() as unknown as Record<string, unknown>);
  }, [rawSf, r, sessionId]);

  const now = Date.now();
  const sf = rawSf?.v === 2 ? rawSf : null;

  useEffect(() => {
    if (!sf || sf.phase !== "intro") return;
    if (!sf.introReady.userA || !sf.introReady.userB) return;
    mergeSharedFuture(sessionId, {
      phase: "a_write",
      aWriteEndsAt: Date.now() + WRITE_PHASE_MS,
    });
  }, [sf?.phase, sf?.introReady?.userA, sf?.introReady?.userB, sessionId]);

  useEffect(() => {
    if (!sf) return;
    const t = Date.now();
    if (sf.phase === "reveal_a" && sf.discussAEndsAt && t >= sf.discussAEndsAt) {
      mergeSharedFuture(sessionId, {
        phase: "b_write",
        bWriteEndsAt: t + WRITE_PHASE_MS,
      });
    }
    if (sf.phase === "reveal_b" && sf.discussBEndsAt && t >= sf.discussBEndsAt) {
      mergeSharedFuture(sessionId, { phase: "closing" });
    }
  }, [tick, sf, sessionId]);

  useEffect(() => {
    if (sf?.phase === "b_write" && !sf.bSubmitted && r === "userB") {
      setInputs(["", "", ""]);
    }
  }, [sf?.phase, sf?.bSubmitted, r]);

  if (!sf) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  const introSecsLeft = Math.max(0, Math.ceil((sf.introReadyAfter - now) / 1000));

  const markIntroReady = async () => {
    if (now < sf.introReadyAfter) return;
    setBusy(true);
    await mergeSharedFuture(sessionId, {
      introReady: {
        userA: r === "userA" ? true : sf.introReady.userA,
        userB: r === "userB" ? true : sf.introReady.userB,
      },
    });
    setBusy(false);
  };

  const submitA = async () => {
    if (!inputs.every((s) => s.trim())) return;
    setBusy(true);
    await mergeSharedFuture(sessionId, {
      aSubmitted: true,
      aDreams: [inputs[0].trim(), inputs[1].trim(), inputs[2].trim()],
      aFakeIndex: fakePick,
      phase: "b_guess_a",
    });
    setBusy(false);
  };

  const lockGuessA = async () => {
    if (guessPick == null) return;
    setBusy(true);
    await mergeSharedFuture(sessionId, {
      bGuessA: guessPick,
      phase: "reveal_a",
      discussAEndsAt: Date.now() + DISCUSSION_MS,
    });
    setGuessPick(null);
    setBusy(false);
  };

  const submitB = async () => {
    if (!inputs.every((s) => s.trim())) return;
    setBusy(true);
    await mergeSharedFuture(sessionId, {
      bSubmitted: true,
      bDreams: [inputs[0].trim(), inputs[1].trim(), inputs[2].trim()],
      bFakeIndex: fakePick,
      phase: "a_guess_b",
    });
    setBusy(false);
  };

  const lockGuessB = async () => {
    if (guessPick == null) return;
    setBusy(true);
    await mergeSharedFuture(sessionId, {
      aGuessB: guessPick,
      phase: "reveal_b",
      discussBEndsAt: Date.now() + DISCUSSION_MS,
    });
    setGuessPick(null);
    setBusy(false);
  };

  const finishToMood = async () => {
    await clearMoods(sessionId);
    await advanceStage(sessionId, "return");
  };

  const ackJournal = async () => {
    await mergeSharedFuture(sessionId, {
      journalAck: {
        userA: r === "userA" ? true : sf.journalAck.userA,
        userB: r === "userB" ? true : sf.journalAck.userB,
      },
    });
  };

  // ——— Intro ———
  if (sf.phase === "intro") {
    const bothReady = sf.introReady.userA && sf.introReady.userB;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 py-10 max-w-lg mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
          className="w-full bg-white rounded-[2rem] border border-primary/15 shadow-lg p-8 space-y-6 text-center"
        >
          <p className="text-xs font-bold text-primary uppercase tracking-widest">Two truths &amp; a dream</p>
          <h2 className="text-2xl font-bold text-foreground leading-snug">
            Write 3 things you want in the next 5 years. Two are real — one is made up. Your partner guesses the fake.
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You&apos;ll each take a turn writing privately, then guessing. ~{Math.round(INTRO_READ_MS / 1000)}s to read — then tap when you&apos;re ready.
          </p>
          {!bothReady && (
            <p className="text-xs text-muted-foreground">
              {now < sf.introReadyAfter ? `Ready unlocks in ${introSecsLeft}s…` : "Tap I'm ready when you've read the twist."}
            </p>
          )}
          {bothReady ? (
            <div className="flex items-center justify-center gap-2 text-primary font-semibold">
              <Loader2 className="w-5 h-5 animate-spin" />
              Starting…
            </div>
          ) : (
            <button
              type="button"
              disabled={busy || now < sf.introReadyAfter || (r === "userA" ? sf.introReady.userA : sf.introReady.userB)}
              onClick={markIntroReady}
              className="w-full py-4 bg-primary text-white rounded-2xl font-bold disabled:opacity-45"
            >
              {r === "userA" && sf.introReady.userA
                ? "You're ready — waiting for partner"
                : r === "userB" && sf.introReady.userB
                  ? "You're ready — waiting for partner"
                  : "I'm ready"}
            </button>
          )}
        </motion.div>
      </div>
    );
  }

  // ——— A writes ———
  if (sf.phase === "a_write") {
    const ends = sf.aWriteEndsAt ?? now;
    const writeLeft = Math.max(0, ends - now);
    if (!sf.aSubmitted && r === "userB") {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground">Player A is writing</h2>
          <p className="text-muted-foreground mt-2">Both of you are on this step — A sees the form; you&apos;ll get your turn next.</p>
          <p className="mt-6 text-3xl font-mono font-bold text-primary tabular-nums">{fmtMs(writeLeft)}</p>
        </div>
      );
    }
    if (!sf.aSubmitted && r === "userA") {
      return (
        <div className="min-h-screen p-4 py-8 max-w-xl mx-auto w-full space-y-6">
          <div className="text-center space-y-1">
            <p className="text-4xl font-mono font-bold text-primary tabular-nums">{fmtMs(writeLeft)}</p>
            <p className="text-sm text-muted-foreground">Your private writing time</p>
          </div>
          <p className="text-xs text-center text-amber-800/90 bg-amber-50 border border-amber-100 rounded-xl py-2 px-3">
            Make the fake one believable!
          </p>
          <div className="space-y-4">
            {([0, 1, 2] as const).map((i) => (
              <label key={i} className="block space-y-1">
                <span className="text-xs font-bold text-primary uppercase">Dream {i + 1}</span>
                <textarea
                  value={inputs[i]}
                  maxLength={MAX_DREAM_LEN}
                  onChange={(e) => {
                    const next = [...inputs] as [string, string, string];
                    next[i] = e.target.value;
                    setInputs(next);
                  }}
                  rows={3}
                  className="w-full rounded-2xl border border-primary/20 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-primary/20 resize-none bg-white"
                  placeholder={`Something you want in the next five years… (${MAX_DREAM_LEN} chars max)`}
                />
                <span className="text-[10px] text-muted-foreground text-right block">
                  {inputs[i].length}/{MAX_DREAM_LEN}
                </span>
              </label>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">Which line is the invented dream? (Only you know — your partner won&apos;t see this until the reveal.)</p>
            <div className="flex gap-2 flex-wrap">
              {([0, 1, 2] as const).map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setFakePick(i)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition ${
                    fakePick === i ? "border-primary bg-primary/10 text-primary" : "border-primary/15 bg-white"
                  }`}
                >
                  Dream {i + 1} is fake
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            disabled={busy || !inputs.every((s) => s.trim())}
            onClick={submitA}
            className="w-full py-4 bg-primary text-white rounded-2xl font-bold disabled:opacity-50"
          >
            {busy ? <Loader2 className="animate-spin mx-auto w-6 h-6" /> : "Submit — lock in my answers"}
          </button>
        </div>
      );
    }
  }

  // ——— B guesses A ———
  if (sf.phase === "b_guess_a" && sf.aDreams && sf.aFakeIndex != null) {
    const statements = sf.aDreams;
    if (r === "userA") {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-foreground">Your partner is guessing…</h2>
          <p className="text-muted-foreground mt-3">Their choice stays hidden until they lock it in.</p>
          <div className="mt-8 space-y-3 w-full text-left">
            {statements.map((s, i) => (
              <div key={i} className="p-4 rounded-2xl bg-white border border-primary/10 text-foreground">
                <span className="text-[10px] uppercase text-muted-foreground">Dream {i + 1}</span>
                <p className="text-sm mt-1 whitespace-pre-wrap">{s}</p>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen p-4 py-8 max-w-xl mx-auto w-full space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Guess the fake</h2>
          <p className="text-muted-foreground text-sm">Tap the statement you think is completely made up.</p>
        </div>
        <div className="space-y-3">
          {statements.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setGuessPick(i)}
              className={`w-full text-left p-5 rounded-2xl border-2 transition shadow-sm ${
                guessPick === i ? "border-primary bg-primary/5" : "border-primary/10 bg-white hover:border-primary/30"
              }`}
            >
              <span className="text-[10px] uppercase text-muted-foreground">Dream {i + 1}</span>
              <p className="text-foreground mt-1 whitespace-pre-wrap">{s}</p>
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={busy || guessPick == null}
          onClick={lockGuessA}
          className="w-full py-4 bg-primary text-white rounded-2xl font-bold disabled:opacity-50"
        >
          Lock in answer
        </button>
      </div>
    );
  }

  // ——— Reveal A ———
  if (sf.phase === "reveal_a" && sf.aDreams && sf.aFakeIndex != null && sf.bGuessA != null) {
    const correct = sf.bGuessA === sf.aFakeIndex;
    const discussLeft = sf.discussAEndsAt ? Math.max(0, sf.discussAEndsAt - now) : 0;
    return (
      <div className="min-h-screen p-4 py-8 max-w-xl mx-auto w-full space-y-6">
        <AnimatePresence>{correct && <ConfettiBurst />}</AnimatePresence>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-foreground">{correct ? "Nice read!" : "Plot twist"}</h2>
          <p className="text-muted-foreground text-sm">
            {correct
              ? "They spotted the invented dream."
              : "They fooled you — ask them about the real ones."}
          </p>
        </div>
        <div className="space-y-3">
          {sf.aDreams.map((s, i) => (
            <div
              key={i}
              className={`p-4 rounded-2xl border-2 ${
                i === sf.aFakeIndex ? "border-amber-400 bg-amber-50" : "border-primary/10 bg-white"
              }`}
            >
              <span className="text-[10px] uppercase text-muted-foreground">Dream {i + 1}</span>
              {i === sf.aFakeIndex && (
                <span className="ml-2 text-[10px] font-bold uppercase text-amber-800">Invented</span>
              )}
              <p className="text-sm mt-1 whitespace-pre-wrap">{s}</p>
            </div>
          ))}
        </div>
        <div className="rounded-2xl bg-primary/5 border border-primary/15 p-4 text-center">
          <p className="text-xs font-bold text-primary uppercase mb-1">Verbal check-in</p>
          <p className="text-2xl font-mono font-bold text-foreground tabular-nums">{fmtMs(discussLeft)}</p>
          <p className="text-xs text-muted-foreground mt-1">Talk face-to-face before the next turn. The app continues automatically.</p>
        </div>
      </div>
    );
  }

  // ——— B writes ———
  if (sf.phase === "b_write") {
    const ends = sf.bWriteEndsAt ?? now;
    const writeLeft = Math.max(0, ends - now);
    if (!sf.bSubmitted && r === "userA") {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground">Player B is writing</h2>
          <p className="text-muted-foreground mt-2">You&apos;ll guess their fake dream after they submit.</p>
          <p className="mt-6 text-3xl font-mono font-bold text-primary tabular-nums">{fmtMs(writeLeft)}</p>
        </div>
      );
    }
    if (!sf.bSubmitted && r === "userB") {
      return (
        <div className="min-h-screen p-4 py-8 max-w-xl mx-auto w-full space-y-6">
          <div className="text-center space-y-1">
            <p className="text-4xl font-mono font-bold text-primary tabular-nums">{fmtMs(writeLeft)}</p>
            <p className="text-sm text-muted-foreground">Your private writing time</p>
          </div>
          <p className="text-xs text-center text-amber-800/90 bg-amber-50 border border-amber-100 rounded-xl py-2 px-3">
            Make the fake one believable!
          </p>
          <div className="space-y-4">
            {([0, 1, 2] as const).map((i) => (
              <label key={i} className="block space-y-1">
                <span className="text-xs font-bold text-primary uppercase">Dream {i + 1}</span>
                <textarea
                  value={inputs[i]}
                  maxLength={MAX_DREAM_LEN}
                  onChange={(e) => {
                    const next = [...inputs] as [string, string, string];
                    next[i] = e.target.value;
                    setInputs(next);
                  }}
                  rows={3}
                  className="w-full rounded-2xl border border-primary/20 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-primary/20 resize-none bg-white"
                  placeholder={`Something you want in the next five years… (${MAX_DREAM_LEN} chars max)`}
                />
                <span className="text-[10px] text-muted-foreground text-right block">
                  {inputs[i].length}/{MAX_DREAM_LEN}
                </span>
              </label>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">Which line is the invented dream?</p>
            <div className="flex gap-2 flex-wrap">
              {([0, 1, 2] as const).map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setFakePick(i)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition ${
                    fakePick === i ? "border-primary bg-primary/10 text-primary" : "border-primary/15 bg-white"
                  }`}
                >
                  Dream {i + 1} is fake
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            disabled={busy || !inputs.every((s) => s.trim())}
            onClick={submitB}
            className="w-full py-4 bg-primary text-white rounded-2xl font-bold disabled:opacity-50"
          >
            {busy ? <Loader2 className="animate-spin mx-auto w-6 h-6" /> : "Submit — lock in my answers"}
          </button>
        </div>
      );
    }
  }

  // ——— A guesses B ———
  if (sf.phase === "a_guess_b" && sf.bDreams && sf.bFakeIndex != null) {
    const statements = sf.bDreams;
    if (r === "userB") {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-foreground">Your partner is guessing…</h2>
          <div className="mt-8 space-y-3 w-full text-left">
            {statements.map((s, i) => (
              <div key={i} className="p-4 rounded-2xl bg-white border border-primary/10">
                <span className="text-[10px] uppercase text-muted-foreground">Dream {i + 1}</span>
                <p className="text-sm mt-1 whitespace-pre-wrap">{s}</p>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen p-4 py-8 max-w-xl mx-auto w-full space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Guess the fake</h2>
          <p className="text-muted-foreground text-sm">Tap the statement you think is completely made up.</p>
        </div>
        <div className="space-y-3">
          {statements.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setGuessPick(i)}
              className={`w-full text-left p-5 rounded-2xl border-2 transition shadow-sm ${
                guessPick === i ? "border-primary bg-primary/5" : "border-primary/10 bg-white hover:border-primary/30"
              }`}
            >
              <span className="text-[10px] uppercase text-muted-foreground">Dream {i + 1}</span>
              <p className="text-foreground mt-1 whitespace-pre-wrap">{s}</p>
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={busy || guessPick == null}
          onClick={lockGuessB}
          className="w-full py-4 bg-primary text-white rounded-2xl font-bold disabled:opacity-50"
        >
          Lock in answer
        </button>
      </div>
    );
  }

  // ——— Reveal B ———
  if (sf.phase === "reveal_b" && sf.bDreams && sf.bFakeIndex != null && sf.aGuessB != null) {
    const correct = sf.aGuessB === sf.bFakeIndex;
    const discussLeft = sf.discussBEndsAt ? Math.max(0, sf.discussBEndsAt - now) : 0;
    return (
      <div className="min-h-screen p-4 py-8 max-w-xl mx-auto w-full space-y-6">
        <AnimatePresence>{correct && <ConfettiBurst />}</AnimatePresence>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-foreground">{correct ? "Nice read!" : "Plot twist"}</h2>
          <p className="text-muted-foreground text-sm">
            {correct
              ? "They spotted the invented dream."
              : "They fooled you — ask them about the real ones."}
          </p>
        </div>
        <div className="space-y-3">
          {sf.bDreams.map((s, i) => (
            <div
              key={i}
              className={`p-4 rounded-2xl border-2 ${
                i === sf.bFakeIndex ? "border-amber-400 bg-amber-50" : "border-primary/10 bg-white"
              }`}
            >
              <span className="text-[10px] uppercase text-muted-foreground">Dream {i + 1}</span>
              {i === sf.bFakeIndex && (
                <span className="ml-2 text-[10px] font-bold uppercase text-amber-800">Invented</span>
              )}
              <p className="text-sm mt-1 whitespace-pre-wrap">{s}</p>
            </div>
          ))}
        </div>
        <div className="rounded-2xl bg-primary/5 border border-primary/15 p-4 text-center">
          <p className="text-xs font-bold text-primary uppercase mb-1">Verbal check-in</p>
          <p className="text-2xl font-mono font-bold text-foreground tabular-nums">{fmtMs(discussLeft)}</p>
          <p className="text-xs text-muted-foreground mt-1">Then you&apos;ll see your shared future together.</p>
        </div>
      </div>
    );
  }

  // ——— Closing ———
  if (
    sf.phase === "closing" &&
    sf.aDreams &&
    sf.bDreams &&
    sf.aFakeIndex != null &&
    sf.bFakeIndex != null
  ) {
    const aReal = realDreams(sf.aDreams, sf.aFakeIndex);
    const bReal = realDreams(sf.bDreams, sf.bFakeIndex);
    const overlap = findSharedFutureThemeOverlap(aReal, bReal);
    const allReal = [...aReal.map((t) => ({ text: t, from: "A" as const })), ...bReal.map((t) => ({ text: t, from: "B" as const }))];

    return (
      <div className="min-h-screen p-4 py-10 max-w-xl mx-auto w-full space-y-8 pb-24">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 text-primary justify-center">
            <Sparkles className="w-6 h-6" />
            <h2 className="text-3xl font-bold text-foreground">Your shared future</h2>
          </div>
          <p className="text-muted-foreground text-sm">Six real hopes between you — the invented lines are left out.</p>
        </div>

        <ul className="space-y-3">
          {allReal.map((item, i) => (
            <li
              key={i}
              className="p-4 rounded-2xl bg-white border border-primary/10 shadow-sm text-left flex gap-3"
            >
              <span className="text-[10px] font-bold text-primary uppercase shrink-0 w-8 pt-1">{item.from}</span>
              <p className="text-foreground text-sm whitespace-pre-wrap">{item.text}</p>
            </li>
          ))}
        </ul>

        {overlap && (
          <p className="text-sm text-center text-primary font-medium bg-primary/5 border border-primary/15 rounded-2xl py-3 px-4">
            {overlap}
          </p>
        )}

        <div className="rounded-2xl bg-white border border-primary/15 p-6 space-y-3 shadow-sm">
          <p className="text-xs font-bold text-muted-foreground uppercase">Talk about this</p>
          <p className="text-foreground leading-relaxed">
            Which of your partner&apos;s real dreams surprised you the most — and why haven&apos;t you talked about it before?
          </p>
        </div>

        <div className="rounded-2xl border border-dashed border-primary/25 p-5 space-y-3 bg-primary/[0.03]">
          <p className="text-sm font-semibold text-foreground">Dream journal (optional)</p>
          <p className="text-xs text-muted-foreground">
            Save your two real lines privately on this device. Your partner won&apos;t see your journal entry.
          </p>
          <button
            type="button"
            disabled={(r === "userA" ? sf.journalAck.userA : sf.journalAck.userB) ?? false}
            onClick={() => {
              const mine = r === "userA" ? aReal : bReal;
              saveDreamJournalLocal(sessionId, r, mine);
              void ackJournal();
            }}
            className="w-full py-3 rounded-xl bg-white border-2 border-primary/20 font-semibold text-primary disabled:opacity-60"
          >
            {(r === "userA" ? sf.journalAck.userA : sf.journalAck.userB) ? "Saved on this device" : "Save my real dreams locally"}
          </button>
        </div>

        <button
          type="button"
          onClick={finishToMood}
          className="w-full py-5 bg-primary text-white rounded-[1.5rem] font-bold shadow-md"
        >
          Continue to mood check-in
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center p-4">
      <Loader2 className="w-10 h-10 animate-spin text-primary" />
    </div>
  );
}
