# Mouser

Web app that finds the **top 10 jobs most likely to respond** when you apply. Paste your resume or LinkedIn profile; the app uses **OpenAI’s Responses API with web search** to discover real job postings and return a ranked list with links to apply.

## How it works

1. You paste your resume or LinkedIn profile text.
2. The app calls OpenAI’s **Responses API** with the **web_search** tool.
3. The model searches the web for matching jobs and returns a ranked list of 10 jobs with direct application links.

## Setup

1. **Clone and install**

   ```bash
   cd mouser
   npm install
   ```

2. **Configure OpenAI**

   Copy `.env.example` to `.env` and set your API key:

   ```bash
   cp .env.example .env
   # Edit .env and set OPENAI_API_KEY=sk-...
   ```

   Get an API key from [OpenAI API keys](https://platform.openai.com/api-keys).

3. **Run the app**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000), paste your resume or LinkedIn text, and click **Find top 10 jobs**.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | Your OpenAI API key. |
| `OPENAI_JOB_MODEL` | No | Model for job search (default: `gpt-4o`). Must support web search in the Responses API (e.g. `gpt-4o`, `gpt-4o-mini`). |
| `NEXTAUTH_SECRET` | Yes (for login) | Secret for NextAuth sessions. Generate with `openssl rand -base64 32`. |
| `NEXTAUTH_URL` | Yes (for login) | Full URL of your app: local `http://localhost:3000`, production `https://mouser-inky.vercel.app` (no trailing slash). |
| `GITHUB_ID` / `GITHUB_SECRET` | No | GitHub OAuth app credentials for “Sign in with GitHub”. Create at [GitHub OAuth Apps](https://github.com/settings/developers). |
| `MOUSER_LOGIN_PASSWORD` | No | If set, users can sign in with any username + this password (for testing). |

## Login

The app uses **NextAuth.js**. You must sign in before using job search.

1. **Required:** Set `NEXTAUTH_SECRET` (e.g. `openssl rand -base64 32`) and `NEXTAUTH_URL` (e.g. `http://localhost:3000`) in `.env`.
2. **Option A – GitHub:** Create a [GitHub OAuth App](https://github.com/settings/developers) and set `GITHUB_ID` and `GITHUB_SECRET` in `.env`. Callback URL: `http://localhost:3000/api/auth/callback/github` (and your production URL when deployed).
3. **Option B – Password:** Set `MOUSER_LOGIN_PASSWORD` in `.env`. Users can sign in with any username and that password.

On first visit you’ll be redirected to `/login`. After signing in you can use job search; **Sign out** is in the top-right.

**GitHub OAuth not working?**

1. **Callback URL must match exactly.** In [GitHub OAuth Apps](https://github.com/settings/developers) → your app → **Authorization callback URL**, set it to exactly:
   - Local: `http://localhost:3000/api/auth/callback/github` (no trailing slash; use your port if not 3000).
   - Production (this app): `https://mouser-inky.vercel.app/api/auth/callback/github`.
2. **Vercel env:** `NEXTAUTH_URL` must be exactly `https://mouser-inky.vercel.app` (no trailing slash). Local: `http://localhost:3000`.
3. **Secrets:** Regenerate the OAuth app **Client secret** on GitHub if unsure; then set the new value in `GITHUB_SECRET`.
4. If it still fails, try again after a failed sign-in—the login page will show the exact callback URL your app expects so you can copy it into GitHub.

**Getting a 404 after clicking “Sign in with GitHub”?**

The app’s **API routes** (including `/api/auth/callback/github`) only exist when the app runs on a **Node server**. They do **not** exist when the site is served as a **static export** (e.g. from GitHub Pages).

- **If you’re on GitHub Pages:** Sign-in will 404 after GitHub redirects back. Use **Vercel** (or another Node host) for the full app, or run **`npm run dev`** locally to sign in.
- **If you’re on localhost:** Make sure you’re running **`npm run dev`** (not opening a static `out/` build). Restart the dev server and try again.
- **If you’re on Vercel:** Open [https://mouser-inky.vercel.app/api/auth/status](https://mouser-inky.vercel.app/api/auth/status). If you get **404** there, the API routes aren’t deployed (check build logs, redeploy). If you get **200**, auth routes exist; then check that `NEXTAUTH_URL` in Vercel is exactly `https://mouser-inky.vercel.app` (no trailing slash) and that the GitHub OAuth app’s callback URL is `https://mouser-inky.vercel.app/api/auth/callback/github`.

## API key: both ways

The app reads the key in two ways (it tries in order):

1. **Environment variable** – `OPENAI_API_KEY` from the process environment.  
   - **Local:** Set in `.env` (one line, e.g. `OPENAI_API_KEY="sk-proj-..."`) or let your host inject it.  
   - **Deployed:** Set in the host’s env (e.g. Vercel → Settings → Environment Variables). You can paste the same value you store in a GitHub secret.

2. **Key file** – If the env var is missing or too short (&lt; 50 chars), the app reads from **`.env.openai_key`** in the project root: one line, key only, no variable name.  
   - Use this when `.env` truncates the key (e.g. line breaks).  
   - File is in `.gitignore`; never commit it.

So: **local** = `.env` or `.env.openai_key`; **deployed** = set `OPENAI_API_KEY` in the host. The app works both ways with no code changes.

## Using a GitHub secret when deploying

- **Runtime:** The app does *not* read GitHub Secrets at runtime. It only reads `OPENAI_API_KEY` from the environment (or `.env.openai_key` locally).
- **Deploy:** To use your GitHub secret for the **deployed** app, pass it into the deploy step so the host gets it. Add `OPENAI_API_KEY` under **Settings → Secrets and variables → Actions**, then in your deploy workflow set the env var from the secret (see `.github/workflows/deploy.yml` if you use the example workflow). The host (e.g. Vercel) then has the key for the running app.
- **Manual:** Or set `OPENAI_API_KEY` in Vercel (or your host) once and paste the same value as your GitHub secret.

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
   | `OPENAI_API_KEY` | Your OpenAI API key |
   | `NEXTAUTH_SECRET` | e.g. run `openssl rand -base64 32` locally |
   | `NEXTAUTH_URL` | `https://mouser-inky.vercel.app` (no trailing slash) |
   | `GITHUB_ID` | GitHub OAuth App **Client ID** |
   | `GITHUB_SECRET` | GitHub OAuth App **Client secret** |

   Optional: `MOUSER_LOGIN_PASSWORD` for password sign-in; `OPENAI_JOB_MODEL` to change the model.

3. **GitHub OAuth callback**
   - In [GitHub OAuth Apps](https://github.com/settings/developers) → your app → **Authorization callback URL**, set to exactly:  
     **`https://mouser-inky.vercel.app/api/auth/callback/github`**

4. **Redeploy**
   - **Deployments** → ⋮ on the latest → **Redeploy**. After that, use the Vercel link for the app; login and APIs work there.

You can ignore GitHub Pages if you only use Vercel. If you use both, the GitHub Pages site is static (no login); the Vercel link is the one with full app and auth.

Other hosts (Netlify, Railway, etc.): same idea — set the env vars there and use that host’s URL as `NEXTAUTH_URL` and for the GitHub callback.

## Deploy to GitHub Pages (for testing)

The app can be deployed as a **static site** to GitHub Pages. The UI is served from GitHub Pages; the **job search API** must be hosted elsewhere (e.g. Vercel) because GitHub Pages only serves static files.

1. **Enable GitHub Pages**
   - In your repo: **Settings → Pages**.
   - Under **Build and deployment**, set **Source** to **GitHub Actions**.

2. **Optional: make job search work on the Pages site**
   - Deploy the full app to **Vercel** first (so `/api/jobs` and `/api/health` work there).
   - In the repo: **Settings → Secrets and variables → Actions → Variables**.
   - Add a variable: **Name** `NEXT_PUBLIC_API_BASE`, **Value** `https://mouser-inky.vercel.app`. No trailing slash.
   - The workflow will use this when building; the static site on GitHub Pages will call your Vercel app for job search.

3. **Push to `main`**
   - The workflow `.github/workflows/pages.yml` runs on push to `main`, builds a static export, and deploys it to GitHub Pages.
   - Your site will be at `https://<username>.github.io/mouser/` (or your repo’s Pages URL).

If you don’t set `NEXT_PUBLIC_API_BASE`, the Pages site will load but **Find top 10 jobs** will fail (no API). Set it to a Vercel (or other) URL where the API is deployed to get job search on the Pages site.

## Tech

- **Next.js 15** (App Router) + **React 19** + TypeScript + Tailwind
- **ESLint 9** + eslint-config-next 15
- **OpenAI Responses API** with **web_search** for live job search and ranking
