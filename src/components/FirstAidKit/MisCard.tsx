"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface MisCardProps {
  mis: {
    moment: string;
    interpretation: string;
    solution: string;
    detectedTone?: string;
  };
  rawText?: string;
}

export default function MisCard({ mis, rawText }: MisCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div className="w-full max-w-md mx-auto perspective-1000 h-[300px]">
      <motion.div
        className="w-full h-full relative transform-style-3d cursor-pointer"
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
        onClick={() => setIsFlipped(!isFlipped)}
      >
        {/* Front of Card (Raw or Processed Summary) */}
        <div className="absolute w-full h-full backface-hidden bg-card rounded-2xl shadow-sm border border-muted p-6 flex flex-col justify-center items-center text-center">
          <div className="flex flex-col items-center gap-2 mb-4">
            <h3 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold">
              {rawText ? "Raw Input" : "Tap to flip"}
            </h3>
            {mis.detectedTone && (
              <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold shadow-sm">
                Tone: {mis.detectedTone}
              </span>
            )}
          </div>
          <p className="text-lg font-medium text-foreground italic">
            {rawText || "Hover or tap to reveal the M.I.S. breakdown"}
          </p>
          <p className="text-xs text-primary mt-6">Tap to flip &rarr;</p>
        </div>

        {/* Back of Card (MIS Framework) */}
        <div className="absolute w-full h-full backface-hidden rotate-y-180 bg-accent rounded-2xl shadow-sm border border-primary/20 p-6 flex flex-col gap-4 text-left overflow-y-auto">
          <div>
            <h4 className="text-xs font-bold uppercase text-accent-foreground mb-1">Moment</h4>
            <p className="text-sm text-foreground bg-white/50 p-2 rounded-lg">{mis.moment}</p>
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase text-accent-foreground mb-1">Interpretation</h4>
            <p className="text-sm text-foreground bg-white/50 p-2 rounded-lg">{mis.interpretation}</p>
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase text-accent-foreground mb-1">Solution</h4>
            <p className="text-sm text-foreground bg-white/50 p-2 rounded-lg font-medium">{mis.solution}</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
