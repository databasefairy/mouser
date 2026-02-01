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

export type FetchUrlResult = {
  url: string;
  final_url: string;
  status_code: number;
  content_type: string;
  html_excerpt: string;
  detected_apply_links: string[];
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

  return links;
}
