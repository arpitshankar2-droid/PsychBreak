import { useState } from "react";
import { Copy, Check } from "lucide-react";

export default function InviteScreen({ sessionId, role }: { sessionId: string, role: string }) {
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(sessionId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (role === "userB") {
    return (
      <div className="flex h-screen items-center justify-center p-4 text-center">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-primary/20 space-y-4 max-w-sm w-full">
          <h2 className="text-2xl font-bold text-foreground">Waiting for partner...</h2>
          <p className="text-muted-foreground">State is syncing...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center p-4 text-center">
      <div className="bg-white/90 backdrop-blur-md p-10 rounded-[2rem] shadow-xl border border-primary/20 space-y-8 max-w-sm w-full relative overflow-hidden">
        
        <div className="space-y-2 relative z-10">
          <h2 className="text-3xl font-bold text-accent-foreground">Invite Partner</h2>
          <p className="text-muted-foreground">Share this code to start the breakout.</p>
        </div>

        <div className="bg-accent/30 p-6 rounded-2xl flex items-center justify-between group cursor-pointer relative z-10" onClick={copyCode}>
          <span className="text-4xl font-mono font-bold tracking-widest text-accent-foreground">{sessionId}</span>
          {copied ? <Check className="text-green-600" /> : <Copy className="text-accent-foreground/50 group-hover:text-primary transition" />}
        </div>

        <div className="pt-6 animate-pulse relative z-10">
          <p className="text-sm font-medium text-primary uppercase tracking-wider">Waiting for partner to join...</p>
        </div>
        
        {/* Decorative background element */}
        <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-primary/5 rounded-full blur-2xl" />

      </div>
    </div>
  );
}
