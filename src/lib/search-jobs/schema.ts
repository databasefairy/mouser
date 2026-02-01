import { z } from "zod";

const RESUME_TEXT_MAX_LENGTH = 40_000;

/** Industries list (exact strings for prompt). */
export const INDUSTRIES_LIST = [
  "Technology (Software/SaaS)",
  "Cybersecurity",
  "FinTech",
  "Healthcare",
  "Insurance",
  "Retail / eCommerce",
  "Logistics / Supply Chain",
  "Manufacturing",
  "Energy / Utilities",
  "Telecommunications",
  "Media / Entertainment",
  "Education (EdTech)",
  "Government / Public Sector",
  "Defense / Aerospace",
  "Real Estate / PropTech",
  "Travel / Hospitality",
  "Automotive",
  "Consumer Packaged Goods (CPG)",
  "Professional Services / Consulting",
  "Nonprofit",
] as const;

export const searchJobsInputSchema = z.object({
  top_n: z.number().int().min(1).max(50).default(10),
  industries: z.array(z.string()).default([]),
  zip_code: z.string().trim().default(""),
  radius_miles: z.number().int().min(0).max(500).default(25),
  remote_only: z.boolean().default(false),
  salary_min: z.number().int().min(0).default(0),
  titles: z.array(z.string().trim()).default([]),
  posted_within_days: z.number().int().min(1).max(30).default(3),
  resume_text: z.string().trim().max(RESUME_TEXT_MAX_LENGTH).optional().default(""),
  dry_run: z.boolean().optional().default(false),
});

export type SearchJobsInput = z.infer<typeof searchJobsInputSchema>;

export const salarySchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  currency: z.string().optional(),
  period: z.string().optional(),
  is_estimated: z.boolean().optional(),
});

export const pageTypeSchema = z.enum([
  "listing",
  "apply_flow",
  "search_page",
  "company_jobs_index",
  "aggregator",
  "unknown",
]);

export const classificationSchema = z.object({
  page_type: pageTypeSchema,
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()),
});

export const jobResultSchema = z.object({
  job_title: z.string(),
  company: z.string(),
  salary: salarySchema.optional(),
  callback_likelihood_score: z.number().min(0).max(100),
  score_rationale: z.array(z.string()).optional(),
  resume_match_summary: z.string().optional(),
  listing_url: z.string().optional(),
  listing_url_classification: classificationSchema.optional(),
  direct_apply_link: z.string(),
  direct_apply_classification: classificationSchema.optional(),
  notes: z.array(z.string()).optional(),
});

export type JobResult = z.infer<typeof jobResultSchema>;

export const excludedCountsSchema = z.object({
  not_active: z.number().optional(),
  not_direct_apply: z.number().optional(),
  below_salary_min: z.number().optional(),
  outside_filters: z.number().optional(),
  duplicate: z.number().optional(),
  not_whitelisted: z.number().optional(),
  bad_classification: z.number().optional(),
});

export type ExcludedCounts = z.infer<typeof excludedCountsSchema>;
