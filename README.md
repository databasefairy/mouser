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
| `NEXTAUTH_URL` | Yes (for login) | Full URL of your app (e.g. `http://localhost:3000` or `https://your-app.vercel.app`). |
| `GITHUB_ID` / `GITHUB_SECRET` | No | GitHub OAuth app credentials for “Sign in with GitHub”. Create at [GitHub OAuth Apps](https://github.com/settings/developers). |
| `MOUSER_LOGIN_PASSWORD` | No | If set, users can sign in with any username + this password (for testing). |

## Login

The app uses **NextAuth.js**. You must sign in before using job search.

1. **Required:** Set `NEXTAUTH_SECRET` (e.g. `openssl rand -base64 32`) and `NEXTAUTH_URL` (e.g. `http://localhost:3000`) in `.env`.
2. **Option A – GitHub:** Create a [GitHub OAuth App](https://github.com/settings/developers) and set `GITHUB_ID` and `GITHUB_SECRET` in `.env`. Callback URL: `http://localhost:3000/api/auth/callback/github` (and your production URL when deployed).
3. **Option B – Password:** Set `MOUSER_LOGIN_PASSWORD` in `.env`. Users can sign in with any username and that password.

On first visit you’ll be redirected to `/login`. After signing in you can use job search; **Sign out** is in the top-right.

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

## Deployment (e.g. Vercel)

1. Push the repo to GitHub and import the project in [Vercel](https://vercel.com).
2. **Option A – Manual:** In the Vercel project: **Settings → Environment Variables** → add `OPENAI_API_KEY` (paste your key or the value from your GitHub secret).
3. **Option B – From GitHub secret:** Use the example workflow in `.github/workflows/deploy.yml` (if present): it passes `OPENAI_API_KEY` from the repo secret into the deploy so the host gets it.
4. Redeploy. The live site will use the key from the host’s env.

Other hosts (Netlify, Railway, etc.): set `OPENAI_API_KEY` in that platform’s environment the same way.

## Deploy to GitHub Pages (for testing)

The app can be deployed as a **static site** to GitHub Pages. The UI is served from GitHub Pages; the **job search API** must be hosted elsewhere (e.g. Vercel) because GitHub Pages only serves static files.

1. **Enable GitHub Pages**
   - In your repo: **Settings → Pages**.
   - Under **Build and deployment**, set **Source** to **GitHub Actions**.

2. **Optional: make job search work on the Pages site**
   - Deploy the full app to **Vercel** first (so `/api/jobs` and `/api/health` work there).
   - In the repo: **Settings → Secrets and variables → Actions → Variables**.
   - Add a variable: **Name** `NEXT_PUBLIC_API_BASE`, **Value** your Vercel URL (e.g. `https://mouser-xxx.vercel.app`). No trailing slash.
   - The workflow will use this when building; the static site on GitHub Pages will call your Vercel app for job search.

3. **Push to `main`**
   - The workflow `.github/workflows/pages.yml` runs on push to `main`, builds a static export, and deploys it to GitHub Pages.
   - Your site will be at `https://<username>.github.io/mouser/` (or your repo’s Pages URL).

If you don’t set `NEXT_PUBLIC_API_BASE`, the Pages site will load but **Find top 10 jobs** will fail (no API). Set it to a Vercel (or other) URL where the API is deployed to get job search on the Pages site.

## Tech

- **Next.js** (App Router) + TypeScript + Tailwind
- **OpenAI Responses API** with **web_search** for live job search and ranking
