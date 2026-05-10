export default function GridlockScreen() {
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-card rounded-2xl shadow-sm border border-destructive/20 text-center space-y-6 max-w-lg mx-auto mt-20">
      <h2 className="text-2xl font-bold text-destructive">Gridlock Detected</h2>
      <p className="text-muted-foreground">
        You've bounced this back and forth 3 times without an agreement. Time to pause the argument and reset your nervous systems.
      </p>
      
      <div className="bg-accent w-full p-6 rounded-xl space-y-4">
        <h3 className="font-semibold text-accent-foreground uppercase tracking-widest text-sm">Co-op Mini-Game: Role Reversal</h3>
        <p className="text-foreground text-sm">
          For the next 2 minutes, argue your partner's side of this issue as convincingly as you can. 
          When the timer is up, return to the fix.
        </p>
        <button className="px-6 py-2 bg-primary text-primary-foreground rounded-full font-medium hover:bg-primary/90 transition w-full mt-4">
          Start Timer
        </button>
      </div>
    </div>
  );
}
