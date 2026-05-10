import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { advanceStage } from "@/lib/firebaseUtils";

export default function BreathingRoom({ sessionId, role }: { sessionId: string, role: string }) {
  const [timeLeft, setTimeLeft] = useState(60);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          if (role === "userA") {
             advanceStage(sessionId, "game_select");
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionId, role]);

  return (
    <div className="flex h-screen items-center justify-center flex-col px-4 text-center space-y-16 relative overflow-hidden">
      
      <div className="absolute inset-0 bg-white opacity-50 pointer-events-none transition-opacity duration-[60000ms]" style={{ opacity: 1 - (timeLeft / 60) }} />

      <div className="space-y-4 relative z-10">
        <h2 className="text-4xl font-bold text-foreground tracking-tight">Breathe.</h2>
        <p className="text-muted-foreground max-w-xs mx-auto text-lg">
          Rational thought returns when your heart rate drops below 100 bpm.
        </p>
      </div>

      <div className="relative w-64 h-64 flex items-center justify-center z-10">
        <motion.div
          className="absolute w-full h-full rounded-full bg-primary/10"
          animate={{ scale: [1, 1.4, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute w-48 h-48 rounded-full bg-primary/20"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute w-32 h-32 rounded-full bg-primary flex items-center justify-center shadow-2xl">
          <span className="text-white text-5xl font-bold font-mono">{timeLeft}</span>
        </div>
      </div>
      
      <motion.p 
        className="text-sm font-medium text-primary uppercase tracking-[0.4em] relative z-10"
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      >
        Inhale ... Exhale
      </motion.p>
    </div>
  );
}
