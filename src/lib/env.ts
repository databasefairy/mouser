import { existsSync, readFileSync } from "fs";
import { join } from "path";

const MIN_KEY_LENGTH = 50;
const KEY_FILE = ".env.openai_key";

/**
 * Get OPENAI_API_KEY from env. If it looks truncated (< 50 chars) or missing,
 * try reading the full key from .env.openai_key (one line, key only, no variable name).
 */
export function getOpenAIApiKey(): string | undefined {
  let key = process.env.OPENAI_API_KEY?.replace(/\r?\n/g, "").trim();
  if (key && key.length >= MIN_KEY_LENGTH) return key;

  const keyPath = join(process.cwd(), KEY_FILE);
  if (existsSync(keyPath)) {
    try {
      const raw = readFileSync(keyPath, "utf8");
      key = raw.replace(/\r?\n/g, "").trim();
      if (key.length >= MIN_KEY_LENGTH) return key;
    } catch {
      // fall through
    }
  }
  return key || undefined;
}

/** Path we check for .env.openai_key (for error messages). */
export function getOpenAIKeyPath(): string {
  return join(process.cwd(), KEY_FILE);
}
