"use client";

import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const INDUSTRIES_OPTIONS = [
  "Artificial Intelligence / Machine Learning",
  "SaaS (B2B or B2C)",
  "Fintech",
  "Healthtech",
  "Cybersecurity",
  "Developer Tools",
  "Data / Analytics",
  "Cloud Infrastructure",
  "E-commerce",
  "EdTech",
  "Marketplace Platforms",
  "Enterprise Software",
  "Web3 / Blockchain",
  "GovTech",
  "InsurTech",
  "HR Tech",
];

const COMPANY_STAGE_OPTIONS = [
  "Series A",
  "Series B",
  "Series C",
  "Late-stage startup",
  "Public company",
];

const DEFAULT_TARGET_TITLES =
  "Senior Product Manager, Staff Product Manager, Principal Product Manager, Director of Product, Head of Product, VP of Product";

type JobRow = {
  jobTitle: string;
  company: string;
  industry: string;
  postedDate: string;
  compensation: string;
  employmentType: string;
  remoteConfirmation: string;
  applicationLink: string;
};

type Result = {
  jobs?: JobRow[];
  jobsText?: string;
  citations?: Array<{ url: string; title?: string }>;
};

const inputClass =
  "w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-50 box-border";
const labelClass = "block text-sm font-medium text-slate-700";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const [timeWindowHours, setTimeWindowHours] = useState(72);
  const [minCompensation, setMinCompensation] = useState(180_000);
  const [remoteOnly, setRemoteOnly] = useState(true);
  const [candidateZip, setCandidateZip] = useState("30062");
  const [excludeRadiusMiles, setExcludeRadiusMiles] = useState(15);
  const [resultCount, setResultCount] = useState(10);
  const [targetTitlesFreeText, setTargetTitlesFreeText] = useState(DEFAULT_TARGET_TITLES);
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([
    "Artificial Intelligence / Machine Learning",
    "SaaS (B2B or B2C)",
    "Fintech",
  ]);
  const [companyStage, setCompanyStage] = useState<string[]>([
    "Series B",
    "Series C",
    "Late-stage startup",
    "Public company",
  ]);
  const [industriesOpen, setIndustriesOpen] = useState(false);
  const [companyStageOpen, setCompanyStageOpen] = useState(false);
  const industriesRef = useRef<HTMLDivElement>(null);
  const companyStageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (industriesRef.current && !industriesRef.current.contains(e.target as Node)) setIndustriesOpen(false);
      if (companyStageRef.current && !companyStageRef.current.contains(e.target as Node)) setCompanyStageOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-slate-600">Loading…</p>
      </main>
    );
  }

  function toggleIndustry(industry: string) {
    setSelectedIndustries((prev) =>
      prev.includes(industry) ? prev.filter((i) => i !== industry) : [...prev, industry]
    );
  }
  function toggleCompanyStage(stage: string) {
    setCompanyStage((prev) =>
      prev.includes(stage) ? prev.filter((s) => s !== stage) : [...prev, stage]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    const trimmed = input.trim();
    setLoading(true);
    const apiBase = typeof process.env.NEXT_PUBLIC_API_BASE === "string" ? process.env.NEXT_PUBLIC_API_BASE.replace(/\/$/, "") : "";
    const body: Record<string, unknown> = {
      timeWindowHours,
      minCompensation,
      remoteOnly,
      candidateZip: candidateZip.trim() || "30062",
      excludeRadiusMiles,
      resultCount,
      targetTitles: targetTitlesFreeText.trim() || DEFAULT_TARGET_TITLES,
      selectedIndustries: selectedIndustries.length > 0 ? selectedIndustries : ["Artificial Intelligence / Machine Learning", "SaaS (B2B or B2C)", "Fintech"],
      companyStage: companyStage.length > 0 ? companyStage : ["Series B", "Series C", "Late-stage startup", "Public company"],
    };
    if (trimmed) body.resume = trimmed;
    try {
      const res = await fetch(`${apiBase}/api/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
    <main className="w-full max-w-[min(42rem,100%)] sm:max-w-2xl lg:max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 box-border">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Mouser
        </h1>
        <div className="flex items-center gap-3">
          {session?.user?.name && (
            <span className="text-sm text-slate-600">{session.user.name}</span>
          )}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm font-medium text-slate-600 hover:text-slate-900 underline"
          >
            Sign out
          </button>
        </div>
      </div>
      <p className="text-slate-600 mb-8">
        Search for remote jobs by target titles and industries. Results are filtered by recency, compensation, and direct apply links.
      </p>
      <p className="text-slate-500 text-sm mb-6">
        Not connecting? Run <code className="bg-slate-100 px-1 rounded">npm run dev</code>, add <code className="bg-slate-100 px-1 rounded">OPENAI_API_KEY</code> to <code className="bg-slate-100 px-1 rounded">.env</code>, and check <a href={typeof process.env.NEXT_PUBLIC_API_BASE === "string" ? `${process.env.NEXT_PUBLIC_API_BASE.replace(/\/$/, "")}/api/health` : "/api/health"} target="_blank" rel="noopener noreferrer" className="underline">/api/health</a>.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6 w-full min-w-0">
        <section className="space-y-2 w-full min-w-0">
          <label htmlFor="targetTitles" className={labelClass}>
            Target job titles (comma-separated or descriptive)
          </label>
          <textarea
            id="targetTitles"
            value={targetTitlesFreeText}
            onChange={(e) => setTargetTitlesFreeText(e.target.value)}
            placeholder="e.g. Senior Product Manager, Staff Engineer, Director of Product"
            rows={3}
            className={inputClass}
            disabled={loading}
          />
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full min-w-0">
          <div className="min-w-0">
            <label htmlFor="timeWindowHours" className={labelClass}>Posted within (hours)</label>
            <input
              id="timeWindowHours"
              type="number"
              min={1}
              max={720}
              value={timeWindowHours}
              onChange={(e) => setTimeWindowHours(Number(e.target.value) || 72)}
              className={inputClass}
              disabled={loading}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="minCompensation" className={labelClass}>Min compensation ($)</label>
            <input
              id="minCompensation"
              type="number"
              min={0}
              step={1000}
              value={minCompensation}
              onChange={(e) => setMinCompensation(Number(e.target.value) || 0)}
              className={inputClass}
              disabled={loading}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="resultCount" className={labelClass}>Result count</label>
            <input
              id="resultCount"
              type="number"
              min={1}
              max={20}
              value={resultCount}
              onChange={(e) => setResultCount(Number(e.target.value) || 10)}
              className={inputClass}
              disabled={loading}
            />
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="candidateZip" className={labelClass}>Your ZIP code</label>
            <input
              id="candidateZip"
              type="text"
              value={candidateZip}
              onChange={(e) => setCandidateZip(e.target.value)}
              placeholder="30062"
              className={inputClass}
              disabled={loading}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="excludeRadiusMiles" className={labelClass}>Exclude offices within (miles)</label>
            <input
              id="excludeRadiusMiles"
              type="number"
              min={0}
              value={excludeRadiusMiles}
              onChange={(e) => setExcludeRadiusMiles(Number(e.target.value) || 0)}
              className={inputClass}
              disabled={loading}
            />
          </div>
        </section>

        <section>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={remoteOnly}
              onChange={(e) => setRemoteOnly(e.target.checked)}
              disabled={loading}
              className="rounded border-slate-300"
            />
            <span className={labelClass}>Fully remote only (exclude hybrid/onsite)</span>
          </label>
        </section>

        <section className="w-full min-w-0" ref={industriesRef}>
          <span className={labelClass}>Industries (select one or more)</span>
          <div className="mt-2 relative w-full min-w-0">
            <button
              type="button"
              onClick={() => setIndustriesOpen((o) => !o)}
              disabled={loading}
              className={`${inputClass} text-left flex items-center justify-between gap-2`}
            >
              <span className="truncate">
                {selectedIndustries.length === 0
                  ? "Select industries…"
                  : selectedIndustries.length === 1
                    ? selectedIndustries[0]
                    : `${selectedIndustries.length} industries selected`}
              </span>
              <span className="shrink-0 text-slate-500" aria-hidden>{industriesOpen ? "▲" : "▼"}</span>
            </button>
            {industriesOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto py-2">
                {INDUSTRIES_OPTIONS.map((ind) => (
                  <label
                    key={ind}
                    className="flex items-center gap-2 cursor-pointer text-sm px-3 py-2 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIndustries.includes(ind)}
                      onChange={() => toggleIndustry(ind)}
                      disabled={loading}
                      className="rounded border-slate-300"
                    />
                    <span className="truncate">{ind}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="w-full min-w-0" ref={companyStageRef}>
          <span className={labelClass}>Company stage (select one or more)</span>
          <div className="mt-2 relative w-full min-w-0">
            <button
              type="button"
              onClick={() => setCompanyStageOpen((o) => !o)}
              disabled={loading}
              className={`${inputClass} text-left flex items-center justify-between gap-2`}
            >
              <span className="truncate">
                {companyStage.length === 0
                  ? "Select company stages…"
                  : companyStage.length === 1
                    ? companyStage[0]
                    : `${companyStage.length} stages selected`}
              </span>
              <span className="shrink-0 text-slate-500" aria-hidden>{companyStageOpen ? "▲" : "▼"}</span>
            </button>
            {companyStageOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-white border border-slate-300 rounded-lg shadow-lg max-h-52 overflow-y-auto py-2">
                {COMPANY_STAGE_OPTIONS.map((stage) => (
                  <label
                    key={stage}
                    className="flex items-center gap-2 cursor-pointer text-sm px-3 py-2 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={companyStage.includes(stage)}
                      onChange={() => toggleCompanyStage(stage)}
                      disabled={loading}
                      className="rounded border-slate-300"
                    />
                    <span className="truncate">{stage}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-2 w-full min-w-0">
          <label htmlFor="resume" className={labelClass}>
            Optional: resume or LinkedIn profile (for context)
          </label>
          <textarea
            id="resume"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste resume or LinkedIn text for additional context"
            rows={4}
            className={inputClass}
            disabled={loading}
          />
        </section>

        <button
          type="submit"
          disabled={loading}
          className="w-full min-w-0 rounded-lg bg-slate-900 px-4 py-3 font-medium text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Searching…" : "Find jobs"}
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
            Jobs for you
          </h2>
          {result.jobs && result.jobs.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-slate-800">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200">
                      <th className="px-4 py-3 font-semibold text-slate-900">Job Title</th>
                      <th className="px-4 py-3 font-semibold text-slate-900">Company</th>
                      <th className="px-4 py-3 font-semibold text-slate-900">Industry</th>
                      <th className="px-4 py-3 font-semibold text-slate-900">Posted</th>
                      <th className="px-4 py-3 font-semibold text-slate-900">Compensation</th>
                      <th className="px-4 py-3 font-semibold text-slate-900">Type</th>
                      <th className="px-4 py-3 font-semibold text-slate-900">Remote</th>
                      <th className="px-4 py-3 font-semibold text-slate-900">Apply</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.jobs.map((job, i) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium">{job.jobTitle}</td>
                        <td className="px-4 py-3">{job.company}</td>
                        <td className="px-4 py-3">{job.industry || "—"}</td>
                        <td className="px-4 py-3">{job.postedDate || "—"}</td>
                        <td className="px-4 py-3 max-w-[12rem]">{job.compensation || "—"}</td>
                        <td className="px-4 py-3">{job.employmentType || "—"}</td>
                        <td className="px-4 py-3">{job.remoteConfirmation || "—"}</td>
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
