"""
Recruitment Recommendation Engine.

Unlike candidate_scoring.py (which ranks candidates against a role you
type in), this scores every candidate on general "recruitability" —
independent of any specific search — so you get a standing shortlist to
browse. Same transparent-composite philosophy: 5 named, weighted signals,
each derived from real scraped fields.

| Signal              | Weight | Real field used                                   |
|----------------------|--------|----------------------------------------------------|
| experience_years    | 35%    | experience_months (parsed from exp_duration etc.)  |
| tenure_stability     | 25%    | is_current + experience length (long + current =   |
|                      |        | stable), the closest proxy available to a real      |
|                      |        | tenure-start-date field, which isn't in the scrape  |
| seniority_score      | 20%    | job-title keyword tier (same as candidate_scoring)  |
| connection_score     | 15%    | LinkedIn connection_degree (2e is a closer network  |
|                      |        | than 3e — used as a rough proxy for reach)          |
| positions_count      | 5%     | 1 for every profile (the scrape captures one current|
|                      |        | position per person, so this has almost no variance |
|                      |        | today — kept as a named, low-weight placeholder so  |
|                      |        | it's honest about being weak rather than hidden)    |
"""
from __future__ import annotations

import pandas as pd

from .data_loader import load_employees

WEIGHTS = {
    "experience_years": 0.35,
    "tenure_stability": 0.25,
    "seniority_score": 0.20,
    "connection_score": 0.15,
    "positions_count": 0.05,
}

MAX_EXPERIENCE_MONTHS_CAP = 180
MAX_SENIORITY = 4

TIER_THRESHOLDS = [
    (85, "Elite Talent"),
    (65, "Strong Candidate"),
    (40, "Potential Candidate"),
    (0, "À développer"),
]


def _tier(score: float) -> str:
    for threshold, label in TIER_THRESHOLDS:
        if score >= threshold:
            return label
    return "À développer"


def _connection_score(degree: str | float) -> float:
    if degree is None or (isinstance(degree, float) and pd.isna(degree)):
        return 0.0
    text = str(degree).strip().lower()
    if text.startswith("1"):
        return 1.0
    if text.startswith("2"):
        return 0.66
    if text.startswith("3"):
        return 0.33
    return 0.0


def compute_recruitment_scores() -> pd.DataFrame:
    df = load_employees().copy()

    df["score_experience_years"] = (
        df["experience_months"].fillna(0).clip(upper=MAX_EXPERIENCE_MONTHS_CAP)
        / MAX_EXPERIENCE_MONTHS_CAP
    )
    tenure_raw = df["experience_months"].fillna(0).clip(upper=MAX_EXPERIENCE_MONTHS_CAP) / MAX_EXPERIENCE_MONTHS_CAP
    df["score_tenure_stability"] = (tenure_raw * 0.7) + (df["is_current"].astype(float) * 0.3)
    df["score_seniority_score"] = df["seniority_score"] / MAX_SENIORITY
    df["score_connection_score"] = df["connection_degree"].apply(_connection_score)
    df["score_positions_count"] = 1.0  # see module docstring — weak signal today

    df["recruitment_score"] = (
        df["score_experience_years"] * WEIGHTS["experience_years"]
        + df["score_tenure_stability"] * WEIGHTS["tenure_stability"]
        + df["score_seniority_score"] * WEIGHTS["seniority_score"]
        + df["score_connection_score"] * WEIGHTS["connection_score"]
        + df["score_positions_count"] * WEIGHTS["positions_count"]
    ) * 100
    df["recruitment_score"] = df["recruitment_score"].round(1)
    df["tier"] = df["recruitment_score"].apply(_tier)

    df = df.sort_values("recruitment_score", ascending=False).reset_index(drop=True)
    df["rank"] = df.index + 1
    return df


def recruitment_breakdown(row: pd.Series) -> list[dict]:
    return [
        {"label": "Ancienneté (expérience)", "weight": WEIGHTS["experience_years"],
         "normalized": round(float(row["score_experience_years"]), 2)},
        {"label": "Stabilité (tenure)", "weight": WEIGHTS["tenure_stability"],
         "normalized": round(float(row["score_tenure_stability"]), 2)},
        {"label": "Signal de séniorité", "weight": WEIGHTS["seniority_score"],
         "normalized": round(float(row["score_seniority_score"]), 2)},
        {"label": "Réseau (connexions)", "weight": WEIGHTS["connection_score"],
         "normalized": round(float(row["score_connection_score"]), 2)},
        {"label": "Nombre de postes", "weight": WEIGHTS["positions_count"],
         "normalized": round(float(row["score_positions_count"]), 2)},
    ]


def feature_importance() -> list[dict]:
    """Static view of the weights above, formatted for the 'what drives
    recruitability' bar chart — these are the model's declared weights,
    not a fitted importance (there's no labeled outcome to fit against)."""
    labels = {
        "experience_years": "Années d'expérience",
        "tenure_stability": "Stabilité (tenure)",
        "seniority_score": "Signal de séniorité",
        "connection_score": "Score de connexions",
        "positions_count": "Nombre de postes",
    }
    return [
        {"feature": labels[k], "importance": v}
        for k, v in sorted(WEIGHTS.items(), key=lambda kv: -kv[1])
    ]


def top_companies_by_talent(n: int = 8) -> list[dict]:
    """Which pharmacies have the most Elite/Strong-tier candidates among
    their scraped employees — i.e. where the recruitable talent is
    currently concentrated. Real counts from the same scored dataframe,
    no separate data source."""
    df = compute_recruitment_scores()
    talent = df[df["tier"].isin(["Elite Talent", "Strong Candidate"])]
    counts = talent.groupby("company_name").size().sort_values(ascending=False).head(n)
    return [{"company_name": name, "count": int(count)} for name, count in counts.items()]
