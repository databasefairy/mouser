# Mouser — GUI Specification for Designers

This document describes the user interface of **Mouser**, a job-search web app that lets authenticated users set search criteria and receive a list of remote jobs with direct apply links. Use it for visual design, UX copy, and implementation handoff.

---

## 1. Product overview and user flow

- **Purpose:** Authenticated users configure job-search criteria (titles, industries, compensation, location, etc.) and run a search. The app returns a table of jobs with direct apply links.
- **Flow:** Unauthenticated users are redirected to **Login**. After sign-in they land on **Home (Job Search)**. They edit form fields, submit, and see **Results** (table or fallback text) on the same page below the form. They can run new searches without leaving the page.

---

## 2. Screens / pages

### 2.1 Login (`/login`)

- **When shown:** User is not signed in; app redirects here from `/`.
- **Layout:** Centered card on a full-viewport background. Single column.
- **Content:**
  - App name: **Mouser** (heading).
  - Subtitle: “Sign in to use job search.”
  - **Sign in with GitHub** (primary button, full width).
  - Divider with “or”.
  - **Credentials form:** Username (optional), Password (required), **Sign in** button.
  - Error message area (only when login fails).
  - Footer note: “Password login works only if MOUSER_LOGIN_PASSWORD is set in .env. GitHub requires GITHUB_ID and GITHUB_SECRET.”
- **States:** Default; loading (button disabled, “Signing in…”); error (message above form).

### 2.2 Home / Job Search (`/`)

- **When shown:** User is signed in.
- **Layout:** Single scrollable column: header (app name + user + Sign out) → short description → optional help text → **form** → error block (conditional) → **results** (conditional).
- **Content:** See Sections 3–5 for form fields, buttons, and results.

### 2.3 Results (on same page as Home)

- **When shown:** After a successful search; appears below the form.
- **Variants:**
  - **Table:** List of jobs with columns (Job Title, Company, Industry, Posted, Compensation, Type, Remote, Apply). Each row has an “Apply” link opening the job’s apply URL in a new tab.
  - **Fallback text:** If the API returns non-JSON text (`jobsText`), it is shown as preformatted text with URLs turned into links.
- **Empty:** If there are no jobs and no `jobsText`, the results section still appears but with no table/content (designer may specify an explicit “No jobs found” state).

---

## 3. Layout and responsive behavior

### 3.1 Main container (Home)

- **Width:** Responsive.
  - `max-width`: `min(42rem, 100%)` on small screens; `sm: 42rem` (672px); `lg: 56rem` (896px).
- **Alignment:** Centered (`mx-auto`).
- **Padding:** Horizontal `1rem` (16px) base, `1.5rem` (24px) from `sm`; vertical `2rem` (32px) base, `3rem` (48px) from `sm`.
- **Sizing:** `w-full`, `min-w-0` on form and sections so content doesn’t overflow on narrow viewports.

### 3.2 Login

- **Card:** `max-width: 24rem` (384px), centered, with padding and shadow.
- **Background:** Light gray (`bg-slate-50`); page uses `min-h-screen` and flex center.

### 3.3 Breakpoints (Tailwind)

- **sm:** 640px  
- **lg:** 1024px  

Form grids switch from 1 column to 2–3 columns at `sm` and `lg` as noted in Section 5.

---

## 4. Visual design (design tokens)

### 4.1 Colors

- **Background (page):** `#f8fafc` (slate-50). Dark-mode override: `#f1f5f9`.
- **Foreground (body text):** `#0f172a` (slate-900).
- **Primary (buttons, emphasis):** Background `#0f172a` (slate-900), hover `#1e293b` (slate-800). Text white.
- **Borders (inputs, cards):** `#cbd5e1` (slate-300), `#e2e8f0` (slate-200).
- **Labels / secondary text:** `#334155` (slate-700), `#64748b` (slate-500), `#475569` (slate-600).
- **Placeholder:** `#94a3b8` (slate-400).
- **Error:** Background `#fef2f2` (red-50), border `#ef4444` (red-500), text `#991b1b` (red-900). On Home, error block uses `bg-red-100`, `border-red-500`, `text-red-900`.
- **Focus ring (inputs):** Border/ring `#64748b` (slate-500).
- **Hover (table row, dropdown option):** `#f8fafc` (slate-50).
- **Links:** Default `#334155`, hover `#0f172a`; underlined.

### 4.2 Typography

- **App name (header):** Bold, `1.5rem` (24px).
- **Section heading (e.g. “Jobs for you”):** Semibold, `1.125rem` (18px).
- **Labels:** Medium, `0.875rem` (14px).
- **Body / inputs / table:** `0.875rem` (14px) for table and small UI text; inputs and body use default/base size.
- **Login title:** Bold, `1.25rem` (20px).
- **Footer / helper (login):** `0.75rem` (12px), muted.

### 4.3 Spacing and radii

- **Input/card radius:** `0.5rem` (8px).
- **Form section spacing:** `1.5rem` (24px) between sections.
- **Label–control gap:** `0.5rem` (8px) (`mt-2` where used).
- **Input padding:** `0.5rem 0.75rem` (8px 12px).
- **Button padding:** `0.75rem 1rem` (12px 16px).
- **Table cell padding:** `0.75rem 1rem` (12px 16px).

---

## 5. Component specifications

### 5.1 Header (Home)

- **Left:** “Mouser” (text, not a link).
- **Right:** Optional “{User name}” (if available) + “Sign out” link. Sign out is underlined, opens in same window and redirects to `/login`.
- **Layout:** Flex, space-between; single row on all breakpoints.

### 5.2 Copy blocks (Home)

- **Description (below header):**  
  “Search for remote jobs by target titles and industries. Results are filtered by recency, compensation, and direct apply links.”
- **Help text:**  
  “Not connecting? Run `npm run dev`, add `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) to `.env`, and check /api/health.” (with inline code styling and a link to `/api/health`).

### 5.3 Form — field list and layout

All form fields are full width within their grid cell (`w-full min-w-0`). Labels use the same style (`block text-sm font-medium text-slate-700`).

| # | Label | Type | Default / constraints | Grid |
|---|--------|------|------------------------|------|
| 1 | Target job titles (comma-separated or descriptive) | Textarea | Placeholder: “e.g. Senior Product Manager, Staff Engineer, Director of Product.” Default: Product Manager–style titles. Rows: 3. | Full width |
| 2 | Posted within (hours) | Number input | Min 1, max 720. Default: 72. | 1 col → 3 col at `sm` |
| 3 | Min compensation ($) | Number input | Min 0, step 1000. Default: 180000. | 1 col → 3 col at `sm` |
| 4 | Result count | Number input | Min 1, max 20. Default: 10. | 1 col → 3 col at `sm` |
| 5 | Your ZIP code | Text input | Placeholder “30062”. Default: 30062. | 1 col → 2 col at `sm` |
| 6 | Exclude offices within (miles) | Number input | Min 0. Default: 15. | 1 col → 2 col at `sm` |
| 7 | (no label) | Checkbox | “Fully remote only (exclude hybrid/onsite)”. Default: checked. | Full width |
| 8 | Industries (select one or more) | **Dropdown** (multi-select) | See 5.4. Default: 3 options selected. | Full width |
| 9 | Company stage (select one or more) | **Dropdown** (multi-select) | See 5.5. Default: 4 options selected. | Full width |
| 10 | Optional: resume or LinkedIn profile (for context) | Textarea | Placeholder: “Paste resume or LinkedIn text for additional context”. Rows: 4. Optional. | Full width |

- **Submit button:** Full width; label “Find jobs” (loading: “Searching…”). Primary style, disabled during loading.

### 5.4 Industries dropdown

- **Behavior:** Click opens a panel below the trigger; checkboxes inside allow multiple selection. Click outside (or designer-specified gesture) closes the panel.
- **Trigger (button):** Looks like a text input; full width.  
  - **Label when closed:**  
    - 0 selected: “Select industries…”  
    - 1 selected: that option’s full text  
    - 2+ selected: “{N} industries selected”
- **Panel:** Positioned below trigger; white background, border, shadow; max height ~240px, scrollable. Each option is a row: checkbox + label. Hover state on row (e.g. light gray).
- **Options (all shown in dropdown):**  
  Artificial Intelligence / Machine Learning, SaaS (B2B or B2C), Fintech, Healthtech, Cybersecurity, Developer Tools, Data / Analytics, Cloud Infrastructure, E-commerce, EdTech, Marketplace Platforms, Enterprise Software, Web3 / Blockchain, GovTech, InsurTech, HR Tech.  
- **Default selected:** Artificial Intelligence / Machine Learning, SaaS (B2B or B2C), Fintech.  
- Long labels may truncate with ellipsis in the trigger; full text in panel.

### 5.5 Company stage dropdown

- **Behavior:** Same pattern as Industries: button opens a panel with checkboxes; click outside closes.
- **Trigger label when closed:**  
  - 0: “Select company stages…”  
  - 1: that stage name  
  - 2+: “{N} stages selected”
- **Panel:** Same style as industries; max height ~208px, scrollable.
- **Options:** Series A, Series B, Series C, Late-stage startup, Public company.  
- **Default selected:** Series B, Series C, Late-stage startup, Public company.

### 5.6 Primary button (Login and Home)

- Full width, rounded, slate-900 background, white text, medium font weight.  
- Hover: darker slate.  
- Disabled: reduced opacity, not clickable.  
- Labels: “Sign in with GitHub”, “Sign in”, “Find jobs”, “Searching…”.

### 5.7 Error block (Home)

- **When:** API or network error. Shown below the form.
- **Style:** Red background tint, strong red border, dark red text, padding. `role="alert"`.
- **Content:** Server-provided message or generic “Search failed.” / connection message.

### 5.8 Results table

- **Container:** Rounded card, border, white background; horizontal scroll wrapper so table doesn’t break layout on small screens.
- **Table:** Full width; left-aligned text; small text.
- **Header row:** Background slate-100, bottom border; cells: Job Title, Company, Industry, Posted, Compensation, Type, Remote, Apply. Semibold.
- **Data rows:** Bottom border; hover row background slate-50.  
  - **Apply:** Link, opens in new tab; label “Apply”. Underline, slate-700 → slate-900 on hover. Long URLs can wrap/break.
- **Empty cells:** Show “—” when value is missing (industry, posted date, compensation, type, remote).
- **Compensation column:** Max width ~12rem so long text doesn’t dominate.

### 5.9 Fallback results (plain text)

- When API returns non-JSON text: same card style, padding; preformatted text; URLs in the text are rendered as clickable links (underline, same link styling).

---

## 6. States and microcopy

### 6.1 Loading

- **Home:** Submit button disabled, label “Searching…”.
- **Login:** Submit button disabled, label “Signing in…”.
- No global spinner specified; designer can add one.

### 6.2 Errors

- **Login:** “Invalid username or password.”
- **Home:** From API (e.g. “GEMINI_API_KEY or GOOGLE_API_KEY is not set.”) or network (“Could not reach the app…”, “Search failed.”). Shown in the red error block.

### 6.3 Empty / zero selection

- Industries: “Select industries…” when none selected.
- Company stage: “Select company stages…” when none selected.  
- Submitting with zero industries or zero company stages is allowed; API uses default lists if needed.

### 6.4 Accessibility

- Labels associated with inputs via `htmlFor` / `id`.
- Error block has `role="alert"`.
- Dropdown trigger is a `<button type="button">`; panel can be given `aria-expanded` and `aria-controls` for screen readers. Designer can specify focus order and keyboard (Enter/Space to open, Escape to close).

---

## 7. Data and constraints summary

- **Industries:** 16 options (see 5.4). Multi-select.
- **Company stages:** 5 options (see 5.5). Multi-select.
- **Job result columns:** Job Title, Company, Industry, Posted, Compensation, Type, Remote, Apply (link).
- **Responsive:** Form and inputs are full width within a responsive max-width container; table scrolls horizontally on small screens; dropdowns full width.

---

## 8. Out of scope for this spec

- Backend API contract (only UI and copy are specified).
- Auth provider configuration (GitHub vs credentials).
- Theming beyond the existing light palette and single dark-mode background override.
- Mobile-specific navigation (e.g. hamburger); current UI is a single column with no nav bar.

---

*Document version: 1.0. Reflects app state as of the GUI spec date. For implementation details, see `src/app/page.tsx`, `src/app/login/page.tsx`, and `src/app/globals.css`.*
