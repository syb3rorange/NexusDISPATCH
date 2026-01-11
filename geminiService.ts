
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const assistDispatcher = async (notes: string) => {
  if (!process.env.API_KEY) return notes;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are a high-level emergency dispatch AI. Convert the following informal scene notes into a professional, concise dispatcher log entry. Use tactical language and standard police/medical abbreviations where appropriate. Keep it short.
      
      Input notes: "${notes}"`,
      config: {
        temperature: 0.7,
        maxOutputTokens: 150,
      }
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
      contents: `Based on a call of type "${callType}" at "${location}", suggest how many police, fire, or EMS units should be prioritized and what specific equipment they might need. Return a very brief 1-sentence recommendation.`,
      config: {
        temperature: 0.5,
        maxOutputTokens: 100,
      }
    });
    return response.text?.trim();
  } catch (error) {
    return null;
  }
};
