# Info Hub Discovery Survey

A discovery survey for branch and contact-center staff, feeding a future
"internal info hub" platform (products, procedures, campaigns, internal
news) with a possible AI chatbot. Two pages:

- **`index.html`** — the Armenian survey (10 questions, with branching:
  Q1 location filters Q2's role list; Q4 selecting "Outlook նամակագրություն"
  reveals a sub-question). Public link, no login.
- **`dashboard.html`** — results view. Stat tiles, a bar-chart breakdown for
  every closed question, and the two open-text questions (9 and 10) listed
  in full with respondent role/location. Filter by location, export
  everything as CSV.

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
- No Claude API calls in this project (unlike `feedback-triage-tool`) —
  it's a closed-question survey, nothing to classify. `.env.example` is
  kept only for consistency / in case an "analyze open text" feature gets
  added later for Q9/Q10.

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
