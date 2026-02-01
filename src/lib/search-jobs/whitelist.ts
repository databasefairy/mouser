/**
 * Allowed domains for job listing and direct-apply URLs.
 * Only accept results whose host matches this list or resolves to one of these.
 */
export const ALLOWED_DOMAINS = new Set([
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "ziprecruiter.com",
  "monster.com",
  "careerbuilder.com",
  "dice.com",
  "builtin.com",
  "wellfound.com",
  "flexjobs.com",
  "themuse.com",
  "simplyhired.com",
  "levels.fyi",
  "hireremote.io",
  "remote.co",
  "remoteok.com",
  "weworkremotely.com",
  "remotive.com",
  "workingnomads.com",
  "jobspresso.co",
  "justremote.co",
  "powertofly.com",
  "fairygodboss.com",
  "idealist.org",
  "stackoverflow.com",
  "upwork.com",
  "builtinnyc.com",
  "angel.co",
  "greenhouse.io",
  "boards.greenhouse.io",
  "lever.co",
  "jobs.lever.co",
  "ashbyhq.com",
  "myworkdayjobs.com",
  "icims.com",
  "smartrecruiters.com",
  "jobs.smartrecruiters.com",
  "taleo.net",
  "oraclecloud.com",
  "successfactors.com",
  "ultipro.com",
  "ukg.com",
  "dayforcehcm.com",
  "paycomonline.net",
  "paylocity.com",
  "bamboohr.com",
  "jobvite.com",
  "applytojob.com",
  "breezy.hr",
  "recruitee.com",
  "apply.workable.com",
  "workable.com",
  "careers-page.com",
]);

/** Normalize host for comparison: lowercase, strip www. */
export function normalizeHost(url: string): string {
  try {
    const u = new URL(url);
    let host = u.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    return host;
  } catch {
    return "";
  }
}

/** Check if the URL's host is on the whitelist (or a subdomain of a listed host). */
export function isHostWhitelisted(url: string): boolean {
  const host = normalizeHost(url);
  if (!host) return false;
  if (ALLOWED_DOMAINS.has(host)) return true;
  for (const allowed of ALLOWED_DOMAINS) {
    if (host === allowed || host.endsWith("." + allowed)) return true;
  }
  return false;
}
