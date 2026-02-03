/**
 * classify_url: heuristic page-type classifier for job listing URLs.
 * Returns page_type (listing | apply_flow | search_page | company_jobs_index | aggregator | unknown),
 * confidence 0-1, and reasons[].
 */

export type PageType =
  | "listing"
  | "apply_flow"
  | "search_page"
  | "company_jobs_index"
  | "aggregator"
  | "unknown";

export type ClassifyUrlResult = {
  page_type: PageType;
  confidence: number;
  reasons: string[];
};

const APPLY_INDICATORS = [
  /\/apply\b/i,
  /submit\s*application/i,
  /resume\s*\/?\s*cv/i,
  /application\s*questions/i,
  /equal\s*opportunity/i,
  /greenhouse\.io\/.*\/apply/i,
  /lever\.co\/.*\/apply/i,
  /workable\.com\/.*\/apply/i,
  /ashbyhq\.com\/.*\/apply/i,
  /applytojob\.com/i,
  /myworkdayjobs\.com\/.*\/apply/i,
  /icims\.com\/.*\/apply/i,
  /smartrecruiters\.com\/.*\/apply/i,
  /jobvite\.com\/.*\/apply/i,
];

const LISTING_INDICATORS = [
  /responsibilities/i,
  /qualifications/i,
  /requirements/i,
  /job\s*description/i,
  /apply\s*(now|button|link)/i,
  /<a\s+[^>]*apply/i,
];

const SEARCH_PAGE_INDICATORS = [
  /\?q=|&q=/i,
  /\/search\b/i,
  /search\s*jobs/i,
  /filters?\s*(ui|panel)/i,
  /(show|view)\s*\d+\s*jobs/i,
  /search\s*results/i,
  /\d+\s*jobs?\s*found/i,
  /\d+\s*results/i,
  /sort\s*by/i,
  /filter\s*by/i,
  /refine\s*search/i,
  // LinkedIn search patterns
  /linkedin\.com\/jobs\/search/i,
  /linkedin\.com\/jobs\?/i,
  // Indeed search patterns
  /indeed\.com\/jobs\?/i,
  /indeed\.com\/q-/i,
  // Glassdoor search patterns
  /glassdoor\.com\/Job\/.*-jobs/i,
  // ZipRecruiter search patterns
  /ziprecruiter\.com\/jobs\/search/i,
  // Google Jobs patterns
  /google\.com\/search.*&ibp=htl;jobs/i,
];

const COMPANY_JOBS_INDEX_INDICATORS = [
  /join\s*our\s*team/i,
  /department\s*(list|menu)/i,
  /(many|multiple)\s*job\s*cards/i,
  /open\s*positions/i,
  /careers?\s*at\s*\w+/i,
  /we\s*are\s*hiring/i,
  /current\s*openings/i,
  /browse\s*all\s*jobs/i,
  /view\s*all\s*openings/i,
  /explore\s*opportunities/i,
  /\/careers\/?$/i,
  /\/jobs\/?$/i,
];

const AGGREGATOR_INDICATORS = [
  /apply\s*on\s*company\s*site/i,
  /(lots\s*of|many)\s*unrelated\s*job\s*links/i,
  /multiple\s*locations/i,
  /seo\s*boilerplate/i,
  /see\s*full\s*job\s*description\s*on/i,
  /view\s*on\s*company\s*website/i,
  /apply\s*externally/i,
];

// URL patterns that strongly indicate a specific page type
const URL_PATTERNS = {
  apply_flow: [
    /\/apply\/?(\?|$)/i,
    /greenhouse\.io\/[^/]+\/jobs\/\d+.*\/application/i,
    /lever\.co\/[^/]+\/[a-f0-9-]+\/apply/i,
    /myworkdayjobs\.com\/.*\/job\/.*\/apply/i,
    /icims\.com\/jobs\/\d+\/job$/i, // iCIMS direct job page (not search)
  ],
  listing: [
    // Greenhouse: boards.greenhouse.io, job-boards.greenhouse.io, etc.
    /greenhouse\.io\/[^/]+\/jobs\/\d+/i,
    /lever\.co\/[^/]+\/[a-f0-9-]+/i,
    /ashbyhq\.com\/[^/]+\/[a-f0-9-]+/i,  // jobs.ashbyhq.com/company/uuid format
    /myworkdayjobs\.com\/.*\/job\/[^/]+/i,
    /smartrecruiters\.com\/[^/]+\/\d+/i,
    /jobvite\.com\/[^/]+\/job\/[a-zA-Z0-9]+/i,
    /linkedin\.com\/jobs\/view\/\d+/i,
    /indeed\.com\/viewjob/i,
    /glassdoor\.com\/job-listing\//i,
    /workable\.com\/view\/[^/]+\/[^/]+/i,  // jobs.workable.com/view/company/job
  ],
  search_page: [
    /linkedin\.com\/jobs\/search/i,
    /linkedin\.com\/jobs\?/i,
    /indeed\.com\/jobs\?/i,
    /indeed\.com\/q-.*-jobs/i,
    /glassdoor\.com\/Job\/.*-jobs-SRCH/i,
    /ziprecruiter\.com\/jobs\/search/i,
    /monster\.com\/jobs\/search/i,
    /careerbuilder\.com\/jobs/i,
  ],
  company_jobs_index: [
    /\/careers\/?$/i,
    /\/jobs\/?$/i,
    /greenhouse\.io\/[^/]+$/i, // Company's greenhouse main page (no job ID)
    /greenhouse\.io\/[^/]+\/?(?:\?|#)/i, // Greenhouse company page with query params (e.g. ?error=true)
    /greenhouse\.io\/[^/]+\?error=/i, // Greenhouse error redirect (job not found -> company page)
    /lever\.co\/[^/]+\/?$/i, // Company's lever main page
  ],
};

export function classifyUrl(params: {
  url: string;
  html_excerpt: string;
  final_url: string;
  status_code: number;
}): ClassifyUrlResult {
  const { url, html_excerpt, final_url, status_code } = params;
  const reasons: string[] = [];
  let applyScore = 0;
  let listingScore = 0;
  let searchScore = 0;
  let companyIndexScore = 0;
  let aggregatorScore = 0;

  const combined = `${url} ${final_url} ${html_excerpt}`.toLowerCase();
  const excerptLower = html_excerpt.toLowerCase();

  if (status_code >= 400) {
    reasons.push(`status ${status_code}`);
    return { page_type: "unknown", confidence: 0.9, reasons };
  }

  // Check URL patterns first (strongest signal) - these override content-based detection
  for (const pattern of URL_PATTERNS.search_page) {
    if (pattern.test(final_url) || pattern.test(url)) {
      reasons.push("URL matches search page pattern");
      return { page_type: "search_page", confidence: 0.95, reasons };
    }
  }
  
  for (const pattern of URL_PATTERNS.apply_flow) {
    if (pattern.test(final_url) || pattern.test(url)) {
      applyScore += 3;
      reasons.push("URL matches apply flow pattern");
      break;
    }
  }
  
  for (const pattern of URL_PATTERNS.listing) {
    if (pattern.test(final_url) || pattern.test(url)) {
      listingScore += 2;
      reasons.push("URL matches job listing pattern");
      break;
    }
  }
  
  // Check for company jobs index URL patterns (but don't override if we already found listing/apply)
  if (applyScore === 0 && listingScore === 0) {
    for (const pattern of URL_PATTERNS.company_jobs_index) {
      if (pattern.test(final_url) || pattern.test(url)) {
        companyIndexScore += 2;
        reasons.push("URL matches company jobs index pattern");
        break;
      }
    }
  }

  // Apply flow content indicators
  for (const p of APPLY_INDICATORS) {
    if (p.test(combined)) {
      applyScore += 1;
      reasons.push("apply_flow indicator");
      break;
    }
  }
  if (/\/apply\/?(\?|$)/i.test(final_url) || /\/apply\/?(\?|$)/i.test(url)) {
    applyScore += 2;
    reasons.push("URL path contains /apply");
  }

  // Listing content indicators
  for (const p of LISTING_INDICATORS) {
    if (p.test(excerptLower)) {
      listingScore += 1;
      reasons.push("listing content indicator");
      break;
    }
  }
  // Single-job URL (e.g. greenhouse /jobs/5237890003, wellfound /jobs/123-title): treat as listing so we don't misclassify when page has "open positions" in footer
  if (/\/jobs\/\d+|\/jobs\/[a-z0-9-]+(?:-[a-z0-9-]+)*/i.test(final_url) || /\/jobs\/\d+|\/jobs\/[a-z0-9-]+(?:-[a-z0-9-]+)*/i.test(url)) {
    listingScore += 1;
    if (!reasons.some((r) => r.includes("listing"))) reasons.push("URL path suggests single job listing");
  }

  // Search page content indicators (check these before returning)
  for (const p of SEARCH_PAGE_INDICATORS) {
    if (p.test(combined)) {
      searchScore += 1;
      reasons.push("search page indicator");
      break;
    }
  }
  if (/\?.*[qk]=/i.test(final_url)) {
    searchScore += 1;
    reasons.push("query param suggests search");
  }

  // Company jobs index content indicators
  for (const p of COMPANY_JOBS_INDEX_INDICATORS) {
    if (p.test(excerptLower)) {
      companyIndexScore += 1;
      reasons.push("company index indicator");
      break;
    }
  }

  // Aggregator content indicators
  for (const p of AGGREGATOR_INDICATORS) {
    if (p.test(excerptLower)) {
      aggregatorScore += 1;
      reasons.push("aggregator indicator");
      break;
    }
  }

  const scores = (
    [
      { type: "apply_flow" as const, score: applyScore },
      { type: "listing" as const, score: listingScore },
      { type: "search_page" as const, score: searchScore },
      { type: "company_jobs_index" as const, score: companyIndexScore },
      { type: "aggregator" as const, score: aggregatorScore },
    ] as Array<{ type: PageType; score: number }>
  ).filter((s) => s.score > 0);

  if (scores.length === 0) {
    return { page_type: "unknown", confidence: 0.3, reasons: ["No strong indicators"] };
  }

  scores.sort((a, b) => b.score - a.score);
  const top = scores[0];
  const second = scores[1];
  const confidence = second ? Math.min(0.95, 0.5 + top.score * 0.2 - second.score * 0.1) : Math.min(0.95, 0.5 + top.score * 0.25);
  return {
    page_type: top.type,
    confidence,
    reasons: reasons.length > 0 ? reasons : [`${top.type} (score ${top.score})`],
  };
}
