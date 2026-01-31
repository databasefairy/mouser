import { NextResponse } from "next/server";
import { getOpenAIApiKey, getOpenAIKeyPath } from "@/lib/env";

/**
 * GET /api/health
 * Verifies OPENAI_API_KEY is set and valid (calls OpenAI to check).
 */
export async function GET() {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "OPENAI_API_KEY is not set. Add it to .env (one line) or create .env.openai_key in the project root with only your key on one line.",
        debug: { keyPath: getOpenAIKeyPath(), cwd: process.cwd() },
      },
      { status: 500 }
    );
  }

  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (res.status === 401) {
    const keyLength = apiKey.length;
    const hint =
      keyLength < 50
        ? `Only ${keyLength} characters were read. Put the entire key on one line in .env, or use a file named .env.openai_key containing only the key (one line, no variable name).`
        : keyLength < 160
          ? `Key length is ${keyLength} (you expected ~164). Part of the key may be missing—check for a line break or space in .env.`
          : "Key length looks correct but OpenAI rejected it. Create a new key at https://platform.openai.com/api-keys and replace the value in .env.";
    return NextResponse.json(
      {
        ok: false,
        error:
          "API key is invalid or revoked. Check it at https://platform.openai.com/api-keys and update .env, then restart the dev server.",
        debug: {
          keyLength,
          expectedAround: 164,
          hint,
        },
      },
      { status: 500 }
    );
  }
  if (!res.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `OpenAI returned ${res.status}. Check your key and https://status.openai.com`,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "API key is valid. Submit a resume to run a job search.",
  });
}
