import { NextResponse } from "next/server";

/**
 * GET /api/auth/status
 * Helps debug auth/404: confirms auth routes exist and env vars are set (no secrets).
 */
export async function GET() {
  const nextAuthUrl = process.env.NEXTAUTH_URL ?? "";
  const hasSecret = Boolean(process.env.NEXTAUTH_SECRET);
  const hasGitHub = Boolean(process.env.GITHUB_ID && process.env.GITHUB_SECRET);
  const hasPassword = Boolean(process.env.MOUSER_LOGIN_PASSWORD);

  return NextResponse.json({
    ok: true,
    message: "Auth API is running. If you still get 404 on sign-in, see below.",
    auth: {
      nextAuthUrl: nextAuthUrl || "(not set)",
      nextAuthUrlSet: Boolean(nextAuthUrl),
      hasSecret,
      hasGitHub,
      hasPassword,
    },
    callbackUrl: nextAuthUrl ? `${nextAuthUrl.replace(/\/$/, "")}/api/auth/callback/github` : null,
  });
}
