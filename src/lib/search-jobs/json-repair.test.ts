import { describe, it, expect } from "vitest";
import {
  fixTruncatedDirectApplyLink,
  fixTruncatedUrlThenDuplicateJson,
  fixUnescapedNewlinesInStrings,
  tryRepairTruncatedArray,
  repairGeminiJson,
  parseGeminiJobsOutput,
} from "./json-repair";

describe("JSON repair utilities", () => {
  describe("fixTruncatedDirectApplyLink", () => {
    it("repairs truncated https: with concatenated next object", () => {
      const input = `[{"job_title": "PM", "direct_apply_link": "https:
  },
  {
    "job_title": "Engineer"}]`;
      const result = fixTruncatedDirectApplyLink(input);
      expect(result).toContain('"direct_apply_link": "" }, { "');
    });

    it("leaves valid URLs unchanged", () => {
      const input = `[{"direct_apply_link": "https://example.com/jobs/123"}]`;
      const result = fixTruncatedDirectApplyLink(input);
      expect(result).toBe(input);
    });
  });

  describe("fixTruncatedUrlThenDuplicateJson", () => {
    it("repairs truncated URL followed by duplicate code block", () => {
      const input = `[{"direct_apply_link": "https://example.com/jo
\`\`\`json
[{"another": "array"}]`;
      const result = fixTruncatedUrlThenDuplicateJson(input);
      expect(result).toContain('"direct_apply_link": "" } ]');
    });

    it("repairs unclosed URL at end of string", () => {
      const input = `[{"job_title": "PM", "direct_apply_link": "https://example.com`;
      const result = fixTruncatedUrlThenDuplicateJson(input);
      expect(result).toContain('"direct_apply_link": "" } ]');
    });

    it("leaves complete JSON unchanged", () => {
      const input = `[{"direct_apply_link": "https://example.com/jobs/123"}]`;
      const result = fixTruncatedUrlThenDuplicateJson(input);
      expect(result).toBe(input);
    });
  });

  describe("fixUnescapedNewlinesInStrings", () => {
    it("escapes literal newlines inside strings", () => {
      const input = `{"title": "Senior
PM"}`;
      const result = fixUnescapedNewlinesInStrings(input);
      expect(result).toBe('{"title": "Senior\\nPM"}');
    });

    it("leaves properly escaped newlines unchanged", () => {
      const input = `{"title": "Senior\\nPM"}`;
      const result = fixUnescapedNewlinesInStrings(input);
      expect(result).toBe(input);
    });

    it("handles newlines outside strings", () => {
      const input = `{
  "title": "PM"
}`;
      const result = fixUnescapedNewlinesInStrings(input);
      expect(result).toBe(input);
    });
  });

  describe("tryRepairTruncatedArray", () => {
    it("repairs truncated array by closing at last complete object", () => {
      const input = `[{"a": 1}, {"b": 2}, {"c": 3`;
      const result = tryRepairTruncatedArray(input);
      expect(result).toBe('[{"a": 1}, {"b": 2}]');
      expect(JSON.parse(result!)).toHaveLength(2);
    });

    it("returns null for non-array input", () => {
      const input = `{"a": 1}`;
      const result = tryRepairTruncatedArray(input);
      expect(result).toBeNull();
    });

    it("returns null for completely broken input", () => {
      const input = `[{"a":`;
      const result = tryRepairTruncatedArray(input);
      expect(result).toBeNull();
    });
  });

  describe("repairGeminiJson", () => {
    it("strips markdown code fences", () => {
      const input = `\`\`\`json
[{"job_title": "PM"}]
\`\`\``;
      const result = repairGeminiJson(input);
      expect(result).toBe('[{"job_title": "PM"}]');
    });

    it("strips leading text before array", () => {
      const input = `Here are the jobs:

[{"job_title": "PM"}]`;
      const result = repairGeminiJson(input);
      expect(result).toBe('[{"job_title": "PM"}]');
    });

    it("removes trailing commas", () => {
      const input = `[{"job_title": "PM",}]`;
      const result = repairGeminiJson(input);
      expect(JSON.parse(result)).toEqual([{ job_title: "PM" }]);
    });

    it("preserves valid URLs with // in them", () => {
      const input = `[{"listing_url": "https://boards.greenhouse.io/company/jobs/123", "direct_apply_link": "https://boards.greenhouse.io/company/jobs/123"}]`;
      const result = repairGeminiJson(input);
      expect(result).toContain("https://boards.greenhouse.io/company/jobs/123");
    });

    it("does NOT corrupt URLs by treating // as comments", () => {
      const input = `\`\`\`json
[
  {
    "job_title": "Product Manager",
    "company": "Acme",
    "listing_url": "https://boards.greenhouse.io/acme/jobs/123",
    "direct_apply_link": "https://boards.greenhouse.io/acme/jobs/123"
  }
]
\`\`\``;
      const result = repairGeminiJson(input);
      const parsed = JSON.parse(result);
      expect(parsed[0].listing_url).toBe("https://boards.greenhouse.io/acme/jobs/123");
      expect(parsed[0].direct_apply_link).toBe("https://boards.greenhouse.io/acme/jobs/123");
    });

    it("handles complex real-world Gemini output", () => {
      const input = `\`\`\`json
[
  {
    "job_title": "Senior Product Manager",
    "company": "TechCorp",
    "listing_url": "https://jobs.lever.co/techcorp/abc-123",
    "direct_apply_link": "https://jobs.lever.co/techcorp/abc-123"
  },
  {
    "job_title": "Product Manager",
    "company": "StartupXYZ",
    "listing_url": "https://boards.greenhouse.io/startupxyz/jobs/456",
    "direct_apply_link": "https://boards.greenhouse.io/startupxyz/jobs/456"
  }
]
\`\`\``;
      const result = repairGeminiJson(input);
      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].direct_apply_link).toBe("https://jobs.lever.co/techcorp/abc-123");
      expect(parsed[1].direct_apply_link).toBe("https://boards.greenhouse.io/startupxyz/jobs/456");
    });
  });

  describe("parseGeminiJobsOutput", () => {
    it("parses valid JSON array", () => {
      const input = `[{"job_title": "PM", "company": "Acme"}]`;
      const result = parseGeminiJobsOutput(input);
      expect(result).toEqual([{ job_title: "PM", company: "Acme" }]);
    });

    it("parses JSON with markdown fences", () => {
      const input = `\`\`\`json
[{"job_title": "PM"}]
\`\`\``;
      const result = parseGeminiJobsOutput(input);
      expect(result).toEqual([{ job_title: "PM" }]);
    });

    it("repairs and parses truncated output", () => {
      const input = `[{"job_title": "PM"}, {"job_title": "Engineer"}, {"job_title": "Desig`;
      const result = parseGeminiJobsOutput(input);
      expect(result).toHaveLength(2);
    });

    it("throws for completely invalid output", () => {
      expect(() => parseGeminiJobsOutput("not json at all")).toThrow();
    });

    it("throws for non-array JSON", () => {
      expect(() => parseGeminiJobsOutput('{"single": "object"}')).toThrow("not a JSON array");
    });
  });
});

describe("Integration: real Gemini output scenarios", () => {
  it("handles Gemini output with multiple jobs and valid URLs", () => {
    const geminiOutput = `\`\`\`json
[
  {
    "job_title": "Staff Product Manager, Card Experience",
    "company": "Affirm",
    "listing_url": "https://boards.greenhouse.io/affirm/jobs/5594191",
    "direct_apply_link": "https://boards.greenhouse.io/affirm/jobs/5594191"
  },
  {
    "job_title": "Senior Product Manager",
    "company": "Remote",
    "listing_url": "https://boards.greenhouse.io/remote/jobs/4294432007",
    "direct_apply_link": "https://boards.greenhouse.io/remote/jobs/4294432007"
  },
  {
    "job_title": "Product Manager I - Institutional Staking",
    "company": "Coinbase",
    "listing_url": "https://www.coinbase.com/careers/positions/5129653003",
    "direct_apply_link": "https://www.coinbase.com/careers/positions/5129653003"
  }
]
\`\`\``;

    const result = parseGeminiJobsOutput(geminiOutput);
    expect(result).toHaveLength(3);
    
    const jobs = result as Array<{ job_title: string; company: string; direct_apply_link: string }>;
    
    // Verify all URLs are complete and valid
    expect(jobs[0].direct_apply_link).toBe("https://boards.greenhouse.io/affirm/jobs/5594191");
    expect(jobs[1].direct_apply_link).toBe("https://boards.greenhouse.io/remote/jobs/4294432007");
    expect(jobs[2].direct_apply_link).toBe("https://www.coinbase.com/careers/positions/5129653003");
    
    // Verify no URLs are truncated
    jobs.forEach(job => {
      expect(job.direct_apply_link).not.toBe("https:");
      expect(job.direct_apply_link.length).toBeGreaterThan(20);
    });
  });

  it("handles output with trailing text after JSON", () => {
    const geminiOutput = `Here are some jobs I found:

\`\`\`json
[{"job_title": "PM", "direct_apply_link": "https://example.com/jobs/1"}]
\`\`\`

Let me know if you need more!`;

    const result = parseGeminiJobsOutput(geminiOutput);
    expect(result).toHaveLength(1);
    expect((result[0] as { direct_apply_link: string }).direct_apply_link).toBe("https://example.com/jobs/1");
  });
});
