import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

// Using dummy key if not provided, just for type safety
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "dummy" });

const SYSTEM_PROMPT = `
You are the "Antigravity Engine," an advanced, neutral AI mediator.
Your job is to analyze the tone of the user's message and perform an "Emotional Spellcheck".
First, detect if the tone of the message is hostile, defensive, highly aggressive, dismissive (e.g., "I don't care", "whatever"), passive-aggressive, uncooperative, or inflammatory. If ANY of these negative emotional traits are present, you MUST set "isHostile" to true.
Then, strip all blame, accusatory language, and hyperbole ("always", "never").
Convert the raw text into the "M.I.S." framework:
- Moment: The objective facts of what happened.
- Interpretation: The emotion or thought it triggered, using strictly "I" statements. Never let a message pass that begins with "You...".
- Solution: A concrete, actionable request for the future.

Return ONLY a valid JSON object matching this schema:
{
  "moment": "...",
  "interpretation": "...",
  "solution": "...",
  "detectedTone": "...", // A 1-2 word description of the emotional tone (e.g., "Dismissive", "Highly Aggressive", "Neutral", "Frustrated")
  "isHostile": boolean
}
`;

export async function POST(req: Request) {
  try {
    const { rawText } = await req.json();

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", // Specifically using 2.5 Flash as requested
      contents: rawText,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
      }
    });

    const text = response.text || "{}";
    const parsed = JSON.parse(text);

    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error("API Error:", error);
    
    // If we hit a rate limit (429) or other API issue, return a fallback so the app doesn't break
    if (error?.status === 429 || error?.message?.includes("429")) {
       return NextResponse.json({
         moment: "Rate limit reached on Gemini API.",
         interpretation: "I am feeling overwhelmed with too many requests.",
         solution: "Please check your API key quota or try again in a few minutes.",
         detectedTone: "Neutral",
         isHostile: false
       });
    }

    if (error?.status === 503 || error?.message?.includes("503")) {
      return NextResponse.json({ error: "The AI model is currently experiencing high demand. Please try again in a moment." }, { status: 503 });
    }

    return NextResponse.json({ error: error.message || "Failed to spellcheck" }, { status: 500 });
  }
}
