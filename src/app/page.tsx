"use client";
import { useState, useEffect } from "react";
import { createSession, joinSession } from "@/lib/firebaseUtils";
import { useRouter } from "next/navigation";

function firebaseLooksConfigured() {
  const pid = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  return Boolean(pid && pid !== "demo-project");
}

export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [createError, setCreateError] = useState("");
  const [joinError, setJoinError] = useState("");
  const [creating, setCreating] = useState(false);
  const [configHint, setConfigHint] = useState("");

  useEffect(() => {
    document.body.className = "theme-amber";
    return () => {
      document.body.className = "";
    };
  }, []);

  useEffect(() => {
    if (!firebaseLooksConfigured()) {
      const local =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
      setConfigHint(
        local
          ? "Add all NEXT_PUBLIC_FIREBASE_* lines to .env.local (see .env.example), then stop and run npm run dev again."
          : "Firebase is not configured for this deployment. In Render, add all NEXT_PUBLIC_FIREBASE_* variables, then redeploy so the build picks them up."
      );
    }
  }, []);

  const handleCreate = async () => {
    setCreateError("");
    setJoinError("");
    if (!firebaseLooksConfigured()) {
      setCreateError(
        "Cannot create a session: set NEXT_PUBLIC_FIREBASE_* on Render and redeploy (Next.js bakes these in at build time)."
      );
      return;
    }
    setCreating(true);
    try {
      const id = await createSession();
      router.push(`/session/${id}?role=userA`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setCreateError(
        `Could not start a session (${msg}). Check the browser console, Firestore rules, and that your Render build had Firebase env vars set.`
      );
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError("");
    setCreateError("");
    if (!joinCode.trim()) return;

    if (!firebaseLooksConfigured()) {
      setJoinError(
        "Firebase is not configured on this host. Set NEXT_PUBLIC_FIREBASE_* on Render and redeploy."
      );
      return;
    }

    const code = joinCode.toUpperCase();
    try {
      const success = await joinSession(code);

      if (success) {
        router.push(`/session/${code}?role=userB`);
      } else {
        setJoinError("Session not found. Check your code.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setJoinError(`Could not join (${msg}). Check Firebase config and network.`);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center flex-col px-4 text-center relative overflow-hidden">
      
      <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />

      <div className="w-full max-w-md space-y-16 z-10">
        
        <div className="space-y-6">
          {configHint ? (
            <p className="text-left text-sm text-amber-900 bg-amber-100 border border-amber-200 rounded-2xl px-4 py-3 leading-snug">
              {configHint}
            </p>
          ) : null}
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="w-full py-10 bg-primary text-white rounded-[2rem] text-3xl font-bold shadow-2xl hover:bg-primary/90 transition-transform hover:scale-[1.02] active:scale-[0.98] border border-white/20 disabled:opacity-60 disabled:pointer-events-none"
          >
            {creating ? "Starting…" : "Breakout Time"}
          </button>
          <p className="text-accent-foreground/80 font-medium text-lg">Tap when you need a circuit breaker.</p>
          {createError ? <p className="text-red-600 font-medium text-sm leading-snug">{createError}</p> : null}
        </div>

        <div className="pt-8 border-t-2 border-primary/10">
          <form onSubmit={handleJoin} className="space-y-4">
            <h2 className="text-xl font-bold text-accent-foreground">Join Partner</h2>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Enter 6-digit code"
                className="flex-1 bg-white border border-primary/20 rounded-2xl px-4 py-4 outline-none focus:ring-4 focus:ring-primary/20 text-center font-mono text-2xl uppercase placeholder:text-muted-foreground placeholder:font-sans placeholder:text-base text-foreground shadow-sm"
                maxLength={6}
              />
              <button type="submit" className="px-8 py-4 bg-accent text-accent-foreground rounded-2xl font-bold shadow-sm hover:bg-white transition border border-primary/10">
                Join
              </button>
            </div>
            {joinError ? <p className="text-red-600 font-medium text-sm">{joinError}</p> : null}
          </form>
        </div>

      </div>
    </div>
  );
}
