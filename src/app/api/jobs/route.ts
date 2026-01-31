import { NextRequest, NextResponse } from "next/server";
import { getOpenAIApiKey } from "@/lib/env";

const JOB_SEARCH_INSTRUCTIONS = `You are a job search assistant. The user will provide their resume or LinkedIn profile text.

Your task:
1. Use web search to find current job openings that match the user's background.
2. Focus on jobs most likely to respond (strong match, recent postings, active hiring).
3. Return exactly 10 jobs, ranked from best to worst match.
4. You MUST respond with ONLY a valid JSON array of objects. No other text, no markdown code fence, no explanation. Just the raw JSON array.

CRITICAL - Direct application links only:
- "applicationLink" MUST be the direct URL to that specific job's application page—the page where the user can click "Apply" and submit their application for that job.
- Do NOT use: job board search URLs, "view all jobs" or career homepage URLs, LinkedIn/Indeed/Glassdoor search result links, or any URL that shows a list of jobs instead of one job's apply page.
- Only include a job if you can find a direct link to that job's apply page (e.g. company careers site job page, or job board listing page for that single role). If you cannot find a direct apply URL for a job, omit it and find another job that has one.
- Each applicationLink must open the specific job posting or its apply form, not a search or directory.

Each object in the array must have exactly these keys (use these exact names):
- "jobTitle": string (the job title)
- "company": string (company name)
- "applicationLink": string (direct URL to this job's application page only; must be a real URL that goes straight to apply for this job)
- "probabilityOfCallback": number from 1 to 10 (10 = very likely to get a callback, 1 = unlikely; base on match quality, recency, company size)

Example format (your response must be only the array, no other text):
[{"jobTitle":"Software Engineer","company":"Acme Inc","applicationLink":"https://example.com/careers/software-engineer-apply","probabilityOfCallback":8},...]

Use web search to find real job postings and their direct apply URLs. Do not invent URLs. Return only the JSON array.`;

export async function POST(request: NextRequest) {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set." },
      { status: 500 }
    );
  }

  let body: { resume?: string; linkedin?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const resume = body.resume ?? body.linkedin ?? "";
  const trimmed = resume.trim();
  if (!trimmed) {
    return NextResponse.json(
      { error: "Provide resume or linkedin text in the request body." },
      { status: 400 }
    );
  }

  const userInput = `Here is my resume/LinkedIn profile. Please search the web and return the top 10 jobs most likely to respond to my application, with direct links to apply.\n\n---\n\n${trimmed}`;

  const model = process.env.OPENAI_JOB_MODEL || "gpt-4o";

  let res: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min for web search
    res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        instructions: JOB_SEARCH_INSTRUCTIONS,
        input: userInput,
        tools: [{ type: "web_search" }],
        tool_choice: "required",
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error";
    const isNetwork =
      message.includes("fetch") ||
      message.includes("network") ||
      message.includes("abort") ||
      message.includes("ECONNREFUSED") ||
      message.includes("ETIMEDOUT");
    return NextResponse.json(
      {
        error: isNetwork
          ? "Could not connect to OpenAI. Check your internet and that OPENAI_API_KEY is set in .env."
          : `OpenAI request failed: ${message}`,
      },
      { status: 502 }
    );
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const oai = err as { error?: { message?: string; code?: string } };
    const message = oai?.error?.message ?? res.statusText;
    if (res.status === 401) {
      return NextResponse.json(
        {
          error: `${message} Check .env: no space after =, key on one line. Restart dev server after editing .env.`,
        },
        { status: 502 }
      );
    }
    if (res.status === 404 || res.status === 403) {
      return tryChatCompletionsFallback(apiKey, userInput);
    }
    return NextResponse.json(
      { error: message || "OpenAI request failed." },
      { status: 502 }
    );
  }

  const data = (await res.json()) as {
    output?: Array<{
      type?: string;
      content?: Array<{
        type?: string;
        text?: string;
        annotations?: Array<{ type?: string; url?: string; title?: string }>;
      }>;
    }>;
  };

  const outputText = getOutputTextFromOutput(data.output ?? []);
  const citations = getAnnotationsFromOutput(data.output ?? []);

  if (!outputText) {
    return NextResponse.json(
      { error: "No text in model response." },
      { status: 502 }
    );
  }

  const jobs = parseJobsFromText(outputText);
  if (jobs.length > 0) {
    return NextResponse.json({ jobs, citations });
  }
  return NextResponse.json({ jobsText: outputText, citations });
}

async function tryChatCompletionsFallback(
  apiKey: string,
  userInput: string
): Promise<NextResponse> {
  const fullPrompt = `${JOB_SEARCH_INSTRUCTIONS}\n\n---\n\n${userInput}`;
  let res: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-search-preview",
        web_search_options: {},
        messages: [{ role: "user", content: fullPrompt }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        error: `Responses API not available and fallback failed: ${msg}. Try again later or check https://platform.openai.com/docs.`,
      },
      { status: 502 }
    );
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const oai = err as { error?: { message?: string } };
    return NextResponse.json(
      { error: oai?.error?.message ?? res.statusText },
      { status: 502 }
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        annotations?: Array<{
          type?: string;
          url_citation?: { url?: string; title?: string };
        }>;
      };
    }>;
  };

  const content = data.choices?.[0]?.message?.content ?? null;
  const annotations = data.choices?.[0]?.message?.annotations ?? [];
  const citations = annotations
    .filter((a) => a.type === "url_citation" && a.url_citation?.url)
    .map((a) => ({
      url: a.url_citation!.url!,
      title: a.url_citation!.title,
    }));

  if (!content) {
    return NextResponse.json(
      { error: "No content in Chat Completions response." },
      { status: 502 }
    );
  }

  const jobs = parseJobsFromText(content);
  if (jobs.length > 0) {
    return NextResponse.json({ jobs, citations });
  }
  return NextResponse.json({ jobsText: content, citations });
}

function parseJobsFromText(text: string): JobRow[] {
  const trimmed = text.trim();
  let jsonStr = trimmed;
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) jsonStr = codeBlock[1].trim();
  try {
    const parsed = JSON.parse(jsonStr) as unknown;
    const arr = Array.isArray(parsed) ? parsed : (parsed as { jobs?: unknown[] })?.jobs;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (item): item is Record<string, unknown> =>
          item != null && typeof item === "object"
      )
      .map((item) => ({
        jobTitle: String(item.jobTitle ?? item.job_title ?? ""),
        company: String(item.company ?? ""),
        applicationLink: String(item.applicationLink ?? item.application_link ?? ""),
        probabilityOfCallback: typeof item.probabilityOfCallback === "number"
          ? Math.min(10, Math.max(1, item.probabilityOfCallback))
          : typeof item.probability_of_callback === "number"
            ? Math.min(10, Math.max(1, item.probability_of_callback))
            : 5,
      }))
      .filter((j) => j.jobTitle && j.applicationLink);
  } catch {
    return [];
  }
}

function getOutputTextFromOutput(
  output: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>
): string {
  for (const item of output) {
    if (item.type === "message" && item.content) {
      for (const part of item.content) {
        if (part.type === "output_text" && part.text) return part.text;
      }
    }
  }
  return "";
}

function getAnnotationsFromOutput(
  output: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      annotations?: Array<{ type?: string; url?: string; title?: string }>;
    }>;
  }>
): Array<{ url: string; title?: string }> {
  const citations: Array<{ url: string; title?: string }> = [];
  for (const item of output) {
    if (item.type !== "message" || !item.content) continue;
    for (const part of item.content) {
      if (part.type !== "output_text" || !part.annotations) continue;
      for (const ann of part.annotations) {
        if (ann.type === "url_citation" && ann.url) {
          citations.push({ url: ann.url, title: ann.title });
        }
      }
    }
  }
  return citations;
}
