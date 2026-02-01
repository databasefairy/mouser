# Mouser

Production-ready **stateless job search** app. Returns the **top N jobs most likely to call an applicant back**, with **verified direct apply links** only. Paste your resume or LinkedIn profile; the app uses **Gemini with Google Search** to discover real job postings and return a ranked list with links to apply.

## How it works

1. **Stateless:** No stored user inputs, resume, or prior results. Each run uses only the current input payload.
2. **Inputs:** top_n, industries, zip_code, radius_miles, remote_only, salary_min, titles, posted_within_days, optional resume_text and resume_file (PDF/DOCX). Resume used only for ranking; never stored.
3. **Tools:** Google Search, fetch_url (SSRF-safe), classify_url (page_type). Verification: only whitelisted domains and apply_flow or listing-with-apply accepted. Output: job_title, company, salary, callback_likelihood_score, score_rationale, resume_match_summary, listing_url, listing_url_classification, direct_apply_link, direct_apply_classification, notes. API returns query_used (resume_provided), results, excluded_counts (including bad_classification), missing_info. **Security:** SSRF blocklist; rate limit per IP; zod (resume_text max 40k); fetch_url timeout/redirects/bytes.

## Setup

1. **Clone and install**

   ```bash
   cd mouser
   npm install
   ```

2. **Configure Gemini**

   Copy `.env.example` to `.env` and set your API key:

   ```bash
   cp .env.example .env
   # Edit .env and set GEMINI_API_KEY=... or GOOGLE_API_KEY=...
   ```

   Get an API key at [Google AI Studio](https://aistudio.google.com/apikey).

3. **Run the app**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). Set search criteria (industries, titles, salary min, remote only, etc.), optionally add **resume text** or **resume file** (PDF/DOCX, max 2MB). Click **Find jobs**. Use **Dry run** to return generated prompts without verification (for debugging).

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` or `GOOGLE_API_KEY` | Yes | Your Gemini/Google API key. Get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). |
| `NEXTAUTH_SECRET` | Yes (for login) | Secret for NextAuth sessions. Generate with `openssl rand -base64 32`. |
| `NEXTAUTH_URL` | Yes (for login) | Full URL of your app: local `http://localhost:3000`, production `https://mouser-inky.vercel.app` (no trailing slash). |
| `GITHUB_ID` / `GITHUB_SECRET` | No | GitHub OAuth app credentials for "Sign in with GitHub". Create at [GitHub OAuth Apps](https://github.com/settings/developers). |
| `MOUSER_LOGIN_PASSWORD` | No | If set, users can sign in with any username + this password (for testing). |

## Login

The app uses **NextAuth.js**. You must sign in before using job search.

1. **Required:** Set `NEXTAUTH_SECRET` (e.g. `openssl rand -base64 32`) and `NEXTAUTH_URL` (e.g. `http://localhost:3000`) in `.env`.
2. **Option A – GitHub:** Create a [GitHub OAuth App](https://github.com/settings/developers) and set `GITHUB_ID` and `GITHUB_SECRET` in `.env`. Callback URL: `http://localhost:3000/api/auth/callback/github` (and your production URL when deployed).
3. **Option B – Password:** Set `MOUSER_LOGIN_PASSWORD` in `.env`. Users can sign in with any username and that password.

On first visit you'll be redirected to `/login`. After signing in you can use job search; **Sign out** is in the top-right.

**GitHub OAuth not working?**

1. **Callback URL must match exactly.** In [GitHub OAuth Apps](https://github.com/settings/developers) → your app → **Authorization callback URL**, set it to exactly:
   - Local: `http://localhost:3000/api/auth/callback/github` (no trailing slash; use your port if not 3000).
   - Production (this app): `https://mouser-inky.vercel.app/api/auth/callback/github`.
2. **Vercel env:** `NEXTAUTH_URL` must be exactly `https://mouser-inky.vercel.app` (no trailing slash). Local: `http://localhost:3000`.
3. **Secrets:** Regenerate the OAuth app **Client secret** on GitHub if unsure; then set the new value in `GITHUB_SECRET`.
4. If it still fails, try again after a failed sign-in—the login page will show the exact callback URL your app expects so you can copy it into GitHub.

**Getting a 404 after clicking "Sign in with GitHub"?**

The app's **API routes** (including `/api/auth/callback/github`) only exist when the app runs on a **Node server**. They do **not** exist when the site is served as a **static export** (e.g. from GitHub Pages).

- **If you're on GitHub Pages:** Sign-in will 404 after GitHub redirects back. Use **Vercel** (or another Node host) for the full app, or run **`npm run dev`** locally to sign in.
- **If you're on localhost:** Make sure you're running **`npm run dev`** (not opening a static `out/` build). Restart the dev server and try again.
- **If you're on Vercel:** Open [https://mouser-inky.vercel.app/api/auth/status](https://mouser-inky.vercel.app/api/auth/status). If you get **404** there, the API routes aren't deployed (check build logs, redeploy). If you get **200**, auth routes exist; then check that `NEXTAUTH_URL` in Vercel is exactly `https://mouser-inky.vercel.app` (no trailing slash) and that the GitHub OAuth app's callback URL is `https://mouser-inky.vercel.app/api/auth/callback/github`.

## API key

Set **`GEMINI_API_KEY`** or **`GOOGLE_API_KEY`** in `.env` (or in your host's environment). The app uses whichever is set. Get a key at [Google AI Studio](https://aistudio.google.com/apikey).

## Using a GitHub secret when deploying

- **Runtime:** The app reads `GEMINI_API_KEY` or `GOOGLE_API_KEY` from the environment.
- **Deploy:** Add `GEMINI_API_KEY` under **Settings → Secrets and variables → Actions**, and in your deploy workflow set the env var from the secret (see `.github/workflows/deploy.yml`). Set the same key in Vercel (or your host) so the running app has it.
- **Manual:** Or set `GEMINI_API_KEY` or `GOOGLE_API_KEY` in Vercel (or your host) once.

## Use Vercel instead of GitHub Pages

**Yes — you use the Vercel link as your app.** Once deployed, open that URL. For this project the app URL is **https://mouser-inky.vercel.app**. Login and job search work there because Vercel runs the full app (API routes and auth).

1. **Deploy to Vercel**
   - Go to [vercel.com](https://vercel.com) and sign in (e.g. with GitHub).
   - **Add New Project** → **Import** your `mouser` repo.
   - Leave build settings as default (Next.js). Click **Deploy**. Wait for the first deploy to finish.

2. **Set environment variables**
   - In the Vercel project: **Settings → Environment Variables**.
   - Add these (use your own values):

   | Variable | Value |
   |----------|--------|
   | `GEMINI_API_KEY` or `GOOGLE_API_KEY` | Your Gemini API key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
   | `NEXTAUTH_SECRET` | e.g. run `openssl rand -base64 32` locally |
   | `NEXTAUTH_URL` | `https://mouser-inky.vercel.app` (no trailing slash) |
   | `GITHUB_ID` | GitHub OAuth App **Client ID** |
   | `GITHUB_SECRET` | GitHub OAuth App **Client secret** |

   Optional: `MOUSER_LOGIN_PASSWORD` for password sign-in.

3. **GitHub OAuth callback**
   - In [GitHub OAuth Apps](https://github.com/settings/developers) → your app → **Authorization callback URL**, set to exactly:  
     **`https://mouser-inky.vercel.app/api/auth/callback/github`**

4. **Redeploy**
   - **Deployments** → ⋮ on the latest → **Redeploy**. After that, use the Vercel link for the app; login and APIs work there.

You can ignore GitHub Pages if you only use Vercel. If you use both, the GitHub Pages site is static (no login); the Vercel link is the one with full app and auth.

Other hosts (Netlify, Railway, etc.): same idea — set the env vars there and use that host's URL as `NEXTAUTH_URL` and for the GitHub callback.

## Deploy to GitHub Pages (for testing)

The app can be deployed as a **static site** to GitHub Pages. The UI is served from GitHub Pages; the **job search API** must be hosted elsewhere (e.g. Vercel) because GitHub Pages only serves static files.

1. **Enable GitHub Pages**
   - In your repo: **Settings → Pages**.
   - Under **Build and deployment**, set **Source** to **GitHub Actions**.

2. **Optional: make job search work on the Pages site**
   - Deploy the full app to **Vercel** first (so `/api/search-jobs` and `/api/health` work there).
   - In the repo: **Settings → Secrets and variables → Actions → Variables**.
   - Add a variable: **Name** `NEXT_PUBLIC_API_BASE`, **Value** `https://mouser-inky.vercel.app`. No trailing slash.
   - The workflow will use this when building; the static site on GitHub Pages will call your Vercel app for job search.

3. **Push to `main`**
   - The workflow `.github/workflows/pages.yml` runs on push to `main`, builds a static export, and deploys it to GitHub Pages.
   - Your site will be at `https://<username>.github.io/mouser/` (or your repo's Pages URL).

If you don't set `NEXT_PUBLIC_API_BASE`, the Pages site will load but **Find top 10 jobs** will fail (no API). Set it to a Vercel (or other) URL where the API is deployed to get job search on the Pages site.

## Stateless Job Search (home page)

All job search is **stateless** and lives on the **home page** [(/)](http://localhost:3000). Login is optional (e.g. for rate-limit exemption).

- **API:** `POST /api/search-jobs` — uses **Gemini** with Google Search and custom **fetch_url** / **classify_url** tools to verify direct-apply links.
- **Inputs (validated with Zod):** `top_n`, `industries`, `zip_code`, `radius_miles`, `remote_only`, `salary_min`, `titles[]`, `posted_within_days`.
- **Behavior:** Stateless (no conversation history). The agent uses Google Search for discovery and must call `fetch_url(url)` to verify every job's `direct_apply_link`. Only whitelisted domains and active links are returned. Results are deduped and include callback score, salary, and excluded counts.
- **Rate limit:** In-memory per IP (10 requests per minute).
- **Setup:** Set `GEMINI_API_KEY` or `GOOGLE_API_KEY` in `.env`.

Open [http://localhost:3000](http://localhost:3000), set your criteria, and click **Find jobs**.

## Tech

- **Next.js 15** (App Router) + **React 19** + TypeScript + Tailwind
- **Gemini** (@google/genai) with Google Search, **fetch_url**, **classify_url**
- **lib:** `search-jobs/gemini-agent.ts`, `search-jobs/fetch-url.ts`, `search-jobs/classify-url.ts`, `search-jobs/dedupe.ts`, `ssrf.ts`, `resumeExtract.ts` (PDF + DOCX via pdf-parse, mammoth)
- **Tests:** Vitest — `src/lib/ssrf.test.ts`, `src/lib/search-jobs/dedupe.test.ts`
