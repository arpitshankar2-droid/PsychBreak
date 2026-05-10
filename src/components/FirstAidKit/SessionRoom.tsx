"use client";

import { useEffect, useState, useRef } from "react";
import { subscribeToSession, subscribeToMessages, sendMessage, reviseMessage, acceptSolution, triggerCircuitBreaker, incrementGeminiCall } from "@/lib/firebaseUtils";
import MisCard from "./MisCard";
import GridlockScreen from "../MiniGames/GridlockScreen";
import { Loader2, ShieldAlert, Wand2, Pause } from "lucide-react";

export default function SessionRoom({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [rawInput, setRawInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentUser, setCurrentUser] = useState("userA");
  const [isRevising, setIsRevising] = useState(false);
  const [reviseReason, setReviseReason] = useState("");
  const [interceptionData, setInterceptionData] = useState<any>(null);
  const [interceptionContext, setInterceptionContext] = useState<"send" | "revise" | null>(null);
  
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    const unsubSession = subscribeToSession(sessionId, (data) => {
      hasLoadedRef.current = true;
      setSession(data);
    });
    const unsubMessages = subscribeToMessages(sessionId, setMessages);
    
    // Safety timeout: If session doesn't load within 2 seconds, it might be missing
    const timeout = setTimeout(() => {
      if (!hasLoadedRef.current) setSession("not_found");
    }, 2000);

    return () => {
      clearTimeout(timeout);
      unsubSession();
      unsubMessages();
    };
  }, [sessionId]);

  if (session === "not_found") {
    return (
      <div className="flex flex-col h-screen items-center justify-center space-y-4 text-center">
        <h2 className="text-2xl font-bold text-destructive">Session Not Found</h2>
        <p className="text-muted-foreground max-w-md">
          This session does not exist in this browser. If you opened an Incognito window or a different browser, it cannot access the local storage from your first tab. Please open the second tab in the SAME browser window.
        </p>
      </div>
    );
  }

  if (!session) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>;
  }

  const handleSend = async () => {
    if (!rawInput.trim()) return;
    setIsProcessing(true);
    try {
      const res = await fetch("/api/spellcheck", {
        method: "POST",
        body: JSON.stringify({ rawText: rawInput }),
        headers: { "Content-Type": "application/json" }
      });
      const mis = await res.json();
      
      if (!res.ok || mis.error) {
        alert(mis.error || "Failed to process message due to a server error. Please try again.");
        return;
      }
      
      await incrementGeminiCall(sessionId);
      
      const processedText = mis.solution || "No solution generated";
      await sendMessage(sessionId, currentUser, rawInput, processedText, mis);
      setRawInput("");
    } catch (e) {
      console.error(e);
      alert("Network error: Failed to connect to the server.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReviseSubmit = async () => {
    if (!reviseReason.trim()) return;
    setIsProcessing(true);
    try {
      const res = await fetch("/api/spellcheck", {
        method: "POST",
        body: JSON.stringify({ rawText: reviseReason }),
        headers: { "Content-Type": "application/json" }
      });
      const mis = await res.json();
      
      if (!res.ok || mis.error) {
        alert(mis.error || "Failed to process message due to a server error.");
        return;
      }

      await incrementGeminiCall(sessionId);
      
      if (mis.isHostile) {
        setInterceptionData(mis);
        setInterceptionContext("revise");
      } else {
        reviseMessage(sessionId, session.strikeCount, session.currentTurn, reviseReason);
        setIsRevising(false);
        setReviseReason("");
      }
    } catch (e) {
      console.error(e);
      alert("Network error.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInterceptionOptionA = async () => {
    setIsProcessing(true);
    try {
      if (interceptionContext === "send") {
        const processedText = interceptionData.solution || "No solution generated";
        await sendMessage(sessionId, currentUser, rawInput, processedText, interceptionData);
        setRawInput("");
      } else {
        const translatedReason = interceptionData.interpretation || "I am feeling overwhelmed with this solution.";
        reviseMessage(sessionId, session.strikeCount, session.currentTurn, translatedReason);
        setIsRevising(false);
        setReviseReason("");
      }
      setInterceptionData(null);
      setInterceptionContext(null);
    } catch (e) {
      console.error(e);
      alert("Error sending revision");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCircuitBreaker = async () => {
    setInterceptionData(null);
    setInterceptionContext(null);
    await triggerCircuitBreaker(sessionId);
  };

  if (session.status === "gridlock") {
    return <GridlockScreen />;
  }

  if (session.status === "circuit_breaker") {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-gray-50 rounded-3xl text-center space-y-6 max-w-lg mx-auto mt-20 border border-gray-200 shadow-sm">
        <h2 className="text-3xl font-bold text-gray-800">Session Paused</h2>
        <p className="text-gray-600 text-lg">
          The system detected escalating emotions and has triggered a Circuit Breaker. 
          Please take a 30-minute cooling off period before returning to this session.
        </p>
      </div>
    );
  }

  if (session.status === "handshake") {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-green-50 rounded-3xl text-center space-y-6 max-w-lg mx-auto mt-20 border border-green-200">
        <h2 className="text-3xl font-bold text-green-700">Digital Handshake</h2>
        <p className="text-green-800">You both committed to this fix. The session is successfully resolved.</p>
      </div>
    );
  }

  const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const isMyTurn = session.currentTurn === currentUser;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-8 h-full flex flex-col pt-12 pb-12">
      <div className="flex justify-between items-center bg-card p-4 rounded-full shadow-sm border border-muted">
        <span className="text-sm font-medium text-muted-foreground ml-4 flex gap-4">
          <span>Session: {sessionId}</span>
          <span className="text-primary font-bold">AI Calls: {session.geminiCallCount || 0}</span>
        </span>
        <select 
          value={currentUser} 
          onChange={(e) => setCurrentUser(e.target.value)}
          className="bg-accent text-accent-foreground px-4 py-2 rounded-full text-sm outline-none cursor-pointer font-medium"
        >
          <option value="userA">Simulate User A</option>
          <option value="userB">Simulate User B</option>
        </select>
      </div>

      <div className="flex-1 flex flex-col justify-center min-h-[400px]">
        {!latestMessage ? (
          <div className="text-center text-muted-foreground space-y-4">
            <h2 className="text-2xl font-bold text-foreground">First Aid Kit</h2>
            <p>No active messages. It's {session.currentTurn}'s turn to speak.</p>
          </div>
        ) : latestMessage.type === "rejection" ? (
          <div className="bg-destructive/10 p-8 rounded-3xl text-center border border-destructive/20 space-y-4 max-w-md mx-auto shadow-sm">
            <h3 className="text-destructive font-bold text-xl uppercase tracking-wider">Revision Requested</h3>
            <p className="text-foreground text-lg font-medium">{latestMessage.reason}</p>
          </div>
        ) : (
          <MisCard mis={latestMessage.mis} rawText={latestMessage.senderId === currentUser ? latestMessage.rawText : undefined} />
        )}
      </div>

      <div className="bg-card p-6 rounded-3xl shadow-sm border border-muted space-y-4 relative overflow-hidden">
        {interceptionData && (
          <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-md flex flex-col justify-center items-center p-8 rounded-3xl space-y-6 animate-in fade-in zoom-in duration-300 border border-destructive/10">
            <div className="bg-destructive/10 w-16 h-16 rounded-full flex items-center justify-center mb-2 shadow-sm">
              <ShieldAlert className="w-8 h-8 text-destructive" />
            </div>
            <div className="text-center space-y-3 max-w-md">
              <h3 className="text-2xl font-extrabold text-foreground tracking-tight">Hold on a second.</h3>
              {interceptionData.detectedTone && (
                <div className="inline-block bg-destructive/10 text-destructive px-3 py-1 rounded-full text-sm font-bold tracking-wide uppercase mt-1 mb-2 shadow-sm border border-destructive/20">
                  Detected Tone: {interceptionData.detectedTone}
                </div>
              )}
              <p className="text-muted-foreground text-lg leading-relaxed">
                It seems like you're feeling overwhelmed right now. Sending this <span className="font-semibold text-destructive">as-is might escalate the situation.</span> Would you like to:
              </p>
            </div>
            <div className="flex flex-col w-full gap-3 max-w-sm mt-4">
              <button 
                onClick={handleInterceptionOptionA}
                disabled={isProcessing}
                className="py-4 px-6 bg-primary text-primary-foreground rounded-2xl font-semibold hover:bg-primary/90 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-3 text-left w-full relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                <Wand2 className="w-5 h-5 shrink-0" />
                <span className="relative z-10">Use AI to translate into an "I" statement</span>
              </button>
              <button 
                onClick={handleCircuitBreaker}
                className="py-4 px-6 bg-secondary text-secondary-foreground rounded-2xl font-semibold hover:bg-secondary/80 border border-muted transition shadow-sm cursor-pointer flex items-center justify-center gap-3 text-left w-full"
              >
                <Pause className="w-5 h-5 shrink-0 text-muted-foreground" />
                <span>Take a 30-minute cooling off pause</span>
              </button>
            </div>
            <button 
              onClick={handleCircuitBreaker}
              className="text-sm font-medium text-muted-foreground hover:text-destructive underline underline-offset-4 mt-6 transition cursor-pointer"
            >
              No, send it exactly how I typed it.
            </button>
          </div>
        )}
        {isMyTurn ? (
          <>
            {latestMessage && latestMessage.senderId !== currentUser && latestMessage.type !== "rejection" ? (
              isRevising ? (
                <div className="space-y-4">
                  <textarea 
                    value={reviseReason}
                    onChange={(e) => setReviseReason(e.target.value)}
                    placeholder="Why are you revising? What else do you want to add?"
                    className="w-full h-24 p-4 bg-muted border-none rounded-xl resize-none outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
                  />
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setIsRevising(false)}
                      className="flex-1 py-3 bg-muted text-foreground rounded-xl font-medium hover:bg-muted/80 transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleReviseSubmit}
                      disabled={!reviseReason.trim() || isProcessing}
                      className="flex-1 py-3 bg-destructive text-destructive-foreground rounded-xl font-medium hover:bg-destructive/90 transition disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 cursor-pointer"
                    >
                      {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
                      {isProcessing ? "Analyzing..." : "Submit Revision"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-4">
                  <button 
                    onClick={() => setIsRevising(true)}
                    className="flex-1 py-3 bg-muted text-foreground rounded-xl font-medium hover:bg-muted/80 transition"
                  >
                    Revise (Strike {session.strikeCount + 1}/3)
                  </button>
                  <button 
                    onClick={() => acceptSolution(sessionId)}
                    className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition"
                  >
                    Commit to this Fix
                  </button>
                </div>
              )
            ) : (
              <div className="space-y-4">
                <textarea 
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder="Enter your raw, unfiltered frustration here..."
                  className="w-full h-32 p-4 bg-muted border-none rounded-xl resize-none outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
                />
                <button 
                  onClick={handleSend}
                  disabled={isProcessing || !rawInput.trim()}
                  className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition disabled:opacity-50 flex justify-center items-center gap-2"
                >
                  {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isProcessing ? "Emotional Spellcheck in progress..." : "Run Emotional Spellcheck"}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-6 text-muted-foreground animate-pulse font-medium">
            Waiting for other user to respond...
          </div>
        )}
      </div>
    </div>
  );
}
