
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const assistDispatcher = async (notes: string) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are a high-level emergency dispatch AI. Convert the following informal scene notes into a professional, concise dispatcher log entry. Use tactical language and standard police/medical abbreviations.
      
      Input notes: "${notes}"`,
    });

    return response.text?.trim() || notes;
  } catch (error) {
    console.error("Gemini assistance error:", error);
    return notes;
  }
};

export const suggestUnits = async (callType: string, location: string) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Based on a call of type "${callType}" at "${location}", suggest units to prioritize. Return a 1-sentence recommendation.`,
    });
    return response.text?.trim();
  } catch (error) {
    return null;
  }
};
