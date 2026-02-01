/**
 * POST /api/search-jobs
 * Stateless job search using Gemini (fetch_url + classify_url). Note: Google Search and function calling cannot be combined in one request.
 * Returns top N jobs with verified direct apply links, callback scores, salary, excluded_counts.
 * Supports resume_text (and resume_file via base64), dry_run.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getGeminiApiKey } from "@/lib/env";
import { fetchUrl } from "@/lib/search-jobs/fetch-url";
import { runGeminiSearchOnly } from "@/lib/search-jobs/gemini-agent";
import { classifyUrl } from "@/lib/search-jobs/classify-url";
import { isHostWhitelisted } from "@/lib/search-jobs/whitelist";
import { dedupeKey } from "@/lib/search-jobs/dedupe";
import { extractResumeText } from "@/lib/resumeExtract";
import {
  searchJobsInputSchema,
  INDUSTRIES_LIST,
  type SearchJobsInput,
  type JobResult,
  type ExcludedCounts,
} from "@/lib/search-jobs/schema";

// --- Rate limit (in-memory per IP) ---
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_PER_IP = 10;
const ipCounts = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return req.headers.get("x-real-ip")?.trim() ?? "unknown";
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipCounts.get(ip);
  if (!entry) {
    ipCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (now >= entry.resetAt) {
    ipCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_PER_IP) return false;
  entry.count += 1;
  return true;
}

/** Reject truncated/incomplete URLs like "https:" or "https://" (no host/path). */
function isIncompleteApplyUrl(url: string): boolean {
  const u = url.trim();
  if (u === "https:" || u === "http:" || u === "https://" || u === "http://") return true;
  if (u.length < 20) return true;
  try {
    const parsed = new URL(u);
    return !parsed.host || parsed.host.length < 4;
  } catch {
    return true;
  }
}

/** Ask the model for more jobs than top_n so that after filtering (404/410, whitelist, dedupe) we still have at least top_n. */
function requestCount(topN: number): number {
  return Math.min(50, Math.max(topN * 3, topN + 15));
}

function buildInstructions(input: SearchJobsInput): string {
  const industriesStr =
    input.industries.length > 0
      ? input.industries.map((i) => `"${i}"`).join(", ")
      : INDUSTRIES_LIST.map((i) => `"${i}"`).join(", ");
  const titlesStr = input.titles.length > 0 ? input.titles.join(", ") : "any relevant title";
  const remoteNote = input.remote_only
    ? "remote_only: true — ignore zip_code and radius_miles; add note 'remote-only: zip/radius ignored.'"
    : `Consider zip_code=${input.zip_code} and radius_miles=${input.radius_miles} (best-effort geo).`;
  const resumeNote = input.resume_text?.trim()
    ? "Resume context is provided; use it ONLY to improve ranking and match scoring. Add a short non-sensitive resume_match_summary per job (e.g. 'Strong match: platform PM + payments'). Never output resume content."
    : "No resume provided.";
  const askFor = requestCount(input.top_n);

  return `You are a stateless job-search agent. Do NOT use any prior conversation; only the current input matters.

INPUTS (use exactly):
- top_n: ${input.top_n} (we need at least this many after server-side filtering; return at least ${askFor} jobs so enough pass).
- industries: [${industriesStr}]
- zip_code: "${input.zip_code}"
- radius_miles: ${input.radius_miles}
- remote_only: ${input.remote_only}
- salary_min: ${input.salary_min}
- titles: [${titlesStr}]
- posted_within_days: ${input.posted_within_days}
- ${resumeNote}

RULES:
1. Use your knowledge of job boards and current listings to suggest candidate jobs (e.g. greenhouse.io, lever.co, indeed.com, linkedin.com). For each job you MUST call fetch_url on the apply page URL to verify it is live, then use the exact 'url' or 'final_url' from that response as direct_apply_link. Call classify_url when needed to confirm page type.
2. direct_apply_link MUST be the FULL URL from fetch_url's response (the 'url' or 'final_url' field)—do NOT type URLs from memory or abbreviate to 'https:'. Paste the URL from fetch_url verbatim. Any job with an incomplete URL (e.g. only 'https:') is dropped server-side.
3. Exclude removed/expired listings, generic search pages, company "all jobs" index, aggregators unless they yield a direct apply-page URL.
4. Salary: if listing has salary and meets salary_min, include it. If no salary, include only if seniority implies comp >= salary_min; set salary.is_estimated=true and add a note.
5. Your final response must be ONLY a valid JSON array—nothing else. No explanatory text, no markdown code fences, no "Here are the jobs:", no text before the [ or after the ]. Start with [ and end with ]. Each object: job_title, company, salary { min, max, currency, period, is_estimated }, callback_likelihood_score (0-100), score_rationale (string[]), resume_match_summary (string), listing_url (optional), listing_url_classification (optional), direct_apply_link (required), direct_apply_classification (optional), notes (string[]). Use double quotes for all keys and string values; escape quotes and newlines inside strings (use \\n for newlines). CRITICAL: Never put line breaks inside JSON string values—keep each value on one line. listing_url and direct_apply_link must be COMPLETE full URLs on a single line each—e.g. https://boards.greenhouse.io/acme/jobs/456 or https://jobs.lever.co/company/abc123. NEVER output truncated or abbreviated URLs like "https:" or "https://"; any job with an incomplete URL will be dropped. No comments.
6. ${remoteNote}
7. Prefer jobs posted within the last ${input.posted_within_days} days where detectable. You MUST return at least ${askFor} jobs (we need at least ${input.top_n} after filtering).`;
}

function buildUserMessage(input: SearchJobsInput): string {
  const titlesStr = input.titles.length > 0 ? input.titles.join(", ") : "any";
  const resumeHint = input.resume_text?.trim() ? " Use the resume context below ONLY for ranking and match scoring; add a short resume_match_summary per job. Do not output resume content." : "";
  const askFor = requestCount(input.top_n);
  let msg = `Find at least ${askFor} jobs matching: industries [${input.industries.join(", ") || "any"}], titles [${titlesStr}], salary_min ${input.salary_min}, remote_only ${input.remote_only}. We need at least ${input.top_n} to pass verification—return ${askFor} or more. For each job: call fetch_url for the apply page, then copy the EXACT 'url' or 'final_url' from that response into direct_apply_link. Do not type URLs from memory; paste the full URL from fetch_url. Never output "https:" or a truncated URL. Verify with fetch_url and classify_url; return only active, whitelisted links.${resumeHint} Output a JSON array of job objects only. CRITICAL: direct_apply_link = exact URL from fetch_url (e.g. https://boards.greenhouse.io/company/jobs/123); never "https:" alone.`;
  if (input.resume_text?.trim()) {
    const resume = input.resume_text.trim().slice(0, 40_000);
    msg += `\n\n---\nRESUME CONTEXT (use only for ranking and resume_match_summary; do not echo or output this text):\n${resume}`;
  }
  return msg;
}

/** Prompt for phase 1: Google Search only. Asks for a JSON array of jobs with listing_url + direct_apply_link. */
function buildSearchOnlyPrompt(input: SearchJobsInput): string {
  const industriesStr = input.industries.length > 0 ? input.industries.join(", ") : "Technology";
  const titlesStr = input.titles.length > 0 ? input.titles.join(" OR ") : "Product Manager";

  // Logic to prevent $0 filtering issues
  const salaryInstruction = input.salary_min > 0
    ? `The job MUST have a verified or estimated salary of at least $${input.salary_min}.`
    : "Include all professional paid positions regardless of whether salary is explicitly listed.";

  return `You are a stateless job search agent. Your only goal is to perform a fresh search and return structured data. Do not refer to previous turns.

### MANDATORY CRITERIA
- **Keywords:** ${titlesStr}
- **Industries:** ${industriesStr}
- **Remote:** ${input.remote_only ? "Strictly Remote / Work from Home" : "Any"}
- **Salary:** ${salaryInstruction}
- **Recency:** Must be posted within the last ${input.posted_within_days} days.

### EXECUTION STEPS
1. Use the Google Search tool to find current listings on Applicant Tracking Systems (e.g., site:greenhouse.io, site:lever.co, site:ashbyhq.com).
2. Filter for active links from the year 2025 or 2026.
3. If no results are found for the exact title, broaden the search to include highly related titles (e.g., "Product Lead" or "Technical Program Manager").

### OUTPUT FORMAT (JSON ONLY)
Return a valid JSON array of objects. No introductory text. No markdown formatting except for the code block.

\`\`\`json
[
  {
    "job_title": "string",
    "company": "string",
    "listing_url": "string (The main page of the job post)",
    "direct_apply_link": "string (The application form URL; use listing_url if a separate form link is unavailable)"
  }
]
\`\`\`

**Constraint:** Return exactly ${input.top_n || 5} results. Do not truncate URLs.`;
}

/**
 * Repair model output where direct_apply_link was truncated to "https:" and the next object was concatenated inside the string.
 * Pattern: "direct_apply_link": "https:\n  },\n  {\n    "job_title": ... → replace with "direct_apply_link": "" }, { "job_title": ...
 */
function fixTruncatedDirectApplyLink(json: string): string {
  let out = json;
  // Match truncated direct_apply_link value containing }\s*,\s*{\s*" then next key (job_title, company, etc.)
  const re = /"direct_apply_link"\s*:\s*"https:\n[\s\S]*?\}\s*,\s*\{\s*"/g;
  out = out.replace(re, '"direct_apply_link": "" }, { "');
  const reCamel = /"directApplyLink"\s*:\s*"https:\n[\s\S]*?\}\s*,\s*\{\s*"/g;
  out = out.replace(reCamel, '"directApplyLink": "" }, { "');
  return out;
}

/** Fix literal newlines/carriage returns inside double-quoted strings (JSON allows only \\n). */
function fixUnescapedNewlinesInStrings(json: string): string {
  let out = "";
  let i = 0;
  let inDoubleString = false;
  let escape = false;
  while (i < json.length) {
    const c = json[i];
    if (inDoubleString) {
      if (escape) {
        out += c;
        escape = false;
        i++;
        continue;
      }
      if (c === "\\") {
        out += c;
        escape = true;
        i++;
        continue;
      }
      if (c === '"') {
        out += c;
        inDoubleString = false;
        i++;
        continue;
      }
      if (c === "\n") {
        out += "\\n";
        i++;
        continue;
      }
      if (c === "\r") {
        out += "\\r";
        i++;
        continue;
      }
      out += c;
      i++;
      continue;
    }
    if (c === '"') {
      inDoubleString = true;
      out += c;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** If the array was truncated (e.g. token limit), try to close it at the last complete object. */
function tryRepairTruncatedArray(raw: string): string | null {
  if (!raw.startsWith("[")) return null;
  let idx = raw.length - 1;
  while (idx >= 0) {
    const commaAt = raw.lastIndexOf("},", idx);
    if (commaAt === -1) break;
    const candidate = raw.slice(0, commaAt + 1) + "]";
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed) && parsed.length > 0) return candidate;
    } catch {
      idx = commaAt - 1;
      continue;
    }
    return candidate;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again in a minute." },
        { status: 429 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    // Optional resume file (base64): extract to text and append to resume_text
    const resumeFileBase64 = body.resume_file_base64 as string | undefined;
    const resumeFileMime = body.resume_file_mime as string | undefined;
    if (resumeFileBase64 && resumeFileMime) {
      try {
        const buf = Buffer.from(resumeFileBase64, "base64");
        const extracted = await extractResumeText(buf, resumeFileMime);
        const existing = typeof body.resume_text === "string" ? body.resume_text : "";
        body.resume_text = (existing + "\n\n" + extracted).trim().slice(0, 40_000);
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Resume file extraction failed." },
          { status: 400 }
        );
      }
      delete body.resume_file_base64;
      delete body.resume_file_mime;
    }

    const parseResult = searchJobsInputSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }
    const input = parseResult.data;

    // Debug features (dry_run, parse_error/raw_preview in errors) only for limitless profile
    const session = await getServerSession(authOptions);
    const isLimitless = (session?.user as { id?: string } | undefined)?.id === "rate_limit_exempt";
    const effectiveDryRun = input.dry_run && isLimitless;

    if (effectiveDryRun) {
      const queryUsed = { ...input, resume_text: undefined, resume_provided: !!input.resume_text?.trim(), dry_run: true };
      const searchPrompt = buildSearchOnlyPrompt(input);
      return NextResponse.json({
        query_used: queryUsed,
        dry_run: true,
        generated_instructions: "(Phase 1: Google Search only)",
        generated_user_message: searchPrompt,
        results: [],
        excluded_counts: {},
        missing_info: [],
      });
    }

    const geminiKey = getGeminiApiKey();
    if (!geminiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY or GOOGLE_API_KEY is not set. Add it to .env." },
        { status: 500 }
      );
    }
    // Phase 1: Google Search only (no function calling) to get live job links
    const searchPrompt = buildSearchOnlyPrompt(input);
    const geminiResult = await runGeminiSearchOnly(geminiKey, searchPrompt);
    const outputText = geminiResult.outputText;

  if (!outputText.trim()) {
    return NextResponse.json(
      {
        error: "No output from search. Try broadening your criteria or try again.",
      },
      { status: 500 }
    );
  }

  let rawJson = outputText.trim();
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const codeBlock = rawJson.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock?.[1]) rawJson = codeBlock[1].trim();
  // Strip single-line and multi-line comments (model sometimes adds them)
  rawJson = rawJson.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  // Strip any leading text before first [ (e.g. "Here are the jobs:\n\n[...]")
  const firstBracket = rawJson.indexOf("[");
  if (firstBracket > 0) rawJson = rawJson.slice(firstBracket);
  // Repair: direct_apply_link truncated to "https:" with next object concatenated inside the string
  rawJson = fixTruncatedDirectApplyLink(rawJson);
  // Find the first complete JSON array by bracket matching (skip brackets inside strings)
  const start = rawJson.indexOf("[");
  if (start !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;
    let quoteChar = "";
    let end = -1;
    for (let i = start; i < rawJson.length; i++) {
      const c = rawJson[i];
      if (inString) {
        if (escape) escape = false;
        else if (c === "\\") escape = true;
        else if (c === quoteChar) inString = false;
        continue;
      }
      if (c === '"' || c === "'") {
        inString = true;
        quoteChar = c;
        continue;
      }
      if (c === "[") depth++;
      else if (c === "]") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end !== -1) rawJson = rawJson.slice(start, end + 1);
  } else {
    const jsonMatch = rawJson.match(/\[[\s\S]*\]/);
    if (jsonMatch) rawJson = jsonMatch[0];
  }
  // Fix common non-standard JSON: trailing commas (apply repeatedly for nested structures)
  let prev = "";
  while (prev !== rawJson) {
    prev = rawJson;
    rawJson = rawJson.replace(/,(\s*[}\]])/g, "$1");
  }
  // Remove control characters that can break JSON (keep \n \r \t)
  rawJson = rawJson.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
  // Repair: model sometimes puts a newline inside a string then the next key (e.g. "listing_url": "https:\n    "direct_apply_link": "https:). Only fix when the char before \n looks like we're inside a string (e.g. : / or alphanumeric from a URL), not after structural chars like { [ , "
  rawJson = rawJson.replace(/(.)\n\s*"(\w+)"\s*:/g, (_, before, key) =>
    /^[:\/\w]$/.test(before) ? `${before}", "${key}":` : `${before}\n    "${key}":`
  );
  // Fix unescaped newlines inside double-quoted strings (invalid in JSON)
  rawJson = fixUnescapedNewlinesInStrings(rawJson);

  let results: unknown[];
  let parseError: string | null = null;
  try {
    results = JSON.parse(rawJson);
  } catch (e) {
    parseError = e instanceof Error ? e.message : String(e);
    // Try truncation repair: model may have been cut off mid-output
    const repaired = tryRepairTruncatedArray(rawJson);
    if (repaired !== null) {
      try {
        results = JSON.parse(repaired);
      } catch {
        return NextResponse.json(
          {
            error: "Model output is not valid JSON.",
            ...(isLimitless ? { parse_error: parseError, raw_preview: rawJson.slice(0, 3000) } : {}),
          },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json(
        {
          error: "Model output is not valid JSON.",
          ...(isLimitless ? { parse_error: parseError, raw_preview: rawJson.slice(0, 3000) } : {}),
        },
        { status: 500 }
      );
    }
  }

  if (!Array.isArray(results)) {
    return NextResponse.json(
      {
        error: "Model output is not a JSON array.",
        ...(isLimitless ? { raw_preview: rawJson.slice(0, 1000) } : {}),
      },
      { status: 500 }
    );
  }

  // Enrich each raw result: resolve direct_apply_link (from listing_url if needed), run fetch_url + classify_url
  for (let i = 0; i < results.length; i++) {
    const raw = results[i] as Record<string, unknown>;
    if (!raw || typeof raw !== "object") continue;
    let link = (raw.direct_apply_link ?? raw.directApplyLink) as string | undefined;
    const listing = (raw.listing_url ?? raw.listingUrl) as string | undefined;
    // Treat missing, short, or truncated URLs (e.g. "https:") as "resolve from listing_url"
    if (
      typeof link !== "string" ||
      !link.startsWith("http") ||
      link.length < 20 ||
      link === "https:" ||
      link === "http:" ||
      link === "https://" ||
      link === "http://"
    ) {
      link = "";
      if (typeof listing === "string" && listing.startsWith("http") && listing.length >= 20) {
        try {
          const fetchRes = await fetchUrl(listing);
          const applyLinks = (fetchRes?.detected_apply_links as string[] | undefined) ?? [];
          link = applyLinks[0] ?? (fetchRes?.final_url as string) ?? (fetchRes?.url as string) ?? "";
        } catch {
          // leave link ""
        }
      }
    }
    if (!link || link.length < 20) continue;
    try {
      const fetchRes = await fetchUrl(link);
      const finalUrl = (fetchRes?.final_url ?? fetchRes?.url ?? link) as string;
      raw.direct_apply_link = finalUrl;
      raw.directApplyLink = finalUrl;
      const classification = classifyUrl({
        url: link,
        html_excerpt: (fetchRes?.html_excerpt as string) ?? "",
        final_url: finalUrl,
        status_code: (fetchRes?.status_code as number) ?? 0,
      });
      raw.direct_apply_classification = classification;
      raw.directApplyClassification = classification;
      if (typeof raw.callback_likelihood_score !== "number" && typeof raw.callbackLikelihoodScore !== "number") {
        raw.callback_likelihood_score = 50;
      }
    } catch {
      // leave raw as-is; pipeline may exclude later
    }
  }

  const excluded: ExcludedCounts & { invalid_shape?: number } = {
    not_active: 0,
    not_direct_apply: 0,
    below_salary_min: 0,
    outside_filters: 0,
    duplicate: 0,
    not_whitelisted: 0,
    bad_classification: 0,
    invalid_shape: 0,
  };

  type NormalizedJob = JobResult & { direct_apply_classification?: { page_type: string; confidence: number; reasons: string[] } };

  /** Normalize raw model output to our shape (accept snake_case, camelCase). */
  function normalizeJob(raw: unknown): NormalizedJob | null {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    const jobTitle = [o.job_title, o.jobTitle].find((v) => typeof v === "string") as string | undefined;
    const company = [o.company].find((v) => typeof v === "string") as string | undefined;
    const link = [o.direct_apply_link, o.directApplyLink, o.application_link, o.applicationLink].find((v) => typeof v === "string") as string | undefined;
    const score = [o.callback_likelihood_score, o.callbackLikelihoodScore, o.callback_score, o.score].find((v) => typeof v === "number") as number | undefined;
    if (!jobTitle?.trim() || !company?.trim() || !link?.trim()) return null;
    const numScore = typeof score === "number" && Number.isFinite(score) ? score : 50;
    const scoreRationale = Array.isArray(o.score_rationale) ? o.score_rationale.filter((x): x is string => typeof x === "string") : Array.isArray(o.scoreRationale) ? o.scoreRationale.filter((x): x is string => typeof x === "string") : undefined;
    const notes = Array.isArray(o.notes) ? o.notes.filter((x): x is string => typeof x === "string") : undefined;
    const resumeMatchSummary = typeof o.resume_match_summary === "string" ? o.resume_match_summary : undefined;
    const listingUrl = typeof o.listing_url === "string" ? o.listing_url : undefined;
    const listingUrlClass = o.listing_url_classification && typeof o.listing_url_classification === "object" ? (o.listing_url_classification as { page_type?: string; confidence?: number; reasons?: string[] }) : undefined;
    const directApplyClass = o.direct_apply_classification && typeof o.direct_apply_classification === "object" ? (o.direct_apply_classification as { page_type?: string; confidence?: number; reasons?: string[] }) : undefined;
    return {
      job_title: String(jobTitle).trim(),
      company: String(company).trim(),
      salary: o.salary as JobResult["salary"],
      callback_likelihood_score: Math.min(100, Math.max(0, numScore)),
      score_rationale: scoreRationale,
      resume_match_summary: resumeMatchSummary,
      listing_url: listingUrl,
      listing_url_classification: listingUrlClass?.page_type ? { page_type: listingUrlClass.page_type as "listing" | "apply_flow" | "search_page" | "company_jobs_index" | "aggregator" | "unknown", confidence: listingUrlClass.confidence ?? 0, reasons: Array.isArray(listingUrlClass.reasons) ? listingUrlClass.reasons : [] } : undefined,
      direct_apply_link: String(link).trim(),
      direct_apply_classification: directApplyClass?.page_type ? { page_type: directApplyClass.page_type as "listing" | "apply_flow" | "search_page" | "company_jobs_index" | "aggregator" | "unknown", confidence: directApplyClass.confidence ?? 0, reasons: Array.isArray(directApplyClass.reasons) ? directApplyClass.reasons : [] } : undefined,
      notes,
    };
  }

  /** Only exclude when page is clearly a bad type (search page, index, aggregator). Allow listing, apply_flow, unknown, or missing. */
  const BAD_APPLY_PAGE_TYPES = new Set(["search_page", "company_jobs_index", "aggregator"]);

  const seenKeys = new Set<string>();
  const filtered: JobResult[] = [];
  /** Jobs that parsed and had valid http link but failed whitelist; used as fallback when filtered is empty. */
  const whitelistRejects: JobResult[] = [];

  for (const raw of results) {
    const job = normalizeJob(raw);
    if (!job) {
      excluded.invalid_shape = (excluded.invalid_shape ?? 0) + 1;
      continue;
    }
    const link = job.direct_apply_link;
    if (!link.startsWith("http")) {
      excluded.not_direct_apply = (excluded.not_direct_apply ?? 0) + 1;
      continue;
    }
    if (isIncompleteApplyUrl(link)) {
      excluded.not_direct_apply = (excluded.not_direct_apply ?? 0) + 1;
      continue;
    }
    const key = dedupeKey({
      job_title: job.job_title,
      company: job.company,
      direct_apply_link: link,
    });
    if (seenKeys.has(key)) {
      excluded.duplicate = (excluded.duplicate ?? 0) + 1;
      continue;
    }

    if (!isHostWhitelisted(link)) {
      excluded.not_whitelisted = (excluded.not_whitelisted ?? 0) + 1;
      whitelistRejects.push({
        job_title: job.job_title,
        company: job.company,
        salary: job.salary,
        callback_likelihood_score: job.callback_likelihood_score,
        score_rationale: job.score_rationale ?? [],
        resume_match_summary: job.resume_match_summary,
        listing_url: job.listing_url,
        listing_url_classification: job.listing_url_classification,
        direct_apply_link: link,
        direct_apply_classification: job.direct_apply_classification,
        notes: job.notes ?? [],
      });
      continue;
    }

    const applyClass = job.direct_apply_classification;
    if (applyClass?.page_type != null && BAD_APPLY_PAGE_TYPES.has(applyClass.page_type)) {
      excluded.bad_classification = (excluded.bad_classification ?? 0) + 1;
      continue;
    }

    seenKeys.add(key);

    filtered.push({
      job_title: job.job_title,
      company: job.company,
      salary: job.salary,
      callback_likelihood_score: job.callback_likelihood_score,
      score_rationale: job.score_rationale ?? [],
      resume_match_summary: job.resume_match_summary,
      listing_url: job.listing_url,
      listing_url_classification: job.listing_url_classification,
      direct_apply_link: link,
      direct_apply_classification: job.direct_apply_classification,
      notes: job.notes ?? [],
    });
  }

  /** Exclude jobs whose direct_apply_link returns 404 or 410 (page gone). */
  const deadStatusCodes = new Set([404, 410]);
  const fetchResults = await Promise.all(
    filtered.map((job) => fetchUrl(job.direct_apply_link))
  );
  const liveFiltered: JobResult[] = [];
  for (let i = 0; i < filtered.length; i++) {
    const res = fetchResults[i];
    const job = filtered[i]!;
    if (res && deadStatusCodes.has(res.status_code)) {
      excluded.not_active = (excluded.not_active ?? 0) + 1;
      continue;
    }
    liveFiltered.push(job);
  }

  /** If no whitelisted results, include whitelist-rejects so user still sees something (with a note). Also exclude 404/410 from fallback. */
  let finalResults = liveFiltered;
  if (finalResults.length === 0 && whitelistRejects.length > 0) {
    const rejectFetchResults = await Promise.all(
      whitelistRejects.map((job) => fetchUrl(job.direct_apply_link))
    );
    const liveRejects = whitelistRejects.filter((job, i) => {
      const res = rejectFetchResults[i];
      if (res && deadStatusCodes.has(res.status_code)) {
        excluded.not_active = (excluded.not_active ?? 0) + 1;
        return false;
      }
      return true;
    });
    finalResults = liveRejects
      .sort((a, b) => (b.callback_likelihood_score ?? 0) - (a.callback_likelihood_score ?? 0))
      .slice(0, input.top_n);
  }

  const missingInfo: string[] = [];
  if (input.remote_only && (input.zip_code || input.radius_miles)) {
    missingInfo.push("remote_only: zip/radius ignored.");
  }
  if (finalResults.length > 0 && liveFiltered.length === 0 && whitelistRejects.length > 0) {
    missingInfo.push("Some apply links are from domains not on the verified whitelist.");
  }

  const topN = finalResults
    .sort((a, b) => (b.callback_likelihood_score ?? 0) - (a.callback_likelihood_score ?? 0))
    .slice(0, input.top_n);

  const queryUsed = { ...input, resume_text: undefined, resume_provided: !!input.resume_text?.trim() };
  return NextResponse.json({
    query_used: queryUsed,
    results: topN,
    excluded_counts: excluded,
    missing_info: missingInfo,
  });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[search-jobs]", message);
    return NextResponse.json(
      { error: message || "Server error." },
      { status: 500 }
    );
  }
}
