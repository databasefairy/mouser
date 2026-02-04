/**
 * POST /api/search-jobs
 * Stateless job search using Gemini (fetch_url + classify_url). Note: Google Search and function calling cannot be combined in one request.
 * Returns top N jobs with verified direct apply links, callback scores, salary, excluded_counts.
 * Supports resume_text (and resume_file via base64), dry_run.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import axios from "axios";
import { authOptions, isLimitless as checkIsLimitless, isAdmin as checkIsAdmin } from "@/lib/auth";
import { getGeminiApiKey } from "@/lib/env";
import { incrementSearchCountAsync } from "@/lib/users";
import { fetchUrl, type JobLinkWithTitle } from "@/lib/search-jobs/fetch-url";
import { runGeminiSearchOnly } from "@/lib/search-jobs/gemini-agent";
import { classifyUrl } from "@/lib/search-jobs/classify-url";
import { extractResumeText } from "@/lib/resumeExtract";
import {
  searchJobsInputSchema,
  INDUSTRIES_LIST,
  type SearchJobsInput,
  type JobResult,
  type ExcludedCounts,
} from "@/lib/search-jobs/schema";
import {
  fixTruncatedDirectApplyLink,
  fixTruncatedUrlThenDuplicateJson,
  fixUnescapedNewlinesInStrings,
  tryRepairTruncatedArray,
} from "@/lib/search-jobs/json-repair";
import { estimateSalary, hasSalaryData } from "@/lib/search-jobs/salary-estimate";
import { estimateCallbackScore } from "@/lib/search-jobs/callback-score";
import { isHostWhitelisted } from "@/lib/search-jobs/whitelist";

// --- Title matching for Greenhouse job upgrades ---

/**
 * Normalize a job title for comparison (lowercase, remove common suffixes/prefixes).
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[–—-]/g, "-") // Normalize dashes
    .replace(/\s*\([^)]*\)\s*/g, " ") // Remove parenthetical info
    .replace(/\s*,\s*[^,]+$/, "") // Remove trailing location
    .trim();
}

function extractTitleFromHtml(html: string): string {
  if (!html) return "";
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match?.[1]) {
    return h1Match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) {
    return titleMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return "";
}

function titlesRoughlyMatch(targetTitle: string, candidateTitle: string): boolean {
  if (!targetTitle || !candidateTitle) return false;
  const normalizedTarget = normalizeTitle(targetTitle);
  const normalizedCandidate = normalizeTitle(candidateTitle);
  if (!normalizedTarget || !normalizedCandidate) return false;
  if (normalizedCandidate.includes(normalizedTarget) || normalizedTarget.includes(normalizedCandidate)) return true;
  return titleSimilarity(targetTitle, candidateTitle) > 0.5;
}

/**
 * Calculate similarity between two strings (0-1).
 * Uses a simple word overlap approach.
 */
function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeTitle(a).split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(normalizeTitle(b).split(/\s+/).filter(w => w.length > 2));
  
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  
  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap++;
  }
  
  // Jaccard-like similarity
  const union = new Set([...wordsA, ...wordsB]).size;
  return overlap / union;
}

/**
 * Find a job from the list that best matches the given title.
 * Returns the best match if similarity > 0.5, otherwise null.
 */
function findMatchingJobByTitle(targetTitle: string, jobs: JobLinkWithTitle[]): JobLinkWithTitle | null {
  if (!targetTitle || jobs.length === 0) return null;
  
  let bestMatch: JobLinkWithTitle | null = null;
  let bestScore = 0;
  
  for (const job of jobs) {
    if (!job.title) continue;
    
    const score = titleSimilarity(targetTitle, job.title);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = job;
    }
  }
  
  // Only return if we have a reasonable match (> 50% word overlap)
  if (bestScore > 0.5) {
    return bestMatch;
  }
  
  // Also check if target title is contained in or contains the job title
  const normalizedTarget = normalizeTitle(targetTitle);
  for (const job of jobs) {
    if (!job.title) continue;
    const normalizedJob = normalizeTitle(job.title);
    
    if (normalizedJob.includes(normalizedTarget) || normalizedTarget.includes(normalizedJob)) {
      return job;
    }
  }
  
  return null;
}

// --- Link verification: check if a job listing is actually live ---
// Keywords indicating a job posting is no longer active (all lowercase for matching)
const DEAD_KEYWORDS = [
  // Generic closed/filled messages
  "job no longer available",
  "position has been filled",
  "listing has expired",
  "no longer accepting applications",
  "this job is closed",
  "this position is no longer available",
  "job has been removed",
  "posting has expired",
  "this role has been filled",
  "application deadline has passed",
  "applications are closed",
  "we are no longer accepting",
  "position is closed",
  "job is no longer open",
  "role is no longer available",
  "this opportunity is closed",
  "vacancy has been filled",
  "opening has been filled",
  "job listing no longer exists",
  "listing no longer exists",
  "job does not exist",
  "position does not exist",
  "job listing has been removed",
  "this job has been closed",
  "this position has been closed",
  "job is closed",
  "role has been closed",
  "no longer available",
  "job expired",
  "position expired",
  "role expired",
  "this posting is closed",
  "job listing is closed",
  "this job was removed",
  "job has expired",
  "this position was filled",
  "job has closed",
  "this listing has closed",
  "the job you are looking for",
  "job you requested",
  "unable to find this job",
  "could not find the job",
  "couldn't find this job",
  "job doesn't exist",
  "position doesn't exist",
  "this job no longer",
  "this position no longer",
  "this role no longer",
  // Platform-specific messages
  "this job posting has expired", // LinkedIn
  "no longer accepting applications for this job", // LinkedIn
  "sorry, this job is no longer available", // Indeed
  "this job has expired", // Indeed
  "this listing is no longer accepting applications", // Glassdoor
  "the position you are looking for is no longer available", // Workday
  "this requisition is no longer active", // Greenhouse
  "this job is no longer accepting applications", // Greenhouse
  "the job you are looking for is no longer open", // Greenhouse modal
  "job you are looking for is no longer open", // Greenhouse modal variant
  "is no longer open", // Greenhouse short match
  "job not found", // Generic
  "position not found",
  "page not found", // 404-like soft errors
  "oops! we couldn't find that job",
  "this job has been archived",
  "job posting is inactive",
  "this position has been cancelled",
  "this position has been canceled",
  "the hiring for this position has concluded",
  // Lever specific
  "this job is no longer open",
  "we couldn't find that job",
  // Ashby specific
  "this position is no longer open",
  // Workable specific
  "this job is not available",
  // Workday specific
  "job requisition is no longer available",
  "requisition is no longer available",
  "job requisition has been filled",
  "this job has been filled",
  "we are no longer accepting applications for this position",
  "the job you are looking for has been filled",
  "job has been filled",
  "job no longer available",
  "job no longer exists",
  "requisition no longer exists",
  // BambooHR specific
  "job listing not found",
];

type VerifyResult = {
  active: boolean;
  reason: "valid" | "invalid_url" | "status_404" | "status_410" | "dead_keyword" | "timeout" | "error";
  statusCode?: number;
  durationMs?: number;
  retries?: number;
};

// Retry configuration for link verification
const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY_MS = 500;

/** Check if error is retryable (timeout or transient network error) */
function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("econnaborted") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("network") ||
    msg.includes("socket hang up")
  );
}

/** Sleep for ms milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isLinkActive(url: string): Promise<VerifyResult> {
  if (!url || !url.startsWith("http")) {
    return { active: false, reason: "invalid_url" };
  }
  
  const startTime = Date.now();
  let lastError: unknown = null;
  let retryCount = 0;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get(url, {
        timeout: 8000,
        maxRedirects: 5,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        validateStatus: (status) => status < 500, // treat 4xx as valid response (we check content)
      });
      const durationMs = Date.now() - startTime;
      if (response.status === 404) {
        return { active: false, reason: "status_404", statusCode: 404, durationMs, retries: retryCount };
      }
      if (response.status === 410) {
        return { active: false, reason: "status_410", statusCode: 410, durationMs, retries: retryCount };
      }
      if (response.status !== 200) {
        return { active: true, reason: "valid", statusCode: response.status, durationMs, retries: retryCount };
      }
      const htmlRaw = typeof response.data === "string" ? response.data : "";
      const htmlContent = htmlRaw.toLowerCase();
      const isAshby = url.includes("ashbyhq.com");
      const isWorkday = url.includes("myworkdayjobs.com");
      const pageTitle = extractTitleFromHtml(htmlRaw);
      const normalizedTitle = pageTitle.toLowerCase().trim();
      
      // Check for dead keywords in text content
      const isDead = DEAD_KEYWORDS.some((keyword) => htmlContent.includes(keyword));
      const isWorkdaySearchFallback =
        isWorkday &&
        /\/job\//i.test(url) &&
        (normalizedTitle === "job search" || normalizedTitle === "search jobs" || normalizedTitle === "careers");
      const isAshbyGenericJobsPage =
        isAshby && (normalizedTitle === "jobs" || normalizedTitle.startsWith("jobs @"));
      const isAshbyRealJobPage =
        isAshby && !!normalizedTitle && !isAshbyGenericJobsPage;
      if (isAshbyGenericJobsPage) {
        return { active: false, reason: "dead_keyword", statusCode: 200, durationMs, retries: retryCount };
      }
      if (isWorkdaySearchFallback) {
        return { active: false, reason: "dead_keyword", statusCode: 200, durationMs, retries: retryCount };
      }
      if (isDead && !isAshbyRealJobPage) {
        return { active: false, reason: "dead_keyword", statusCode: 200, durationMs, retries: retryCount };
      }
      
      // Check for explicit closed job indicators in structured data (more reliable than form detection)
      // Only flag as closed if we find EXPLICIT closed indicators, not just missing forms
      
      // Ashby: Check for explicit closed status in JSON data  
      const isAshbyClosed = 
        url.includes("ashbyhq.com") && (
          htmlContent.includes('"isopen":false') ||
          htmlContent.includes('"isopen": false') ||
          htmlContent.includes('"status":"closed"') ||
          htmlContent.includes('"status": "closed"')
        );
      
      if (isAshbyClosed) {
        return { active: false, reason: "dead_keyword", statusCode: 200, durationMs, retries: retryCount };
      }
      
      return { active: true, reason: "valid", statusCode: 200, durationMs, retries: retryCount };
    } catch (err) {
      lastError = err;
      // Only retry on transient errors (timeout, network issues)
      if (attempt < MAX_RETRIES && isRetryableError(err)) {
        retryCount++;
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt); // Exponential backoff: 500ms, 1000ms
        await sleep(delay);
        continue;
      }
      break;
    }
  }
  
  // All retries exhausted or non-retryable error
  const durationMs = Date.now() - startTime;
  const isTimeout = lastError instanceof Error && (lastError.message.includes("timeout") || lastError.message.includes("ECONNABORTED"));
  return { active: false, reason: isTimeout ? "timeout" : "error", durationMs, retries: retryCount };
}

type VerifyStats = {
  total: number;
  passed: number;
  failed: number;
  byReason: Record<string, number>;
  avgDurationMs: number;
  totalRetries: number;
};

async function getVerifiedJobs(
  jobs: JobResult[],
  onDead: () => void
): Promise<{ verified: JobResult[]; stats: VerifyStats }> {
  const stats: VerifyStats = {
    total: jobs.length,
    passed: 0,
    failed: 0,
    byReason: {},
    avgDurationMs: 0,
    totalRetries: 0,
  };
  let totalDuration = 0;

  const results = await Promise.all(
    jobs.map(async (job) => {
      const urlToCheck = job.direct_apply_link || job.listing_url || "";
      const result = await isLinkActive(urlToCheck);
      
      stats.byReason[result.reason] = (stats.byReason[result.reason] || 0) + 1;
      if (result.durationMs) totalDuration += result.durationMs;
      if (result.retries) stats.totalRetries += result.retries;
      
      if (!result.active) {
        stats.failed++;
        onDead();
        return null;
      }
      stats.passed++;
      return job;
    })
  );

  stats.avgDurationMs = stats.total > 0 ? Math.round(totalDuration / stats.total) : 0;
  
  return {
    verified: results.filter((j): j is JobResult => j !== null),
    stats,
  };
}

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

/** 
 * Request count per iteration.
 * With URL Context, Gemini verifies pages before returning them.
 * Google's limit is 20 URLs per request - cap at 15 to leave room for search URLs.
 */
function requestCount(needed: number): number {
  return Math.min(15, Math.max(needed, 10));
}

/** Maximum iterations to prevent infinite loops */
const MAX_SEARCH_ITERATIONS = 5;

/** Number of parallel Gemini calls per iteration */
const PARALLEL_SEARCHES = 2;

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
  let msg = `Find at least ${askFor} jobs matching: industries [${input.industries.join(", ") || "any"}], titles [${titlesStr}], salary_min ${input.salary_min}, remote_only ${input.remote_only}. We need at least ${input.top_n} to pass verification—return ${askFor} or more. For each job: call fetch_url on the job description page (NOT the apply form), then copy the EXACT 'url' or 'final_url' from that response into direct_apply_link. Avoid /apply or /application URLs; link to the job description where the user can then choose to apply. Do not type URLs from memory; paste the full URL from fetch_url. Never output "https:" or a truncated URL. Verify with fetch_url and classify_url; return only active links. Prefer whitelisted/known ATS domains, but if you cannot find enough results, include other reputable company career sites.${resumeHint} Output a JSON array of job objects only. CRITICAL: direct_apply_link = exact URL from fetch_url (e.g. https://boards.greenhouse.io/company/jobs/123); never "https:" alone. Balance results across ATS sources—do NOT return mostly Greenhouse. Include a mix from greenhouse, lever, ashby, workday, smartrecruiters, icims, and company career sites, and keep any single ATS under ~50% of results.`;
  if (input.resume_text?.trim()) {
    const resume = input.resume_text.trim().slice(0, 40_000);
    msg += `\n\n---\nRESUME CONTEXT (use only for ranking and resume_match_summary; do not echo or output this text):\n${resume}`;
  }
  return msg;
}

/**
 * Detect seniority level from job titles.
 */
function detectTargetSeniority(titles: string[]): { level: string; description: string } {
  const combined = titles.join(" ").toLowerCase();
  
  if (/\b(ceo|cto|cfo|coo|cmo|cio|chief|c-level)\b/.test(combined)) {
    return { level: "executive", description: "C-level/Executive roles" };
  }
  if (/\b(vp|vice president)\b/.test(combined)) {
    return { level: "vp", description: "VP-level roles" };
  }
  if (/\bdirector\b/.test(combined)) {
    return { level: "director", description: "Director-level roles" };
  }
  if (/\b(senior|sr\.?|staff|principal|lead)\b/.test(combined)) {
    return { level: "senior", description: "Senior/Staff/Lead roles" };
  }
  if (/\b(junior|jr\.?|entry|associate)\b/.test(combined)) {
    return { level: "junior", description: "Entry-level/Junior roles" };
  }
  if (/\b(intern|internship)\b/.test(combined)) {
    return { level: "intern", description: "Internship roles" };
  }
  return { level: "mid", description: "Mid-level roles" };
}

/** 
 * Prompt for Phase 1: Google Search + URL Context.
 * Uses Google Search to find job URLs, URL Context to verify pages are real job listings.
 * Includes callback score logic to prioritize high-quality opportunities.
 */
function buildSearchOnlyPrompt(input: SearchJobsInput, options?: { excludeUrls?: Set<string>; iteration?: number; neededCount?: number; parallelIndex?: number }): string {
  const titlesStr = input.titles.length > 0 ? input.titles.join(" OR ") : "Product Manager";
  const locationStr = input.remote_only ? "remote" : (input.zip_code ? `near ${input.zip_code}` : "");
  const neededCount = options?.neededCount ?? input.top_n ?? 10;
  const requestNum = requestCount(neededCount);
  const salaryNote = input.salary_min > 0 ? ` with salary >= $${input.salary_min.toLocaleString()}/year` : "";
  const industryNote = input.industries.length > 0 ? ` in ${input.industries.join(" or ")}` : "";
  
  // Detect target seniority from search titles
  const targetSeniority = detectTargetSeniority(input.titles);
  
  // Add search variation hints for parallel searches to get diverse results
  const searchVariations = [
    "", // Default search
    "Focus on RECENTLY POSTED jobs (last 48 hours). ",
    "Focus on STARTUP and SMALLER COMPANIES. ",
    "Focus on jobs with EXPLICIT SALARY listed. ",
  ];
  const variationHint = options?.parallelIndex !== undefined ? searchVariations[options.parallelIndex % searchVariations.length] : "";
  
  // Build exclusion list for subsequent iterations (limit to 10 to avoid URL limit issues)
  let exclusionNote = "";
  if (options?.excludeUrls && options.excludeUrls.size > 0) {
    const excludeList = Array.from(options.excludeUrls).slice(0, 10);
    exclusionNote = `\n\n### ALREADY FOUND (DO NOT RETURN)
${excludeList.map(u => `- ${u}`).join("\n")}`;
  }

  return `Find ${requestNum} ${locationStr} ${titlesStr}${industryNote} job postings${salaryNote} that are currently open.
${variationHint}
## YOUR GOAL
Find jobs with the HIGHEST CALLBACK SCORE - positions where the applicant is most likely to get a response.
The user is searching for: ${targetSeniority.description}

## CALLBACK SCORE CALCULATION (prioritize higher scores!)
Calculate a score 0-100 for each job. Start at 50, then adjust:

**Company Size (major factor):**
- Small company/startup (< 500 employees): +15 points (personal review likely)
- Mid-size company (500-5000): +5 points
- Large tech giants (Google, Meta, Amazon, Apple, Microsoft, Netflix, etc.): -15 points (thousands of applicants)
- Large corporations (JP Morgan, Goldman, Boeing, Disney, etc.): -15 points

**Application Platform (major factor):**
- Direct ATS platforms: +15 points (application goes straight to recruiter)
  ✓ greenhouse.io, lever.co, ashbyhq.com, workday, bamboohr, smartrecruiters, icims
- Company careers page: +10 points
- Job aggregators: -10 points (high competition)
  ✗ indeed.com, linkedin.com/jobs, glassdoor, ziprecruiter, monster

**Seniority Match (IMPORTANT - match to user's search):**
The user is looking for: ${targetSeniority.description}
- Job matches user's target seniority: +10 points (good fit)
- Job is one level above/below: +0 points (acceptable)
- Job is significantly mismatched: -10 points (poor fit)

**Role Demand:**
- High-demand roles (Engineer, Data Scientist, ML, DevOps, Security): +5 points

**Freshness:**
- Posted today/yesterday: +10 points (early applicant advantage)
- Posted within 3 days: +5 points
- Posted over 2 weeks ago: -5 points

## PRIORITIZE JOBS THAT:
1. MATCH the user's target seniority level (${targetSeniority.description})
2. Are from smaller/mid-size companies (NOT tech giants)
3. Use direct ATS platforms (greenhouse, lever, ashby, workday)
4. Were posted recently
5. Are high-demand roles

## VERIFICATION (USE URL CONTEXT)
Before including a job, verify via URL Context:
- Page is a real job posting (not careers homepage)
- Position is OPEN (no "closed", "filled", "no longer available")
- Extract exact title, company, and salary from the page

## URL REQUIREMENTS  
✓ PREFER: Direct ATS platforms (higher callback scores)
  - boards.greenhouse.io/company/jobs/123456
  - jobs.lever.co/company/job-id  
  - jobs.ashbyhq.com/company/uuid
  - myworkdayjobs.com/company/job/title/id
  - smartrecruiters.com/company/job-id

✗ AVOID: Aggregators and large company postings (lower callback scores)
  - linkedin.com/jobs (aggregator, -10 points)
  - indeed.com (aggregator, -10 points)
  - google.com, meta.com, amazon.jobs (giants, -15 points)
${exclusionNote}
## OUTPUT FORMAT
Return ONLY a JSON array, sorted by callback_score (highest first):
[
  {
    "job_title": "Senior Product Manager",
    "company": "TechStartup Inc",
    "direct_apply_link": "https://jobs.lever.co/techstartup/abc123",
    "salary": { "min": 150000, "max": 180000, "currency": "USD", "period": "yearly", "is_estimated": false },
    "location": "Remote",
    "callback_score": 85,
    "score_rationale": ["Small company +15", "Direct ATS +15", "Senior role +5"]
  }
]

CRITICAL RULES:
- Return ${requestNum} jobs with HIGHEST callback scores
- Prefer direct ATS platforms over aggregators
- Prefer smaller companies over tech giants
- Include callback_score (0-100) and score_rationale for each job
- JSON only, no markdown, no other text${options?.iteration && options.iteration > 1 ? `
- Iteration ${options.iteration}: Return DIFFERENT jobs` : ""}`;
}

type SearchResponsePayload = {
  query_used: Record<string, unknown>;
  results: JobResult[];
  excluded_counts: ExcludedCounts;
  missing_info: string[];
  raw_phase1_response?: string;
  verify_stats?: {
    total: number;
    passed: number;
    failed: number;
    pass_rate: number;
    by_reason: Record<string, number>;
    avg_duration_ms: number;
    total_retries: number;
  };
};

type ProgressStats = {
  found: number;
  target: number;
  looked_at: number;
  dead_links: number;
  excluded_other: number;
};

type StreamEmit = (event: "status" | "progress" | "done" | "error", data: Record<string, unknown>) => void;

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

    const wantsStream = body.stream === true;
    if ("stream" in body) delete body.stream;

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

    // Get session and check user role
    const session = await getServerSession(authOptions);
    const username = session?.user?.name;
    const sessionRole = (session?.user as { role?: string; id?: string })?.role || 
                        (session?.user as { role?: string; id?: string })?.id;
    
    // Check user roles
    const isAdmin = sessionRole === "admin";
    const isLimitless = sessionRole === "power_user" || sessionRole === "admin" || sessionRole === "rate_limit_exempt";
    
    // Track search count and enforce daily limits for basic users only
    // Admin and power_user have unlimited searches - skip the check
    if (username && !isLimitless) {
      const searchResult = await incrementSearchCountAsync(username);
      if (!searchResult.allowed) {
        return NextResponse.json(
          { error: `Daily search limit reached (${searchResult.limit}/day). Upgrade to Power User for unlimited searches.` },
          { status: 429 }
        );
      }
    } else if (username && isLimitless) {
      // Still track search count for stats, but don't block
      incrementSearchCountAsync(username).catch((err) => {
        console.error("[search-jobs] Failed to track search count:", err);
      });
    }
    
    // Debug features (dry_run, raw_phase1_response) only for admins
    const effectiveDryRun = input.dry_run && isAdmin;

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

    const runSearch = async (emit?: StreamEmit): Promise<SearchResponsePayload> => {
      const emitStatus = (message: string) => emit?.("status", { message });
      
      // Running stats for progress updates
      let runningLookedAt = 0;
      let runningDeadLinks = 0;
      let runningExcludedOther = 0;
      
      const emitProgress = (found: number) => emit?.("progress", { 
        found, 
        target: input.top_n,
        looked_at: runningLookedAt,
        dead_links: runningDeadLinks,
        excluded_other: runningExcludedOther,
      } as ProgressStats);

      emitStatus("🔍 Starting search...");

    // Use first industry from input for salary estimation (or undefined if none specified)
    const primaryIndustry = input.industries.length > 0 ? input.industries[0] : undefined;
    const hasResume = !!input.resume_text?.trim();
    
    // Page types that should get a warning note (not direct job listings)
    const WARN_PAGE_TYPES: Record<string, string> = {
      'search_page': '⚠️ Link goes to a search results page',
      'company_jobs_index': '⚠️ Link goes to a company jobs list page',
      'aggregator': '⚠️ Link goes to a job aggregator page',
    };
    
    // Page type display names for annotation
    const PAGE_TYPE_LABELS: Record<string, string> = {
      'listing': '📋 Job Listing',
      'apply_flow': '✅ Direct Apply',
      'search_page': '🔍 Search Page',
      'company_jobs_index': '🏢 Company Jobs',
      'aggregator': '📰 Aggregator',
      'unknown': '❓ Unknown',
    };

    type NormalizedJob = JobResult & { direct_apply_classification?: { page_type: string; confidence: number; reasons: string[] } };

    /** Normalize raw model output to our shape (accept snake_case, camelCase). Only skip when not an object or both title and company empty. */
    function normalizeJob(raw: unknown): NormalizedJob | null {
      if (!raw || typeof raw !== "object") return null;
      const o = raw as Record<string, unknown>;
      const jobTitle = [o.job_title, o.jobTitle].find((v) => typeof v === "string") as string | undefined;
      const company = [o.company].find((v) => typeof v === "string") as string | undefined;
      let link = [o.direct_apply_link, o.directApplyLink, o.application_link, o.applicationLink].find((v) => typeof v === "string") as string | undefined;
      const listingUrl = typeof o.listing_url === "string" ? o.listing_url : undefined;
      const isInvalidLink = (u: string) => {
        const s = u?.trim() ?? "";
        return (
          !s ||
          s.includes("localhost") ||
          s === "https:" ||
          s === "http:" ||
          s === "https://" ||
          s === "http://" ||
          s.length < 20
        );
      };
      // Use listing_url when direct_apply_link is missing, truncated (e.g. "https:"), or invalid so Apply links are always real job URLs
      if (isInvalidLink(link ?? "")) link = listingUrl && !isInvalidLink(listingUrl) ? listingUrl : "";
      link = link?.trim() ?? "";
      const score = [o.callback_likelihood_score, o.callbackLikelihoodScore, o.callback_score, o.score].find((v) => typeof v === "number") as number | undefined;
      if (!String(jobTitle ?? "").trim() && !String(company ?? "").trim()) return null;
      const numScore = typeof score === "number" && Number.isFinite(score) ? score : 50;
      const scoreRationale = Array.isArray(o.score_rationale) ? o.score_rationale.filter((x): x is string => typeof x === "string") : Array.isArray(o.scoreRationale) ? o.scoreRationale.filter((x): x is string => typeof x === "string") : undefined;
      const notes = Array.isArray(o.notes) ? o.notes.filter((x): x is string => typeof x === "string") : undefined;
      const resumeMatchSummary = typeof o.resume_match_summary === "string" ? o.resume_match_summary : undefined;
      const listingUrlClass = o.listing_url_classification && typeof o.listing_url_classification === "object" ? (o.listing_url_classification as { page_type?: string; confidence?: number; reasons?: string[] }) : undefined;
      const directApplyClass = o.direct_apply_classification && typeof o.direct_apply_classification === "object" ? (o.direct_apply_classification as { page_type?: string; confidence?: number; reasons?: string[] }) : undefined;
      return {
        job_title: String(jobTitle ?? "").trim(),
        company: String(company ?? "").trim(),
        salary: o.salary as JobResult["salary"],
        callback_likelihood_score: Math.min(100, Math.max(0, numScore)),
        score_rationale: scoreRationale,
        resume_match_summary: resumeMatchSummary,
        listing_url: listingUrl,
        listing_url_classification: listingUrlClass?.page_type ? { page_type: listingUrlClass.page_type as "listing" | "apply_flow" | "search_page" | "company_jobs_index" | "aggregator" | "unknown", confidence: listingUrlClass.confidence ?? 0, reasons: Array.isArray(listingUrlClass.reasons) ? listingUrlClass.reasons : [] } : undefined,
        direct_apply_link: link,
        direct_apply_classification: directApplyClass?.page_type ? { page_type: directApplyClass.page_type as "listing" | "apply_flow" | "search_page" | "company_jobs_index" | "aggregator" | "unknown", confidence: directApplyClass.confidence ?? 0, reasons: Array.isArray(directApplyClass.reasons) ? directApplyClass.reasons : [] } : undefined,
        notes,
      };
    }

    // === ITERATIVE SEARCH LOOP ===
    // Keep searching until we have enough verified jobs or hit max iterations
    const verifiedJobs: JobResult[] = [];
    const seenUrls = new Set<string>();
    const excluded: ExcludedCounts = {
      not_active: 0,
      not_direct_apply: 0,
      below_salary_min: 0,
      outside_filters: 0,
      duplicate: 0,
      not_whitelisted: 0,
      bad_classification: 0,
      invalid_shape: 0,
    };
    let totalVerifyStats: VerifyStats = {
      total: 0,
      passed: 0,
      failed: 0,
      byReason: {},
      avgDurationMs: 0,
      totalRetries: 0,
    };
    let rawPhase1Response = "";
    let totalRawResults = 0;
    
    for (let iteration = 1; iteration <= MAX_SEARCH_ITERATIONS; iteration++) {
      const neededCount = input.top_n - verifiedJobs.length;
      if (neededCount <= 0) break;
      
      console.log(`[search-jobs] Iteration ${iteration}/${MAX_SEARCH_ITERATIONS}: need ${neededCount} more verified jobs (have ${verifiedJobs.length}/${input.top_n})`);
      emitStatus(`🔍 Iteration ${iteration}/${MAX_SEARCH_ITERATIONS} — need ${neededCount} more (${PARALLEL_SEARCHES} parallel searches)`);
      
      // Build prompts for parallel searches with slight variations
      const searchPromises = Array.from({ length: PARALLEL_SEARCHES }, (_, idx) => {
        const searchPrompt = buildSearchOnlyPrompt(input, {
          excludeUrls: seenUrls,
          iteration,
          neededCount: Math.ceil(neededCount / PARALLEL_SEARCHES) + 3, // Request a few extra
          parallelIndex: idx, // Pass index for prompt variation
        });
        return runGeminiSearchOnly(geminiKey, searchPrompt);
      });
      
      // Run parallel Gemini calls
      const geminiResults = await Promise.all(searchPromises);
      
      // Combine outputs from all parallel searches
      const outputText = geminiResults.map(r => r.outputText).join("\n");
      
      // Store first iteration's raw response for debugging
      if (iteration === 1) {
        rawPhase1Response = geminiResults.map((r, i) => `--- Parallel Search ${i + 1} ---\n${r.outputText}`).join("\n\n");
      }
      
      if (!outputText.trim()) {
        console.log(`[search-jobs] Iteration ${iteration}: empty response from Gemini`);
        continue;
      }
      
      // Parse JSON response
      let rawJson = outputText.trim();
      // Strip markdown code fences (```json ... ``` or ``` ... ```)
      const codeBlock = rawJson.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlock?.[1]) rawJson = codeBlock[1].trim();
      // Repair: truncated URL then duplicate ```json or [ or unclosed URL at end
      rawJson = fixTruncatedUrlThenDuplicateJson(rawJson);
      // Strip multi-line comments only
      rawJson = rawJson.replace(/\/\*[\s\S]*?\*\//g, "");
      // Strip any leading text before first [
      const firstBracket = rawJson.indexOf("[");
      if (firstBracket > 0) rawJson = rawJson.slice(firstBracket);
      // Repair: direct_apply_link truncated to "https:"
      rawJson = fixTruncatedDirectApplyLink(rawJson);
      // Find the first complete JSON array by bracket matching
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
      // Fix trailing commas
      let prev = "";
      while (prev !== rawJson) {
        prev = rawJson;
        rawJson = rawJson.replace(/,(\s*[}\]])/g, "$1");
      }
      // Remove control characters
      rawJson = rawJson.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
      // Repair broken strings
      rawJson = rawJson.replace(/(.)\n\s*"(\w+)"\s*:/g, (_, before, key) =>
        /^[:\/\w]$/.test(before) ? `${before}", "${key}":` : `${before}\n    "${key}":`
      );
      // Fix unescaped newlines
      rawJson = fixUnescapedNewlinesInStrings(rawJson);
      
      let results: unknown[];
      try {
        results = JSON.parse(rawJson);
      } catch {
        const repaired = tryRepairTruncatedArray(rawJson);
        if (repaired !== null) {
          try {
            results = JSON.parse(repaired);
          } catch {
            console.log(`[search-jobs] Iteration ${iteration}: JSON parse failed after repair`);
            continue;
          }
        } else {
          console.log(`[search-jobs] Iteration ${iteration}: JSON parse failed`);
          continue;
        }
      }
      
      if (!Array.isArray(results)) {
        console.log(`[search-jobs] Iteration ${iteration}: result is not an array`);
        continue;
      }
      
      console.log(`[search-jobs] Iteration ${iteration}: Gemini returned ${results.length} raw results`);
      totalRawResults += results.length;
      runningLookedAt += results.length;
      emitProgress(verifiedJobs.length); // Update with new looked_at count
      
      // Process each result
      const iterationJobs: JobResult[] = [];
      
      for (let i = 0; i < results.length; i++) {
        const raw = results[i] as Record<string, unknown>;
        if (!raw || typeof raw !== "object") continue;
        
        let link = (raw.direct_apply_link ?? raw.directApplyLink) as string | undefined;
        const listing = (raw.listing_url ?? raw.listingUrl) as string | undefined;
        const isBadLink = (u: string) =>
          !u ||
          !u.startsWith("http") ||
          u.length < 20 ||
          u.includes("localhost") ||
          u === "https:" ||
          u === "http:" ||
          u === "https://" ||
          u === "http://";
          
        if (typeof link !== "string" || isBadLink(link)) {
          link = "";
          if (typeof listing === "string" && listing.startsWith("http") && listing.length >= 20 && !listing.includes("localhost")) {
            raw.direct_apply_link = listing;
            raw.directApplyLink = listing;
            link = listing;
          }
        }
        
        // Skip if we've already seen this URL
        if (link && seenUrls.has(link)) {
          excluded.duplicate = (excluded.duplicate ?? 0) + 1;
          runningExcludedOther++;
          continue;
        }

        // Soft whitelist: prefer known ATS domains, allow others after iteration 3
        const allowOutsideWhitelist = iteration >= 3;
        if (link && !isHostWhitelisted(link) && !allowOutsideWhitelist) {
          excluded.not_whitelisted = (excluded.not_whitelisted ?? 0) + 1;
          runningExcludedOther++;
          continue;
        }

        // Breezy restriction: only allow the base URL https://jobs.breezy.hr/
        if (link && /(^|\.)breezy\.hr$/i.test(new URL(link).hostname)) {
          const breezyPath = new URL(link).pathname;
          if (breezyPath !== "/" && breezyPath !== "") {
            excluded.not_whitelisted = (excluded.not_whitelisted ?? 0) + 1;
            runningExcludedOther++;
            continue;
          }
        }
        
        // Fetch and classify the URL
        if (link && link.length >= 20 && !link.includes("localhost")) {
          seenUrls.add(link);
          
          try {
            const fetchRes = await fetchUrl(link);
            let classification = classifyUrl({
              url: link,
              html_excerpt: (fetchRes?.html_excerpt as string) ?? "",
              final_url: (fetchRes?.final_url ?? fetchRes?.url ?? link) as string,
              status_code: (fetchRes?.status_code as number) ?? 0,
            });
            
            console.log(`[classify] ${link} -> ${classification.page_type} (${classification.confidence.toFixed(2)})`);
            
            const originalPageType = classification.page_type;
            const finalUrl = (fetchRes?.final_url ?? fetchRes?.url ?? link) as string;
            
            // Check if we were redirected to a different valid job listing
            // This happens when Gemini returns an old job ID that redirects to the correct one
            // --- ATS Detection Helpers ---
            const isGreenhouseJob = (url: string) => /greenhouse\.io\/[^/]+\/jobs\/\d+/i.test(url);
            const isGreenhouseError = (url: string) => /greenhouse\.io\/[^/]+\?error=/i.test(url);
            const isGreenhouseCompanyPage = (url: string) => /greenhouse\.io\/[^/]+\/?(?:\?|#|$)/i.test(url) && !isGreenhouseJob(url);
            
            // Ashby uses UUIDs: jobs.ashbyhq.com/{company}/{uuid}
            const ashbyUuidRegex = /jobs\.ashbyhq\.com\/[^/]+\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;
            const isAshbyJob = (url: string) => ashbyUuidRegex.test(url);
            const isAshbyCompanyPage = (url: string) => /jobs\.ashbyhq\.com\/[^/]+\/?(?:\?|#|$)/i.test(url) && !isAshbyJob(url);
            // Ashby shows "not found" or redirects to company page when job doesn't exist
            const isAshbyNotFound = (url: string, html: string) => {
              // Check if redirected to company page or if page contains "not found" indicators
              if (isAshbyCompanyPage(url)) return true;
              const lowerHtml = html.toLowerCase();
              return lowerHtml.includes("job not found") || 
                     lowerHtml.includes("this job is no longer available") ||
                     lowerHtml.includes("this position has been filled") ||
                     (lowerHtml.includes('"isopen":false') || lowerHtml.includes('"isopen": false'));
            };
            
            // Combined helpers for any ATS
            const isSpecificJobUrl = (url: string) => isGreenhouseJob(url) || isAshbyJob(url);
            const isAtsCompanyPage = (url: string) => isGreenhouseCompanyPage(url) || isAshbyCompanyPage(url);
            
            if (finalUrl !== link && isGreenhouseJob(finalUrl) && !seenUrls.has(finalUrl)) {
              console.log(`[classify] Greenhouse redirect: ${link} -> ${finalUrl}`);
              seenUrls.add(finalUrl);
              link = finalUrl;
              raw.direct_apply_link = finalUrl;
              raw.directApplyLink = finalUrl;
              // Reclassify with the new URL
              classification = classifyUrl({
                url: finalUrl,
                html_excerpt: (fetchRes?.html_excerpt as string) ?? "",
                final_url: finalUrl,
                status_code: (fetchRes?.status_code as number) ?? 0,
              });
              classification.reasons.push("Followed redirect to actual job");
            }

            // Prefer job description pages over application flows when possible
            if (classification.page_type === "apply_flow") {
              const listingCandidateFromUrl = link
                .replace(/\/apply\/?(?:\?.*)?$/i, "")
                .replace(/\/application\/?(?:\?.*)?$/i, "")
                .replace(/\?application=.*$/i, "");
              const listingCandidates = [
                listingCandidateFromUrl,
                listing,
              ].filter((u): u is string => typeof u === "string" && u.startsWith("http"));
              for (const candidate of listingCandidates) {
                if (!candidate || candidate === link) continue;
                try {
                  const candidateFetch = await fetchUrl(candidate);
                  const candidateClass = classifyUrl({
                    url: candidate,
                    html_excerpt: (candidateFetch?.html_excerpt as string) ?? "",
                    final_url: (candidateFetch?.final_url ?? candidateFetch?.url ?? candidate) as string,
                    status_code: (candidateFetch?.status_code as number) ?? 0,
                  });
                  if (candidateClass.page_type === "listing") {
                    link = candidate;
                    raw.direct_apply_link = candidate;
                    raw.directApplyLink = candidate;
                    classification = candidateClass;
                    classification.reasons.push("Preferred job description page");
                    break;
                  }
                } catch {
                  // ignore candidate fetch errors
                }
              }
            }
            
            // Handle stale job IDs that redirect to error/company pages
            // Try to find a matching job by title on the company's jobs page
            const originalHadJobId = isSpecificJobUrl(link);
            const jobTitle = (raw.job_title ?? raw.jobTitle) as string | undefined;
            const htmlContent = (fetchRes?.html_excerpt as string) ?? "";
            
            // Check if this is an error page (Greenhouse or Ashby)
            const isErrorPage = isGreenhouseError(finalUrl) || 
                               (isAshbyJob(link) && isAshbyNotFound(finalUrl, htmlContent));
            
            if (isErrorPage && originalHadJobId && fetchRes.job_links_with_titles?.length) {
              const atsName = isGreenhouseJob(link) ? "Greenhouse" : "Ashby";
              console.log(`[classify] ${atsName} job not found: ${link} -> ${finalUrl} - searching for "${jobTitle}"`);
              
              // Try to find a job with a matching title
              const matchingJob = findMatchingJobByTitle(jobTitle ?? "", fetchRes.job_links_with_titles);
              
              if (matchingJob && !seenUrls.has(matchingJob.url)) {
                console.log(`[classify] Found matching job: "${matchingJob.title}" -> ${matchingJob.url}`);
                seenUrls.add(matchingJob.url);
                link = matchingJob.url;
                raw.direct_apply_link = matchingJob.url;
                raw.directApplyLink = matchingJob.url;
                // Reclassify with the new URL
                const matchFetch = await fetchUrl(matchingJob.url);
                classification = classifyUrl({
                  url: matchingJob.url,
                  html_excerpt: (matchFetch?.html_excerpt as string) ?? "",
                  final_url: (matchFetch?.final_url ?? matchFetch?.url ?? matchingJob.url) as string,
                  status_code: (matchFetch?.status_code as number) ?? 0,
                });
                classification.reasons.push(`Matched by title from company page`);
              } else {
                console.log(`[classify] No matching job found for "${jobTitle}" - marking as dead`);
                excluded.not_active = (excluded.not_active ?? 0) + 1;
                runningDeadLinks++;
                continue;
              }
            } else if (isErrorPage && originalHadJobId) {
              // Error page but no job links with titles to match against
              const atsName = isGreenhouseJob(link) ? "Greenhouse" : "Ashby";
              console.log(`[classify] ${atsName} job not found: ${link} -> ${finalUrl} - attempting fallback match`);
              const candidateLinks = (fetchRes.detected_apply_links ?? []).filter((u) => isSpecificJobUrl(u)).slice(0, 5);
              let matched = false;
              for (const candidateLink of candidateLinks) {
                if (!candidateLink || seenUrls.has(candidateLink)) continue;
                try {
                  const candidateFetch = await fetchUrl(candidateLink);
                  const candidateTitle = extractTitleFromHtml((candidateFetch?.html_excerpt as string) ?? "");
                  if (titlesRoughlyMatch(jobTitle ?? "", candidateTitle)) {
                    console.log(`[classify] Fallback match: "${candidateTitle}" -> ${candidateLink}`);
                    seenUrls.add(candidateLink);
                    link = candidateLink;
                    raw.direct_apply_link = candidateLink;
                    raw.directApplyLink = candidateLink;
                    classification = classifyUrl({
                      url: candidateLink,
                      html_excerpt: (candidateFetch?.html_excerpt as string) ?? "",
                      final_url: (candidateFetch?.final_url ?? candidateFetch?.url ?? candidateLink) as string,
                      status_code: (candidateFetch?.status_code as number) ?? 0,
                    });
                    classification.reasons.push("Matched by title from fallback fetch");
                    matched = true;
                    break;
                  }
                } catch {
                  // Ignore failed candidate fetch
                }
              }
              if (!matched) {
                console.log(`[classify] No fallback match found for "${jobTitle}" - marking as dead`);
                excluded.not_active = (excluded.not_active ?? 0) + 1;
                runningDeadLinks++;
                continue;
              }
            }
            
            // Try to upgrade search/index pages to actual job listings
            // Only upgrade if the ORIGINAL URL was a company page (not a specific job that 404'd)
            const UPGRADE_PAGE_TYPES = new Set(['search_page', 'company_jobs_index', 'aggregator', 'unknown']);
            const needsUpgrade = (UPGRADE_PAGE_TYPES.has(classification.page_type) && !originalHadJobId) || 
              // Upgrade if original was a company page (no job ID)
              (isAtsCompanyPage(link) && !isSpecificJobUrl(link));
            
            if (needsUpgrade && fetchRes.detected_apply_links?.length > 0) {
              // Prioritize ATS job links (with job IDs)
              const atsJobLinks = fetchRes.detected_apply_links.filter(l => isSpecificJobUrl(l));
              const otherLinks = fetchRes.detected_apply_links.filter(l => !isSpecificJobUrl(l));
              const candidateLinks = [...atsJobLinks, ...otherLinks].slice(0, 5);
              
              for (const candidateLink of candidateLinks) {
                if (!candidateLink || candidateLink.length < 20 || candidateLink.includes("localhost") || candidateLink === link) continue;
                if (seenUrls.has(candidateLink)) continue;
                
                try {
                  const upgradedFetch = await fetchUrl(candidateLink);
                  const upgradedClassification = classifyUrl({
                    url: candidateLink,
                    html_excerpt: (upgradedFetch?.html_excerpt as string) ?? "",
                    final_url: (upgradedFetch?.final_url ?? upgradedFetch?.url ?? candidateLink) as string,
                    status_code: (upgradedFetch?.status_code as number) ?? 0,
                  });
                  
                  if (upgradedClassification.page_type === 'listing' || upgradedClassification.page_type === 'apply_flow') {
                    console.log(`[classify] Upgraded ${link} -> ${candidateLink} (${upgradedClassification.page_type})`);
                    seenUrls.add(candidateLink);
                    link = candidateLink;
                    classification = upgradedClassification;
                    raw.direct_apply_link = candidateLink;
                    raw.directApplyLink = candidateLink;
                    classification.reasons.push(`Upgraded from ${originalPageType}`);
                    break;
                  }
                } catch {
                  // Try next candidate
                }
              }
            }

            // Exclude search/index pages from results (do not return these)
            if (classification.page_type === "search_page" || classification.page_type === "company_jobs_index") {
              excluded.bad_classification = (excluded.bad_classification ?? 0) + 1;
              runningExcludedOther++;
              continue;
            }
            // Extra guard: drop root careers/jobs pages (these are never specific job listings)
            try {
              const urlObj = new URL(link);
              const path = urlObj.pathname.replace(/\/+$/, "").toLowerCase();
              // Match root careers pages: /careers, /jobs, /join, /join-us, /work-with-us, etc.
              // Also match localized versions: /en/careers, /us/jobs, etc.
              const rootCareersPatterns = [
                /^\/careers$/,
                /^\/jobs$/,
                /^\/join$/,
                /^\/join-us$/,
                /^\/joinus$/,
                /^\/work-with-us$/,
                /^\/openings$/,
                /^\/opportunities$/,
                /^\/vacancies$/,
                /^\/[a-z]{2}\/careers$/, // /en/careers, /de/careers, etc.
                /^\/[a-z]{2}\/jobs$/, // /en/jobs, /us/jobs, etc.
                /^\/[a-z]{2}-[a-z]{2}\/careers$/, // /en-us/careers, etc.
                /^\/[a-z]{2}-[a-z]{2}\/jobs$/, // /en-us/jobs, etc.
              ];
              const isRootCareersPage = rootCareersPatterns.some(pattern => pattern.test(path));
              if (isRootCareersPage) {
                console.log(`[filter] Excluded root careers page: ${link}`);
                excluded.bad_classification = (excluded.bad_classification ?? 0) + 1;
                runningExcludedOther++;
                continue;
              }
            } catch {
              // ignore URL parse errors
            }
            
            if (UPGRADE_PAGE_TYPES.has(originalPageType)) {
              raw._originalPageType = originalPageType;
            }
            
            raw.direct_apply_classification = classification;
            raw.directApplyClassification = classification;
          } catch (err) {
            console.log(`[classify] ${link} -> ERROR: ${err instanceof Error ? err.message : String(err)}`);
          }
        } else {
          console.log(`[classify] Skipped (bad link): ${link}`);
          continue;
        }
        
        if (typeof raw.callback_likelihood_score !== "number" && typeof raw.callbackLikelihoodScore !== "number") {
          raw.callback_likelihood_score = 50;
        }
        
        // Normalize the job
        const job = normalizeJob(raw);
        if (!job) {
          excluded.invalid_shape = (excluded.invalid_shape ?? 0) + 1;
          runningExcludedOther++;
          continue;
        }
        
        // Check page type
        const pageType = job.direct_apply_classification?.page_type;
        const reasons = job.direct_apply_classification?.reasons ?? [];
        
        const isHttpError = reasons.some(r => r.toLowerCase().includes('status 4') || r.toLowerCase().includes('status 5'));
        if (pageType === 'unknown' && isHttpError) {
          excluded.bad_classification = (excluded.bad_classification ?? 0) + 1;
          runningExcludedOther++;
          continue;
        }
        
        const jobNotes = [...(job.notes ?? [])];
        const rawObj = raw as Record<string, unknown>;
        const originalPageType = rawObj._originalPageType as string | undefined;
        
        // Add page type label for clear annotation
        if (pageType && PAGE_TYPE_LABELS[pageType]) {
          jobNotes.unshift(PAGE_TYPE_LABELS[pageType]);
        }
        
        // Add warning notes for non-direct pages
        if (pageType && WARN_PAGE_TYPES[pageType]) {
          jobNotes.push(WARN_PAGE_TYPES[pageType]);
        } else if (originalPageType && WARN_PAGE_TYPES[originalPageType]) {
          jobNotes.push(`${WARN_PAGE_TYPES[originalPageType]} (link was extracted)`);
        }
        
        if (pageType === 'unknown' && !isHttpError) {
          jobNotes.push('ℹ️ Link type could not be verified');
        }
        
        // Estimate salary if missing
        let finalSalary = job.salary;
        if (!hasSalaryData(job.salary)) {
          finalSalary = estimateSalary(job.job_title, job.company, primaryIndustry);
        } else if (job.salary && !job.salary.is_estimated) {
          finalSalary = { ...job.salary, is_estimated: false };
        }
        
        // Calculate callback score
        const aiProvidedScore = job.callback_likelihood_score !== 50;
        let finalScore = job.callback_likelihood_score;
        let finalRationale = job.score_rationale ?? [];
        
        if (!aiProvidedScore) {
          const scoreResult = estimateCallbackScore({
            jobTitle: job.job_title,
            company: job.company,
            directApplyLink: job.direct_apply_link,
            listingUrl: job.listing_url,
            pageType: job.direct_apply_classification?.page_type,
            postedWithinDays: input.posted_within_days,
            hasResume,
          });
          finalScore = scoreResult.score;
          finalRationale = scoreResult.rationale;
        }
        
        iterationJobs.push({
          job_title: job.job_title,
          company: job.company,
          salary: finalSalary,
          callback_likelihood_score: finalScore,
          score_rationale: finalRationale,
          resume_match_summary: job.resume_match_summary,
          listing_url: job.listing_url,
          listing_url_classification: job.listing_url_classification,
          direct_apply_link: job.direct_apply_link,
          direct_apply_classification: job.direct_apply_classification,
          notes: jobNotes,
        });
      }
      
      // Verify the jobs from this iteration
      const { verified, stats: iterStats } = await getVerifiedJobs(iterationJobs, () => {
        excluded.not_active = (excluded.not_active ?? 0) + 1;
        runningDeadLinks++;
      });
      
      console.log(`[search-jobs] Iteration ${iteration}: ${verified.length}/${iterationJobs.length} passed verification`);
      
      // Accumulate stats
      totalVerifyStats.total += iterStats.total;
      totalVerifyStats.passed += iterStats.passed;
      totalVerifyStats.failed += iterStats.failed;
      totalVerifyStats.totalRetries += iterStats.totalRetries;
      for (const [reason, count] of Object.entries(iterStats.byReason)) {
        totalVerifyStats.byReason[reason] = (totalVerifyStats.byReason[reason] ?? 0) + count;
      }
      
      // Add verified jobs to our collection
      verifiedJobs.push(...verified);
      emitProgress(verifiedJobs.length);
      
      // Check if we have enough
      if (verifiedJobs.length >= input.top_n) {
        console.log(`[search-jobs] Found ${verifiedJobs.length} verified jobs, stopping search`);
        break;
      }
    }
    
    // Calculate average duration
    totalVerifyStats.avgDurationMs = totalVerifyStats.total > 0 
      ? Math.round(totalVerifyStats.avgDurationMs / totalVerifyStats.total) 
      : 0;
    
    // Log final stats
    console.log("[search-jobs] Final link verification stats:", JSON.stringify({
      total: totalVerifyStats.total,
      passed: totalVerifyStats.passed,
      failed: totalVerifyStats.failed,
      passRate: totalVerifyStats.total > 0 ? `${Math.round((totalVerifyStats.passed / totalVerifyStats.total) * 100)}%` : "N/A",
      byReason: totalVerifyStats.byReason,
      totalRetries: totalVerifyStats.totalRetries,
      totalRawResults,
    }));

    const missingInfo: string[] = [];
    if (input.remote_only && (input.zip_code || input.radius_miles)) {
      missingInfo.push("remote_only: zip/radius ignored.");
    }
    
    // If we still don't have enough, add a note
    if (verifiedJobs.length < input.top_n) {
      missingInfo.push(`Only found ${verifiedJobs.length} verified jobs after ${MAX_SEARCH_ITERATIONS} search iterations.`);
    }

    const topN = verifiedJobs
      .sort((a, b) => (b.callback_likelihood_score ?? 0) - (a.callback_likelihood_score ?? 0))
      .slice(0, input.top_n);

    const queryUsed = { ...input, resume_text: undefined, resume_provided: !!input.resume_text?.trim() };
    return {
      query_used: queryUsed,
      results: topN,
      excluded_counts: excluded,
      missing_info: missingInfo,
      ...(isAdmin && { 
        raw_phase1_response: rawPhase1Response,
        verify_stats: {
          total: totalVerifyStats.total,
          passed: totalVerifyStats.passed,
          failed: totalVerifyStats.failed,
          pass_rate: totalVerifyStats.total > 0 ? Math.round((totalVerifyStats.passed / totalVerifyStats.total) * 100) : 0,
          by_reason: totalVerifyStats.byReason,
          avg_duration_ms: totalVerifyStats.avgDurationMs,
          total_retries: totalVerifyStats.totalRetries,
        },
      }),
    };
    };

    if (wantsStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const send: StreamEmit = (event, data) => {
            const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(payload));
          };
          (async () => {
            try {
              const payload = await runSearch(send);
              send("done", payload);
            } catch (err) {
              const message = err instanceof Error ? err.message : "Search failed.";
              send("error", { message });
            } finally {
              controller.close();
            }
          })();
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const payload = await runSearch();
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[search-jobs]", message);
    return NextResponse.json(
      { error: message || "Server error." },
      { status: 500 }
    );
  }
}
