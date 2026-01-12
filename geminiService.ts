
import { GoogleGenAI } from "@google/genai";

export const assistDispatcher = async (notes: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are a high-level emergency dispatch AI for the New York State Police (NYSP). Convert the following informal scene notes into a professional, concise dispatcher log entry. Use tactical language, Signal codes, and File codes where applicable.
      
      Input notes: "${notes}"`,
    });

    return response.text?.trim() || notes;
  } catch (error) {
    console.error("Gemini assistance error:", error);
    return notes;
  }
};

export const generateAutoDispatch = async (callType: string, location: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate a one-sentence professional radio dispatch for a new emergency call. 
      Call Type: ${callType}
      Location: ${location}
      Use NYSP terminology like "Be advised", "10-4", "Signal 55", or appropriate File codes. Make it sound like an automated emergency broadcast.`,
    });
    return response.text?.trim();
  } catch (error) {
    return `Units be advised, new ${callType} at ${location}. 10-4.`;
  }
};
