/**
 * Salary estimation module.
 * Estimates salaries based on job title (seniority + role type), company, and industry.
 * All estimated salaries are marked with is_estimated: true.
 */

export type SalaryEstimate = {
  min: number;
  max: number;
  currency: string;
  period: string;
  is_estimated: boolean;
};

// Seniority levels with base multipliers (1.0 = mid-level baseline)
type SeniorityLevel = 'intern' | 'entry' | 'mid' | 'senior' | 'staff' | 'principal' | 'lead' | 'manager' | 'director' | 'vp' | 'svp' | 'c_level';

const SENIORITY_MULTIPLIERS: Record<SeniorityLevel, number> = {
  intern: 0.4,
  entry: 0.65,
  mid: 1.0,
  senior: 1.3,
  staff: 1.5,
  principal: 1.7,
  lead: 1.4,
  manager: 1.35,
  director: 1.8,
  vp: 2.2,
  svp: 2.6,
  c_level: 3.5,
};

// Role type base salaries (USD annual, mid-level)
type RoleType = 'engineering' | 'product' | 'design' | 'data' | 'marketing' | 'sales' | 'operations' | 'hr' | 'finance' | 'legal' | 'support' | 'general';

const ROLE_BASE_SALARIES: Record<RoleType, number> = {
  engineering: 130000,
  product: 135000,
  design: 110000,
  data: 125000,
  marketing: 95000,
  sales: 90000,      // Base; commission often adds more
  operations: 85000,
  hr: 80000,
  finance: 100000,
  legal: 120000,
  support: 60000,
  general: 75000,
};

// Industry multipliers (tech/finance pay more, nonprofit less)
const INDUSTRY_MULTIPLIERS: Record<string, number> = {
  'Technology (Software/SaaS)': 1.15,
  'Cybersecurity': 1.2,
  'FinTech': 1.25,
  'Healthcare': 1.0,
  'Insurance': 0.95,
  'Retail / eCommerce': 0.9,
  'Logistics / Supply Chain': 0.85,
  'Manufacturing': 0.85,
  'Energy / Utilities': 1.0,
  'Telecommunications': 0.95,
  'Media / Entertainment': 0.95,
  'Education (EdTech)': 0.85,
  'Government / Public Sector': 0.8,
  'Defense / Aerospace': 1.05,
  'Real Estate / PropTech': 0.95,
  'Travel / Hospitality': 0.8,
  'Automotive': 0.95,
  'Consumer Packaged Goods (CPG)': 0.9,
  'Professional Services / Consulting': 1.1,
  'Nonprofit': 0.7,
};

// Known high-paying companies (FAANG+, top unicorns, big finance)
const HIGH_PAYING_COMPANIES = new Set([
  'google', 'alphabet', 'meta', 'facebook', 'apple', 'amazon', 'microsoft', 'netflix',
  'nvidia', 'tesla', 'openai', 'anthropic', 'stripe', 'airbnb', 'uber', 'lyft', 'doordash',
  'coinbase', 'robinhood', 'plaid', 'figma', 'databricks', 'snowflake', 'datadog',
  'salesforce', 'adobe', 'oracle', 'sap', 'vmware', 'servicenow', 'workday', 'splunk',
  'linkedin', 'twitter', 'x', 'snap', 'snapchat', 'pinterest', 'reddit', 'discord',
  'goldman sachs', 'morgan stanley', 'jpmorgan', 'jp morgan', 'blackrock', 'citadel',
  'two sigma', 'jane street', 'hudson river trading', 'hrt', 'de shaw', 'd.e. shaw',
  'bridgewater', 'point72', 'millennium', 'aqr', 'blackstone', 'kkr', 'carlyle',
  'palantir', 'roblox', 'unity', 'epic games', 'ea', 'electronic arts', 'activision',
  'spotify', 'block', 'square', 'paypal', 'intuit', 'zoom', 'dropbox', 'atlassian',
  'asana', 'notion', 'canva', 'airtable', 'mongodb', 'elastic', 'hashicorp', 'confluent',
]);

/**
 * Detect seniority level from job title.
 */
function detectSeniority(title: string): SeniorityLevel {
  const t = title.toLowerCase();
  
  // C-level
  if (/\b(ceo|cto|cfo|coo|cmo|cio|ciso|chief)\b/.test(t)) return 'c_level';
  
  // SVP/EVP
  if (/\b(svp|evp|senior vice president|executive vice president)\b/.test(t)) return 'svp';
  
  // VP
  if (/\b(vp|vice president)\b/.test(t)) return 'vp';
  
  // Director
  if (/\bdirector\b/.test(t) && !/\bassociate director\b/.test(t)) return 'director';
  
  // Principal/Distinguished
  if (/\b(principal|distinguished|fellow)\b/.test(t)) return 'principal';
  
  // Staff
  if (/\bstaff\b/.test(t)) return 'staff';
  
  // Lead/Head
  if (/\b(lead|head of|team lead)\b/.test(t)) return 'lead';
  
  // Manager (people management) - but NOT "Product Manager" which is a role title, not people management
  const isProductManager = /\bproduct\s+manager\b/.test(t);
  const isProjectManager = /\bproject\s+manager\b/.test(t);
  const isProgramManager = /\bprogram\s+manager\b/.test(t);
  if (/\b(manager|management)\b/.test(t) && !isProductManager && !isProjectManager && !isProgramManager) {
    return 'manager';
  }
  
  // Senior (check after manager to handle "Senior Engineering Manager" correctly)
  if (/\b(senior|sr\.?|iii|3)\b/.test(t)) return 'senior';
  
  // Entry/Junior
  if (/\b(junior|jr\.?|entry|associate|i\b|1\b|graduate|new grad)\b/.test(t)) return 'entry';
  
  // Intern
  if (/\b(intern|internship|co-?op)\b/.test(t)) return 'intern';
  
  // Default to mid-level
  return 'mid';
}

/**
 * Detect role type from job title.
 * Order matters: more specific patterns should come before generic ones.
 */
function detectRoleType(title: string): RoleType {
  const t = title.toLowerCase();
  
  // Support (check BEFORE engineering to catch "Technical Support Engineer")
  if (/\b(support|customer service|help desk|it support)\b/.test(t) && !/\bsales support\b/.test(t)) {
    return 'support';
  }
  
  // Data (check BEFORE engineering to catch "Data Engineer", "ML Engineer")
  if (/\b(data scientist|data engineer|data analyst|machine learning|ml engineer|ml\b|ai engineer|analytics|business intelligence|bi analyst|data\b)\b/.test(t)) {
    return 'data';
  }
  
  // Product (check before operations to catch "Product Manager")
  if (/\b(product manager|product owner|pm\b|product lead|product director|growth pm)\b/.test(t)) {
    return 'product';
  }
  
  // Engineering
  if (/\b(engineer|developer|programmer|swe|sde|devops|sre|architect|backend|frontend|fullstack|full-stack|software|platform|infrastructure|systems)\b/.test(t)) {
    return 'engineering';
  }
  
  // Design
  if (/\b(designer|ux|ui|user experience|user interface|visual design|interaction design|product design|graphic design)\b/.test(t)) {
    return 'design';
  }
  
  // Marketing
  if (/\b(marketing|growth|brand|content|seo|sem|social media|communications|pr|public relations)\b/.test(t)) {
    return 'marketing';
  }
  
  // Sales
  if (/\b(sales|account executive|ae\b|sdr|bdr|business development|customer success|account manager)\b/.test(t)) {
    return 'sales';
  }
  
  // Operations
  if (/\b(operations|ops\b|supply chain|logistics|procurement|project manager|program manager|scrum master)\b/.test(t)) {
    return 'operations';
  }
  
  // HR/People
  if (/\b(hr\b|human resources|recruiter|talent|people ops|people operations|compensation|benefits)\b/.test(t)) {
    return 'hr';
  }
  
  // Finance
  if (/\b(finance|accountant|accounting|controller|treasurer|fp&a|financial analyst|auditor)\b/.test(t)) {
    return 'finance';
  }
  
  // Legal
  if (/\b(legal|lawyer|attorney|counsel|compliance|paralegal)\b/.test(t)) {
    return 'legal';
  }
  
  return 'general';
}

/**
 * Check if company is known to pay above market.
 */
function isHighPayingCompany(company: string): boolean {
  const normalized = company.toLowerCase().trim();
  for (const hpc of HIGH_PAYING_COMPANIES) {
    if (normalized.includes(hpc) || hpc.includes(normalized)) {
      return true;
    }
  }
  return false;
}

/**
 * Estimate salary for a job based on title, company, and industry.
 * Returns an estimated salary range in USD.
 */
export function estimateSalary(
  jobTitle: string,
  company: string,
  industry?: string
): SalaryEstimate {
  const seniority = detectSeniority(jobTitle);
  const roleType = detectRoleType(jobTitle);
  
  // Get base salary for role
  const baseSalary = ROLE_BASE_SALARIES[roleType];
  
  // Apply seniority multiplier
  const seniorityMultiplier = SENIORITY_MULTIPLIERS[seniority];
  
  // Apply industry multiplier (default to 1.0 if not found)
  const industryMultiplier = industry ? (INDUSTRY_MULTIPLIERS[industry] ?? 1.0) : 1.0;
  
  // Apply company premium (20% boost for known high-paying companies)
  const companyMultiplier = isHighPayingCompany(company) ? 1.2 : 1.0;
  
  // Calculate estimated salary
  const midpoint = Math.round(baseSalary * seniorityMultiplier * industryMultiplier * companyMultiplier);
  
  // Create a reasonable range (±15%)
  const min = Math.round(midpoint * 0.85);
  const max = Math.round(midpoint * 1.15);
  
  return {
    min,
    max,
    currency: 'USD',
    period: 'yearly',
    is_estimated: true,
  };
}

/**
 * Check if a salary object is valid (has meaningful data).
 */
export function hasSalaryData(salary: unknown): boolean {
  if (!salary || typeof salary !== 'object') return false;
  const s = salary as Record<string, unknown>;
  // Consider valid if either min or max is a positive number
  const hasMin = typeof s.min === 'number' && s.min > 0;
  const hasMax = typeof s.max === 'number' && s.max > 0;
  return hasMin || hasMax;
}

// Export for testing
export { detectSeniority, detectRoleType, isHighPayingCompany };
export type { SeniorityLevel, RoleType };
