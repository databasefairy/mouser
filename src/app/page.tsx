"use client";

import { useState } from "react";

type JobRow = {
  jobTitle: string;
  company: string;
  applicationLink: string;
  probabilityOfCallback: number;
};

type Result = {
  jobs?: JobRow[];
  jobsText?: string;
  citations?: Array<{ url: string; title?: string }>;
};

export default function Home() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    const trimmed = input.trim();
    if (!trimmed) {
      setError("Paste your resume or LinkedIn profile text.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: trimmed }),
      });
      let data: Result | { error?: string };
      try {
        data = await res.json();
      } catch {
        setError(res.ok ? "Invalid response from server." : `Server error (${res.status}). Check terminal and .env.`);
        return;
      }
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Search failed.");
        return;
      }
      setResult(data as Result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error.";
      setError(msg.includes("fetch") || msg.includes("Failed to fetch") ? "Could not reach the app. Is the dev server running? Run: npm run dev" : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">
        Mouser
      </h1>
      <p className="text-slate-600 mb-8">
        Paste your resume or LinkedIn profile. We’ll search the web and return the top 10 jobs most likely to respond, with links to apply.
      </p>
      <p className="text-slate-500 text-sm mb-6">
        Not connecting? Run <code className="bg-slate-100 px-1 rounded">npm run dev</code>, add <code className="bg-slate-100 px-1 rounded">OPENAI_API_KEY</code> to <code className="bg-slate-100 px-1 rounded">.env</code>, and check <a href="/api/health" target="_blank" rel="noopener noreferrer" className="underline">/api/health</a>.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label htmlFor="input" className="block text-sm font-medium text-slate-700">
          Resume or LinkedIn profile
        </label>
        <textarea
          id="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste your resume or LinkedIn profile text here…"
          rows={10}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-slate-900 px-4 py-3 font-medium text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Searching…" : "Find top 10 jobs"}
        </button>
      </form>

      {error && (
        <div className="mt-6 rounded-lg bg-red-100 border-2 border-red-500 px-4 py-3 text-red-900 text-sm font-medium" role="alert">
          {error}
        </div>
      )}

      {result && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Top 10 jobs for you
          </h2>
          {result.jobs && result.jobs.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-slate-800">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200">
                      <th className="px-4 py-3 font-semibold text-slate-900">Job Title</th>
                      <th className="px-4 py-3 font-semibold text-slate-900">Company</th>
                      <th className="px-4 py-3 font-semibold text-slate-900">Application link</th>
                      <th className="px-4 py-3 font-semibold text-slate-900">Probability of callback</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.jobs.map((job, i) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium">{job.jobTitle}</td>
                        <td className="px-4 py-3">{job.company}</td>
                        <td className="px-4 py-3">
                          <a
                            href={job.applicationLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-700 underline hover:text-slate-900 break-all"
                          >
                            Apply
                          </a>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium">{job.probabilityOfCallback}/10</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : result.jobsText ? (
            <div className="rounded-lg border border-slate-200 bg-white p-6 text-slate-800 whitespace-pre-wrap">
              {result.jobsText.split("\n").map((line, i) => {
                const linkMatch = line.match(/\[?(https?:\/\/[^\s\]\)]+)\]?/);
                if (linkMatch) {
                  const url = linkMatch[1];
                  const before = line.slice(0, linkMatch.index);
                  const after = line.slice((linkMatch.index ?? 0) + linkMatch[0].length);
                  return (
                    <span key={i}>
                      {before}
                      <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
                        {url}
                      </a>
                      {after}
                      {"\n"}
                    </span>
                  );
                }
                return <span key={i}>{line}{"\n"}</span>;
              })}
            </div>
          ) : null}
        </section>
      )}
    </main>
  );
}
