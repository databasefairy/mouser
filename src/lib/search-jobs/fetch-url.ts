/**
 * fetch_url: server-side URL fetcher for job link verification.
 * - SSRF: block private/local URLs before fetch.
 * - Timeout (AbortController), cap redirects to 5, limit body to 250KB.
 * - Returns status_code, final_url, content_type, html_excerpt, detected_apply_links.
 */

import { validateUrlForFetch } from "@/lib/ssrf";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const MAX_BYTES = 250 * 1024; // 250KB
const HTML_EXCERPT_CHARS = 8000;

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Patterns for apply links in HTML (href or anchor text).
const APPLY_ANCHOR_REGEX = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?(?:apply\s*now|submit\s*application|apply|apply\s*for\s*this\s*job)[\s\S]*?<\/a>/gi;
const ATS_HOST_PATTERNS = [
  /greenhouse\.io/i,
  /lever\.co/i,
  /ashbyhq\.com/i,
  /myworkdayjobs\.com/i,
  /icims\.com/i,
  /smartrecruiters\.com/i,
  /taleo\.net/i,
  /successfactors\.com/i,
  /applytojob\.com/i,
  /breezy\.hr/i,
  /jobvite\.com/i,
  /recruitee\.com/i,
  /bamboohr\.com/i,
];

export type JobLinkWithTitle = {
  url: string;
  title?: string;
};

export type FetchUrlResult = {
  url: string;
  final_url: string;
  status_code: number;
  content_type: string;
  html_excerpt: string;
  detected_apply_links: string[];
  /** Job links with their associated titles (for matching when upgrading) */
  job_links_with_titles?: JobLinkWithTitle[];
};

export async function fetchUrl(url: string): Promise<FetchUrlResult> {
  const result: FetchUrlResult = {
    url,
    final_url: url,
    status_code: 0,
    content_type: "",
    html_excerpt: "",
    detected_apply_links: [],
  };

  const allowed = validateUrlForFetch(url);
  if (!allowed.allowed) {
    result.html_excerpt = `(blocked: ${allowed.reason})`;
    return result;
  }

  let redirectCount = 0;
  let currentUrl = url;

  while (redirectCount <= MAX_REDIRECTS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(currentUrl, {
        method: "GET",
        headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml" },
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      result.status_code = res.status;
      result.final_url = res.url;
      result.content_type = res.headers.get("content-type") ?? "";

      const finalAllowed = validateUrlForFetch(res.url);
      if (!finalAllowed.allowed) {
        result.html_excerpt = `(redirect blocked: ${finalAllowed.reason})`;
        return result;
      }

      if (!res.ok) {
        const text = await res.text();
        result.html_excerpt = text.slice(0, HTML_EXCERPT_CHARS);
        return result;
      }

      const contentType = (result.content_type || "").toLowerCase();
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
        result.html_excerpt = `(non-HTML: ${result.content_type})`;
        return result;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        result.html_excerpt = "(no body)";
        return result;
      }

      let html = "";
      let totalBytes = 0;
      const decoder = new TextDecoder("utf-8", { fatal: false });
      while (totalBytes < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        html += chunk;
        totalBytes += value.length;
      }
      reader.cancel?.();

      result.html_excerpt = html.slice(0, HTML_EXCERPT_CHARS);
      result.detected_apply_links = extractApplyLinks(html);
      result.job_links_with_titles = extractJobLinksWithTitles(html);
      return result;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error) {
        result.html_excerpt = `(fetch error: ${err.message})`;
      }
      return result;
    }
  }

  result.html_excerpt = "(too many redirects)";
  return result;
}

function extractApplyLinks(html: string): string[] {
  const links: string[] = [];
  const seen = new Set<string>();

  // Anchors with "apply" etc in text.
  let m: RegExpExecArray | null;
  APPLY_ANCHOR_REGEX.lastIndex = 0;
  while ((m = APPLY_ANCHOR_REGEX.exec(html)) !== null) {
    const href = m[1].trim();
    if (href && href.startsWith("http") && !seen.has(href)) {
      seen.add(href);
      links.push(href);
    }
  }

  // Any href to known ATS domains.
  const hrefRegex = /<a\s+[^>]*href\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
  hrefRegex.lastIndex = 0;
  while ((m = hrefRegex.exec(html)) !== null) {
    const href = m[1].trim();
    if (href && !seen.has(href) && ATS_HOST_PATTERNS.some((p) => p.test(href))) {
      seen.add(href);
      links.push(href);
    }
  }

  // Greenhouse-specific: extract job links from listing pages
  // Greenhouse uses various subdomains: boards.greenhouse.io, job-boards.greenhouse.io, etc.
  // Job links are in format: /company/jobs/ID or full URL
  
  // First, try to find the base URL from the page for relative links
  const greenhouseBaseMatch = html.match(/https?:\/\/[^"'\s]*greenhouse\.io/i);
  const greenhouseBaseUrl = greenhouseBaseMatch ? greenhouseBaseMatch[0] : "";
  
  // Look for relative Greenhouse job links like href="/company/jobs/123"
  const relativeGreenhouseRegex = /href\s*=\s*["'](\/[^"'\/]+\/jobs\/\d+)[^"']*["']/gi;
  relativeGreenhouseRegex.lastIndex = 0;
  while ((m = relativeGreenhouseRegex.exec(html)) !== null) {
    const relativePath = m[1].trim();
    if (greenhouseBaseUrl && relativePath) {
      const fullUrl = greenhouseBaseUrl + relativePath;
      if (!seen.has(fullUrl)) {
        seen.add(fullUrl);
        links.push(fullUrl);
      }
    }
  }

  // Look for full Greenhouse job URLs anywhere in the HTML
  const greenhouseFullUrlRegex = /https?:\/\/[^"'\s<>]*greenhouse\.io\/[^"'\s<>\/]+\/jobs\/\d+/gi;
  greenhouseFullUrlRegex.lastIndex = 0;
  while ((m = greenhouseFullUrlRegex.exec(html)) !== null) {
    let href = m[0].trim();
    // Clean up any trailing characters that might have been captured
    href = href.replace(/[)\]}>].*$/, "");
    if (href && !seen.has(href)) {
      seen.add(href);
      links.push(href);
    }
  }

  // Ashby-specific: extract job links from listing pages
  // Ashby URLs are: jobs.ashbyhq.com/{company}/{uuid}
  const ashbyBaseMatch = html.match(/https?:\/\/jobs\.ashbyhq\.com/i);
  const ashbyBaseUrl = ashbyBaseMatch ? ashbyBaseMatch[0] : "";
  
  // Look for relative Ashby job links like href="/company/uuid"
  // Ashby UUIDs are 36 chars: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const relativeAshbyRegex = /href\s*=\s*["'](\/[^"'\/]+\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})[^"']*["']/gi;
  relativeAshbyRegex.lastIndex = 0;
  while ((m = relativeAshbyRegex.exec(html)) !== null) {
    const relativePath = m[1].trim();
    if (ashbyBaseUrl && relativePath) {
      const fullUrl = ashbyBaseUrl + relativePath;
      if (!seen.has(fullUrl)) {
        seen.add(fullUrl);
        links.push(fullUrl);
      }
    }
  }

  // Look for full Ashby job URLs anywhere in the HTML
  const ashbyFullUrlRegex = /https?:\/\/jobs\.ashbyhq\.com\/[^"'\s<>\/]+\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi;
  ashbyFullUrlRegex.lastIndex = 0;
  while ((m = ashbyFullUrlRegex.exec(html)) !== null) {
    let href = m[0].trim();
    href = href.replace(/[)\]}>].*$/, "");
    if (href && !seen.has(href)) {
      seen.add(href);
      links.push(href);
    }
  }

  return links;
}

/**
 * Clean up job title text by removing HTML tags and location info.
 */
function cleanJobTitle(titleText: string): string {
  // Remove HTML tags, extra whitespace
  let title = titleText
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  
  // Try to extract just the job title (before common location patterns)
  const locationPatterns = [
    /\s*(Remote|United States|US|New York|San Francisco|Los Angeles|Chicago|Boston|Austin|Denver|Seattle|Atlanta|London|Berlin|Toronto|Hybrid|On-site)/i,
    /\s*[A-Z][a-z]+,\s*[A-Z]{2}\s*$/,  // City, ST format
  ];
  
  for (const pattern of locationPatterns) {
    const match = title.match(pattern);
    if (match && match.index && match.index > 10) {
      title = title.slice(0, match.index).trim();
      break;
    }
  }
  
  return title;
}

/**
 * Extract job links with their associated titles from HTML.
 * This is used to match job titles when upgrading from a company jobs page.
 * Supports Greenhouse and Ashby job boards.
 */
function extractJobLinksWithTitles(html: string): JobLinkWithTitle[] {
  const results: JobLinkWithTitle[] = [];
  const seen = new Set<string>();
  
  // --- Greenhouse ---
  const greenhouseBaseMatch = html.match(/https?:\/\/[^"'\s]*greenhouse\.io/i);
  const greenhouseBaseUrl = greenhouseBaseMatch ? greenhouseBaseMatch[0] : "";
  
  // Pattern to match anchor tags with Greenhouse job links
  const greenhouseAnchorRegex = /<a\s+[^>]*href\s*=\s*["']((?:https?:\/\/[^"']*greenhouse\.io)?\/[^"']+\/jobs\/\d+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  
  let m: RegExpExecArray | null;
  greenhouseAnchorRegex.lastIndex = 0;
  while ((m = greenhouseAnchorRegex.exec(html)) !== null) {
    let href = m[1].trim();
    const titleText = m[2] || "";
    
    // Convert relative URLs to full URLs
    if (href.startsWith("/") && greenhouseBaseUrl) {
      href = greenhouseBaseUrl + href;
    }
    
    if (!href.startsWith("http") || seen.has(href)) continue;
    seen.add(href);
    
    const title = cleanJobTitle(titleText);
    if (title) {
      results.push({ url: href, title });
    }
  }
  
  // Also try to find full Greenhouse URLs with surrounding context for titles
  const greenhouseContextRegex = />([^<]{5,100})<\/[^>]+>\s*<a[^>]+href\s*=\s*["'](https?:\/\/[^"']*greenhouse\.io\/[^"']+\/jobs\/\d+)["']/gi;
  greenhouseContextRegex.lastIndex = 0;
  while ((m = greenhouseContextRegex.exec(html)) !== null) {
    const title = cleanJobTitle(m[1]);
    const href = m[2].trim();
    
    if (href && title && !seen.has(href)) {
      seen.add(href);
      results.push({ url: href, title });
    }
  }
  
  // --- Ashby ---
  const ashbyBaseUrl = "https://jobs.ashbyhq.com";
  const ashbyUuidPattern = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
  
  // Pattern to match anchor tags with Ashby job links
  // Ashby format: <a href="/company/uuid">Job Title</a> or full URL
  const ashbyAnchorRegex = new RegExp(
    `<a\\s+[^>]*href\\s*=\\s*["']((?:https?:\\/\\/jobs\\.ashbyhq\\.com)?\\/[^"'\\/]+\\/${ashbyUuidPattern})["'][^>]*>([\\s\\S]*?)<\\/a>`,
    "gi"
  );
  
  ashbyAnchorRegex.lastIndex = 0;
  while ((m = ashbyAnchorRegex.exec(html)) !== null) {
    let href = m[1].trim();
    const titleText = m[2] || "";
    
    // Convert relative URLs to full URLs
    if (href.startsWith("/")) {
      href = ashbyBaseUrl + href;
    }
    
    if (!href.startsWith("http") || seen.has(href)) continue;
    seen.add(href);
    
    const title = cleanJobTitle(titleText);
    if (title) {
      results.push({ url: href, title });
    }
  }
  
  // Also try to find full Ashby URLs with surrounding context for titles
  const ashbyContextRegex = new RegExp(
    `>([^<]{5,100})<\\/[^>]+>\\s*<a[^>]+href\\s*=\\s*["'](https?:\\/\\/jobs\\.ashbyhq\\.com\\/[^"'\\/]+\\/${ashbyUuidPattern})["']`,
    "gi"
  );
  ashbyContextRegex.lastIndex = 0;
  while ((m = ashbyContextRegex.exec(html)) !== null) {
    const title = cleanJobTitle(m[1]);
    const href = m[2].trim();
    
    if (href && title && !seen.has(href)) {
      seen.add(href);
      results.push({ url: href, title });
    }
  }
  
  return results;
}
