"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { INDUSTRIES_LIST } from "@/lib/search-jobs/schema";

type Classification = { page_type: string; confidence: number; reasons: string[] };

type JobResult = {
  job_title: string;
  company: string;
  salary?: { min?: number; max?: number; currency?: string; period?: string; is_estimated?: boolean };
  callback_likelihood_score: number;
  score_rationale?: string[];
  resume_match_summary?: string;
  listing_url?: string;
  listing_url_classification?: Classification;
  direct_apply_link: string;
  direct_apply_classification?: Classification;
  notes?: string[];
};

type ExcludedCounts = {
  not_active?: number;
  not_direct_apply?: number;
  below_salary_min?: number;
  outside_filters?: number;
  duplicate?: number;
  not_whitelisted?: number;
  bad_classification?: number;
};

type SearchResponse = {
  query_used: Record<string, unknown>;
  results: JobResult[];
  excluded_counts: ExcludedCounts;
  missing_info: string[];
  /** Limitless only: raw Gemini Phase 1 response before repair/parse (for debugging truncation/format). */
  raw_phase1_response?: string;
};

const cardBg = "bg-[#2B203E]/95";
const inputDark =
  "w-full min-w-0 rounded-xl border border-white/20 px-3 py-2.5 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#DF338C]/50 box-border";
const inputDarkBg = "bg-white/[0.08]";
const labelLight = "block text-sm font-medium text-white/90";

/** Check if user is an admin (unlimited + debug + admin panel) */
function isAdminProfile(session: { user?: { id?: string | null; role?: string | null } } | null): boolean {
  const role = session?.user?.role || session?.user?.id;
  return role === "admin";
}

export default function Home() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isAdmin = isAdminProfile(session as { user?: { id?: string | null; role?: string | null } } | null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  // If session stays "loading" too long (e.g. missing NEXTAUTH_SECRET or API unreachable), send user to login
  useEffect(() => {
    if (status !== "loading") return;
    const t = setTimeout(() => router.replace("/login"), 2000);
    return () => clearTimeout(t);
  }, [status, router]);

  const [topN, setTopN] = useState(10);
  const [industries, setIndustries] = useState<string[]>([]);
  const [zipCode, setZipCode] = useState("");
  const [radiusMiles, setRadiusMiles] = useState(25);
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [salaryMin, setSalaryMin] = useState(0);
  const [titles, setTitles] = useState<string[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [postedWithinDays, setPostedWithinDays] = useState(3);
  const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [dryRun, setDryRun] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchStatus, setSearchStatus] = useState<string>("");
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [progressCount, setProgressCount] = useState(0);
  const [progressStats, setProgressStats] = useState<{ looked_at: number; dead_links: number; excluded_other: number }>({ looked_at: 0, dead_links: 0, excluded_other: 0 });
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<{ parse_error?: string; raw_preview?: string } | null>(null);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [industriesOpen, setIndustriesOpen] = useState(false);
  const industriesRef = useRef<HTMLDivElement>(null);
  const hasSetLimitlessDefaults = useRef(false);
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const notifyEnabledRef = useRef(false); // Ref to access in async callback

  // Default form values for admin profile: Product Manager titles, remote only, salary above 50k
  useEffect(() => {
    if (!isAdmin || hasSetLimitlessDefaults.current) return;
    hasSetLimitlessDefaults.current = true;
    setTitles(["Product Manager", "Technical Product Manager", "Senior Product Manager"]);
    setRemoteOnly(true);
    setSalaryMin(50_000);
  }, [isAdmin]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (industriesRef.current && !industriesRef.current.contains(e.target as Node)) setIndustriesOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function startProgressAnimation(target: number) {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    const safeTarget = Math.max(0, target);
    let current = 0;
    setProgressCount(0);
    if (safeTarget === 0) return;
    progressTimerRef.current = setInterval(() => {
      current += 1;
      setProgressCount(current);
      if (current >= safeTarget) {
        if (progressTimerRef.current) clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    }, 120);
  }

  function toggleIndustry(industry: string) {
    setIndustries((prev) =>
      prev.includes(industry) ? prev.filter((i) => i !== industry) : [...prev, industry]
    );
  }

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

  async function fileToBase64(file: File): Promise<{ base64: string; mime: string }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.includes(",") ? result.split(",")[1]! : result;
        resolve({ base64, mime: file.type || "application/octet-stream" });
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      alert("This browser does not support notifications");
      return;
    }
    
    if (Notification.permission === "granted") {
      setNotifyEnabled(true);
      notifyEnabledRef.current = true;
    } else if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        setNotifyEnabled(true);
        notifyEnabledRef.current = true;
      }
    } else {
      alert("Notifications are blocked. Please enable them in your browser settings.");
    }
  }

  function sendNotification(jobCount: number) {
    if (!notifyEnabledRef.current) return;
    
    try {
      new Notification("Mouser Search Complete", {
        body: `Found ${jobCount} verified job listing${jobCount !== 1 ? "s" : ""}!`,
        icon: "/logo-cat.png",
      });
    } catch {
      // Notification failed, ignore
    }
    
    // Reset for next search
    setNotifyEnabled(false);
    notifyEnabledRef.current = false;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorDetails(null);
    setData(null);
    setLoading(true);
    setStatusLog([]);
    setProgressCount(0);
    setProgressStats({ looked_at: 0, dead_links: 0, excluded_other: 0 });
    // Don't reset notifyEnabled here - user may have already clicked it
    const logStatus = (msg: string) => {
      setSearchStatus(msg);
      setStatusLog((prev) => [...prev, msg]);
    };
    logStatus("🧭 Preparing search request...");

    const longWaitMessages = [
      "⏳ Patience. The good ones hide.",
      "🧭 Covering more ground.",
      "🔍 Tracking leads.",
      "🧹 Filtering out dead leads.",
      "📈 Calculating call back score.",
    ];
    let longWaitIndex = 0;
    const longWaitInterval = setInterval(() => {
      const msg = longWaitMessages[longWaitIndex % longWaitMessages.length]!;
      longWaitIndex += 1;
      logStatus(msg);
    }, 30_000);
    
    const apiBase = typeof process.env.NEXT_PUBLIC_API_BASE === "string" ? process.env.NEXT_PUBLIC_API_BASE.replace(/\/$/, "") : "";
    try {
      const payload: Record<string, unknown> = {
        top_n: topN,
        industries: industries.length > 0 ? industries : undefined,
        ...(remoteOnly ? {} : { zip_code: zipCode || undefined, radius_miles: radiusMiles }),
        remote_only: remoteOnly,
        salary_min: salaryMin,
        titles: titles.length > 0 ? titles : undefined,
        posted_within_days: postedWithinDays,
        resume_text: resumeText.trim() || undefined,
        ...(isAdmin && dryRun ? { dry_run: true } : {}),
      };
      if (resumeFile) {
        logStatus("📎 Encoding resume file...");
        const { base64, mime } = await fileToBase64(resumeFile);
        payload.resume_file_base64 = base64;
        payload.resume_file_mime = mime;
      }
      payload.stream = true;
      logStatus("🐈‍⬛ Hunting for jobs...");
      const res = await fetch(`${apiBase}/api/search-jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin",
      });
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream") && res.body) {
        logStatus("🧩 Listening for results...");
        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        const handleChunk = (chunk: string) => {
          const lines = chunk.split("\n");
          let eventName = "message";
          let dataLine = "";
          for (const line of lines) {
            if (line.startsWith("event:")) eventName = line.replace("event:", "").trim();
            if (line.startsWith("data:")) dataLine += line.replace("data:", "").trim();
          }
          if (!dataLine) return;
          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(dataLine) as Record<string, unknown>;
          } catch {
            return;
          }
          if (eventName === "status" && typeof data.message === "string") {
            logStatus(data.message);
          } else if (eventName === "progress" && typeof data.found === "number") {
            setProgressCount(data.found);
            if (typeof data.looked_at === "number" || typeof data.dead_links === "number" || typeof data.excluded_other === "number") {
              setProgressStats({
                looked_at: typeof data.looked_at === "number" ? data.looked_at : 0,
                dead_links: typeof data.dead_links === "number" ? data.dead_links : 0,
                excluded_other: typeof data.excluded_other === "number" ? data.excluded_other : 0,
              });
            }
          } else if (eventName === "done") {
            const responseData = data as unknown as SearchResponse;
            setData(responseData);
            const jobCount = Array.isArray(responseData.results) ? responseData.results.length : 0;
            setProgressCount(jobCount);
            logStatus(`✅ Found ${jobCount} verified listings.`);
            sendNotification(jobCount);
          } else if (eventName === "error") {
            const errMsg = typeof data.message === "string" ? data.message : "Server error.";
            setError(errMsg);
            logStatus(`⚠️ ${errMsg}`);
          }
        };
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) handleChunk(part);
        }
        return;
      }
      logStatus("✅ Fresh jobs caught...");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (json as { error?: string }).error;
        const errMsg = msg && msg.trim() ? msg : `Request failed (${res.status}).`;
        setError(errMsg);
        logStatus(`⚠️ ${errMsg}`);
        const details = json as { parse_error?: string; raw_preview?: string };
        setErrorDetails({ parse_error: details.parse_error, raw_preview: details.raw_preview });
        return;
      }
      logStatus("🧩 Processing results...");
      const responseData = json as SearchResponse;
      setData(responseData);
      const jobCount = Array.isArray(responseData.results) ? responseData.results.length : 0;
      logStatus(`✅ Found ${jobCount} verified listings.`);
      startProgressAnimation(jobCount);
      sendNotification(jobCount);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Network error.";
      setError(errMsg);
      logStatus(`⚠️ ${errMsg}`);
      setErrorDetails(null);
    } finally {
      clearInterval(longWaitInterval);
      setSearchStatus("");
      setLoading(false);
    }
  }

  if (status === "loading" || status === "unauthenticated") {
    return (
      <main
        className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#26003B]"
        style={{ backgroundImage: "url('/login-bg.png')", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" }}
      >
        <p className="text-white/80">{status === "unauthenticated" ? "Redirecting to login…" : "Loading…"}</p>
        <Link href="/login" className="text-[#DF338C] hover:text-white/90 font-medium underline">
          Sign in
        </Link>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen relative overflow-hidden bg-[#26003B] px-4 sm:px-6 py-8 sm:py-10"
      style={{ backgroundImage: "url('/login-bg.png')", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" }}
    >
      <div className="relative z-10 max-w-4xl mx-auto">
        <header className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <img src="/logo-cat.png" alt="Mouser" className="object-contain" style={{ width: "1in", height: "1in" }} />
            <div className="flex flex-col gap-0.5">
              <h1 className="text-xl font-semibold text-white">Mouser</h1>
              <span className="text-white/50 text-xs">Stateless job search</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {session?.user?.name && <span className="text-sm text-white/90">{session.user.name}</span>}
            {session ? (
              <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className="text-sm font-medium text-[#DF338C] hover:text-white/90 underline">
                Sign out
              </button>
            ) : (
              <Link href="/login" className="text-sm font-medium text-[#DF338C] hover:text-white/90 underline">
                Sign in
              </Link>
            )}
          </div>
        </header>

        {isAdmin && (
          <div className="flex items-center gap-4 mb-6">
            <Link href="/admin" className="inline-flex items-center gap-1 text-yellow-400/80 text-xs hover:text-yellow-300">
              <span className="text-yellow-400/60">›</span> Admin Panel
            </Link>
            <Link href="/debug" className="inline-flex items-center gap-1 text-white/60 text-xs hover:text-white/80">
              <span className="text-white/40">›</span> Debug: Raw Results
            </Link>
            <a href={typeof process.env.NEXT_PUBLIC_API_BASE === "string" ? `${process.env.NEXT_PUBLIC_API_BASE.replace(/\/$/, "")}/api/health` : "/api/health"} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-white/60 text-xs hover:text-white/80">
              <span className="text-white/40">›</span> Setup help
            </a>
          </div>
        )}

        <div className={`rounded-xl p-6 sm:p-8 shadow-2xl mb-6 ${cardBg}`} style={{ boxShadow: "0 0 0 1px rgba(223,51,140,0.15), 0 25px 50px -12px rgba(38,0,59,0.5)" }}>
          <h2 className="text-lg font-semibold text-white mb-6">Search criteria</h2>
          <form onSubmit={handleSubmit} className="space-y-6 w-full min-w-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="top_n" className={labelLight}>Top N results</label>
                <input
                  id="top_n"
                  type="number"
                  min={1}
                  max={50}
                  value={topN}
                  onChange={(e) => setTopN(Number(e.target.value) || 10)}
                  className={`${inputDark} ${inputDarkBg} mt-1`}
                  disabled={loading}
                />
              </div>
              <div>
                <label htmlFor="posted_within_days" className={labelLight}>Posted within (days)</label>
                <input
                  id="posted_within_days"
                  type="number"
                  min={1}
                  max={30}
                  value={postedWithinDays}
                  onChange={(e) => setPostedWithinDays(Number(e.target.value) || 3)}
                  className={`${inputDark} ${inputDarkBg} mt-1`}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="w-full min-w-0" ref={industriesRef}>
              <span className={labelLight}>Industries</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {industries.map((ind) => (
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
                  <button type="button" onClick={() => setIndustries(industries.length === INDUSTRIES_LIST.length ? [] : [...INDUSTRIES_LIST])} disabled={loading} className="w-full flex items-center gap-2 text-sm px-3 py-2 hover:bg-white/10 text-white/90 font-medium">
                    {industries.length === INDUSTRIES_LIST.length ? "Deselect all" : "Select all"}
                  </button>
                  {INDUSTRIES_LIST.map((industry) => (
                    <label key={industry} className="flex items-center gap-2 cursor-pointer text-sm px-3 py-2 hover:bg-white/10 text-white">
                      <input type="checkbox" checked={industries.includes(industry)} onChange={() => toggleIndustry(industry)} disabled={loading} className="rounded border-white/30" />
                      <span className="truncate">{industry}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className={labelLight}>Titles (add multiple)</label>
              <div className="mt-2 flex flex-wrap gap-2 items-center">
                {titles.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-sm text-white">
                    {t}
                    <button type="button" onClick={() => removeTitle(t)} disabled={loading} className="hover:text-[#DF338C]" aria-label={`Remove ${t}`}>×</button>
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

            <div>
              <h3 className={`${labelLight} flex items-center justify-between`}>
                Location filters
                {loading && <span className="text-white/50 text-xs font-normal">Searching…</span>}
              </h3>
              <label className="mt-2 flex items-center gap-2 cursor-pointer text-white/90 text-sm">
                <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} disabled={loading} className="rounded border-white/30" />
                Remote only
              </label>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input id="zip_code" type="text" value={zipCode} onChange={(e) => setZipCode(e.target.value)} placeholder="ZIP" className={`${inputDark} ${inputDarkBg}`} disabled={loading || remoteOnly} aria-hidden={remoteOnly} />
                <input id="radius_miles" type="number" min={0} value={radiusMiles} onChange={(e) => setRadiusMiles(Number(e.target.value) || 0)} className={`${inputDark} ${inputDarkBg}`} disabled={loading || remoteOnly} aria-hidden={remoteOnly} />
              </div>
              {remoteOnly && <p className="mt-1 text-white/50 text-xs">Zip and radius are ignored when remote only is selected.</p>}
            </div>

            <div>
              <label htmlFor="salary_min" className={labelLight}>Salary min</label>
              <input id="salary_min" type="number" min={0} value={salaryMin} onChange={(e) => setSalaryMin(Number(e.target.value) || 0)} className={`${inputDark} ${inputDarkBg} mt-1`} disabled={loading} />
            </div>

            <div>
              <label htmlFor="resume_text" className={labelLight}>Resume (optional)</label>
              <textarea
                id="resume_text"
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder="Paste resume or LinkedIn text for better ranking and match scoring"
                rows={5}
                className={`mt-1 ${inputDark} ${inputDarkBg}`}
                disabled={loading}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
                  className="text-white/90 text-sm file:mr-2 file:rounded file:border-0 file:bg-white/20 file:px-3 file:py-1.5 file:text-white"
                  disabled={loading}
                />
                {resumeFile && <span className="text-white/70 text-sm">{resumeFile.name}</span>}
              </div>
              <p className="mt-1 text-white/50 text-xs">Used only for this search run. Not saved.</p>
            </div>

            {isAdmin && (
              <label className="flex items-center gap-2 cursor-pointer text-white/90 text-sm">
                <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} disabled={loading} className="rounded border-white/30" />
                Dry run (return generated queries only, no verification)
              </label>
            )}

            {/* Stats and progress bar - visible during and after search */}
            {(loading || progressStats.looked_at > 0 || progressCount > 0) && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap justify-center gap-4 text-xs">
                  <span className="text-white/70">
                    <span className="text-white/90 font-medium">{progressStats.looked_at}</span> jobs found
                  </span>
                  <span className="text-red-400/80">
                    <span className="font-medium">{progressStats.dead_links}</span> dead links
                  </span>
                  <span className="text-yellow-400/80">
                    <span className="font-medium">{progressStats.excluded_other}</span> unverified
                  </span>
                  <span className="text-green-400/80">
                    <span className="font-medium">{progressCount}</span> verified
                  </span>
                </div>
                <div className="w-full">
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden relative">
                    {/* Animated background for activity indication */}
                    {loading && progressCount === 0 && (
                      <div 
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-[#DF338C]/30 to-transparent"
                        style={{ animation: 'shimmer 1.5s infinite' }}
                      />
                    )}
                    <div
                      className="h-full rounded-full bg-[#DF338C] transition-all duration-300 relative z-10"
                      style={{ width: `${Math.min(100, (progressCount / Math.max(1, topN)) * 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-white/50 text-center">
                    {progressCount} of {topN} verified listings
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button type="submit" disabled={loading} className="flex-1 rounded-xl px-4 py-3 font-semibold text-white disabled:opacity-50 transition opacity-90 hover:opacity-100" style={{ background: "linear-gradient(90deg, #DF338C 0%, #972D57 100%)" }}>
                {loading ? searchStatus || "Searching…" : "Find jobs"}
              </button>
              
              {loading && (
                <button
                  type="button"
                  onClick={enableNotifications}
                  disabled={notifyEnabled}
                  className={`rounded-xl px-4 py-3 font-semibold transition ${
                    notifyEnabled 
                      ? "bg-green-600/80 text-white cursor-default" 
                      : "bg-white/20 text-white hover:bg-white/30"
                  }`}
                >
                  {notifyEnabled ? "🔔 On" : "🔔 Notify me"}
                </button>
              )}
            </div>
            
            {loading && (
              <div className="mt-4 text-center">
                <span className="text-white/80 text-sm">We&apos;re searching the whole internet for the perfect job for you, this may take a while....</span>
              </div>
            )}
          </form>
        </div>

        {error && (
          <div className="mb-6 rounded-xl px-4 py-3 text-sm text-white" style={{ background: "#972D57" }} role="alert">
            <p className="flex items-center gap-2">
              <span>⚠</span> {error}
            </p>
            {isAdmin && (
              <details className="mt-3 text-white/90">
                <summary className="cursor-pointer font-medium">Response details (for debugging)</summary>
                {errorDetails?.parse_error != null && (
                  <p className="mt-1 text-xs font-mono">Parse error: {errorDetails.parse_error}</p>
                )}
                {errorDetails?.raw_preview != null && (
                  <pre className="mt-2 p-2 rounded bg-black/20 text-xs overflow-x-auto whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                    {errorDetails.raw_preview}
                  </pre>
                )}
                {errorDetails != null && errorDetails.parse_error == null && errorDetails.raw_preview == null && (
                  <p className="mt-1 text-xs text-white/70">No debug info in response. Sign in as admin to see parse_error/raw_preview.</p>
                )}
              </details>
            )}
          </div>
        )}

        {data && (() => {
          const results = Array.isArray(data.results) ? data.results : [];
          const isDryRun = data.query_used?.dry_run === true;
          const hasExcluded = Object.entries(data.excluded_counts || {}).some(([, v]) => typeof v === "number" && v > 0);
          return (
          <div className={`rounded-xl p-6 sm:p-8 shadow-2xl ${cardBg}`} style={{ boxShadow: "0 0 0 1px rgba(223,51,140,0.15), 0 25px 50px -12px rgba(38,0,59,0.5)" }}>
            <h2 className="text-lg font-semibold text-white mb-4">Results ({results.length})</h2>
            {Array.isArray(data.missing_info) && data.missing_info.length > 0 && (
              <p className="text-white/70 text-sm mb-4">{data.missing_info.join(" ")}</p>
            )}
            <p className="text-white/60 text-xs mb-4">
              Excluded: {(() => {
                const entries = Object.entries(data.excluded_counts || {}).filter(([, v]) => typeof v === "number" && v > 0);
                if (entries.length === 0) return "none";
                return entries.map(([k, v]) => `${k}=${v}`).join(", ");
              })()}
            </p>
            {isAdmin && data.raw_phase1_response != null && (
              <details className="mb-4 text-sm text-white/90">
                <summary className="cursor-pointer font-medium select-none">Phase 1 raw response (before repair/parse)</summary>
                <pre className="mt-2 p-3 rounded-lg bg-black/20 text-xs overflow-x-auto whitespace-pre-wrap break-words max-h-64 overflow-y-auto border border-white/10">
                  {data.raw_phase1_response}
                </pre>
              </details>
            )}
            {isAdmin && results.length === 0 && !isDryRun && data.raw_phase1_response != null && (
              <p className="text-white/60 text-xs mb-4">Phase 1 returned jobs but all were excluded after verification. Check Excluded counts above and Phase 1 raw response for details.</p>
            )}
            {results.length === 0 && !isDryRun ? (
              <div className="text-white/70 space-y-2">
                <p>No jobs matched after verification and filters.</p>
                {hasExcluded ? (
                  <p className="text-white/60 text-xs">
                    Jobs were excluded by: not_direct_apply (incomplete or invalid apply URL, e.g. only "https:"), not_active (apply link 404/410), not_whitelisted (domain not allowed), bad_classification, duplicate, or invalid shape. Try again; if not_direct_apply is high, the model may be truncating URLs—we are working on improving this.
                  </p>
                ) : (
                  <p className="text-white/60 text-xs">Model returned no jobs. Try again or broaden search criteria (industries, titles).</p>
                )}
              </div>
            ) : isDryRun ? (
              <div className="space-y-4 text-sm text-white/90">
                <p className="font-medium">Dry run: generated prompts (no verification run).</p>
                <pre className="rounded-lg bg-white/5 p-4 whitespace-pre-wrap break-words text-xs overflow-x-auto">
                  {typeof (data as unknown as { generated_instructions?: string }).generated_instructions === "string"
                    ? (data as unknown as { generated_instructions: string }).generated_instructions?.slice(0, 3000) + "\n..."
                    : ""}
                </pre>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm text-left text-white">
                  <thead>
                    <tr className="border-b border-white/20">
                      <th className="px-4 py-3 font-semibold text-white/90">Job Title</th>
                      <th className="px-4 py-3 font-semibold text-white/90">Company</th>
                      <th className="px-4 py-3 font-semibold text-white/90">Estimated Salary</th>
                      <th className="px-4 py-3 font-semibold text-white/90">Call Back Score</th>
                      <th className="px-4 py-3 font-semibold text-white/90">Application link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((job, i) => (
                      <tr key={i} className="border-b border-white/10 hover:bg-white/5">
                        <td className="px-4 py-3 align-top font-medium">{job.job_title}</td>
                        <td className="px-4 py-3 align-top"><span className="text-[#c4b5fd]">{job.company}</span></td>
                        <td className="px-4 py-3 align-top">
                          {job.salary && (job.salary.min != null || job.salary.max != null)
                            ? (() => {
                                const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: job.salary?.currency || "USD", maximumFractionDigits: 0 });
                                const min = job.salary.min != null ? fmt(job.salary.min) : null;
                                const max = job.salary.max != null ? fmt(job.salary.max) : null;
                                const range = min && max ? `${min} – ${max}` : min || max || "";
                                const period = job.salary.period ? `/${job.salary.period === "yearly" ? "yr" : job.salary.period}` : "";
                                return (
                                  <span className={job.salary.is_estimated ? "text-white/70" : ""}>
                                    {range}{period}
                                    {job.salary.is_estimated && <span className="ml-1 text-white/50 text-xs">(est.)</span>}
                                  </span>
                                );
                              })()
                            : <span className="text-white/40">—</span>}
                        </td>
                        <td className="px-4 py-3 align-top font-medium">{job.callback_likelihood_score}</td>
                        <td className="px-4 py-3 align-top">
                          {job.direct_apply_link && job.direct_apply_link.startsWith("http") && !job.direct_apply_link.includes("localhost") ? (
                            <div className="flex flex-col gap-1">
                              <a href={job.direct_apply_link} target="_blank" rel="noopener noreferrer" className="text-[#DF338C] hover:text-white font-medium">
                                Apply →
                              </a>
                              {job.notes && job.notes.length > 0 && (
                                <>
                                  {/* Page type labels */}
                                  {job.notes.filter(n => 
                                    n.startsWith("📋") || n.startsWith("✅") || n.startsWith("🔍") || 
                                    n.startsWith("🏢") || n.startsWith("📰") || n.startsWith("❓")
                                  ).map((note, i) => (
                                    <span key={`type-${i}`} className="inline-flex items-center gap-1 text-xs text-green-400/90 font-medium">{note}</span>
                                  ))}
                                  {/* Warning notes */}
                                  {job.notes.filter(n => n.startsWith("⚠️")).map((note, i) => (
                                    <span key={`warn-${i}`} className="text-yellow-400/80 text-xs">{note}</span>
                                  ))}
                                  {/* Info notes */}
                                  {job.notes.filter(n => n.startsWith("ℹ️")).map((note, i) => (
                                    <span key={`info-${i}`} className="text-blue-400/70 text-xs">{note}</span>
                                  ))}
                                </>
                              )}
                            </div>
                          ) : (
                            <span className="text-white/50">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          );
        })()}
      </div>
    </main>
  );
}
