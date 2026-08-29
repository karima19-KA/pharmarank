# Pharank — pharmacy ranking & recruitment dashboard

**Live app:** https://pharmarank-production.up.railway.app/ (deployed on Railway)

A dashboard for ranking pharmaceutical labs operating in Morocco and
scoring candidates worth recruiting, built on top of the scraped
LinkedIn dataset (`labos_linkedin_merged_clean.csv`,
`labos_linkedin_employees_with_experience_clean.csv`,
`labos_linkedin_people_insights_wide.csv`).

## Stack

- **Backend:** Python, FastAPI, pandas, scikit-learn — one process that
  serves both the JSON API and the static frontend, no separate server
  needed.
- **Frontend:** plain HTML/CSS/JS (same stack as your CakePHP/CRM VMP
  frontends — no Node/npm build step), Chart.js from CDN for the one
  chart on the dashboard. Styled with the same purple/lavender design
  system as CRM VMP (`#6C63F5` primary, Poppins, rounded cards, pill
  badges).

## Folder structure

```
pharma-dashboard/
├── backend/
│   ├── requirements.txt
│   ├── data/                   # the 3 CSVs live here
│   └── app/
│       ├── main.py             # FastAPI routes + serves the frontend
│       ├── data_loader.py      # loads & cleans the 3 CSVs
│       ├── pharmacy_scoring.py # pharmacy ranking model
│       ├── candidate_scoring.py# role-search candidate matching model
│       ├── analytics.py        # dashboard chart aggregations
│       ├── recommendation.py   # recruitment recommendation engine scoring
│       └── assistant.py        # AI assistant (Google Gemini API) context + call
└── frontend/
    ├── index.html               # dashboard (KPIs, 6 charts, filters, export)
    ├── pharmacies.html          # full ranked pharmacy list + detail drawer
    ├── candidates.html          # role search + ranked candidate list
    ├── recruitment.html         # standing recruitment recommendation engine
    └── assets/
        ├── css/style.css
        └── js/ (common.js, dashboard.js, pharmacies.js, candidates.js, recruitment.js)
```

## Running it

**Just use the live deployment** — https://pharmarank-production.up.railway.app/ — nothing to install.

### Running it locally (development)

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Then open **http://localhost:8000**. `--reload` picks up code changes live.
On Windows PowerShell, run the same three commands from inside `backend/`
(activate your venv first if you're using one).

### Enabling the AI assistant (optional)

The floating chat widget (bottom-right, every page) calls Google's Gemini
API (free tier, no credit card required) with real aggregated data from
your CSVs as context. It needs an API key from **aistudio.google.com**
(click "Get API key") set as an environment variable before starting the
server:

```bash
export GEMINI_API_KEY=AIza...
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

On Windows PowerShell, use `$env:GEMINI_API_KEY="AIza..."` instead.

On the live Railway deployment, `GEMINI_API_KEY` is set under the
service's **Variables** tab rather than exported in a terminal.

Without it, the assistant still opens and replies, but tells you clearly
that the key is missing rather than pretending to answer.

## How the two models work

Both scores are **transparent weighted composites**, not black-box
models — every score in the UI expands into its named components, so
you can always show *why* a pharmacy or candidate ranked where it did.
That was a deliberate choice: there's no ground-truth label for "best
pharmacy" in this data, so nothing supervised could actually be trained
on it. A composite score is the honest tool for this data, and it's
still fair to call it a scoring model — it's just an explainable one.

### Pharmacy ranking (`pharmacy_scoring.py`)

| Signal | Weight | What it measures |
|---|---|---|
| Company size | 35% | Declared LinkedIn employee count |
| LinkedIn workforce signal | 20% | Total people indexed under "Lieu de résidence" in the People-insights scrape — a proxy for how large the company's LinkedIn-visible team is |
| Multi-site presence | 15% | Number of extra office addresses listed |
| Web presence | 10% | Has a working website field |
| Profile completeness | 20% | Share of key profile fields filled in |

Each signal is min-max normalized (0–1) across all companies, then
combined by weight and scaled to 0–100.

### Candidate matching (`candidate_scoring.py`)

This one does use real ML: a **TF-IDF + cosine similarity** model
(scikit-learn) compares the boss's free-text role description against
each candidate's job title, so "responsable qualité pharmaceutique"
actually gets scored against how close each profile's title/experience
is in a vector space — not just a keyword `contains()` check.

| Signal | Weight | What it measures |
|---|---|---|
| Role text match | 50% | TF-IDF cosine similarity between the search text and the candidate's job title/experience |
| Seniority | 25% | Keyword tier parsed from the job title (Directeur > Manager > Ingénieur/Pharmacien > Technicien) |
| Experience length | 15% | Total months of experience, normalized against a 15-year cap |
| Currently employed | 10% | Whether the scraped profile shows them as still active in that role |

## Known data limitations (worth knowing before trusting the ranking)

- **"Company size" reflects LinkedIn's global figure**, not headcount in
  Morocco specifically. That's why multinationals like Pfizer/Sanofi/Bayer
  currently rank at the top — their global LinkedIn page shows tens of
  thousands of employees, which dwarfs Moroccan-only labs. If you want a
  ranking that reflects Moroccan presence specifically, that weight
  should probably come down, or be replaced with something Morocco-specific
  (e.g. number of Moroccan office addresses, which is already a separate
  signal in the model).
- **Experience-duration parsing is best-effort.** The employee-experience
  scrape has columns that shift depending on the row (a known artifact
  of the source scraper, not something introduced here), so
  `experience_months` is derived by scanning several fields for a
  "X ans Y mois" pattern rather than trusting one fixed column. It won't
  be 100% accurate for every row.
- **Small sample per company.** The People-insights file only has 5
  ranked rows per category per company, and the employee-experience file
  has ~356 profiles across 43 companies (~8 per company on average) — a
  small sample for anything statistical, fine for a directional ranking.

## Extending it

- Swap the pharmacy weights in `WEIGHTS` at the top of
  `pharmacy_scoring.py` — no other code needs to change.
- Add a real supervised model later if you get a labeled target (e.g. the
  boss manually rates 15–20 pharmacies "good/bad" — that's enough to try
  a simple classifier and compare it against the composite score).
- The API is fully decoupled from the frontend (`/api/...` routes) — you
  could swap the plain-JS frontend for React later without touching the
  Python side at all.

## What's new: dashboard charts, recruitment engine, AI assistant

- **Dashboard** now has 6 additional chart cards: sector breakdown, top
  15 labs by declared headcount, top 10 cities for talent, seniority
  distribution, a hiring-trend line (see caveat below), and a closable-tag
  radar comparing up to 5 labs on 5 real signals. All computed in
  `analytics.py` from the same CSVs — nothing fabricated.
- **Hiring trend caveat:** there's no explicit hire-date field in the
  scrape. The chart uses `exp_date_range` (only present for ~40 of 356
  profiles) as the closest real proxy and says so directly under the
  chart — treat it as directional, not a precise trend.
- **Recruitment Recommendation Engine** (`/recruitment.html`): a standing,
  query-independent score for every candidate (unlike `candidates.html`,
  which scores against a role you type). 5 weighted, documented signals
  in `recommendation.py` — ancienneté, stabilité, séniorité, réseau,
  nombre de postes — with tiers (Elite Talent / Strong Candidate /
  Potential Candidate) and a feature-importance chart showing the
  model's declared (not fitted — there's no labeled outcome to fit
  against) weights.
- **AI assistant**: floating chat button on every page, backed by
  `/api/assistant` in `assistant.py`. It builds a compact JSON bundle of
  real aggregates (top pharmacies, top candidates, sector/city/seniority
  breakdowns) and sends it as context to the Gemini API alongside your
  question, so every number it can mention is one actually computed from
  the data. Requires `GEMINI_API_KEY` (see "Enabling the AI assistant"
  above) — conversation history is kept client-side in `sessionStorage`.
- **Candidates page**: the free-text role field is now a combobox backed
  by the real, distinct `job_title` values in the scrape (via
  `/api/filters/job-titles`), plus clickable suggestion chips for the
  most frequent titles.
- **Sidebar**: grouped into "Analyse" (Tableau de bord / Pharmacies /
  Candidats) and "Outils" (Moteur de recommandation / Assistant IA),
  collapsible (state remembered via `localStorage`), with a mini profile
  block at the bottom.

## Data-quality fixes applied while building this

- **Sanofi was scraped twice** (two rows, slightly different declared
  employee counts) — deduplicated at the data-loading layer
  (`data_loader.py`), so it no longer appears twice anywhere in the app.
- **The literal string `"none"`** (not a real empty value) was leaking
  into city dropdowns and the "top cities" chart as if it were an actual
  city — now filtered out at load time.