"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { mergeGratitudeVolley, advanceStage, clearMoods } from "@/lib/firebaseUtils";
import {
  AIM_MAX_WORDS,
  AIM_MIN_WORDS,
  FINAL_PAUSE_MS,
  INTRO_READ_MS,
  TURN_MS,
  TOTAL_VOLLEYS,
  type GratitudeLine,
  type GratitudeVolleyV2,
  createInitialGratitudeVolleyState,
  getVolleyTurn,
  isGenericGratitude,
  lineId,
  migrateLegacyLines,
  spotlightIdForAuthor,
  wordCount,
} from "@/lib/gratitudeVolleyState";
import { Loader2, Heart, X } from "lucide-react";

type SessionShape = { gameData?: Record<string, unknown> };

function fmtTurnClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `0:${String(s).padStart(2, "0")}`;
}

function saveGratitudeArchive(sessionId: string, lines: GratitudeLine[]) {
  if (typeof window === "undefined") return;
  try {
    const key = "lets_fix_it_gratitude_archive";
    const prev = JSON.parse(localStorage.getItem(key) || "[]") as unknown[];
    prev.push({
      at: Date.now(),
      sessionId,
      lines: lines.map((l) => ({ author: l.author, text: l.text })),
    });
    localStorage.setItem(key, JSON.stringify(prev));
  } catch {
    /* ignore */
  }
}

export default function GratitudeVolley({
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
  const rawGv = gameData.gratitudeVolley as GratitudeVolleyV2 | undefined;
  const legacyLines = gameData.gratitudeLines as { author: "userA" | "userB"; text: string }[] | undefined;

  const [tick, setTick] = useState(0);
  const [draft, setDraft] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const migratedLegacyRef = useRef(false);
  const seededFreshRef = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), 400);
    return () => window.clearInterval(id);
  }, []);

  /** One-time migration from pre-v2 flat `gratitudeLines`. */
  useEffect(() => {
    if (migratedLegacyRef.current || r !== "userA") return;
    if (rawGv?.v === 2) return;
    if (!legacyLines?.length) return;
    migratedLegacyRef.current = true;
    const lines = migrateLegacyLines(legacyLines);
    if (lines.length >= TOTAL_VOLLEYS) {
      void mergeGratitudeVolley(sessionId, {
        v: 2,
        phase: "closing",
        introAck: { userA: true, userB: true },
        introProceedAfter: Date.now(),
        lines,
        turnDeadline: null,
        finalMomentStartedAt: null,
        spotlightAId: spotlightIdForAuthor(lines, "userA", sessionId),
        spotlightBId: spotlightIdForAuthor(lines, "userB", sessionId),
        archiveAck: { userA: false, userB: false },
      });
      return;
    }
    void mergeGratitudeVolley(sessionId, {
      v: 2,
      phase: "playing",
      introAck: { userA: true, userB: true },
      introProceedAfter: Date.now(),
      lines,
      turnDeadline: Date.now() + TURN_MS,
      finalMomentStartedAt: null,
      spotlightAId: null,
      spotlightBId: null,
      archiveAck: { userA: false, userB: false },
    });
  }, [legacyLines, rawGv, r, sessionId]);

  /** Host seeds v2 if game started without GameSelect merge (edge case). */
  useEffect(() => {
    if (migratedLegacyRef.current || seededFreshRef.current || r !== "userA") return;
    if (rawGv?.v === 2) return;
    if (legacyLines?.length) return;
    seededFreshRef.current = true;
    void mergeGratitudeVolley(sessionId, createInitialGratitudeVolleyState() as unknown as Record<string, unknown>);
  }, [legacyLines?.length, rawGv, r, sessionId]);

  const now = Date.now();
  const gv = rawGv?.v === 2 ? rawGv : null;

  useEffect(() => {
    if (!gv || gv.phase !== "intro") return;
    if (!gv.introAck.userA || !gv.introAck.userB) return;
    void mergeGratitudeVolley(sessionId, {
      phase: "playing",
      turnDeadline: Date.now() + TURN_MS,
    });
  }, [gv?.phase, gv?.introAck?.userA, gv?.introAck?.userB, sessionId]);

  useEffect(() => {
    if (!gv || gv.phase !== "final_pause" || gv.finalMomentStartedAt == null) return;
    if (Date.now() < gv.finalMomentStartedAt + FINAL_PAUSE_MS) return;
    void mergeGratitudeVolley(sessionId, {
      phase: "closing",
      spotlightAId: spotlightIdForAuthor(gv.lines, "userA", sessionId),
      spotlightBId: spotlightIdForAuthor(gv.lines, "userB", sessionId),
    });
  }, [tick, gv, sessionId]);

  if (!gv) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  const lines = gv.lines;
  const turn = getVolleyTurn(lines);
  const donePlaying = lines.length >= TOTAL_VOLLEYS;
  const myTurn = gv.phase === "playing" && !donePlaying && turn === r;
  const introSecs = Math.max(0, Math.ceil((gv.introProceedAfter - now) / 1000));
  const turnLeft = gv.turnDeadline != null ? Math.max(0, gv.turnDeadline - now) : 0;
  const pulseTurn = myTurn && turnLeft > 0 && turnLeft <= 15_000;
  const wc = wordCount(draft);

  const ackIntro = async () => {
    if (now < gv.introProceedAfter) return;
    setBusy(true);
    await mergeGratitudeVolley(sessionId, {
      introAck: {
        userA: r === "userA" ? true : gv.introAck.userA,
        userB: r === "userB" ? true : gv.introAck.userB,
      },
    });
    setBusy(false);
  };

  const submit = async () => {
    const t = draft.trim();
    setHint("");
    if (!t || (r !== "userA" && r !== "userB")) return;
    if (isGenericGratitude(t)) {
      setHint("Can you be more specific? Name a real moment or behaviour — not just “I love you” or generic praise.");
      return;
    }
    setBusy(true);
    const next: GratitudeLine[] = [...lines, { id: lineId(), author: r, text: t }];
    if (next.length >= TOTAL_VOLLEYS) {
      await mergeGratitudeVolley(sessionId, {
        lines: next,
        phase: "final_pause",
        finalMomentStartedAt: Date.now(),
        turnDeadline: null,
      });
    } else {
      await mergeGratitudeVolley(sessionId, {
        lines: next,
        turnDeadline: Date.now() + TURN_MS,
      });
    }
    setDraft("");
    setBusy(false);
  };

  const ackArchive = async () => {
    await mergeGratitudeVolley(sessionId, {
      archiveAck: {
        userA: r === "userA" ? true : gv.archiveAck.userA,
        userB: r === "userB" ? true : gv.archiveAck.userB,
      },
    });
  };

  const finishMood = async () => {
    await clearMoods(sessionId);
    await advanceStage(sessionId, "return");
  };

  const labelFor = (author: "userA" | "userB") => (author === "userA" ? "From A" : "From B");

  // ——— Intro ———
  if (gv.phase === "intro") {
    const both = gv.introAck.userA && gv.introAck.userB;
    return (
      <div className="min-h-screen p-4 py-8 max-w-lg mx-auto w-full flex flex-col justify-center space-y-6">
        <div className="text-center space-y-2">
          <p className="text-xs font-bold text-primary uppercase tracking-widest">Gratitude volley</p>
          <h2 className="text-2xl font-bold text-foreground">The rule of specificity</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">&quot;I love you&quot;</span> doesn&apos;t count here. Only
            specific, real memories or behaviours — things only your partner would know.
          </p>
        </div>

        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/80 p-4 space-y-2">
          <p className="text-[10px] font-bold text-emerald-800 uppercase">Good examples</p>
          <p className="text-sm text-emerald-950 leading-relaxed">
            &quot;You always refill my water glass without being asked.&quot;
          </p>
          <p className="text-sm text-emerald-950 leading-relaxed">
            &quot;You remembered that thing I mentioned three months ago.&quot;
          </p>
        </div>

        <div className="rounded-2xl border-2 border-red-200 bg-red-50/60 p-4 space-y-2 relative overflow-hidden">
          <p className="text-[10px] font-bold text-red-800 uppercase">Too generic</p>
          <p className="text-sm text-red-900/90 line-through decoration-2 decoration-red-500 flex items-start gap-2">
            <X className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
            &quot;I love you so much — you&apos;re the best.&quot;
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          {now < gv.introProceedAfter ? `Take a breath — continue in ${introSecs}s…` : "When you've read the rule, tap below."}
        </p>

        {both ? (
          <div className="flex justify-center gap-2 text-primary font-medium">
            <Loader2 className="w-5 h-5 animate-spin" /> Starting…
          </div>
        ) : (
          <button
            type="button"
            disabled={busy || now < gv.introProceedAfter || (r === "userA" ? gv.introAck.userA : gv.introAck.userB)}
            onClick={ackIntro}
            className="w-full py-4 rounded-2xl bg-primary text-white font-bold disabled:opacity-45"
          >
            {r === "userA" && gv.introAck.userA
              ? "Got it — waiting for partner"
              : r === "userB" && gv.introAck.userB
                ? "Got it — waiting for partner"
                : "Got it"}
          </button>
        )}
      </div>
    );
  }

  const listBlock = (opts: { animate?: boolean }) => (
    <div className="space-y-2 max-h-[42vh] overflow-y-auto pr-1">
      <AnimatePresence initial={false}>
        {lines.map((line) => (
          <motion.div
            key={line.id}
            layout
            initial={opts.animate ? { opacity: 0, y: 12 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="rounded-2xl border border-primary/10 bg-white px-4 py-3 shadow-sm text-left"
          >
            <p className="text-[10px] font-bold text-primary uppercase tracking-wide mb-1">{labelFor(line.author)}</p>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{line.text}</p>
          </motion.div>
        ))}
      </AnimatePresence>
      {lines.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-6">Your list will grow here, turn by turn.</p>
      )}
    </div>
  );

  // ——— Playing ———
  if (gv.phase === "playing") {
    return (
      <div className="min-h-screen flex flex-col max-w-lg mx-auto w-full p-4 pb-6">
        <div className="shrink-0 text-center space-y-1 pt-2 pb-3">
          <p className="text-xs font-bold text-muted-foreground uppercase">
            Round {lines.length + 1} of {TOTAL_VOLLEYS}
          </p>
          {myTurn ? (
            <p
              className={`text-3xl font-mono font-bold text-primary tabular-nums ${pulseTurn ? "animate-pulse" : ""}`}
            >
              {fmtTurnClock(turnLeft)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Partner&apos;s turn — watch the list update live.</p>
          )}
        </div>

        {listBlock({ animate: true })}

        <div className="flex-1 min-h-4" />

        {myTurn ? (
          <div className="space-y-3 pt-4 border-t border-primary/10 mt-4">
            <p className="text-xs text-center text-muted-foreground">
              Aim for about {AIM_MIN_WORDS}–{AIM_MAX_WORDS} words with a concrete detail. ({wc} words)
            </p>
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setHint("");
              }}
              placeholder="Something specific they did or said…"
              rows={4}
              className="w-full rounded-2xl border border-primary/20 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-primary/20 resize-none bg-white"
            />
            {hint ? <p className="text-sm text-amber-800 text-center bg-amber-50 rounded-xl py-2 px-3">{hint}</p> : null}
            <button
              type="button"
              disabled={busy || !draft.trim()}
              onClick={submit}
              className="w-full py-4 rounded-2xl bg-primary text-white font-bold disabled:opacity-50"
            >
              {busy ? <Loader2 className="animate-spin mx-auto w-6 h-6" /> : "Add to shared list"}
            </button>
          </div>
        ) : (
          <div className="pt-6 flex flex-col items-center gap-2 text-center text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">They&apos;re writing something specific for you…</p>
          </div>
        )}
      </div>
    );
  }

  // ——— Final pause (5s silence) ———
  if (gv.phase === "final_pause" && gv.finalMomentStartedAt != null) {
    const pauseLeft = Math.max(0, gv.finalMomentStartedAt + FINAL_PAUSE_MS - now);
    return (
      <div className="min-h-screen flex flex-col items-center p-4 py-10 max-w-lg mx-auto w-full">
        <div className="text-center space-y-2 mb-6">
          <Heart className="w-10 h-10 text-primary mx-auto" />
          <h2 className="text-2xl font-bold text-foreground">All eight</h2>
          <p className="text-sm text-muted-foreground">Take a quiet moment together — no buttons yet.</p>
        </div>
        <div className="w-full flex-1 space-y-2 overflow-y-auto">
          {lines.map((line) => (
            <div
              key={line.id}
              className="rounded-2xl border border-primary/10 bg-white px-4 py-4 shadow-sm text-left"
            >
              <p className="text-[10px] font-bold text-primary uppercase tracking-wide mb-1">{labelFor(line.author)}</p>
              <p className="text-foreground leading-relaxed whitespace-pre-wrap">{line.text}</p>
            </div>
          ))}
        </div>
        {pauseLeft > 0 && (
          <p className="text-xs text-muted-foreground mt-6 tabular-nums">{Math.ceil(pauseLeft / 1000)}s</p>
        )}
      </div>
    );
  }

  // ——— Closing ———
  if (gv.phase === "closing") {
    const sa = gv.spotlightAId ? lines.find((l) => l.id === gv.spotlightAId) : null;
    const sb = gv.spotlightBId ? lines.find((l) => l.id === gv.spotlightBId) : null;

    return (
      <div className="min-h-screen p-4 py-10 max-w-lg mx-auto w-full space-y-8 pb-24">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold text-foreground">Your volley</h2>
          <p className="text-muted-foreground text-sm">Eight specific things — no score, no winner. Just what you noticed.</p>
        </div>

        <div className="space-y-2">
          {lines.map((line) => (
            <div key={line.id} className="rounded-2xl border border-primary/10 bg-white px-4 py-3 shadow-sm">
              <p className="text-[10px] font-bold text-primary uppercase mb-1">{labelFor(line.author)}</p>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{line.text}</p>
            </div>
          ))}
        </div>

        {(sa || sb) && (
          <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-5 space-y-4">
            <p className="text-xs font-bold text-primary uppercase text-center">Did you know they noticed that?</p>
            {sa && (
              <div className="rounded-xl bg-white border border-primary/10 p-3">
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">From A</p>
                <p className="text-sm text-foreground">{sa.text}</p>
              </div>
            )}
            {sb && (
              <div className="rounded-xl bg-white border border-primary/10 p-3">
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">From B</p>
                <p className="text-sm text-foreground">{sb.text}</p>
              </div>
            )}
          </div>
        )}

        <div className="rounded-2xl bg-white border border-primary/15 p-5 shadow-sm">
          <p className="text-xs font-bold text-muted-foreground uppercase mb-2">Talk about this</p>
          <p className="text-foreground leading-relaxed">
            Which one on their list did you least expect them to remember?
          </p>
        </div>

        <div className="rounded-2xl border border-dashed border-primary/25 p-5 space-y-3 bg-primary/[0.03]">
          <p className="text-sm font-semibold text-foreground">Gratitude archive</p>
          <p className="text-xs text-muted-foreground">
            Save this full list on your device to reread before tough conversations.
          </p>
          <button
            type="button"
            onClick={() => {
              saveGratitudeArchive(sessionId, lines);
              void ackArchive();
            }}
            disabled={r === "userA" ? gv.archiveAck.userA : gv.archiveAck.userB}
            className="w-full py-3 rounded-xl bg-white border-2 border-primary/20 font-semibold text-primary disabled:opacity-60"
          >
            {r === "userA" ? (gv.archiveAck.userA ? "Saved on this device" : "Add to your Gratitude Archive") : gv.archiveAck.userB ? "Saved on this device" : "Add to your Gratitude Archive"}
          </button>
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
