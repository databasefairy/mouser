"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authUnavailable, setAuthUnavailable] = useState(false);

  useEffect(() => {
    const base = typeof process.env.NEXT_PUBLIC_API_BASE === "string" ? process.env.NEXT_PUBLIC_API_BASE.replace(/\/$/, "") : "";
    const url = base ? `${base}/api/auth/providers` : "/api/auth/providers";
    fetch(url, { method: "GET", credentials: "same-origin" })
      .then((r) => { if (r.status === 404) setAuthUnavailable(true); })
      .catch(() => setAuthUnavailable(true));
  }, []);

  const callbackError = searchParams.get("error");

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim()) {
      setError("Username is required.");
      return;
    }
    setLoading(true);
    const res = await signIn("credentials", {
      username: username.trim(),
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid username or password.");
      return;
    }
    if (res?.ok) window.location.href = "/";
  }

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden bg-[#26003B]"
      style={{
        backgroundImage: "url('/login-bg.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >

      {/* Logo — reactive, slightly wider than login box; centered on card */}
      <div className="relative z-10 w-full max-w-sm mx-auto mb-8 overflow-visible flex justify-center">
        <img
          src="/logo.png"
          alt="Mouser — Hunts the job boards. Brings back the best leads."
          className="h-auto drop-shadow-lg [mix-blend-mode:lighten] object-contain w-[calc(100%+2rem)] max-w-[calc(100%+2rem)] block"
        />
      </div>

      {/* Login card */}
      <div
        className="relative z-10 w-full max-w-sm rounded-xl p-8 shadow-2xl"
        style={{
          background: "#2B203E",
          boxShadow: "0 0 0 1px rgba(223, 51, 140, 0.15), 0 25px 50px -12px rgba(38, 0, 59, 0.6)",
        }}
      >
        {authUnavailable && (
          <div className="mb-4 rounded-lg px-3 py-2 text-sm text-white flex items-center gap-2" style={{ background: "#972D57" }}>
            <span className="shrink-0">⚠</span>
            This site is running as a static copy. Use <strong>npm run dev</strong> or the Vercel deployment to sign in.
          </div>
        )}

        {(error || callbackError) && (
          <div className="mb-4 rounded-lg px-3 py-2.5 text-sm text-white flex items-start gap-2" style={{ background: "#972D57" }}>
            <span className="shrink-0 mt-0.5">⚠</span>
            <div>
              {error ?? `Error: ${callbackError}`}
            </div>
          </div>
        )}

        <form onSubmit={handleCredentials} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-white/90 mb-1">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-white/20 px-3 py-2.5 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#DF338C]/50"
              style={{ background: "rgba(255,255,255,0.08)" }}
              placeholder="username"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-white/90 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-white/20 px-3 py-2.5 pr-10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#DF338C]/50"
                style={{ background: "rgba(255,255,255,0.08)" }}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#DF338C]/50"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl px-4 py-3 font-semibold text-white disabled:opacity-50 transition opacity-90 hover:opacity-100"
            style={{ background: "linear-gradient(90deg, #DF338C 0%, #972D57 100%)" }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-white/60 text-xs text-center">
          Contact admin for login credentials.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main
        className="min-h-screen flex items-center justify-center px-4 bg-[#26003B]"
        style={{
          backgroundImage: "url('/login-bg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div className="w-full max-w-sm rounded-xl p-8 text-center text-white" style={{ background: "#2B203E" }}>
          <img src="/logo.png" alt="Mouser" className="h-auto mb-4 mx-auto [mix-blend-mode:lighten] object-contain w-[calc(100%+2rem)] max-w-[calc(100%+2rem)] block" />
          <p className="text-white/80 text-sm">Loading…</p>
        </div>
      </main>
    }>
      <LoginForm />
    </Suspense>
  );
}
