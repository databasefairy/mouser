/**
 * Get Gemini API key from GEMINI_API_KEY or GOOGLE_API_KEY.
 */
export function getGeminiApiKey(): string | undefined {
  const key =
    process.env.GEMINI_API_KEY?.replace(/\r?\n/g, "").trim() ||
    process.env.GOOGLE_API_KEY?.replace(/\r?\n/g, "").trim();
  return key && key.length >= 20 ? key : undefined;
}
