"""
Pharmacy ranking model.

There's no ground-truth label for "best pharmacy" in this data, so a
supervised model isn't the right tool — there's nothing to learn from.
Instead this is a transparent weighted composite score: every input
signal is normalized 0-1 and combined with a fixed, documented weight.
This keeps every score fully explainable — you can always show *why* a
company ranks where it does, which matters for a hiring/business
decision a boss will actually act on.

Signals used (all derived from what we actually have):
- company_size        : declared LinkedIn employee count            (35%)
- linkedin_workforce   : total people indexed under 'Lieu de résidence'
                         insight card, a proxy for LinkedIn presence  (20%)
- multi_site           : number of extra office addresses listed     (15%)
- web_presence         : has a working website field                (10%)
- profile_completeness : how many of the profile fields are filled   (20%)
"""
from __future__ import annotations

import pandas as pd

from .data_loader import load_companies, load_insights

WEIGHTS = {
    "company_size": 0.35,
    "linkedin_workforce": 0.20,
    "multi_site": 0.15,
    "web_presence": 0.10,
    "profile_completeness": 0.20,
}

PROFILE_FIELDS = ["website", "date_creation", "secteur", "employe", "primary_address"]


def _minmax(series: pd.Series) -> pd.Series:
    lo, hi = series.min(skipna=True), series.max(skipna=True)
    if pd.isna(lo) or pd.isna(hi) or hi == lo:
        return series.fillna(0) * 0
    return ((series - lo) / (hi - lo)).fillna(0)


def compute_pharmacy_scores() -> pd.DataFrame:
    companies = load_companies()
    insights = load_insights()

    df = companies.merge(
        insights[["company_name", "lieu_de_résidence_total", "occupation_top",
                  "compétences_top", "études_top"]],
        on="company_name", how="left",
    )

    df["profile_completeness_raw"] = df[PROFILE_FIELDS].notna().sum(axis=1) / len(PROFILE_FIELDS)

    norm_size = _minmax(df["employe"])
    norm_workforce = _minmax(df["lieu_de_résidence_total"])
    norm_sites = _minmax(df["other_addresses_count"])
    norm_web = df["has_website"].astype(float)
    norm_complete = df["profile_completeness_raw"]

    df["score_company_size"] = norm_size
    df["score_linkedin_workforce"] = norm_workforce
    df["score_multi_site"] = norm_sites
    df["score_web_presence"] = norm_web
    df["score_profile_completeness"] = norm_complete

    df["match_score"] = (
        norm_size * WEIGHTS["company_size"]
        + norm_workforce * WEIGHTS["linkedin_workforce"]
        + norm_sites * WEIGHTS["multi_site"]
        + norm_web * WEIGHTS["web_presence"]
        + norm_complete * WEIGHTS["profile_completeness"]
    ) * 100

    df["match_score"] = df["match_score"].round(1)
    df = df.sort_values("match_score", ascending=False).reset_index(drop=True)
    df["rank"] = df.index + 1
    return df


def score_breakdown(row: pd.Series) -> list[dict]:
    """Per-company explanation of how the score was built, for the UI."""
    return [
        {"label": "Company size", "weight": WEIGHTS["company_size"],
         "normalized": round(row["score_company_size"], 2),
         "raw": row.get("employe")},
        {"label": "LinkedIn workforce signal", "weight": WEIGHTS["linkedin_workforce"],
         "normalized": round(row["score_linkedin_workforce"], 2),
         "raw": row.get("lieu_de_résidence_total")},
        {"label": "Multi-site presence", "weight": WEIGHTS["multi_site"],
         "normalized": round(row["score_multi_site"], 2),
         "raw": row.get("other_addresses_count")},
        {"label": "Web presence", "weight": WEIGHTS["web_presence"],
         "normalized": round(row["score_web_presence"], 2),
         "raw": bool(row.get("has_website"))},
        {"label": "Profile completeness", "weight": WEIGHTS["profile_completeness"],
         "normalized": round(row["score_profile_completeness"], 2),
         "raw": round(row.get("profile_completeness_raw", 0), 2)},
    ]
