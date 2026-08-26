"""
Candidate matching model.

The boss types the role they're hiring for (free text, e.g. "responsable
qualité pharmaceutique"). We score every scraped employee profile against
that text using:

  1. TF-IDF + cosine similarity between the query and each candidate's
     job title / experience title (the actual ML component — this is a
     real vector-space text-matching model, from scikit-learn)     (50%)
  2. Seniority tier parsed from job-title keywords                  (25%)
  3. Experience length in months, normalized                        (15%)
  4. Currently employed bonus                                       (10%)

Like the pharmacy score, every candidate's total is broken into these
same four named components in the API response, so "why did this person
rank #1" is always answerable.
"""
from __future__ import annotations

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from .data_loader import load_employees

WEIGHTS = {
    "text_match": 0.50,
    "seniority": 0.25,
    "experience": 0.15,
    "currently_employed": 0.10,
}

MAX_SENIORITY = 4
MAX_EXPERIENCE_MONTHS_CAP = 180  # 15 years — anything beyond this is treated as "maxed out"


def _text_corpus(df: pd.DataFrame) -> pd.Series:
    return (
        df["job_title"].fillna("") + " " + df["exp_job_title"].fillna("")
    ).str.lower()


def match_candidates(
    query: str,
    min_experience_months: int | None = None,
    ville: str | None = None,
    company: str | None = None,
    top_n: int = 50,
) -> pd.DataFrame:
    df = load_employees().copy()

    if ville:
        df = df[df["ville_clean"].str.lower() == ville.lower()]
    if company:
        df = df[df["company_name"].str.lower() == company.lower()]
    if min_experience_months is not None:
        df = df[df["experience_months"].fillna(0) >= min_experience_months]

    if df.empty:
        return df

    corpus = _text_corpus(df)

    if query and query.strip():
        vectorizer = TfidfVectorizer(stop_words=None)
        try:
            tfidf_matrix = vectorizer.fit_transform(list(corpus) + [query.lower()])
            sims = cosine_similarity(tfidf_matrix[-1], tfidf_matrix[:-1]).flatten()
        except ValueError:
            # empty vocabulary (e.g. query is only stopword-like) — fall back to no signal
            sims = pd.Series(0.0, index=df.index).values
    else:
        sims = pd.Series(0.0, index=df.index).values

    df["score_text_match"] = sims
    df["score_seniority"] = df["seniority_score"] / MAX_SENIORITY
    df["score_experience"] = (
        df["experience_months"].fillna(0).clip(upper=MAX_EXPERIENCE_MONTHS_CAP)
        / MAX_EXPERIENCE_MONTHS_CAP
    )
    df["score_currently_employed"] = df["is_current"].astype(float)

    df["match_score"] = (
        df["score_text_match"] * WEIGHTS["text_match"]
        + df["score_seniority"] * WEIGHTS["seniority"]
        + df["score_experience"] * WEIGHTS["experience"]
        + df["score_currently_employed"] * WEIGHTS["currently_employed"]
    ) * 100
    df["match_score"] = df["match_score"].round(1)

    df = df.sort_values("match_score", ascending=False).head(top_n).reset_index(drop=True)
    return df


def candidate_breakdown(row: pd.Series) -> list[dict]:
    return [
        {"label": "Role text match", "weight": WEIGHTS["text_match"],
         "normalized": round(float(row["score_text_match"]), 2)},
        {"label": "Seniority", "weight": WEIGHTS["seniority"],
         "normalized": round(float(row["score_seniority"]), 2),
         "raw": row.get("job_title")},
        {"label": "Experience length", "weight": WEIGHTS["experience"],
         "normalized": round(float(row["score_experience"]), 2),
         "raw": row.get("experience_months")},
        {"label": "Currently employed", "weight": WEIGHTS["currently_employed"],
         "normalized": round(float(row["score_currently_employed"]), 2),
         "raw": bool(row.get("is_current"))},
    ]
