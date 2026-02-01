/**
 * SSRF protection: block private/local URLs and non-http(s) schemes.
 * Deny: localhost, 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16,
 * link-local (169.254.x.x, fe80::), and any non-http(s) URL.
 */

export const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.",
  "127.0.0.1",
  "0.0.0.0",
  "[::]",
  "[::1]",
]);

/** Hosts that are always blocked (exact or subdomain). */
export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().trim();
  if (BLOCKED_HOSTS.has(h)) return true;
  if (h.endsWith(".localhost")) return true;
  return false;
}

/** Check if IPv4 is in a private range. */
function isPrivateIPv4(parts: number[]): boolean {
  if (parts.length !== 4) return false;
  // 10.0.0.0/8
  if (parts[0] === 10) return true;
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;
  // 127.0.0.0/8 (loopback)
  if (parts[0] === 127) return true;
  // 169.254.0.0/16 (link-local)
  if (parts[0] === 169 && parts[1] === 254) return true;
  return false;
}

/** Check if IPv6 is link-local or loopback. */
function isPrivateIPv6(parts: string[]): boolean {
  if (parts.length === 0) return false;
  const first = parts[0].toLowerCase();
  // fe80::/10 link-local, ::1 loopback
  if (first.startsWith("fe8") || first.startsWith("fe9") || first.startsWith("fea") || first.startsWith("feb")) return true;
  if (parts.length === 1 && first === "1") return true;
  return false;
}

/** Resolve host to check if it's a private IP. Returns true if host is allowed (public). */
export function isAllowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().trim();
  if (isBlockedHost(h)) return false;

  // IPv4
  const ipv4Match = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const parts = ipv4Match.slice(1, 5).map(Number);
    if (parts.some((n) => n > 255 || n < 0)) return false;
    return !isPrivateIPv4(parts);
  }

  // IPv6 (simplified: strip brackets if present, split by :)
  const ipv6Raw = h.replace(/^\[|\]$/g, "");
  if (ipv6Raw.includes(":")) {
    const parts = ipv6Raw.split(":");
    return !isPrivateIPv6(parts);
  }

  return true;
}

/**
 * Validate URL for SSRF: only allow http/https; reject private/local hosts.
 * Returns { allowed: true } or { allowed: false, reason: string }.
 */
export function validateUrlForFetch(url: string): { allowed: true } | { allowed: false; reason: string } {
  try {
    const u = new URL(url);
    const proto = u.protocol.toLowerCase();
    if (proto !== "http:" && proto !== "https:") {
      return { allowed: false, reason: "Only http and https URLs are allowed." };
    }
    const host = u.hostname;
    if (isBlockedHost(host)) {
      return { allowed: false, reason: "Private or localhost host is not allowed." };
    }
    // DNS could resolve to private IP; we only check hostname here.
    // For production, you could resolve and check the resolved IP.
    if (!isAllowedHost(host)) {
      return { allowed: false, reason: "Host is not allowed (private or local)." };
    }
    return { allowed: true };
  } catch {
    return { allowed: false, reason: "Invalid URL." };
  }
}
