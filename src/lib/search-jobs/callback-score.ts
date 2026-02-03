/**
 * Callback score estimation module.
 * Estimates the likelihood (0-100) that an applicant will receive a response/callback.
 * Higher scores = more likely to get a response.
 */

export type CallbackScoreInput = {
  jobTitle: string;
  company: string;
  directApplyLink: string;
  listingUrl?: string;
  pageType?: 'listing' | 'apply_flow' | 'search_page' | 'company_jobs_index' | 'aggregator' | 'unknown';
  postedWithinDays?: number;
  hasResume?: boolean;
};

export type CallbackScoreResult = {
  score: number;
  rationale: string[];
};

// Known large companies (thousands of applicants = lower response rates)
const LARGE_COMPANIES = new Set([
  'google', 'alphabet', 'meta', 'facebook', 'apple', 'amazon', 'microsoft', 'netflix',
  'nvidia', 'tesla', 'salesforce', 'oracle', 'ibm', 'intel', 'cisco', 'adobe',
  'walmart', 'target', 'costco', 'home depot', 'lowes',
  'jpmorgan', 'jp morgan', 'bank of america', 'wells fargo', 'citigroup', 'chase',
  'goldman sachs', 'morgan stanley', 'blackrock',
  'at&t', 'verizon', 't-mobile', 'comcast',
  'united health', 'kaiser', 'cvs', 'walgreens',
  'boeing', 'lockheed martin', 'raytheon', 'northrop grumman',
  'uber', 'lyft', 'doordash', 'airbnb', 'booking', 'expedia',
  'disney', 'warner', 'paramount', 'universal', 'sony',
]);

// Startups and smaller companies (often respond more personally)
const STARTUP_INDICATORS = [
  'inc.', 'llc', 'startup', 'stealth', 'seed', 'series a', 'series b',
  'early-stage', 'early stage', 'venture',
];

// Job boards / aggregators (typically lower response rates due to high volume)
const AGGREGATOR_DOMAINS = [
  'indeed.com', 'linkedin.com', 'glassdoor.com', 'ziprecruiter.com',
  'monster.com', 'careerbuilder.com', 'dice.com', 'simplyhired.com',
  'angellist.com', 'wellfound.com', 'ycombinator.com/jobs',
];

// Direct application platforms (higher response rates - company sees application directly)
const DIRECT_APPLY_DOMAINS = [
  'greenhouse.io', 'lever.co', 'workday.com', 'ashbyhq.com', 'bamboohr.com',
  'jobvite.com', 'smartrecruiters.com', 'icims.com', 'taleo',
  'successfactors', 'breezy.hr', 'jazz.co', 'recruiterbox.com',
];

/**
 * Check if company is known to be large (high applicant volume).
 */
function isLargeCompany(company: string): boolean {
  const normalized = company.toLowerCase().trim();
  for (const large of LARGE_COMPANIES) {
    if (normalized.includes(large)) return true;
  }
  return false;
}

/**
 * Check if company appears to be a startup or small company.
 */
function isSmallCompany(company: string): boolean {
  const normalized = company.toLowerCase().trim();
  return STARTUP_INDICATORS.some(indicator => normalized.includes(indicator));
}

/**
 * Check if URL is from an aggregator/job board.
 */
function isAggregatorUrl(url: string): boolean {
  const normalized = url.toLowerCase();
  return AGGREGATOR_DOMAINS.some(domain => normalized.includes(domain));
}

/**
 * Check if URL is from a direct application platform.
 */
function isDirectApplyPlatform(url: string): boolean {
  const normalized = url.toLowerCase();
  return DIRECT_APPLY_DOMAINS.some(domain => normalized.includes(domain));
}

/**
 * Detect seniority level from job title for score adjustment.
 */
function detectSeniorityBoost(title: string): number {
  const t = title.toLowerCase();
  
  // C-level and VP get personal attention
  if (/\b(ceo|cto|cfo|coo|cmo|cio|vp|vice president|chief)\b/.test(t)) return 15;
  
  // Director level
  if (/\bdirector\b/.test(t)) return 10;
  
  // Senior/Staff/Principal
  if (/\b(senior|sr\.?|staff|principal|lead)\b/.test(t)) return 5;
  
  // Entry level often gets less attention (high volume)
  if (/\b(junior|jr\.?|entry|intern|internship|associate)\b/.test(t)) return -5;
  
  return 0;
}

/**
 * Check if job title suggests high-demand role (companies compete for these).
 */
function isHighDemandRole(title: string): boolean {
  const t = title.toLowerCase();
  return /\b(engineer|developer|data scientist|machine learning|ml|ai|devops|sre|security)\b/.test(t);
}

/**
 * Estimate callback likelihood score (0-100).
 */
export function estimateCallbackScore(input: CallbackScoreInput): CallbackScoreResult {
  const rationale: string[] = [];
  let score = 50; // Base score

  const applyUrl = input.directApplyLink || input.listingUrl || '';

  // 1. Company size factor (-15 to +15)
  if (isLargeCompany(input.company)) {
    score -= 15;
    rationale.push('Large company: high applicant volume');
  } else if (isSmallCompany(input.company)) {
    score += 15;
    rationale.push('Smaller company: likely more personal review');
  }

  // 2. Application channel factor (-10 to +15)
  if (isDirectApplyPlatform(applyUrl)) {
    score += 15;
    rationale.push('Direct ATS: application goes straight to recruiter');
  } else if (isAggregatorUrl(applyUrl)) {
    score -= 10;
    rationale.push('Job board: high competition, lower response rate');
  } else if (applyUrl.includes('.com/careers') || applyUrl.includes('/jobs/')) {
    score += 10;
    rationale.push('Company careers page: direct application');
  }

  // 3. Page type classification factor (-5 to +10)
  if (input.pageType === 'apply_flow') {
    score += 10;
    rationale.push('Direct application page');
  } else if (input.pageType === 'listing') {
    score += 5;
    rationale.push('Job listing page');
  } else if (input.pageType === 'aggregator') {
    score -= 5;
    rationale.push('Aggregator page');
  }

  // 4. Seniority factor (-5 to +15)
  const seniorityBoost = detectSeniorityBoost(input.jobTitle);
  if (seniorityBoost !== 0) {
    score += seniorityBoost;
    if (seniorityBoost > 0) {
      rationale.push('Senior/leadership role: more individual attention');
    } else {
      rationale.push('Entry-level: high competition');
    }
  }

  // 5. High-demand role factor (+5)
  if (isHighDemandRole(input.jobTitle)) {
    score += 5;
    rationale.push('High-demand role: companies actively competing');
  }

  // 6. Resume provided factor (+10)
  if (input.hasResume) {
    score += 10;
    rationale.push('Resume provided: better match potential');
  }

  // 7. Freshness factor (if posting is recent)
  if (input.postedWithinDays !== undefined) {
    if (input.postedWithinDays <= 1) {
      score += 10;
      rationale.push('Very fresh posting: early applicant advantage');
    } else if (input.postedWithinDays <= 3) {
      score += 5;
      rationale.push('Recent posting');
    } else if (input.postedWithinDays > 14) {
      score -= 5;
      rationale.push('Older posting: may be filled or have many applicants');
    }
  }

  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));

  // Add overall summary if rationale is empty
  if (rationale.length === 0) {
    rationale.push('Standard application likelihood');
  }

  return { score, rationale };
}

// Export for testing
export { isLargeCompany, isSmallCompany, isAggregatorUrl, isDirectApplyPlatform, detectSeniorityBoost };
