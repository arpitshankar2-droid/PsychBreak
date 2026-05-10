"use client";
import { useState, useEffect } from "react";
import { createSession, joinSession } from "@/lib/firebaseUtils";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    document.body.className = "theme-amber";
    return () => { document.body.className = ""; }
  }, []);

  const handleCreate = async () => {
    const id = await createSession();
    router.push(`/session/${id}?role=userA`);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!joinCode.trim()) return;
    
    const code = joinCode.toUpperCase();
    const success = await joinSession(code);
    
    if (success) {
      router.push(`/session/${code}?role=userB`);
    } else {
      setError("Session not found. Check your code.");
    }
  };

  return (
    <div className="flex h-screen items-center justify-center flex-col px-4 text-center relative overflow-hidden">
      
      <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />

      <div className="w-full max-w-md space-y-16 z-10">
        
        <div className="space-y-6">
          <button 
            onClick={handleCreate}
            className="w-full py-10 bg-primary text-white rounded-[2rem] text-3xl font-bold shadow-2xl hover:bg-primary/90 transition-transform hover:scale-[1.02] active:scale-[0.98] border border-white/20"
          >
            Breakout Time
          </button>
          <p className="text-accent-foreground/80 font-medium text-lg">Tap when you need a circuit breaker.</p>
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
            {error && <p className="text-red-600 font-medium">{error}</p>}
          </form>
        </div>

      </div>
    </div>
  );
}
