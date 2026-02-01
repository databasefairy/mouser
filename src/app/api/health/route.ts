import { NextResponse } from "next/server";
import { getGeminiApiKey } from "@/lib/env";

/**
 * GET /api/health
 * Verifies GEMINI_API_KEY or GOOGLE_API_KEY is set.
 */
export async function GET() {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "GEMINI_API_KEY or GOOGLE_API_KEY is not set. Add one to .env (get a key at https://aistudio.google.com/apikey).",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "API key is set. Submit a search to run a job search.",
  });
}
