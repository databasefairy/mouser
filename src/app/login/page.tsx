"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
  const isOAuthError =
    callbackError === "Callback" ||
    callbackError === "OAuthCallback" ||
    callbackError === "OAuthAccountNotLinked" ||
    callbackError === "OAuthCreateAccount";
  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const githubCallbackUrl = `${baseUrl}/api/auth/callback/github`;

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", {
      username: username || "user",
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

      {/* Logo — clear/transparent background via blend so black doesn’t show */}
      <div className="relative z-10 text-center mb-8">
        <img
          src="/logo.png"
          alt="Mouser — Hunts the job boards. Brings back the best leads."
          className="mx-auto w-full max-w-[280px] h-auto drop-shadow-lg [mix-blend-mode:lighten]"
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

        {(error || (isOAuthError && callbackError)) && (
          <div className="mb-4 rounded-lg px-3 py-2.5 text-sm text-white flex items-start gap-2" style={{ background: "#972D57" }}>
            <span className="shrink-0 mt-0.5">⚠</span>
            <div>
              {error ?? (isOAuthError ? "GitHub sign-in failed." : `Error: ${callbackError}`)}
              {isOAuthError && (
                <p className="text-xs text-white/90 mt-2">
                  Set callback URL to <code className="bg-white/20 px-1 rounded break-all">{githubCallbackUrl}</code>. Set NEXTAUTH_URL to {baseUrl}.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mb-4">
          <button
            type="button"
            onClick={() => signIn("github", { callbackUrl: "/" })}
            className="w-full rounded-xl px-4 py-3 font-medium text-white flex items-center justify-center gap-2 transition opacity-90 hover:opacity-100"
            style={{ background: "#3A2D50" }}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
            Sign in with GitHub
          </button>
        </div>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/20" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 text-white/70" style={{ background: "#2B203E" }}>or</span>
          </div>
        </div>

        <form onSubmit={handleCredentials} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-white/90 mb-1">
              Username (optional)
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-white/20 px-3 py-2.5 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#DF338C]/50"
              style={{ background: "rgba(255,255,255,0.08)" }}
              placeholder="any"
              autoComplete="username"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-white/90 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/20 px-3 py-2.5 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#DF338C]/50"
              style={{ background: "rgba(255,255,255,0.08)" }}
              autoComplete="current-password"
              required
            />
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
          Password sign-in is not enabled on this environment.
          <br />
          GitHub requires GITHUB_ID and GITHUB_SECRET.
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
          <img src="/logo.png" alt="Mouser" className="mx-auto w-full max-w-[240px] h-auto mb-4 [mix-blend-mode:lighten]" />
          <p className="text-white/80 text-sm">Loading…</p>
        </div>
      </main>
    }>
      <LoginForm />
    </Suspense>
  );
}
