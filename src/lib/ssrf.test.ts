import { describe, it, expect } from "vitest";
import { validateUrlForFetch, isAllowedHost, isBlockedHost } from "./ssrf";

describe("SSRF blocklist", () => {
  it("rejects non-http(s) URLs", () => {
    expect(validateUrlForFetch("file:///etc/passwd").allowed).toBe(false);
    expect(validateUrlForFetch("ftp://example.com").allowed).toBe(false);
  });

  it("rejects localhost", () => {
    expect(validateUrlForFetch("http://localhost/jobs").allowed).toBe(false);
    expect(validateUrlForFetch("https://127.0.0.1/api").allowed).toBe(false);
  });

  it("rejects private IP ranges", () => {
    expect(isAllowedHost("10.0.0.1")).toBe(false);
    expect(isAllowedHost("192.168.1.1")).toBe(false);
    expect(isAllowedHost("172.16.0.1")).toBe(false);
    expect(isAllowedHost("169.254.1.1")).toBe(false);
  });

  it("allows public hosts", () => {
    expect(validateUrlForFetch("https://boards.greenhouse.io/company/jobs/1").allowed).toBe(true);
    expect(validateUrlForFetch("https://example.com/careers").allowed).toBe(true);
  });

  it("isBlockedHost matches localhost", () => {
    expect(isBlockedHost("localhost")).toBe(true);
    expect(isBlockedHost("127.0.0.1")).toBe(true);
    expect(isBlockedHost("example.com")).toBe(false);
  });
});
