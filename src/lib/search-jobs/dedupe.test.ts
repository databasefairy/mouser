import { describe, it, expect } from "vitest";
import { canonicalCompany, canonicalTitle, canonicalApplyLink, dedupeKey, getAtsJobId } from "./dedupe";

describe("dedupe normalization", () => {
  it("canonicalCompany lowercases and normalizes punctuation/whitespace", () => {
    expect(canonicalCompany("Acme, Inc.")).toBe("acme inc");
    expect(canonicalCompany("  Foo   Bar  ")).toBe("foo bar");
  });

  it("canonicalTitle removes fluff tokens", () => {
    expect(canonicalTitle("Senior PM - Remote")).not.toContain("remote");
    expect(canonicalTitle("Engineer Full-Time")).not.toContain("full-time");
  });

  it("canonicalApplyLink strips tracking params and lowercases", () => {
    const url = "https://boards.greenhouse.io/company/jobs/123?utm_source=linkedin&gclid=abc";
    const out = canonicalApplyLink(url);
    expect(out).not.toContain("utm_source");
    expect(out).not.toContain("gclid");
    expect(out).toContain("greenhouse");
  });

  it("getAtsJobId extracts Greenhouse job id", () => {
    const r = getAtsJobId("https://boards.greenhouse.io/acme/jobs/456");
    expect(r).toEqual({ host: "greenhouse", id: "456" });
  });

  it("getAtsJobId extracts Ashby job id", () => {
    const r = getAtsJobId("https://jobs.ashbyhq.com/acme/job/xyz");
    expect(r).toEqual({ host: "ashby", id: "xyz" });
  });

  it("dedupeKey is stable for same company+title+apply", () => {
    const a = dedupeKey({ job_title: "Senior PM", company: "Acme", direct_apply_link: "https://boards.greenhouse.io/acme/jobs/1" });
    const b = dedupeKey({ job_title: "Senior PM", company: "acme", direct_apply_link: "https://boards.greenhouse.io/acme/jobs/1?utm_medium=email" });
    expect(a).toBe(b);
  });
});
