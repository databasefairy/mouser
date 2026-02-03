# HANDOVER SUMMARY

*Last updated: February 2, 2026 (Session 4)*

---

## 1) Project Mission

**Mouser** is a stateless job search application that uses Google Gemini 3 with Google Search grounding to find active job listings, verifies that links are live (not closed/expired), filters out non-application pages, and presents results in a clean table with job title, company, estimated salary, callback score, and application link.

---

## 2) Tech Stack & Architecture

### Frameworks & Libraries
| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15.5.x, React 19, Tailwind CSS |
| Backend | Next.js API Routes (App Router) |
| AI | Google Gemini 3 Flash Preview via `@google/genai` with Google Search grounding |
| Auth | NextAuth.js 4.x (credentials + optional GitHub OAuth) |
| HTTP | axios (link verification), native fetch (SSRF-protected) |
| Validation | Zod |
| Testing | Vitest (100 tests) |

### Architecture Overview
```
User → /login (NextAuth) → Home Page (page.tsx)
                              ↓
                        POST /api/search-jobs
                              ↓
              ╔═══════════════════════════════════════╗
              ║      ITERATIVE SEARCH LOOP            ║
              ║   (repeat until top_n verified jobs   ║
              ║    or max 5 iterations)               ║
              ╚═══════════════════════════════════════╝
                              ↓
                    ┌─────────────────────────────────┐
                    │ 1. runGeminiSearchOnly()        │
                    │    - Gemini 3 Flash Preview     │
                    │    - Google Search grounding    │
                    │    - Returns JSON array of jobs │
                    │    - Retry on 503 (3x, backoff) │
                    │    - Excludes already-seen URLs │
                    └─────────────────────────────────┘
                              ↓
                    ┌─────────────────────────────────┐
                    │ 2. JSON Repair Pipeline         │
                    │    - Strip markdown fences      │
                    │    - Fix truncated URLs         │
                    │    - Fix unescaped newlines     │
                    └─────────────────────────────────┘
                              ↓
                    ┌─────────────────────────────────┐
                    │ 3. Dedupe & Classify            │
                    │    - Skip already-seen URLs     │
                    │    - Classify page type (URL +  │
                    │      content patterns)          │
                    │    - Upgrade search pages to    │
                    │      actual job listings        │
                    └─────────────────────────────────┘
                              ↓
                    ┌─────────────────────────────────┐
                    │ 4. Page Type Annotations        │
                    │    - 📋 Job Listing             │
                    │    - ✅ Direct Apply            │
                    │    - 🔍 Search Page (+ ⚠️)     │
                    │    - 🏢 Company Jobs (+ ⚠️)    │
                    │    - 📰 Aggregator (+ ⚠️)      │
                    │    - ❓ Unknown (+ ℹ️)         │
                    └─────────────────────────────────┘
                              ↓
                    ┌─────────────────────────────────┐
                    │ 5. Salary & Score Estimation    │
                    │    - Estimate missing salaries  │
                    │    - Calculate callback scores  │
                    └─────────────────────────────────┘
                              ↓
                    ┌─────────────────────────────────┐
                    │ 6. Link Verification (axios)    │
                    │    - Check 404/410              │
                    │    - Check 70+ dead keywords    │
                    │    - Check Ashby closed status  │
                    │    - Retry on timeout (2x)      │
                    └─────────────────────────────────┘
                              ↓
                    ┌─────────────────────────────────┐
                    │ 7. Check if enough verified     │
                    │    - If < top_n: loop back      │
                    │    - If >= top_n: return        │
                    └─────────────────────────────────┘
                              ↓
                  Return top_n verified jobs
```

### Key Files
| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Home page with search form, status indicator, and results table |
| `src/app/api/search-jobs/route.ts` | Main API: Gemini call, parsing, verification, scoring |
| `src/lib/search-jobs/gemini-agent.ts` | `runGeminiSearchOnly()` - Gemini 3 with retry logic |
| `src/lib/search-jobs/json-repair.ts` | JSON repair utilities (exported, tested) |
| `src/lib/search-jobs/salary-estimate.ts` | Salary estimation based on title/company/industry |
| `src/lib/search-jobs/callback-score.ts` | Callback likelihood scoring based on job characteristics |
| `src/lib/search-jobs/classify-url.ts` | Heuristic page-type classifier with URL patterns |
| `src/lib/search-jobs/fetch-url.ts` | SSRF-safe URL fetcher with apply link detection |
| `src/lib/search-jobs/schema.ts` | Zod schemas, types, INDUSTRIES_LIST |
| `src/lib/auth.ts` | NextAuth configuration |
| `src/lib/env.ts` | `getGeminiApiKey()` |

---

## 3) Current State

### What Works ✅
- `npm run build` passes
- `npm test` passes (100 tests)
- Auth flow (credentials and GitHub OAuth)
- Gemini 3 Flash Preview with Google Search grounding
- **Gemini API retry logic** (3 retries on 503/overloaded)
- JSON parsing with multiple repair strategies
- **Enhanced URL classification** with URL pattern matching
- **Search page upgrade** - extracts actual job links from search/index pages
- **Warning notes** for search pages, job indexes, aggregators (⚠️ labels)
- Salary estimation for jobs without salary data
- Callback score estimation based on job characteristics
- Link verification with retry logic and **70+ dead keywords**
- **Live search status indicator** with rotating messages
- Results table renders with valid external links and warning labels

### Known Issues (Non-Blocking)

1. **@next/swc Version Mismatch** - Build warning:
   ```
   Mismatching @next/swc version, detected: 15.5.7 while Next.js is on 15.5.11
   ```
   **Cannot be fixed**: No @next/swc@15.5.11 package exists on npm. The warning is cosmetic - build succeeds and app works.

2. **Node Version** - Requires Node 20+. Added to `package.json` engines field.

---

## 4) What Was Done This Session (Session 4)

### New Features Added

1. **Iterative Search Loop** (`route.ts`)
   - Search now continues until it finds the requested number (top_n) of verified live listings
   - **Requests 50 jobs per iteration** to maximize chances of finding enough verified results
   - Maximum 5 iterations to prevent infinite loops
   - Each iteration excludes already-found URLs to avoid duplicates
   - Logs progress: "need X more verified jobs (have Y/Z)"

2. **Page Type Annotations** (`route.ts`, `page.tsx`)
   - Each result now displays its page type with an emoji label:
     - 📋 Job Listing
     - ✅ Direct Apply
     - 🔍 Search Page
     - 🏢 Company Jobs
     - 📰 Aggregator
     - ❓ Unknown
   - Warning notes (⚠️) still shown for non-direct pages
   - Info notes (ℹ️) for unverified links

3. **Cross-Iteration Deduplication**
   - Tracks all seen URLs across all iterations
   - Prevents the same job from being returned multiple times
   - Prompt includes list of already-found URLs to help Gemini find different jobs

4. **Enhanced Greenhouse Handling** (`fetch-url.ts`, `classify-url.ts`, `route.ts`)
   - **Error page detection**: Recognizes `?error=true` URLs as company job indexes
   - **Redirect detection**: If Greenhouse redirects to a different valid job URL, uses that
   - **Better job link extraction**: Extracts relative Greenhouse job links (`/company/jobs/ID`) and converts to full URLs
   - **Aggressive upgrade**: When Gemini returns stale job IDs that redirect to company pages, extracts actual job links and upgrades

5. **Updated Status Messages**
   - Added "🔄 Finding more verified listings..." to status rotation
   - Updated expected time to "30-60 seconds" to account for multiple iterations

### Files Modified
| File | Change |
|------|--------|
| `src/app/api/search-jobs/route.ts` | Iterative search loop (50/iteration), page type labels, Greenhouse redirect/error handling |
| `src/app/page.tsx` | Display page type labels in UI, updated status messages |
| `src/lib/search-jobs/fetch-url.ts` | Improved Greenhouse job link extraction from listing pages |
| `src/lib/search-jobs/classify-url.ts` | Added Greenhouse error page pattern detection |
| `HANDOVER_SUMMARY.md` | Updated with session 4 work |

---

## 4b) What Was Done in Session 3

### New Features Added

1. **Enhanced URL Classification** (`classify-url.ts`)
   - Added URL pattern matching for major job boards (LinkedIn, Indeed, Greenhouse, Lever, Ashby, etc.)
   - Search page URLs are now detected by pattern (e.g., `linkedin.com/jobs/search`)
   - Job listing URLs are detected by pattern (e.g., `greenhouse.io/.../jobs/123`)
   - URL patterns take priority over content-based detection

2. **Search Page Link Upgrade** (`route.ts`)
   - When a search page or job index is detected, extracts actual job links from `detected_apply_links`
   - Tries up to 3 candidate links and classifies each
   - Upgrades to the actual job listing URL if found
   - Tracks original page type for warning notes

3. **Warning Notes Instead of Filtering**
   - Changed from filtering out search/index pages to including them with warnings
   - Warning notes: ⚠️ for search pages, job indexes, aggregators
   - Info notes: ℹ️ for links that couldn't be verified
   - Displays in yellow/blue text below Apply links

4. **Expanded Dead Keywords** (70+ patterns)
   - Added Greenhouse modal message: "The job you are looking for is no longer open"
   - Added many variations: "job listing no longer exists", "this job has been closed", etc.
   - Added platform-specific patterns for LinkedIn, Indeed, Lever, Ashby, Workable

5. **Ashby Closed Status Detection**
   - Checks for `"isOpen":false` or `"status":"closed"` in page JSON data
   - Works even when the page loads successfully but job is closed

6. **Gemini API Retry Logic** (`gemini-agent.ts`)
   - Retries up to 3 times on 503/overloaded errors
   - Exponential backoff: 2s → 4s → 8s
   - Logs retry attempts to console

7. **Live Search Status Indicator** (`page.tsx`)
   - Shows rotating status messages during search
   - Messages: "Searching for jobs...", "Querying job boards...", "Verifying job links...", etc.
   - Spinner animation with "This may take 15-30 seconds..."
   - Status displayed in the submit button

8. **Improved Prompt** (`route.ts`)
   - More explicit about what URLs are acceptable
   - Lists good examples (greenhouse, lever, linkedin/jobs/view)
   - Lists bad examples (google.com, search pages, careers homepages)

### Files Modified
| File | Change |
|------|--------|
| `src/lib/search-jobs/classify-url.ts` | Added URL_PATTERNS for major job boards, enhanced detection |
| `src/lib/search-jobs/gemini-agent.ts` | Added retry logic for 503 errors (3x with backoff) |
| `src/app/api/search-jobs/route.ts` | Search page upgrade, warning notes, 70+ dead keywords, improved prompt |
| `src/app/page.tsx` | Live status indicator with rotating messages and spinner |

### Previous Sessions
- **Session 2**: Gemini 3 upgrade, salary estimation, callback scoring, page type filtering
- **Session 1**: JSON repair pipeline, link verification monitoring

---

## 5) Next Steps (Suggestions)

### Completed This Session ✅
- [x] **Enhanced URL classification** - URL pattern matching for major job boards
- [x] **Search page link upgrade** - Extract actual job links from search pages
- [x] **Warning notes** - Show ⚠️ for search/index pages instead of filtering
- [x] **70+ dead keywords** - Comprehensive closed job detection
- [x] **Gemini retry logic** - Handle 503/overloaded errors gracefully
- [x] **Live status indicator** - Show search progress to users

### Future Optional Improvements
- [ ] **Extract salary from HTML** - When model doesn't return salary, parse from page content
- [ ] **Machine learning callback model** - Train on actual response data
- [ ] **Caching layer** - Cache verified URLs to speed up repeated searches
- [ ] **Rate limit persistence** - Use Redis/DB instead of in-memory for production
- [ ] **Server-sent events** - Real-time status updates from server during search

---

## 6) Key Decisions (Do Not Change)

### 1. Axios for Link Verification (NOT native fetch)
**Why:** In Next.js server environment, native `fetch` can return `res.url` as `http://localhost:3000/` instead of the actual final URL.

### 2. Never Overwrite AI Links with Fetch Results
**Why:** Fetch can return localhost or relative URLs in server context. Keep AI's original URLs for display.

### 3. Fallback to `listing_url` for Apply Link
**Why:** When `direct_apply_link` is invalid, use `listing_url` so user always gets a link.

### 4. No Single-Line Comment Stripping in JSON Repair
**Why:** The `//` pattern matches URLs like `https://...` and corrupts them.

### 5. No Whitelist Filtering
**Why:** User requested removal. Jobs from any domain are allowed. AI finds listings; server only verifies they're live.

### 6. `isInvalidLink()` Treats <20 chars as Invalid
**Why:** Valid job URLs are always 20+ characters. Anything shorter is truncated garbage.

### 7. Warning Notes Instead of Filtering (Session 3)
**Why:** User requested that search/index pages be included but labeled, not filtered out. High callback score jobs from search pages should still be shown.

### 8. Job Titles as OR (Not AND)
**Why:** User confirmed this is correct. Multiple titles search for jobs matching ANY of the titles.

### 9. Iterative Search Until top_n Verified (Session 4)
**Why:** Single search often returns jobs that fail verification (404, closed, etc.). Loop continues until we have the requested number of verified, live listings or hit max iterations (5).

### 10. Request 50 Jobs Per Iteration (Session 4)
**Why:** Gemini often returns stale job IDs that fail verification. Requesting 50 per iteration increases the chance of finding enough verified jobs without requiring many iterations.

### 11. Greenhouse Error Page Upgrade (Session 4)
**Why:** Gemini's training data contains stale Greenhouse job IDs. When accessing these URLs, Greenhouse redirects to `?error=true` company pages. We detect this and extract actual job links from the page to upgrade to valid jobs.

---

## 7) Environment Variables

Required in `.env` (copy from `.env.example`):

```bash
# Gemini API (required for job search)
GEMINI_API_KEY=your-gemini-api-key
# or
GOOGLE_API_KEY=your-google-api-key

# NextAuth (required for login)
NEXTAUTH_SECRET=random-string-at-least-32-chars
NEXTAUTH_URL=http://localhost:3000  # no trailing slash

# Auth providers (at least one required)
MOUSER_LOGIN_PASSWORD=any-password-for-credentials-login
MOUSER_RATE_LIMIT_EXEMPT_PASSWORD=password-for-limitless-profile
GITHUB_ID=optional-github-oauth-client-id
GITHUB_SECRET=optional-github-oauth-client-secret
```

---

## 8) Commands

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Production build
npm run build

# Run tests (100 tests)
npm test

# Start production server
npm start
```

---

## 9) API Contract

### POST /api/search-jobs

**Request Body:**
```typescript
{
  top_n: number;           // 1-50, default 10
  industries: string[];    // optional
  zip_code: string;        // optional
  radius_miles: number;    // 0-500, default 25
  remote_only: boolean;    // default false
  salary_min: number;      // default 0
  titles: string[];        // e.g. ["Product Manager"] - treated as OR
  posted_within_days: number; // 1-30, default 3
  resume_text?: string;    // optional, for matching
  dry_run?: boolean;       // limitless only
}
```

**Response:**
```typescript
{
  query_used: object;
  results: JobResult[];    // Each job may have notes[] with warning labels
  excluded_counts: {
    not_active?: number;      // 404/410 or "position closed"
    bad_classification?: number; // unknown with HTTP error
    invalid_shape?: number;   // couldn't parse job object
  };
  missing_info: string[];
  // Limitless only:
  raw_phase1_response?: string;
  verify_stats?: {
    total: number;
    passed: number;
    failed: number;
    pass_rate: number;        // 0-100
    by_reason: Record<string, number>;
    avg_duration_ms: number;
    total_retries: number;
  };
}
```

**JobResult.notes[] may contain:**
- `"⚠️ Link goes to a search results page"`
- `"⚠️ Link goes to a company jobs list page"`
- `"⚠️ Link goes to a job aggregator page"`
- `"⚠️ Link goes to a search results page (link was extracted)"` (upgraded links)
- `"ℹ️ Link type could not be verified"`

---

## 10) Testing

```bash
npm test
```

**Test Files (100 tests total):**
- `src/lib/ssrf.test.ts` - SSRF protection (5 tests)
- `src/lib/search-jobs/dedupe.test.ts` - Deduplication key generation (6 tests)
- `src/lib/search-jobs/json-repair.test.ts` - JSON repair pipeline (24 tests)
- `src/lib/search-jobs/salary-estimate.test.ts` - Salary estimation (43 tests)
- `src/lib/search-jobs/callback-score.test.ts` - Callback score estimation (22 tests)

---

## 11) Repo & Links

- **Repo:** https://github.com/databasefairy/mouser (branch: main)
- **Gemini API Key:** https://aistudio.google.com/apikey
- **NextAuth Docs:** https://next-auth.js.org/
- **Google AI Docs:** https://ai.google.dev/gemini-api/docs
