import { NextRequest, NextResponse } from "next/server";
import { getOpenAIApiKey } from "@/lib/env";

type JobSearchVars = {
  timeWindowHours: number;
  minCompensation: number;
  remoteOnly: boolean;
  candidateZip: string;
  excludeRadiusMiles: number;
  resultCount: number;
  targetTitlesFreeText: string;
  selectedIndustries: string[];
  companyStage: string[];
};

const DEFAULT_VARS: JobSearchVars = {
  timeWindowHours: 72,
  minCompensation: 180_000,
  remoteOnly: true,
  candidateZip: "30062",
  excludeRadiusMiles: 15,
  resultCount: 10,
  targetTitlesFreeText:
    "Senior Product Manager, Staff Product Manager, Principal Product Manager, Director of Product, Head of Product, VP of Product",
  selectedIndustries: [
    "Artificial Intelligence / Machine Learning",
    "SaaS (B2B or B2C)",
    "Fintech",
  ],
  companyStage: [
    "Series B",
    "Series C",
    "Late-stage startup",
    "Public company",
  ],
};

function buildJobSearchInstructions(vars: JobSearchVars): string {
  const selectedIndustriesStr = vars.selectedIndustries.map((s) => `  "${s}"`).join(",\n");
  const companyStageStr = vars.companyStage.map((s) => `  "${s}"`).join(",\n");
  return `You are a precise job-search research agent. Your task is to find REAL, CURRENT job listings and return structured, verifiable results. Accuracy matters more than quantity.

VARIABLES (use these exactly):
TIME_WINDOW_HOURS = ${vars.timeWindowHours}
MIN_COMPENSATION = ${vars.minCompensation}
REMOTE_ONLY = ${vars.remoteOnly}
CANDIDATE_ZIP = ${vars.candidateZip}
EXCLUDE_RADIUS_MILES = ${vars.excludeRadiusMiles}
RESULT_COUNT = ${vars.resultCount}

TARGET_TITLES_FREE_TEXT =
"""
${vars.targetTitlesFreeText}
"""

INDUSTRIES_STANDARD = [
  "Artificial Intelligence / Machine Learning",
  "SaaS (B2B or B2C)",
  "Fintech",
  "Healthtech",
  "Cybersecurity",
  "Developer Tools",
  "Data / Analytics",
  "Cloud Infrastructure",
  "E-commerce",
  "EdTech",
  "Marketplace Platforms",
  "Enterprise Software",
  "Web3 / Blockchain",
  "GovTech",
  "InsurTech",
  "HR Tech"
]

SELECTED_INDUSTRIES = [
${selectedIndustriesStr}
]

COMPANY_STAGE = [
${companyStageStr}
]

RULES (do not violate):
- Jobs must be posted within TIME_WINDOW_HOURS
- Jobs must be FULLY REMOTE
- Exclude hybrid, onsite, or office-anchored roles
- Exclude any job tied to an office within EXCLUDE_RADIUS_MILES miles of CANDIDATE_ZIP
- Titles must reasonably match TARGET_TITLES_FREE_TEXT
- Industry must be one of SELECTED_INDUSTRIES
- Minimum pay must be MIN_COMPENSATION base OR highly likely based on title + company norms
- If pay is NOT listed, only include Staff, Principal, Group, Director, Head, or VP-level roles
- Clearly label compensation as:
  - "Listed: $X–$Y"
  - OR "Not listed — likely $MIN_COMPENSATION+ based on role level and company"

OUTPUT REQUIREMENTS:
Return exactly RESULT_COUNT roles unless fewer exist.

For EACH role, you must output a JSON object with these exact keys:
- jobTitle (string)
- company (string)
- industry (string, from INDUSTRIES_STANDARD)
- postedDate (string, e.g. "within last 24 hours" or "posted 2 days ago")
- compensation (string, clearly labeled as "Listed: $X–$Y" or "Not listed — likely $MIN_COMPENSATION+ based on role level and company")
- employmentType (string: "full-time" or "contract")
- remoteConfirmation (string, e.g. "Fully remote")
- applicationLink (string: DIRECT APPLY LINK — company careers page, Greenhouse, or Lever only; no job board search links)

STRICTLY AVOID:
- Invented jobs
- Stale listings
- Job boards without direct apply links
- Guessing posted dates
- Including roles that do not meet compensation or remote criteria

If fewer than RESULT_COUNT roles exist, return fewer and explain why in a separate short note, but still output a valid JSON array of the jobs you found.

CRITICAL — Your response must be ONLY a valid JSON array of objects. No other text before or after, no markdown code fence, no explanation. Just the raw JSON array. Each object must have exactly: jobTitle, company, industry, postedDate, compensation, employmentType, remoteConfirmation, applicationLink.`;
}

export async function POST(request: NextRequest) {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set." },
      { status: 500 }
    );
  }

  let body: {
    resume?: string;
    linkedin?: string;
    targetTitles?: string;
    selectedIndustries?: string[];
    timeWindowHours?: number;
    minCompensation?: number;
    remoteOnly?: boolean;
    candidateZip?: string;
    excludeRadiusMiles?: number;
    resultCount?: number;
    companyStage?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const vars: JobSearchVars = {
    ...DEFAULT_VARS,
    ...(body.targetTitles != null && { targetTitlesFreeText: String(body.targetTitles).trim() }),
    ...(Array.isArray(body.selectedIndustries) && body.selectedIndustries.length > 0 && {
      selectedIndustries: body.selectedIndustries.map(String),
    }),
    ...(typeof body.timeWindowHours === "number" && { timeWindowHours: body.timeWindowHours }),
    ...(typeof body.minCompensation === "number" && { minCompensation: body.minCompensation }),
    ...(typeof body.remoteOnly === "boolean" && { remoteOnly: body.remoteOnly }),
    ...(body.candidateZip != null && { candidateZip: String(body.candidateZip).trim() }),
    ...(typeof body.excludeRadiusMiles === "number" && { excludeRadiusMiles: body.excludeRadiusMiles }),
    ...(typeof body.resultCount === "number" && body.resultCount > 0 && { resultCount: body.resultCount }),
    ...(Array.isArray(body.companyStage) && body.companyStage.length > 0 && {
      companyStage: body.companyStage.map(String),
    }),
  };

  const instructions = buildJobSearchInstructions(vars);
  const userInput =
    "Search the web for jobs matching the criteria above. Return only a valid JSON array of job objects with the required keys. Do not include any text before or after the array.";

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
        instructions,
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
      return tryChatCompletionsFallback(apiKey, instructions, userInput, vars.resultCount);
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

  let jobs = parseJobsFromText(outputText);
  if (jobs.length > 0) {
    jobs = await filterLiveLinks(jobs);
    return NextResponse.json({ jobs: jobs.slice(0, vars.resultCount), citations });
  }
  return NextResponse.json({ jobsText: outputText, citations });
}

async function tryChatCompletionsFallback(
  apiKey: string,
  instructions: string,
  userInput: string,
  resultCount: number
): Promise<NextResponse> {
  const fullPrompt = `${instructions}\n\n---\n\n${userInput}`;
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

  let jobs = parseJobsFromText(content);
  if (jobs.length > 0) {
    jobs = await filterLiveLinks(jobs);
    return NextResponse.json({ jobs: jobs.slice(0, resultCount), citations });
  }
  return NextResponse.json({ jobsText: content, citations });
}

type JobRow = {
  jobTitle: string;
  company: string;
  industry: string;
  postedDate: string;
  compensation: string;
  employmentType: string;
  remoteConfirmation: string;
  applicationLink: string;
};

const LINK_CHECK_TIMEOUT_MS = 10_000;
/** 404/410 = gone; 408/5xx = error. We do NOT treat 403 as dead (many sites block server requests but link works in browser). */
const DEAD_STATUS_CODES = new Set([404, 410, 408, 500, 502, 503]);
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Phrases that indicate the job page says the position is no longer available (soft 404). */
const DEAD_PAGE_PHRASES = [
  "no longer available",
  "position is no longer available",
  "job is no longer available",
  "position has been filled",
  "job has been filled",
  "no longer accepting applications",
  "this position has been filled",
  "role has been filled",
  "opportunity is no longer available",
  "has expired",
  "job has expired",
  "position has expired",
  "removed",
  "been removed",
  "no longer open",
  "we're sorry, this job",
  "page not found",
  "job not found",
  "position not found",
  "this job is no longer",
  "link may be broken",
];

/** Remove jobs whose application link returns 404/410/5xx, fails, or returns a page saying the job is filled/expired. Keeps order. */
async function filterLiveLinks(jobs: JobRow[]): Promise<JobRow[]> {
  const results = await Promise.allSettled(
    jobs.map(async (job) => {
      const url = job.applicationLink.trim();
      if (!url.startsWith("http")) return { job, ok: false };
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), LINK_CHECK_TIMEOUT_MS);
        const res = await fetch(url, {
          method: "GET",
          headers: {
            "User-Agent": BROWSER_UA,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          signal: controller.signal,
          redirect: "follow",
        });
        clearTimeout(timeout);
        if (DEAD_STATUS_CODES.has(res.status)) return { job, ok: false };
        if (res.status >= 400) return { job, ok: false };
        if (res.status !== 200) return { job, ok: true };
        const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
        if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
          return { job, ok: true };
        }
        const raw = await res.text();
        const slice = raw.slice(0, 60_000).toLowerCase();
        const looksDead = DEAD_PAGE_PHRASES.some((phrase) => slice.includes(phrase.toLowerCase()));
        return { job, ok: !looksDead };
      } catch {
        return { job, ok: false };
      }
    })
  );
  return results
    .filter((r) => r.status === "fulfilled" && r.value.ok)
    .map((r) => (r as PromiseFulfilledResult<{ job: JobRow; ok: boolean }>).value.job);
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
        industry: String(item.industry ?? ""),
        postedDate: String(item.postedDate ?? item.posted_date ?? ""),
        compensation: String(item.compensation ?? ""),
        employmentType: String(item.employmentType ?? item.employment_type ?? "full-time"),
        remoteConfirmation: String(item.remoteConfirmation ?? item.remote_confirmation ?? ""),
        applicationLink: String(item.applicationLink ?? item.application_link ?? ""),
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
