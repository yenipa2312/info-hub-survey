# Info Hub Discovery Survey

A discovery survey for branch and contact-center staff, feeding a future
"internal info hub" platform (products, procedures, campaigns, internal
news) with a possible AI chatbot. Two pages:

- **`index.html`** — the Armenian survey (10 questions, with branching:
  Q1 location filters Q2's role list; Q4 selecting "Outlook նամակագրություն"
  reveals a sub-question). Public link, no login.
- **`dashboard.html`** — results view. A written executive summary at the
  top, stat tiles, a bar-chart breakdown for every closed question, and
  the two open-text questions (9 and 10) — click **Վերլուծել բաց
  պատասխանները** to have Claude turn them into metrics too (Q9 into a
  fixed content category, Q10 into free-form topic clusters), with the
  raw answers still listed underneath for reference. Filter by location
  and/or role together, export everything as CSV.

## Design

Same Ameriabank brand system as the sibling `feedback-triage-tool` project
(verified colours/fonts from `skills/ameriabank-deck/references/
design-system.md`): brand green `#68BD45`, deep green `#3D8B26` for text,
near-black `#111111`, pale-green card fill `#EEF6E9`, Cambria/Calibri. Light
mode default, dark mode via `prefers-color-scheme`.

## How it works

- Storage: [Netlify Blobs](https://docs.netlify.com/blobs/overview/) — no
  external database needed.
- `netlify/functions/submit.js` — the survey posts here
- `netlify/functions/list.js` — dashboard reads all stored responses;
  aggregation (tallies, bar charts) happens client-side in `dashboard.js`
- `netlify/functions/analyze.js` — calls Claude on responses whose open
  text hasn't been classified yet: Q9 into one of a fixed set of content
  categories, Q10 into a short free-form topic label (same text reused
  across similar notes so they group together)
- Needs `ANTHROPIC_API_KEY` set in Netlify env vars for the Analyze
  button to work (same key you used for `feedback-triage-tool` works
  fine here too).

## Local setup

1. Install [Node.js](https://nodejs.org) (LTS) if you haven't already.
2. Install dependencies and the Netlify CLI:
   ```
   npm install
   npm install -g netlify-cli
   ```
3. Run the dev server:
   ```
   netlify dev
   ```
4. Open the printed URL for the survey, and `/dashboard.html` for results.

## Deploying to Netlify

1. Push to GitHub, then in Netlify: **Add new site → Import an existing
   project → GitHub** → pick this repo.
2. **Site configuration → Visitor access** → make sure production is
   public (Private/"Previews only" is fine — see the sibling project's
   notes on this), or staff won't be able to open the survey.
3. If functions error with `MissingBlobsEnvironmentError`: create a
   Personal access token (Netlify avatar → **User settings → Applications
   → Personal access tokens**) and the site's **Site ID** (**Site
   configuration → General**), then add `NETLIFY_BLOBS_SITE_ID` and
   `NETLIFY_BLOBS_TOKEN` as environment variables. `netlify/functions/
   lib/store.js` uses these automatically if present.
4. Redeploy, share the root URL with branch/contact-center staff, keep
   `/dashboard.html` for yourself.
