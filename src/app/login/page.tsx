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
    <main className="min-h-screen flex items-center justify-center px-4 bg-slate-50">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900 mb-2">Mouser</h1>
        <p className="text-slate-600 text-sm mb-6">Sign in to use job search.</p>

        {authUnavailable && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-amber-900 text-sm">
            This site is running as a static copy (e.g. GitHub Pages). Sign-in requires a server. Use <strong>npm run dev</strong> locally or the Vercel deployment to sign in.
          </div>
        )}

        {(error || (isOAuthError && callbackError)) && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-red-800 text-sm space-y-2">
            {error ?? (isOAuthError ? "GitHub sign-in failed." : `Error: ${callbackError}`)}
            {isOAuthError && (
              <p className="text-xs text-red-700 mt-2">
                In GitHub: Settings → Developer settings → OAuth Apps → your app → set <strong>Authorization callback URL</strong> to exactly:{" "}
                <code className="bg-red-100 px-1 break-all">{githubCallbackUrl}</code>. In .env set <code className="bg-red-100 px-1">NEXTAUTH_URL</code> to {baseUrl} (no trailing slash).
              </p>
            )}
          </div>
        )}

        <div className="mb-4">
          <button
            type="button"
            onClick={() => signIn("github", { callbackUrl: "/" })}
            className="w-full rounded-lg bg-slate-900 px-4 py-3 font-medium text-white hover:bg-slate-800"
          >
            Sign in with GitHub
          </button>
        </div>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white px-2 text-slate-500">or</span>
          </div>
        </div>
        <form onSubmit={handleCredentials} className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  placeholder="any"
                  autoComplete="username"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  autoComplete="current-password"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-slate-900 px-4 py-3 font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
        <p className="mt-4 text-slate-500 text-xs">
          Password login works only if MOUSER_LOGIN_PASSWORD is set in .env. GitHub requires GITHUB_ID and GITHUB_SECRET.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center px-4 bg-slate-50">
        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900 mb-2">Mouser</h1>
          <p className="text-slate-600 text-sm">Loading…</p>
        </div>
      </main>
    }>
      <LoginForm />
    </Suspense>
  );
}
