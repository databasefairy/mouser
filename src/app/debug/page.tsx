"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";

type RawJob = {
  job_title?: string;
  company?: string;
  direct_apply_link?: string;
  listing_url?: string;
  salary?: {
    min?: number;
    max?: number;
    currency?: string;
    period?: string;
    is_estimated?: boolean;
  };
  location?: string;
  verified?: boolean;
};

type SearchResponse = {
  query_used: Record<string, unknown>;
  results: unknown[];
  excluded_counts: Record<string, number>;
  missing_info: string[];
  raw_phase1_response?: string;
};

const cardBg = "bg-[#2B203E]/95";
const inputDark =
  "w-full min-w-0 rounded-xl border border-white/20 px-3 py-2.5 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#DF338C]/50 box-border";
const inputDarkBg = "bg-white/[0.08]";
const labelLight = "block text-sm font-medium text-white/90";

function isAdminProfile(session: { user?: { id?: string | null; role?: string | null } } | null): boolean {
  const role = session?.user?.role || session?.user?.id;
  return role === "admin";
}

export default function DebugPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isAdmin = isAdminProfile(session as { user?: { id?: string | null; role?: string | null } } | null);

  // Redirect non-admin users
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    } else if (status === "authenticated" && !isAdmin) {
      router.replace("/");
    }
  }, [status, isAdmin, router]);

  const [titles, setTitles] = useState<string[]>(["Product Manager"]);
  const [newTitle, setNewTitle] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(true);
  const [topN, setTopN] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const [parsedJobs, setParsedJobs] = useState<RawJob[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  function addTitle() {
    const t = newTitle.trim();
    if (t && !titles.includes(t)) {
      setTitles((prev) => [...prev, t]);
      setNewTitle("");
    }
  }

  function removeTitle(t: string) {
    setTitles((prev) => prev.filter((x) => x !== t));
  }

  function parseRawResponse(raw: string): RawJob[] {
    try {
      // Strip markdown code fences if present
      let json = raw.trim();
      const codeBlock = json.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlock?.[1]) json = codeBlock[1].trim();
      
      // Find JSON array
      const start = json.indexOf("[");
      const end = json.lastIndexOf("]");
      if (start !== -1 && end !== -1) {
        json = json.slice(start, end + 1);
      }
      
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) {
        return parsed as RawJob[];
      }
      return [];
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Failed to parse JSON");
      return [];
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRawResponse(null);
    setParsedJobs([]);
    setParseError(null);
    setLoading(true);

    try {
      const payload = {
        top_n: topN,
        remote_only: remoteOnly,
        titles: titles.length > 0 ? titles : undefined,
        posted_within_days: 7,
        salary_min: 0,
      };

      const res = await fetch("/api/search-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin",
      });

      const json = (await res.json()) as SearchResponse;

      if (!res.ok) {
        setError((json as { error?: string }).error || `Request failed (${res.status})`);
        return;
      }

      if (json.raw_phase1_response) {
        setRawResponse(json.raw_phase1_response);
        const jobs = parseRawResponse(json.raw_phase1_response);
        setParsedJobs(jobs);
      } else {
        setError("No raw_phase1_response in response. Make sure you're logged in with the limitless password.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#26003B]">
        <p className="text-white/80">Loading...</p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#26003B]">
        <p className="text-white/80">Access denied. Redirecting...</p>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen relative overflow-hidden bg-[#26003B] px-4 sm:px-6 py-8 sm:py-10"
      style={{ backgroundImage: "url('/login-bg.png')", backgroundSize: "cover", backgroundPosition: "center" }}
    >
      <div className="relative z-10 max-w-6xl mx-auto">
        <header className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <img src="/logo-cat.png" alt="Mouser" className="object-contain" style={{ width: "0.75in", height: "0.75in" }} />
            <div className="flex flex-col gap-0.5">
              <h1 className="text-xl font-semibold text-white">Debug: Raw Gemini Results</h1>
              <span className="text-white/50 text-xs">Limitless only - shows raw Phase 1 response</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm text-[#DF338C] hover:text-white underline">
              ← Back to Search
            </Link>
            <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className="text-sm font-medium text-white/70 hover:text-white">
              Sign out
            </button>
          </div>
        </header>

        {/* Search Form */}
        <div className={`rounded-xl p-6 shadow-2xl mb-6 ${cardBg}`}>
          <h2 className="text-lg font-semibold text-white mb-4">Quick Search</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="top_n" className={labelLight}>Results to request</label>
                <input
                  id="top_n"
                  type="number"
                  min={1}
                  max={20}
                  value={topN}
                  onChange={(e) => setTopN(Number(e.target.value) || 10)}
                  className={`${inputDark} ${inputDarkBg} mt-1`}
                  disabled={loading}
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer text-white/90 text-sm pb-2">
                  <input
                    type="checkbox"
                    checked={remoteOnly}
                    onChange={(e) => setRemoteOnly(e.target.checked)}
                    disabled={loading}
                    className="rounded border-white/30"
                  />
                  Remote only
                </label>
              </div>
            </div>

            <div>
              <label className={labelLight}>Titles</label>
              <div className="mt-2 flex flex-wrap gap-2 items-center">
                {titles.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-sm text-white">
                    {t}
                    <button type="button" onClick={() => removeTitle(t)} disabled={loading} className="hover:text-[#DF338C]">×</button>
                  </span>
                ))}
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTitle())}
                  placeholder="Add title"
                  className={`${inputDark} ${inputDarkBg} max-w-[200px]`}
                  disabled={loading}
                />
                <button type="button" onClick={addTitle} className="rounded-xl px-3 py-2 text-sm text-white bg-white/20 hover:bg-white/30" disabled={loading}>
                  Add
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl px-4 py-3 font-semibold text-white disabled:opacity-50 transition"
              style={{ background: "linear-gradient(90deg, #DF338C 0%, #972D57 100%)" }}
            >
              {loading ? "Searching..." : "Search & Show Raw Results"}
            </button>
          </form>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl px-4 py-3 text-sm text-white" style={{ background: "#972D57" }}>
            <p>⚠ {error}</p>
          </div>
        )}

        {/* Results */}
        {parsedJobs.length > 0 && (
          <div className={`rounded-xl p-6 shadow-2xl mb-6 ${cardBg}`}>
            <h2 className="text-lg font-semibold text-white mb-4">
              Raw Gemini Results ({parsedJobs.length} jobs)
              {parseError && <span className="text-red-400 text-sm ml-2">Parse warning: {parseError}</span>}
            </h2>
            <p className="text-white/60 text-xs mb-4">
              These are the raw results from Gemini BEFORE server-side verification and filtering.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-white">
                <thead>
                  <tr className="border-b border-white/20">
                    <th className="px-3 py-2 font-semibold text-white/90">#</th>
                    <th className="px-3 py-2 font-semibold text-white/90">Job Title</th>
                    <th className="px-3 py-2 font-semibold text-white/90">Company</th>
                    <th className="px-3 py-2 font-semibold text-white/90">Location</th>
                    <th className="px-3 py-2 font-semibold text-white/90">Salary</th>
                    <th className="px-3 py-2 font-semibold text-white/90">Verified</th>
                    <th className="px-3 py-2 font-semibold text-white/90">URL</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedJobs.map((job, i) => {
                    const url = job.direct_apply_link || job.listing_url || "";
                    const salaryStr = job.salary
                      ? `${job.salary.min ? `$${job.salary.min.toLocaleString()}` : "?"}–${job.salary.max ? `$${job.salary.max.toLocaleString()}` : "?"}${job.salary.is_estimated ? " (est)" : ""}`
                      : "—";
                    return (
                      <tr key={i} className="border-b border-white/10 hover:bg-white/5">
                        <td className="px-3 py-2 text-white/50">{i + 1}</td>
                        <td className="px-3 py-2 font-medium">{job.job_title || "—"}</td>
                        <td className="px-3 py-2 text-[#c4b5fd]">{job.company || "—"}</td>
                        <td className="px-3 py-2 text-white/70">{job.location || "—"}</td>
                        <td className="px-3 py-2">{salaryStr}</td>
                        <td className="px-3 py-2">
                          {job.verified === true ? (
                            <span className="text-green-400">✓</span>
                          ) : job.verified === false ? (
                            <span className="text-red-400">✗</span>
                          ) : (
                            <span className="text-white/40">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 max-w-xs">
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#DF338C] hover:text-white text-xs break-all"
                            >
                              {url.length > 60 ? url.slice(0, 60) + "..." : url}
                            </a>
                          ) : (
                            <span className="text-white/40">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Raw JSON */}
        {rawResponse && (
          <div className={`rounded-xl p-6 shadow-2xl ${cardBg}`}>
            <details>
              <summary className="text-lg font-semibold text-white cursor-pointer mb-4">
                Raw JSON Response (click to expand)
              </summary>
              <pre className="mt-2 p-4 rounded-lg bg-black/30 text-xs text-white/80 overflow-x-auto whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
                {rawResponse}
              </pre>
            </details>
          </div>
        )}
      </div>
    </main>
  );
}
