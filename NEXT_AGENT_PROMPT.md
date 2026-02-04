# Handover Prompt for Next Agent

Copy and paste this entire prompt to hand over to the next agent:

---

@HANDOVER_SUMMARY.md You are taking over a development task. I am providing a Handover Document from a previous session.

Your Instructions:

1. Read the provided Handover Document above.

2. Index the @Codebase to verify the 'Current State' mentioned.

3. Adopt the coding style and architectural patterns described in the 'Tech Stack' section.

4. Review Section 6 'Key Decisions (Do Not Change)' - these are critical constraints that must be respected.

5. Focus your immediate attention on any item I specify, or ask me what to work on next.

Important Context from Session 5:
- **Streaming progress (SSE)**: client sends `stream: true`, server emits `status`, `progress`, `done`
- **Progress bar** fills as verified jobs are found; status shown only on search button
- **Soft whitelist**: ATS-only for iterations 1–2, allow broader domains from iteration 3
- **Search/index pages are now excluded** (no base careers/search pages)
- **Prefer job description pages** (avoid apply-flow URLs when possible)
- **Ashby/Workday fixes**: treat generic Jobs pages as dead; Workday fallback titles detected
- **Breezy restriction**: only allow `https://jobs.breezy.hr/`
- **Credentials-only auth** (GitHub login removed)
- Job titles are treated as OR (not AND) - this is correct

Key Technical Details:
- Gemini 3 Flash Preview with Google Search grounding
- 70+ dead keywords detect closed job postings
- Gemini API has retry logic for 503 errors (3x with backoff)
- Axios for link verification (NOT native fetch - see Key Decisions)

The app is currently working. Tests pass (100/100), build succeeds.

---

## Quick Reference

### Commands
```bash
npm install     # Install dependencies
npm run dev     # Development server (http://localhost:3000)
npm run build   # Production build
npm test        # Run tests (100 tests)
```

### Key Files
| File | Purpose |
|------|---------|
| `src/app/api/search-jobs/route.ts` | Main API, iterative search + SSE |
| `src/lib/search-jobs/fetch-url.ts` | URL fetcher with ATS link extraction |
| `src/lib/search-jobs/classify-url.ts` | Page type classification with URL patterns |
| `src/app/page.tsx` | Frontend, SSE client + progress bar |

### Environment Variables (required in `.env`)
```
GEMINI_API_KEY=your-key
NEXTAUTH_SECRET=random-32-char-string
NEXTAUTH_URL=http://localhost:3000
MOUSER_LOGIN_PASSWORD=any-password
```

### Known Issue (Cosmetic)
```
Mismatching @next/swc version, detected: 15.5.7 while Next.js is on 15.5.11
```
Cannot be fixed - no @next/swc@15.5.11 exists on npm. Build works fine.
