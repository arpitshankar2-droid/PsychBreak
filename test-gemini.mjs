import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "AIzaSyAUSphkBLx6KZ71TFJprchG3WrDczzTWTU" });

async function check() {
  try {
    console.log("Testing Gemini API...");
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "Hello, just testing the connection. Reply with a short confirmation.",
    });
    console.log("SUCCESS! The API key has credits and works.");
    console.log("Response:", response.text);
  } catch (error) {
    console.error("FAILED! Error details:");
    console.error(error);
  }
}

check();
