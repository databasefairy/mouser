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

const cardBg = "bg-[#2B203E]/95";
const inputDark =
  "w-full min-w-0 rounded-xl border border-white/20 px-3 py-2.5 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#DF338C]/50 disabled:opacity-50 box-border";
const inputDarkBg = "bg-white/[0.08]";
const labelLight = "block text-sm font-medium text-white/90";

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
      <main
        className="min-h-screen flex items-center justify-center bg-[#26003B]"
        style={{ backgroundImage: "url('/login-bg.png')", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" }}
      >
        <p className="text-white/80">Loading…</p>
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
    <main
      className="min-h-screen relative overflow-hidden bg-[#26003B] px-4 sm:px-6 py-8 sm:py-10"
      style={{ backgroundImage: "url('/login-bg.png')", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" }}
    >
      <div className="relative z-10 max-w-4xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <img src="/logo-cat.png" alt="Mouser" className="object-contain" style={{ width: "1in", height: "1in" }} />
            <h1 className="text-xl font-semibold text-white">Mouser - Search</h1>
          </div>
          <div className="flex items-center gap-3">
            {session?.user?.name && <span className="text-sm text-white/90">{session.user.name}</span>}
            <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className="text-sm font-medium text-[#DF338C] hover:text-white/90 underline">
              Sign out
            </button>
          </div>
        </header>
        <a href={typeof process.env.NEXT_PUBLIC_API_BASE === "string" ? `${process.env.NEXT_PUBLIC_API_BASE.replace(/\/$/, "")}/api/health` : "/api/health"} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-white/60 text-xs hover:text-white/80 mb-6">
          <span className="text-white/40">›</span> Setup help
        </a>

        {/* Search criteria card */}
        <div className={`rounded-xl p-6 sm:p-8 shadow-2xl mb-6 ${cardBg}`} style={{ boxShadow: "0 0 0 1px rgba(223,51,140,0.15), 0 25px 50px -12px rgba(38,0,59,0.5)" }}>
          <h2 className="text-lg font-semibold text-white mb-6">Search criteria</h2>

          <form onSubmit={handleSubmit} className="space-y-6 w-full min-w-0">
            <section>
              <label htmlFor="targetTitles" className={labelLight}>What to search</label>
              <textarea
                id="targetTitles"
                value={targetTitlesFreeText}
                onChange={(e) => setTargetTitlesFreeText(e.target.value)}
                placeholder="e.g. Senior Product Manager, Staff Engineer, Director of Product"
                rows={3}
                className={`mt-2 ${inputDark} ${inputDarkBg}`}
                disabled={loading}
              />
            </section>

            <section className="w-full min-w-0" ref={industriesRef}>
              <span className={labelLight}>Industries</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedIndustries.map((ind) => (
                  <span key={ind} className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-sm text-white bg-white/[0.08]">
                    {ind}
                    <button type="button" onClick={() => toggleIndustry(ind)} disabled={loading} className="text-white/60 hover:text-white" aria-label="Remove">×</button>
                  </span>
                ))}
                <button type="button" onClick={() => setIndustriesOpen((o) => !o)} disabled={loading} className="inline-flex items-center gap-1 rounded-full border border-white/20 px-3 py-1.5 text-sm text-white/80 bg-white/[0.08] hover:text-white">
                  {industriesOpen ? "▲" : "▼"} Type
                </button>
              </div>
              {industriesOpen && (
                <div className="mt-2 rounded-xl border border-white/20 max-h-52 overflow-y-auto py-2 bg-[#1a1525]" style={{ background: "rgba(0,0,0,0.3)" }}>
                  {INDUSTRIES_OPTIONS.map((ind) => (
                    <label key={ind} className="flex items-center gap-2 cursor-pointer text-sm px-3 py-2 hover:bg-white/10 text-white">
                      <input type="checkbox" checked={selectedIndustries.includes(ind)} onChange={() => toggleIndustry(ind)} disabled={loading} className="rounded border-white/30" />
                      <span className="truncate">{ind}</span>
                    </label>
                  ))}
                </div>
              )}
            </section>

            <section className="w-full min-w-0" ref={companyStageRef}>
              <span className={labelLight}>Company stage</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {companyStage.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-sm text-white bg-white/[0.08]">
                    {s}
                    <button type="button" onClick={() => toggleCompanyStage(s)} disabled={loading} className="text-white/60 hover:text-white" aria-label="Remove">×</button>
                  </span>
                ))}
                <button type="button" onClick={() => setCompanyStageOpen((o) => !o)} disabled={loading} className="inline-flex items-center gap-1 rounded-full border border-white/20 px-3 py-1.5 text-sm text-white/80 bg-white/[0.08] hover:text-white">
                  {companyStageOpen ? "▲" : "▼"} Type
                </button>
              </div>
              {companyStageOpen && (
                <div className="mt-2 rounded-xl border border-white/20 max-h-52 overflow-y-auto py-2 bg-[#1a1525]">
                  {COMPANY_STAGE_OPTIONS.map((stage) => (
                    <label key={stage} className="flex items-center gap-2 cursor-pointer text-sm px-3 py-2 hover:bg-white/10 text-white">
                      <input type="checkbox" checked={companyStage.includes(stage)} onChange={() => toggleCompanyStage(stage)} disabled={loading} className="rounded border-white/30" />
                      <span className="truncate">{stage}</span>
                    </label>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className={labelLight}>Recency and volume</h3>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input id="timeWindowHours" type="number" min={1} max={720} value={timeWindowHours} onChange={(e) => setTimeWindowHours(Number(e.target.value) || 72)} className={`${inputDark} ${inputDarkBg}`} disabled={loading} placeholder="72" />
                <input id="minCompensation" type="number" min={0} step={1000} value={minCompensation} onChange={(e) => setMinCompensation(Number(e.target.value) || 0)} className={`${inputDark} ${inputDarkBg}`} disabled={loading} placeholder="180000" />
                <input id="resultCount" type="number" min={1} max={20} value={resultCount} onChange={(e) => setResultCount(Number(e.target.value) || 10)} className={`${inputDark} ${inputDarkBg}`} disabled={loading} placeholder="10" />
              </div>
            </section>

            <section>
              <h3 className={`${labelLight} flex items-center justify-between`}>
                Location filters
                {loading && <span className="text-white/50 text-xs font-normal">Searching…</span>}
              </h3>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input id="candidateZip" type="text" value={candidateZip} onChange={(e) => setCandidateZip(e.target.value)} placeholder="ZIP" className={`${inputDark} ${inputDarkBg}`} disabled={loading} />
                <input id="excludeRadiusMiles" type="number" min={0} value={excludeRadiusMiles} onChange={(e) => setExcludeRadiusMiles(Number(e.target.value) || 0)} className={`${inputDark} ${inputDarkBg}`} disabled={loading} />
              </div>
              <label className="mt-2 flex items-center gap-2 cursor-pointer text-white/90 text-sm">
                <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} disabled={loading} className="rounded border-white/30" />
                Fully remote only
              </label>
            </section>

            <section>
              <label htmlFor="resume" className={labelLight}>Optional: resume or LinkedIn (context)</label>
              <textarea id="resume" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste resume or LinkedIn text" rows={3} className={`mt-2 ${inputDark} ${inputDarkBg}`} disabled={loading} />
            </section>

            <button type="submit" disabled={loading} className="w-full rounded-xl px-4 py-3 font-semibold text-white disabled:opacity-50 transition opacity-90 hover:opacity-100 mt-2" style={{ background: "linear-gradient(90deg, #DF338C 0%, #972D57 100%)" }}>
              {loading ? "Searching…" : "Find jobs"}
            </button>
          </form>
        </div>

        {error && (
          <div className="mb-6 rounded-xl px-4 py-3 text-sm text-white flex items-center gap-2" style={{ background: "#972D57" }} role="alert">
            <span>⚠</span> {error}
          </div>
        )}

        {result && (
          <div className={`rounded-xl p-6 sm:p-8 shadow-2xl ${cardBg}`} style={{ boxShadow: "0 0 0 1px rgba(223,51,140,0.15), 0 25px 50px -12px rgba(38,0,59,0.5)" }}>
            <h2 className="text-lg font-semibold text-white mb-4">Jobs for you</h2>
            {result.jobs && result.jobs.length > 0 ? (
              <>
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-sm text-left text-white">
                    <thead>
                      <tr className="border-b border-white/20">
                        <th className="px-4 py-3 font-semibold text-white/90">Job Title</th>
                        <th className="px-4 py-3 font-semibold text-white/90">Company</th>
                        <th className="px-4 py-3 font-semibold text-white/90">Industry</th>
                        <th className="px-4 py-3 font-semibold text-white/90">Posted</th>
                        <th className="px-4 py-3 font-semibold text-white/90">Compensation</th>
                        <th className="px-4 py-3 font-semibold text-white/90">Type</th>
                        <th className="px-4 py-3 font-semibold text-white/90">Remote</th>
                        <th className="px-4 py-3 font-semibold text-white/90">Apply</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.jobs.map((job, i) => (
                        <tr key={i} className="border-b border-white/10 hover:bg-white/5">
                          <td className="px-4 py-3 font-medium">{job.jobTitle}</td>
                          <td className="px-4 py-3"><span className="text-[#c4b5fd]">{job.company}</span></td>
                          <td className="px-4 py-3">{job.industry || "—"}</td>
                          <td className="px-4 py-3">{job.postedDate || "—"}</td>
                          <td className="px-4 py-3 max-w-[10rem]">{job.compensation || "—"}</td>
                          <td className="px-4 py-3">{job.employmentType || "—"}</td>
                          <td className="px-4 py-3">{job.remoteConfirmation || "—"}</td>
                          <td className="px-4 py-3">
                            <a href={job.applicationLink} target="_blank" rel="noopener noreferrer" className="text-[#DF338C] hover:text-white font-medium">
                              Apply →
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-4 text-white/60 text-sm">Showing up to {result.jobs.length} results.</p>
              </>
            ) : result.jobsText ? (
              <div className="text-white/90 whitespace-pre-wrap text-sm">
                {result.jobsText.split("\n").map((line, i) => {
                  const linkMatch = line.match(/\[?(https?:\/\/[^\s\]\)]+)\]?/);
                  if (linkMatch) {
                    const url = linkMatch[1];
                    const before = line.slice(0, linkMatch.index);
                    const after = line.slice((linkMatch.index ?? 0) + linkMatch[0].length);
                    return <span key={i}>{before}<a href={url} target="_blank" rel="noopener noreferrer" className="text-[#DF338C] underline">{url}</a>{after}{"\n"}</span>;
                  }
                  return <span key={i}>{line}{"\n"}</span>;
                })}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
