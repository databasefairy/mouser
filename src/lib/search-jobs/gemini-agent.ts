/**
 * Gemini-based job search agent: fetch_url + classify_url (Google Search cannot be combined with function calling in one request).
 * Returns the final model output text (JSON array of jobs) for the route to parse and filter.
 */

import { GoogleGenAI } from "@google/genai";
import { fetchUrl } from "@/lib/search-jobs/fetch-url";
import { classifyUrl } from "@/lib/search-jobs/classify-url";

// Gemini 3 Flash Preview - fast frontier intelligence with Google Search grounding support
const GEMINI_MODEL = "gemini-3-flash-preview";
const MAX_ITERATIONS = 15;

const fetchUrlDeclaration = {
  name: "fetch_url",
  description:
    "Fetches a URL on the server and returns status_code, final_url, content_type, html_excerpt, and detected_apply_links. Copy the returned 'url' or 'final_url' EXACTLY into direct_apply_link in your JSON—do not abbreviate to 'https:'. Use to verify apply pages; detected_apply_links can help find the actual apply URL from a listing page.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "Full URL to fetch (e.g. listing page or apply page)." },
    },
    required: ["url"],
  },
};

const classifyUrlDeclaration = {
  name: "classify_url",
  description:
    "Classifies a page as listing, apply_flow, search_page, company_jobs_index, aggregator, or unknown. Call with the result of fetch_url (url, html_excerpt, final_url, status_code) to decide if the page is an acceptable direct-apply or listing page.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      url: { type: "string" },
      html_excerpt: { type: "string" },
      final_url: { type: "string" },
      status_code: { type: "number" },
    },
    required: ["url", "html_excerpt", "final_url", "status_code"],
  },
};

type ContentPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

type Content = { role: "user" | "model"; parts: ContentPart[] };

export async function runGeminiJobSearch(
  apiKey: string,
  instructions: string,
  userMessage: string
): Promise<{ outputText: string }> {
  const ai = new GoogleGenAI({ apiKey });

  // Google Search and function calling cannot be used together in one request (API returns 400).
  const tools = [
    {
      functionDeclarations: [fetchUrlDeclaration, classifyUrlDeclaration],
    },
  ];

  const systemPlusUser = `${instructions}\n\n${userMessage}`;
  let contents: Content[] = [{ role: "user", parts: [{ text: systemPlusUser }] }];

  let lastText = "";
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        tools,
        temperature: 0.3,
        maxOutputTokens: 16384,
      },
    });

    const text = (response as { text?: string }).text ?? "";
    const functionCalls = (response as { functionCalls?: Array<{ name: string; args: Record<string, unknown> }> }).functionCalls ?? [];
    const candidateContent = (response as { candidates?: Array<{ content?: { parts?: ContentPart[]; role?: string } }> }).candidates?.[0]?.content;

    if (functionCalls.length === 0) {
      lastText = text;
      break;
    }

    const modelParts: ContentPart[] = candidateContent?.parts ?? functionCalls.map((fc) => ({ functionCall: { name: fc.name, args: fc.args } }));
    contents.push({ role: "model", parts: modelParts });

    for (const fc of functionCalls) {
      let result: Record<string, unknown>;
      if (fc.name === "fetch_url") {
        const url = typeof fc.args?.url === "string" ? fc.args.url : "";
        result = await fetchUrl(url);
      } else if (fc.name === "classify_url") {
        const args = fc.args as { url?: string; html_excerpt?: string; final_url?: string; status_code?: number };
        result = classifyUrl({
          url: args?.url ?? "",
          html_excerpt: args?.html_excerpt ?? "",
          final_url: args?.final_url ?? "",
          status_code: typeof args?.status_code === "number" ? args.status_code : 0,
        });
      } else {
        result = { error: `Unknown function: ${fc.name}` };
      }
      contents.push({
        role: "user",
        parts: [{ functionResponse: { name: fc.name, response: result } }],
      });
    }
  }

  return { outputText: lastText };
}

/** Sleep for ms milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Phase 1: Google Search only (no function calling). Use to get live job links; then verify with fetch_url/classify_url in the route.
 * Includes retry logic for 503 (overloaded) errors.
 */
export async function runGeminiSearchOnly(
  apiKey: string,
  prompt: string
): Promise<{ outputText: string }> {
  const ai = new GoogleGenAI({ apiKey });
  
  const MAX_RETRIES = 3;
  const INITIAL_DELAY_MS = 2000;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          tools: [{ googleSearch: {} as Record<string, never> }],
          temperature: 0.3,
          maxOutputTokens: 16384,
        },
      });
      const text = (response as { text?: string }).text ?? "";
      return { outputText: text };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isOverloaded = errorMessage.includes("503") || 
                           errorMessage.includes("overloaded") || 
                           errorMessage.includes("UNAVAILABLE");
      
      if (isOverloaded && attempt < MAX_RETRIES) {
        const delay = INITIAL_DELAY_MS * Math.pow(2, attempt); // 2s, 4s, 8s
        console.log(`[gemini] Model overloaded, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        continue;
      }
      
      throw err;
    }
  }
  
  return { outputText: "" };
}
