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
];

const COMPANY_JOBS_INDEX_INDICATORS = [
  /join\s*our\s*team/i,
  /department\s*(list|menu)/i,
  /(many|multiple)\s*job\s*cards/i,
  /open\s*positions/i,
  /careers?\s*at\s*\w+/i,
];

const AGGREGATOR_INDICATORS = [
  /apply\s*on\s*company\s*site/i,
  /(lots\s*of|many)\s*unrelated\s*job\s*links/i,
  /multiple\s*locations/i,
  /seo\s*boilerplate/i,
];

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

  // Apply flow
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

  // Listing
  for (const p of LISTING_INDICATORS) {
    if (p.test(excerptLower)) {
      listingScore += 1;
      reasons.push("listing content indicator");
      break;
    }
  }

  // Search page
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

  // Company jobs index
  for (const p of COMPANY_JOBS_INDEX_INDICATORS) {
    if (p.test(excerptLower)) {
      companyIndexScore += 1;
      reasons.push("company index indicator");
      break;
    }
  }

  // Aggregator
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
