"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  mergeBlindArchitect,
  appendBlindChatMessages,
  advanceStage,
  clearMoods,
  updateMood,
} from "@/lib/firebaseUtils";
import { Loader2, Eraser } from "lucide-react";
import BlueprintIllustration from "./BlueprintIllustration";
import {
  type BAChatMsg,
  type BlindArchitectV2,
  createInitialBlindArchitectState,
  findObjectNameViolations,
  makeMessage,
  pickHighlightMessageId,
  explainHighlightMessage,
  summarizeMiscommunicationLines,
} from "@/lib/blindArchitectState";

const BLUEPRINT_CAPTIONS = [
  "Stacked base, body, peaked top with a dot above.",
  "Three equal circles in a row, touching.",
  "Tall vertical bar with a wider horizontal bar through the middle.",
  "Large circle, square inside, small triangle pointing down inside the square.",
  "Three stacked blocks: wide, medium, narrow.",
  "Square base, triangle on top, two small squares inside the base.",
] as const;

const PAINT_COLORS = [
  { hex: "#1C1917", label: "Ink" },
  { hex: "#1d4ed8", label: "Blue" },
  { hex: "#15803d", label: "Green" },
  { hex: "#b45309", label: "Amber" },
  { hex: "#b91c1c", label: "Red" },
  { hex: "#7c3aed", label: "Violet" },
] as const;

const BRUSH_SIZES = [3, 8, 16] as const;
const CANVAS_SIZE = 360;
const STUDY_MS = 45_000;
const CHAT_MS = 4 * 60_000;
const INSTRUCTION_COOLDOWN_MS = 15_000;
const LOCKING_MS = 4000;
const REFLECTION_MS = 60_000;

function seatFor(role: string, describerRole: "userA" | "userB"): "describer" | "drawer" {
  return role === describerRole ? "describer" : "drawer";
}

function partnerKey(role: "userA" | "userB"): "userA" | "userB" {
  return role === "userA" ? "userB" : "userA";
}

export default function BlindArchitect({
  sessionId,
  session,
  role,
}: {
  sessionId: string;
  session: any;
  role: string;
}) {
  const router = useRouter();
  const gameData = session.gameData || {};
  const ba = (gameData.blindArchitect || {}) as BlindArchitectV2 & { v?: number };

  const [tick, setTick] = useState(0);
  const [draft, setDraft] = useState("");
  const [reflDraft, setReflDraft] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Last PNG from the drawer’s canvas while chat is open — locking unmounts the canvas, so upload uses this fallback. */
  const drawingSnapshotRef = useRef<string | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const strokeColorRef = useRef<string>(PAINT_COLORS[0].hex);
  const brushSizeRef = useRef<number>(BRUSH_SIZES[1]);
  const uploadedForLocking = useRef<number | null>(null);
  const revealedForLocking = useRef<number | null>(null);
  const reflectionRevealOnce = useRef(false);
  const studyTransitionKey = useRef<string | null>(null);
  const prevLockingUntil = useRef<number | null>(null);
  const archiveFallbackFor = useRef<number | null>(null);

  const [paintColor, setPaintColor] = useState<string>(PAINT_COLORS[0].hex);
  const [brushSize, setBrushSize] = useState<number>(BRUSH_SIZES[1]);

  useEffect(() => {
    strokeColorRef.current = paintColor;
  }, [paintColor]);
  useEffect(() => {
    brushSizeRef.current = brushSize;
  }, [brushSize]);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 400);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (role !== "userA" || ba.v === 2) return;
    mergeBlindArchitect(sessionId, createInitialBlindArchitectState() as unknown as Record<string, unknown>);
  }, [sessionId, role, ba.v]);

  useEffect(() => {
    if (ba.phase !== "reflection_private") {
      reflectionRevealOnce.current = false;
      return;
    }
    const timeUp = ba.reflectionEndsAt != null && Date.now() >= ba.reflectionEndsAt;
    const both = !!(ba.reflectionSubmitted?.userA && ba.reflectionSubmitted?.userB);
    if (!timeUp && !both) return;
    if (reflectionRevealOnce.current) return;
    reflectionRevealOnce.current = true;
    mergeBlindArchitect(sessionId, { phase: "reflection_reveal" });
  }, [tick, ba.phase, ba.reflectionEndsAt, ba.reflectionSubmitted, sessionId]);

  useEffect(() => {
    if (ba.phase === "reflection_private") setReflDraft("");
  }, [ba.phase, ba.reflectionEndsAt]);

  const r = role as "userA" | "userB";
  const now = Date.now();

  if (!ba || ba.v !== 2) {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  const describerRole = ba.describerRole;
  const mySeat = seatFor(r, describerRole);
  const isDescriber = mySeat === "describer";
  const chatSubphase = ba.chatSubphase ?? "instruction";
  const clarifyReceived = ba.clarifyReceivedThisCycle === true;

  /** Firestore-backed append — avoids stale `ba.messages` wiping the thread. */
  const pushMessages = async (msgs: BAChatMsg[], patch: Record<string, unknown> = {}) => {
    await appendBlindChatMessages(sessionId, msgs, patch);
  };

  const ackRules = async () => {
    const ack = { ...ba.rulesAck, [r]: true };
    const both = ack.userA && ack.userB;
    await mergeBlindArchitect(sessionId, {
      rulesAck: ack,
      ...(both
        ? {
            phase: "study",
            studyEndsAt: Date.now() + STUDY_MS,
          }
        : {}),
    });
  };

  /** Describer can end study early; both clients jump to chat via Firestore. */
  const skipStudyToChat = async () => {
    if (ba.phase !== "study" || !ba.studyEndsAt) return;
    const key = `${ba.round}-${ba.studyEndsAt}`;
    studyTransitionKey.current = key;
    await mergeBlindArchitect(sessionId, {
      phase: "chat",
      roundTimerEndsAt: Date.now() + CHAT_MS,
      chatSubphase: "instruction",
      lastInstructionAt: null,
      clarifyReceivedThisCycle: false,
    });
  };

  useEffect(() => {
    if (ba.phase !== "study" || !ba.studyEndsAt) return;
    if (Date.now() < ba.studyEndsAt) return;
    const key = `${ba.round}-${ba.studyEndsAt}`;
    if (studyTransitionKey.current === key) return;
    studyTransitionKey.current = key;
    mergeBlindArchitect(sessionId, {
      phase: "chat",
      roundTimerEndsAt: Date.now() + CHAT_MS,
      chatSubphase: "instruction",
      lastInstructionAt: null,
      clarifyReceivedThisCycle: false,
    });
  }, [tick, ba.phase, ba.studyEndsAt, ba.round, sessionId]);

  useEffect(() => {
    if (ba.phase !== "chat") return;
    if (ba.chatSubphase) return;
    mergeBlindArchitect(sessionId, {
      chatSubphase: "instruction",
      clarifyReceivedThisCycle: false,
    });
  }, [ba.phase, ba.chatSubphase, sessionId]);

  useEffect(() => {
    if (ba.phase !== "chat" || ba.chatLocked || !ba.roundTimerEndsAt) return;
    if (Date.now() < ba.roundTimerEndsAt) return;
    mergeBlindArchitect(sessionId, {
      phase: "locking",
      lockingUntil: Date.now() + LOCKING_MS,
      chatLocked: true,
      canvasLocked: true,
    });
  }, [tick, ba.phase, ba.chatLocked, ba.roundTimerEndsAt, sessionId]);

  useEffect(() => {
    if (ba.phase !== "locking" || ba.lockingUntil == null) return;
    if (seatFor(r, ba.describerRole) !== "drawer") return;
    if (uploadedForLocking.current === ba.lockingUntil) return;
    uploadedForLocking.current = ba.lockingUntil;
    const c = canvasRef.current;
    let dataUrl: string | null = null;
    if (c) {
      try {
        dataUrl = c.toDataURL("image/png");
      } catch {
        dataUrl = null;
      }
    }
    if (!dataUrl) dataUrl = drawingSnapshotRef.current;
    const hi = pickHighlightMessageId(ba.messages || []);
    const archive = {
      round: ba.round,
      blueprintIndex: ba.blueprintIndex,
      messages: [...(ba.messages || [])],
      drawingDataUrl: dataUrl,
      highlightMessageId: hi,
      describerRole: ba.describerRole,
      violationsRound: { ...ba.violations },
    };
    if (ba.round === 1) {
      mergeBlindArchitect(sessionId, { round1Archive: archive, roundDrawingDataUrl: dataUrl });
    } else {
      mergeBlindArchitect(sessionId, { round2Archive: archive, roundDrawingDataUrl: dataUrl });
    }
  }, [ba.phase, ba.lockingUntil, ba.round, ba.blueprintIndex, ba.messages, ba.describerRole, ba.violations, r, sessionId]);

  useEffect(() => {
    if (ba.phase !== "locking" || ba.lockingUntil == null) return;
    if (Date.now() < ba.lockingUntil + 1200) return;
    const arc = ba.round === 1 ? ba.round1Archive : ba.round2Archive;
    if (arc || r !== "userA") return;
    if (archiveFallbackFor.current === ba.lockingUntil) return;
    archiveFallbackFor.current = ba.lockingUntil;
    const hi = pickHighlightMessageId(ba.messages || []);
    const fallback = {
      round: ba.round,
      blueprintIndex: ba.blueprintIndex,
      messages: [...(ba.messages || [])],
      drawingDataUrl: null,
      highlightMessageId: hi,
      describerRole: ba.describerRole,
      violationsRound: { ...ba.violations },
    };
    if (ba.round === 1) mergeBlindArchitect(sessionId, { round1Archive: fallback });
    else mergeBlindArchitect(sessionId, { round2Archive: fallback });
  }, [tick, ba.phase, ba.lockingUntil, ba.round, ba.round1Archive, ba.round2Archive, ba.messages, ba.blueprintIndex, ba.describerRole, ba.violations, r, sessionId]);

  useEffect(() => {
    if (ba.phase !== "locking" || ba.lockingUntil == null) return;
    if (Date.now() < ba.lockingUntil) return;
    if (revealedForLocking.current === ba.lockingUntil) return;
    revealedForLocking.current = ba.lockingUntil;
    mergeBlindArchitect(sessionId, { phase: "reveal" });
  }, [tick, ba.phase, ba.lockingUntil, sessionId]);

  useEffect(() => {
    if (ba.lockingUntil !== prevLockingUntil.current) {
      uploadedForLocking.current = null;
      revealedForLocking.current = null;
      archiveFallbackFor.current = null;
      prevLockingUntil.current = ba.lockingUntil ?? null;
    }
  }, [ba.lockingUntil]);

  useEffect(() => {
    if (ba.phase !== "chat" || ba.canvasLocked || seatFor(r, ba.describerRole) !== "drawer") return;
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    historyRef.current = [];
    try {
      drawingSnapshotRef.current = c.toDataURL("image/png");
    } catch {
      /* ignore */
    }
  }, [ba.phase, ba.canvasLocked, ba.round, r, ba.describerRole]);

  useEffect(() => {
    if (ba.phase !== "chat" || ba.canvasLocked || seatFor(r, ba.describerRole) !== "drawer") return;
    const snap = () => {
      const c = canvasRef.current;
      if (!c) return;
      try {
        drawingSnapshotRef.current = c.toDataURL("image/png");
      } catch {
        /* ignore */
      }
    };
    snap();
    const id = window.setInterval(snap, 2000);
    return () => window.clearInterval(id);
  }, [ba.phase, ba.canvasLocked, r, ba.describerRole]);

  useEffect(() => {
    if (ba.phase !== "chat" || ba.canvasLocked || !isDescriber) return;
    const sub = ba.chatSubphase ?? "instruction";
    if (sub !== "after_instruction" || ba.clarifyReceivedThisCycle === true) return;
    if (ba.lastInstructionAt == null) return;
    if (Date.now() < ba.lastInstructionAt + INSTRUCTION_COOLDOWN_MS) return;
    mergeBlindArchitect(sessionId, { chatSubphase: "instruction" });
  }, [tick, ba.phase, ba.canvasLocked, ba.chatSubphase, ba.clarifyReceivedThisCycle, ba.lastInstructionAt, isDescriber, sessionId]);

  const startRound2 = async () => {
    const nextDescriber: "userA" | "userB" = ba.describerRole === "userA" ? "userB" : "userA";
    studyTransitionKey.current = null;
    await mergeBlindArchitect(sessionId, {
      round: 2,
      describerRole: nextDescriber,
      phase: "study",
      studyEndsAt: Date.now() + STUDY_MS,
      messages: [],
      chatSubphase: "instruction",
      lastInstructionAt: null,
      clarifyReceivedThisCycle: false,
      chatLocked: false,
      canvasLocked: false,
      roundTimerEndsAt: null,
      lockingUntil: null,
      describerDone: false,
      roundDrawingDataUrl: null,
      blueprintIndex: ba.blueprintIndexR2,
    });
  };

  const goClosing = async () => {
    await mergeBlindArchitect(sessionId, { phase: "closing" });
  };

  const startReflection = async () => {
    await mergeBlindArchitect(sessionId, {
      phase: "reflection_private",
      reflectionEndsAt: Date.now() + REFLECTION_MS,
      reflectionText: { userA: "", userB: "" },
      reflectionSubmitted: { userA: false, userB: false },
    });
  };

  const submitReflection = async () => {
    const text = reflDraft.trim();
    const next = { ...ba.reflectionText, [r]: text };
    const sub = { ...ba.reflectionSubmitted, [r]: true };
    await mergeBlindArchitect(sessionId, { reflectionText: next, reflectionSubmitted: sub });
  };

  const startFinalMood = async () => {
    await clearMoods(sessionId);
    await mergeBlindArchitect(sessionId, { phase: "final_mood" });
  };

  const finishBlindArchitect = async () => {
    await advanceStage(sessionId, "return");
    router.push("/");
  };

  const triggerLock = async () => {
    if (ba.phase !== "chat" || ba.chatLocked) return;
    await mergeBlindArchitect(sessionId, {
      phase: "locking",
      lockingUntil: Date.now() + LOCKING_MS,
      chatLocked: true,
      canvasLocked: true,
    });
  };

  const sendDescriberText = async (kind: "instruction" | "answer", textRaw: string) => {
    const text = textRaw.trim();
    if (!text) return;
    const sub = chatSubphase;
    const bad = findObjectNameViolations(text);
    if (bad.length > 0) {
      const v = { ...ba.violations, [r]: (ba.violations[r] || 0) + 1 };
      await pushMessages(
        [
          makeMessage({
            fromRole: r,
            seat: "describer",
            kind: "blocked_attempt",
            text,
            blockedWords: bad,
          }),
          makeMessage({
            fromRole: r,
            seat: "describer",
            kind: "system",
            text: `Object name detected: "${bad.join('", "')}" — please rephrase using only shapes and directions.`,
          }),
        ],
        { violations: v }
      );
      return;
    }

    if (kind === "instruction") {
      const canSend =
        sub === "instruction" ||
        (sub === "after_instruction" &&
          !clarifyReceived &&
          ba.lastInstructionAt != null &&
          Date.now() >= ba.lastInstructionAt + INSTRUCTION_COOLDOWN_MS);
      if (!canSend) return;

      await pushMessages(
        [
          makeMessage({
            fromRole: r,
            seat: "describer",
            kind: "instruction",
            text,
          }),
        ],
        {
          chatSubphase: "after_instruction",
          lastInstructionAt: Date.now(),
          clarifyReceivedThisCycle: false,
        }
      );
    } else {
      if (sub !== "awaiting_answer") return;
      await pushMessages(
        [
          makeMessage({
            fromRole: r,
            seat: "describer",
            kind: "answer",
            text,
          }),
        ],
        {
          chatSubphase: "instruction",
          clarifyReceivedThisCycle: false,
          lastInstructionAt: null,
        }
      );
    }
  };

  const sendDrawerClarify = async (textRaw: string) => {
    const text = textRaw.trim();
    if (!text) return;
    if (chatSubphase !== "after_instruction" || clarifyReceived) return;
    if (!text.includes("?")) {
      await pushMessages([
        makeMessage({
          fromRole: r,
          seat: "drawer",
          kind: "system",
          text: "Please ask one short clarifying question (include a question mark).",
        }),
      ]);
      return;
    }
    await pushMessages(
      [
        makeMessage({
          fromRole: r,
          seat: "drawer",
          kind: "clarify",
          text,
        }),
      ],
      {
        chatSubphase: "awaiting_answer",
        clarifyReceivedThisCycle: true,
      }
    );
  };

  const sendDone = async () => {
    await pushMessages(
      [
        makeMessage({
          fromRole: r,
          seat: "describer",
          kind: "done",
          text: "I'm done — lock this round.",
        }),
      ],
      { describerDone: true }
    );
    await triggerLock();
  };

  const getCtx = () => canvasRef.current?.getContext("2d");

  const pushHistory = () => {
    const ctx = getCtx();
    const c = canvasRef.current;
    if (!ctx || !c) return;
    try {
      const snap = ctx.getImageData(0, 0, c.width, c.height);
      historyRef.current.push(snap);
      if (historyRef.current.length > 24) historyRef.current.shift();
    } catch {
      /* ignore */
    }
  };

  const undoLast = () => {
    const ctx = getCtx();
    const c = canvasRef.current;
    const prev = historyRef.current.pop();
    if (!ctx || !c || !prev) return;
    ctx.putImageData(prev, 0, 0);
  };

  const clearCanvas = () => {
    const ctx = getCtx();
    const c = canvasRef.current;
    if (!ctx || !c) return;
    pushHistory();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    try {
      drawingSnapshotRef.current = c.toDataURL("image/png");
    } catch {
      /* ignore */
    }
  };

  const startDraw = (x: number, y: number) => {
    if (ba.canvasLocked || ba.phase !== "chat") return;
    pushHistory();
    drawingRef.current = true;
    lastRef.current = { x, y };
  };

  const moveDraw = (x: number, y: number) => {
    if (!drawingRef.current || !lastRef.current) return;
    const ctx = getCtx();
    const c = canvasRef.current;
    if (!ctx || !c) return;
    ctx.strokeStyle = strokeColorRef.current;
    ctx.lineWidth = brushSizeRef.current;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    lastRef.current = { x, y };
  };

  const endDraw = () => {
    drawingRef.current = false;
    lastRef.current = null;
    if (ba.phase === "chat" && !ba.canvasLocked && seatFor(r, ba.describerRole) === "drawer") {
      const c = canvasRef.current;
      if (c) {
        try {
          drawingSnapshotRef.current = c.toDataURL("image/png");
        } catch {
          /* ignore */
        }
      }
    }
  };

  const chatTimeLeft = ba.roundTimerEndsAt ? Math.max(0, ba.roundTimerEndsAt - now) : 0;
  const studyTimeLeft = ba.studyEndsAt ? Math.max(0, ba.studyEndsAt - now) : 0;
  const instructionCooldownSecsLeft =
    ba.lastInstructionAt != null
      ? Math.max(0, Math.ceil((ba.lastInstructionAt + INSTRUCTION_COOLDOWN_MS - now) / 1000))
      : 0;
  const warnChat = ba.phase === "chat" && chatTimeLeft > 0 && chatTimeLeft <= 60_000;
  const fmt = (ms: number) => {
    const s = Math.ceil(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  };

  const canSendInstruction =
    isDescriber &&
    ba.phase === "chat" &&
    !ba.chatLocked &&
    (chatSubphase === "instruction" ||
      (chatSubphase === "after_instruction" &&
        !clarifyReceived &&
        ba.lastInstructionAt != null &&
        Date.now() >= ba.lastInstructionAt + INSTRUCTION_COOLDOWN_MS));

  const canSendAnswer = isDescriber && ba.phase === "chat" && !ba.chatLocked && chatSubphase === "awaiting_answer";

  const canSendClarify =
    !isDescriber &&
    ba.phase === "chat" &&
    !ba.chatLocked &&
    chatSubphase === "after_instruction" &&
    !clarifyReceived;

  const blueprintIdx = ba.blueprintIndex % 6;

  if (ba.phase === "rules") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 py-10 max-w-lg mx-auto w-full">
        <div className="space-y-8 w-full text-center">
          <h2 className="text-3xl font-bold text-foreground">Blind Architect</h2>
          <div className="text-left space-y-3 bg-white rounded-[2rem] border border-primary/10 p-8 shadow-sm">
            <p className="font-semibold text-foreground">
              {isDescriber ? "You are describing this round." : "You are drawing this round."}
            </p>
            <ul className="text-muted-foreground text-sm space-y-2 list-disc pl-5">
              <li>One instruction per message (describer).</li>
              <li>Drawer may reply once per instruction with one clarifying question.</li>
              <li>No object names — only shapes and positions (auto-checked).</li>
              <li>No guessing aloud what the image “is.”</li>
              <li>Describer waits for your clarifying reply or 15 seconds before the next instruction.</li>
            </ul>
          </div>
          <button
            type="button"
            onClick={ackRules}
            disabled={ba.rulesAck[r]}
            className="w-full py-5 bg-primary text-white rounded-[1.5rem] font-bold disabled:opacity-50"
          >
            {ba.rulesAck[r] ? "Waiting for partner…" : "I understand the rules"}
          </button>
        </div>
      </div>
    );
  }

  if (ba.phase === "study") {
    if (isDescriber) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center p-4 py-10 max-w-xl mx-auto w-full space-y-6">
          {ba.studyEndsAt && <p className="text-2xl font-mono font-bold text-primary">{fmt(studyTimeLeft)}</p>}
          <h2 className="text-2xl font-bold text-foreground text-center">Study the blueprint</h2>
          <p className="text-muted-foreground text-center text-sm">
            Plan step by step — you will send one instruction at a time in chat.
          </p>
          <div className="w-full bg-white rounded-[2rem] border border-primary/10 p-6 shadow-sm">
            <BlueprintIllustration index={blueprintIdx} className="w-full h-64 rounded-xl border border-primary/10" />
            <p className="text-xs text-muted-foreground mt-4 leading-relaxed">{BLUEPRINT_CAPTIONS[blueprintIdx]}</p>
          </div>
          <button
            type="button"
            onClick={skipStudyToChat}
            className="w-full py-4 rounded-[1.5rem] font-semibold border-2 border-primary/30 bg-white text-foreground hover:bg-primary/5 hover:border-primary/50 transition"
          >
            Start now — skip remaining time
          </button>
          <p className="text-xs text-muted-foreground text-center">
            Use this when you&apos;re ready; your partner&apos;s screen will open chat at the same time.
          </p>
        </div>
      );
    }
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center space-y-8">
        <motion.div
          className="w-40 h-40 rounded-full bg-primary/15"
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Your partner is studying the image…</h2>
          <p className="text-muted-foreground max-w-sm mx-auto">
            Slow breathing. Your canvas unlocks when the round timer starts.
          </p>
        </div>
        <div className="rounded-[1.5rem] border border-dashed border-primary/30 p-4 opacity-60">
          <canvas width={CANVAS_SIZE} height={CANVAS_SIZE} className="max-w-full h-auto bg-white rounded-xl" />
          <p className="text-xs text-muted-foreground mt-2">Locked until chat opens.</p>
        </div>
      </div>
    );
  }

  if (ba.phase === "chat") {
    const onSubmit = async () => {
      const t = draft.trim();
      if (!t) return;
      if (canSendInstruction) await sendDescriberText("instruction", t);
      else if (canSendAnswer) await sendDescriberText("answer", t);
      else if (canSendClarify) await sendDrawerClarify(t);
      setDraft("");
    };

    return (
      <div className="flex min-h-screen flex-col max-w-2xl mx-auto w-full p-3 pb-28">
        {warnChat && (
          <div className="mb-2 rounded-xl bg-amber-100 text-amber-900 text-center text-sm py-2 px-3 border border-amber-200">
            Under one minute left in this round.
          </div>
        )}
        <div className="flex justify-between items-center py-2 border-b border-primary/10">
          <span className="text-sm font-bold text-primary">
            Round {ba.round} · {fmt(chatTimeLeft)}
          </span>
          <span className="text-xs text-muted-foreground">{isDescriber ? "Describer" : "Drawer"}</span>
        </div>

        {isDescriber && (
          <div className="rounded-[1.25rem] border border-primary/15 bg-white p-4 shadow-sm space-y-2 shrink-0">
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Your reference — same blueprint</p>
            <BlueprintIllustration
              index={blueprintIdx}
              className="w-full max-h-52 object-contain rounded-xl border border-primary/10 bg-[#fafbfc]"
            />
            <p className="text-[11px] text-muted-foreground leading-snug">{BLUEPRINT_CAPTIONS[blueprintIdx]}</p>
          </div>
        )}

        {!isDescriber && (
          <div className="py-3 space-y-2">
            <p className="text-xs font-bold text-primary uppercase tracking-widest">Your canvas</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {PAINT_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  title={c.label}
                  onClick={() => setPaintColor(c.hex)}
                  className={`h-8 w-8 rounded-full border-2 ${
                    paintColor === c.hex ? "border-primary ring-2 ring-primary/30" : "border-white ring-1 ring-primary/20"
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
              {BRUSH_SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setBrushSize(s)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold border ${
                    brushSize === s ? "bg-primary text-white" : "bg-white border-primary/15"
                  }`}
                >
                  {s}px
                </button>
              ))}
              <button type="button" onClick={undoLast} className="px-3 py-1 rounded-lg text-xs border bg-white">
                Undo
              </button>
              <button
                type="button"
                onClick={clearCanvas}
                className="px-3 py-1 rounded-lg text-xs border bg-white inline-flex items-center gap-1"
              >
                <Eraser className="w-3 h-3" /> Clear
              </button>
            </div>
            <div className="rounded-[1rem] border border-primary/20 overflow-hidden w-fit mx-auto max-w-full">
              <canvas
                ref={canvasRef}
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
                className="touch-none cursor-crosshair block bg-white max-w-full h-auto"
                onMouseDown={(e) => {
                  const el = e.currentTarget;
                  const rect = el.getBoundingClientRect();
                  const sx = el.width / rect.width;
                  const sy = el.height / rect.height;
                  startDraw((e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy);
                }}
                onMouseMove={(e) => {
                  const el = e.currentTarget;
                  const rect = el.getBoundingClientRect();
                  const sx = el.width / rect.width;
                  const sy = el.height / rect.height;
                  moveDraw((e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy);
                }}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={(e) => {
                  e.preventDefault();
                  const el = e.currentTarget;
                  const rect = el.getBoundingClientRect();
                  const sx = el.width / rect.width;
                  const sy = el.height / rect.height;
                  const t0 = e.touches[0];
                  startDraw((t0.clientX - rect.left) * sx, (t0.clientY - rect.top) * sy);
                }}
                onTouchMove={(e) => {
                  e.preventDefault();
                  const el = e.currentTarget;
                  const rect = el.getBoundingClientRect();
                  const sx = el.width / rect.width;
                  const sy = el.height / rect.height;
                  const t0 = e.touches[0];
                  moveDraw((t0.clientX - rect.left) * sx, (t0.clientY - rect.top) * sy);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  endDraw();
                }}
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-2 py-4 min-h-[40vh]">
          {(ba.messages || []).map((m) => (
            <div
              key={m.id}
              className={`rounded-2xl px-4 py-3 text-sm ${
                m.kind === "system" || m.kind === "blocked_attempt"
                  ? "bg-amber-50 border border-amber-200 text-amber-950"
                  : m.seat === "describer"
                    ? "bg-white border border-primary/15 ml-0 mr-8"
                    : "bg-primary/5 border border-primary/10 ml-8 mr-0"
              }`}
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                {m.seat} · {m.kind.replace("_", " ")}
              </p>
              <p className="text-foreground whitespace-pre-wrap">{m.text}</p>
            </div>
          ))}
        </div>

        <div className="fixed bottom-0 left-0 right-0 p-3 bg-white/95 border-t border-primary/10 backdrop-blur max-w-2xl mx-auto">
          {isDescriber && (
            <p className="text-[11px] text-muted-foreground mb-1 text-center">
              {canSendInstruction && "Send one instruction."}
              {canSendAnswer && "Answer their clarifying question."}
              {!canSendInstruction &&
                !canSendAnswer &&
                chatSubphase === "after_instruction" &&
                !clarifyReceived && (
                  <>
                    Wait for their question or {instructionCooldownSecsLeft}s to send the next instruction.
                  </>
                )}
              {!canSendInstruction && !canSendAnswer && chatSubphase === "awaiting_answer" && "They asked — answer in one message."}
            </p>
          )}
          {!isDescriber && canSendClarify && (
            <p className="text-[11px] text-muted-foreground mb-1 text-center">One clarifying question (must include ?).</p>
          )}
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                isDescriber ? (canSendAnswer ? "Your answer…" : "Type your instruction…") : "Your clarifying question…"
              }
              className="flex-1 rounded-2xl border border-primary/20 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-primary/20"
              disabled={
                ba.chatLocked ||
                (isDescriber && !canSendInstruction && !canSendAnswer) ||
                (!isDescriber && !canSendClarify)
              }
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), onSubmit())}
            />
            <button
              type="button"
              onClick={onSubmit}
              disabled={
                ba.chatLocked ||
                (isDescriber && !canSendInstruction && !canSendAnswer) ||
                (!isDescriber && !canSendClarify)
              }
              className="px-5 py-3 rounded-2xl bg-primary text-white font-bold text-sm"
            >
              Send
            </button>
          </div>
          {isDescriber && (
            <button type="button" onClick={sendDone} className="w-full mt-2 py-2 text-sm text-primary font-semibold">
              I&apos;m done — end round
            </button>
          )}
        </div>
      </div>
    );
  }

  if (ba.phase === "locking") {
    return (
      <div className="flex h-screen items-center justify-center p-6 text-center">
        <div className="space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
          <h2 className="text-xl font-bold text-foreground">Preparing the reveal…</h2>
          <p className="text-muted-foreground text-sm">Canvas and chat are locked.</p>
        </div>
      </div>
    );
  }

  const archive = ba.round === 1 ? ba.round1Archive : ba.round2Archive;
  const highlightId = archive?.highlightMessageId;
  const highlightWhy =
    archive && highlightId ? explainHighlightMessage(archive.messages || [], highlightId) : null;

  if (ba.phase === "reveal" && archive) {
    return (
      <div className="min-h-screen p-4 py-10 max-w-3xl mx-auto w-full space-y-8">
        <h2 className="text-3xl font-bold text-foreground text-center">Round {ba.round} reveal</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <motion.div
            initial={{ x: -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="bg-white rounded-[2rem] border border-primary/10 p-4 shadow-sm"
          >
            <p className="text-xs font-bold text-primary uppercase mb-2">Original</p>
            <BlueprintIllustration index={archive.blueprintIndex} className="w-full h-48 rounded-xl border border-primary/10" />
          </motion.div>
          <motion.div
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="bg-white rounded-[2rem] border border-primary/10 p-4 shadow-sm"
          >
            <p className="text-xs font-bold text-primary uppercase mb-2">What was drawn</p>
            {archive.drawingDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={archive.drawingDataUrl} alt="Drawing" className="w-full rounded-xl border border-primary/10" />
            ) : (
              <p className="text-muted-foreground text-sm">No drawing captured.</p>
            )}
          </motion.div>
        </div>

        {highlightId && (
          <div className="rounded-2xl border-2 border-primary bg-primary/5 p-4">
            <p className="text-xs font-bold text-primary uppercase mb-1">Miscommunication spotted</p>
            <p className="text-sm text-foreground">
              {(archive.messages || []).find((m) => m.id === highlightId)?.text || "Review the thread below."}
            </p>
            {highlightWhy ? <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{highlightWhy}</p> : null}
          </div>
        )}

        <div className="bg-white rounded-[2rem] border border-primary/10 p-4 max-h-64 overflow-y-auto shadow-sm">
          <p className="text-xs font-bold text-muted-foreground uppercase mb-2">Full chat</p>
          {(archive.messages || []).map((m) => (
            <div
              key={m.id}
              className={`py-2 border-b border-primary/5 last:border-0 text-sm ${m.id === highlightId ? "bg-primary/10 -mx-2 px-2 rounded-lg" : ""}`}
            >
              <span className="text-[10px] text-muted-foreground">{m.seat}</span>
              <p className="text-foreground">{m.text}</p>
            </div>
          ))}
        </div>

        {ba.round === 1 ? (
          <button type="button" onClick={startRound2} className="w-full py-5 bg-primary text-white rounded-[1.5rem] font-bold">
            Swap roles — start round 2
          </button>
        ) : (
          <button type="button" onClick={goClosing} className="w-full py-5 bg-primary text-white rounded-[1.5rem] font-bold">
            Continue to closing
          </button>
        )}
      </div>
    );
  }

  if (ba.phase === "reveal" && !archive) {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (ba.phase === "closing") {
    const r1 = ba.round1Archive;
    const r2 = ba.round2Archive;
    const lines = summarizeMiscommunicationLines(r1, r2, 2);
    const va = ba.violations.userA || 0;
    const vb = ba.violations.userB || 0;

    return (
      <div className="min-h-screen p-4 py-10 max-w-3xl mx-auto w-full space-y-8 text-center">
        <h2 className="text-3xl font-bold text-foreground">Both rounds</h2>
        <div className="grid grid-cols-2 gap-3">
          {[r1, r2].map(
            (arc, i) =>
              arc && (
                <div key={i} className="space-y-2">
                  <p className="text-xs font-bold text-primary">R{i + 1} target</p>
                  <BlueprintIllustration index={arc.blueprintIndex} className="w-full h-28 rounded-xl border border-primary/10" />
                  <p className="text-xs font-bold text-primary">R{i + 1} draw</p>
                  {arc.drawingDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={arc.drawingDataUrl} alt="" className="w-full rounded-xl border border-primary/10" />
                  ) : (
                    <div className="h-28 bg-muted rounded-xl" />
                  )}
                </div>
              )
          )}
        </div>

        <div className="text-left bg-white rounded-[2rem] border border-primary/10 p-6 shadow-sm space-y-3">
          <p className="text-xs font-bold text-primary uppercase">Miscommunication highlights</p>
          {lines.map((line, i) => (
            <p key={i} className="text-sm text-foreground border-l-2 border-primary pl-3">
              “{line.text}”
            </p>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">
          Object-name tries (light observation): You used {r === "userA" ? va : vb}. Your partner used {r === "userA" ? vb : va}.
        </p>
        <p className="text-foreground text-lg leading-relaxed max-w-xl mx-auto">
          Even when you&apos;re both trying, the same words can land completely differently. That&apos;s not a flaw — it&apos;s
          just how communication works.
        </p>
        <p className="font-semibold text-foreground">
          Which instruction did you think was perfectly clear — that clearly wasn&apos;t? What would you say differently now?
        </p>
        <button type="button" onClick={startReflection} className="w-full py-5 bg-primary text-white rounded-[1.5rem] font-bold">
          Answer privately (60s)
        </button>
      </div>
    );
  }

  if (ba.phase === "reflection_private") {
    const left = ba.reflectionEndsAt ? Math.max(0, ba.reflectionEndsAt - now) : 0;
    const done = ba.reflectionSubmitted?.[r];

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 max-w-lg mx-auto space-y-6">
        <p className="font-mono text-primary font-bold">{fmt(left)}</p>
        <h2 className="text-2xl font-bold text-foreground text-center">Private reflection</h2>
        <p className="text-muted-foreground text-sm text-center">
          Type 1–2 sentences. Both answers appear when time is up or after you both submit.
        </p>
        <textarea
          value={reflDraft}
          onChange={(e) => setReflDraft(e.target.value)}
          disabled={!!done}
          rows={5}
          className="w-full rounded-[1.5rem] border border-primary/20 p-4 text-base"
        />
        <button
          type="button"
          disabled={!!done}
          onClick={submitReflection}
          className="w-full py-4 bg-primary text-white rounded-[1.5rem] font-bold disabled:opacity-50"
        >
          {done ? "Submitted" : "Submit"}
        </button>
      </div>
    );
  }

  if (ba.phase === "reflection_reveal") {
    return (
      <div className="min-h-screen p-4 py-10 max-w-lg mx-auto space-y-8 text-center">
        <h2 className="text-2xl font-bold text-foreground">Your reflections</h2>
        <div className="text-left space-y-4">
          <div className="bg-white rounded-[1.5rem] border border-primary/10 p-4">
            <p className="text-xs font-bold text-primary mb-1">Partner</p>
            <p className="text-foreground text-sm whitespace-pre-wrap">{ba.reflectionText[partnerKey(r)] || "—"}</p>
          </div>
          <div className="bg-white rounded-[1.5rem] border border-primary/10 p-4">
            <p className="text-xs font-bold text-primary mb-1">You</p>
            <p className="text-foreground text-sm whitespace-pre-wrap">{ba.reflectionText[r] || "—"}</p>
          </div>
        </div>
        <button type="button" onClick={startFinalMood} className="w-full py-5 bg-primary text-white rounded-[1.5rem] font-bold">
          Mood check-in
        </button>
      </div>
    );
  }

  if (ba.phase === "final_mood") {
    const myMood = session.moods?.[r];
    const partnerRole = partnerKey(r);
    const partnerMood = session.moods?.[partnerRole];

    const MOODS = [
      { score: 1, emoji: "🧊" },
      { score: 2, emoji: "🌧️" },
      { score: 3, emoji: "🌥️" },
      { score: 4, emoji: "🌤️" },
      { score: 5, emoji: "☀️" },
    ];

    if (!myMood) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 space-y-8">
          <h2 className="text-2xl font-bold text-foreground">How are you feeling now?</h2>
          <div className="grid grid-cols-5 gap-2 w-full max-w-md">
            {MOODS.map((m) => (
              <button
                key={m.score}
                type="button"
                onClick={() => updateMood(sessionId, r, m.score)}
                className="py-4 bg-white rounded-2xl border border-primary/10 text-3xl"
              >
                {m.emoji}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (!partnerMood) {
      return (
        <div className="flex h-screen items-center justify-center p-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      );
    }

    const ready = myMood >= 3 && partnerMood >= 3;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 space-y-8 text-center max-w-md mx-auto">
        <h2 className="text-2xl font-bold text-foreground">{ready ? "You seem ready." : "Take more time if you need it."}</h2>
        <p className="text-muted-foreground">
          {ready ? "Go gently back to the conversation." : "It’s okay to pause before returning to the hard topic."}
        </p>
        <button type="button" onClick={finishBlindArchitect} className="w-full py-5 bg-primary text-white rounded-[1.5rem] font-bold">
          Done
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
