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

Important Context from Session 4:
- **Iterative search loop**: Requests 50 jobs per iteration, continues until top_n verified jobs found (max 5 iterations)
- **Greenhouse handling**: Detects error pages (`?error=true`), extracts real job links, handles redirects
- **Page type annotations**: Each result shows 📋/✅/🔍/🏢/📰/❓ emoji labels
- **Cross-iteration deduplication**: Tracks seen URLs across iterations to avoid duplicates
- Job titles are treated as OR (not AND) - this is correct
- Warning labels (⚠️/ℹ️) shown for search/index pages, NOT filtered out

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
| `src/app/api/search-jobs/route.ts` | Main API with iterative search loop |
| `src/lib/search-jobs/fetch-url.ts` | URL fetcher with Greenhouse link extraction |
| `src/lib/search-jobs/classify-url.ts` | Page type classification with URL patterns |
| `src/app/page.tsx` | Frontend with search form and results table |

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
