/**
 * Dedupe keys for job listings.
 * canonical_company | canonical_title | canonical_apply, or host | ats_job_id when detectable.
 */

const FLUFF_TOKENS = new Set([
  "remote",
  "hybrid",
  "contract",
  "full-time",
  "ft",
  "pt",
  "fulltime",
  "part-time",
  "parttime",
  "onsite",
  "in-office",
]);

const TRACKING_PARAMS = /[?&](utm_[^=&]*|gclid|fbclid|msclkid|ref|lever-source|[^=&]*source[^=&]*)=[^&]*/gi;

function normalizeForDedupe(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removeFluff(title: string): string {
  const words = title.split(/\s+/).filter((w) => w.length > 0);
  const filtered = words.filter((w) => !FLUFF_TOKENS.has(w.toLowerCase()));
  return filtered.join(" ");
}

/** Normalize direct_apply_link: lowercase host, strip tracking params, keep requisition params. */
export function canonicalApplyLink(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.forEach((_, key) => {
      const k = key.toLowerCase();
      if (k.startsWith("utm_") || k === "gclid" || k === "fbclid" || k === "msclkid" || k === "ref" || k === "lever-source" || k === "source") {
        u.searchParams.delete(key);
      }
    });
    const out = u.toString();
    return out.replace(TRACKING_PARAMS, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function canonicalCompany(company: string): string {
  return normalizeForDedupe(company);
}

export function canonicalTitle(jobTitle: string): string {
  const normalized = normalizeForDedupe(jobTitle);
  return removeFluff(normalized);
}

/** ATS job ID from URL when detectable. */
export function getAtsJobId(url: string): { host: string; id: string } | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname;

    // Greenhouse: /jobs/123 or /j/123
    const gh = path.match(/\/(?:jobs?|j)\/([^/]+)/i);
    if (gh && (host.includes("greenhouse") || host.includes("boards.greenhouse"))) {
      return { host: "greenhouse", id: gh[1] };
    }
    // Lever: /jobs/company-id or lever.co/.../id
    const lev = path.match(/\/(?:jobs?\/[^/]+\/([^/]+)|([a-f0-9-]{20,}))\/?$/i);
    if (lev && host.includes("lever")) {
      return { host: "lever", id: (lev[1] || lev[2] || "").trim() };
    }
    // Ashby: /job/xxx
    const ash = path.match(/\/job\/([^/]+)/i);
    if (ash && host.includes("ashby")) {
      return { host: "ashby", id: ash[1] };
    }
    // Workday / Taleo: often have requisition in path or query
    const req = u.searchParams.get("jobId") || u.searchParams.get("requisition") || path.match(/\/job\/[^/]+\/([^/]+)/)?.[1];
    if (req && (host.includes("workday") || host.includes("taleo") || host.includes("myworkday"))) {
      return { host, id: req };
    }
  } catch {
    // ignore
  }
  return null;
}

export function dedupeKey(job: { job_title: string; company: string; direct_apply_link: string }): string {
  const ats = getAtsJobId(job.direct_apply_link);
  if (ats) {
    return `${ats.host}|${ats.id}`;
  }
  const company = canonicalCompany(job.company);
  const title = canonicalTitle(job.job_title);
  const apply = canonicalApplyLink(job.direct_apply_link);
  const raw = `${company}|${title}|${apply}`;
  return simpleHash(raw);
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h = (h << 5) - h + c;
    h = h & h;
  }
  return "h" + Math.abs(h).toString(36);
}
