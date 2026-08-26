from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import pharmacy_scoring, candidate_scoring, analytics, recommendation, assistant
from .data_loader import load_employees, load_companies

app = FastAPI(title="Pharma Ranking & Recruitment API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _clean(records: list[dict]) -> list[dict]:
    """Replace NaN/NaT with None and numpy scalar types with native Python
    types, by round-tripping through pandas' own (numpy-aware) JSON
    encoder rather than FastAPI's jsonable_encoder."""
    if not records:
        return []
    df = pd.DataFrame(records)
    return json.loads(df.to_json(orient="records", force_ascii=False))


def _clean_dict(d: dict) -> dict:
    """Same numpy-safe cleanup, for a single record (Series.to_dict())."""
    return json.loads(pd.Series(d).to_json(force_ascii=False))


def _to_native(obj):
    """Recursively convert numpy scalars (from a pandas row) to native
    Python types so FastAPI's default JSON encoder can handle them."""
    return json.loads(json.dumps(
        obj, default=lambda o: o.item() if hasattr(o, "item") else str(o)
    ))


@app.get("/api/stats")
def get_stats():
    pharmacies = pharmacy_scoring.compute_pharmacy_scores()
    employees = load_employees()
    top = pharmacies.iloc[0] if not pharmacies.empty else None
    return {
        "total_pharmacies": int(len(pharmacies)),
        "total_candidates": int(len(employees)),
        "avg_pharmacy_score": round(float(pharmacies["match_score"].mean()), 1) if not pharmacies.empty else 0,
        "top_pharmacy": {
            "company_name": top["company_name"],
            "match_score": top["match_score"],
        } if top is not None else None,
        "top_pharmacies_chart": _clean(
            pharmacies[["company_name", "match_score"]].head(10).to_dict(orient="records")
        ),
    }


@app.get("/api/pharmacies")
def get_pharmacies(search: Optional[str] = None):
    df = pharmacy_scoring.compute_pharmacy_scores()
    if search:
        df = df[df["company_name"].str.contains(search, case=False, na=False)]
    cols = [
        "rank", "company_name", "secteur", "employe", "match_score",
        "primary_address", "website", "linkedin_url", "has_website",
        "other_addresses_count",
    ]
    return _clean(df[cols].to_dict(orient="records"))


@app.get("/api/pharmacies/{company_name}")
def get_pharmacy_detail(company_name: str):
    df = pharmacy_scoring.compute_pharmacy_scores()
    match = df[df["company_name"].str.lower() == company_name.lower()]
    if match.empty:
        raise HTTPException(status_code=404, detail="Pharmacy not found")
    row = match.iloc[0]

    employees = load_employees()
    company_employees = employees[
        employees["company_name"].str.lower() == company_name.lower()
    ]

    profile = _clean_dict(row.to_dict())
    profile["score_breakdown"] = _to_native(pharmacy_scoring.score_breakdown(row))
    profile["employees"] = _clean(
        company_employees[
            ["employee_name", "job_title", "ville_clean", "experience_months",
             "is_current", "profile_url"]
        ].to_dict(orient="records")
    )
    return profile


@app.get("/api/candidates")
def get_candidates(
    query: str = Query(default=""),
    min_experience_years: Optional[float] = None,
    ville: Optional[str] = None,
    company: Optional[str] = None,
):
    min_months = int(min_experience_years * 12) if min_experience_years else None
    df = candidate_scoring.match_candidates(
        query=query, min_experience_months=min_months, ville=ville, company=company,
    )
    if df.empty:
        return []
    cols = [
        "employee_name", "job_title", "company_name", "ville_clean",
        "experience_months", "is_current", "match_score", "profile_url",
    ]
    return _clean(df[cols].to_dict(orient="records"))


@app.get("/api/candidates/detail")
def get_candidate_detail(profile_url: str, query: str = ""):
    df = candidate_scoring.match_candidates(query=query, top_n=10_000)
    match = df[df["profile_url"] == profile_url]
    if match.empty:
        raise HTTPException(status_code=404, detail="Candidate not found")
    row = match.iloc[0]
    profile = _clean_dict(row.to_dict())
    profile["score_breakdown"] = _to_native(candidate_scoring.candidate_breakdown(row))
    return profile


@app.get("/api/filters/villes")
def get_villes():
    employees = load_employees()
    villes = sorted(v for v in employees["ville_clean"].dropna().unique() if v)
    return villes


@app.get("/api/filters/companies")
def get_companies():
    companies = load_companies()
    return sorted(companies["company_name"].dropna().unique().tolist())


@app.get("/api/filters/job-titles")
def get_job_titles(top_n: int = 12):
    """Most frequent real job titles in the scrape, for the candidates
    page combobox + suggestion chips. Titles that are just punctuation/
    placeholders (e.g. '--', a lone dash meaning 'unspecified' in the
    scrape) are excluded — they're not real job titles."""
    employees = load_employees()
    titles = employees["job_title"].dropna()
    titles = titles[titles.str.strip() != ""]
    # require at least 2 real letters so junk like "--", "-", "N/A" is dropped
    has_letters = titles.str.count(r"[A-Za-zÀ-ÿ]") >= 2
    titles = titles[has_letters]
    counts = Counter(titles.str.strip())
    most_common = counts.most_common(top_n)
    return {
        "all_titles": sorted(counts.keys()),
        "top_suggestions": [{"title": t, "count": c} for t, c in most_common],
    }


# --- Dashboard analytics charts ---

@app.get("/api/analytics/sector-breakdown")
def get_sector_breakdown():
    return analytics.sector_breakdown()


@app.get("/api/analytics/top-companies")
def get_top_companies(n: int = 15):
    return analytics.top_companies_by_employee_count(n)


@app.get("/api/analytics/top-villes")
def get_top_villes(n: int = 10):
    return analytics.top_villes_talent(n)


@app.get("/api/analytics/seniority")
def get_seniority_distribution():
    return analytics.seniority_distribution()


@app.get("/api/analytics/hiring-trend")
def get_hiring_trend():
    return analytics.hiring_trend_by_month()


@app.get("/api/analytics/compare")
def get_compare_companies(companies: str = Query(..., description="Comma-separated company names")):
    names = [c.strip() for c in companies.split(",") if c.strip()]
    if not names:
        raise HTTPException(status_code=400, detail="Provide at least one company name")
    if len(names) > 5:
        names = names[:5]
    return analytics.compare_companies(names)


# --- Recruitment recommendation engine ---

@app.get("/api/recruitment/stats")
def get_recruitment_stats():
    df = recommendation.compute_recruitment_scores()
    elite = df[df["tier"] == "Elite Talent"]
    top = df.iloc[0] if not df.empty else None

    tier_order = ["Elite Talent", "Strong Candidate", "Potential Candidate", "À développer"]
    tier_counts = df["tier"].value_counts()
    tier_distribution = [
        {"tier": t, "count": int(tier_counts.get(t, 0))} for t in tier_order
    ]

    score_bins = [0, 20, 40, 60, 80, 100]
    bin_labels = ["0-20", "20-40", "40-60", "60-80", "80-100"]
    df["score_bin"] = pd.cut(df["recruitment_score"], bins=score_bins, labels=bin_labels, include_lowest=True)
    score_distribution = [
        {"range": label, "count": int((df["score_bin"] == label).sum())} for label in bin_labels
    ]

    return {
        "elite_count": int(len(elite)),
        "avg_score": round(float(df["recruitment_score"].mean()), 1) if not df.empty else 0,
        "top_candidate": {
            "employee_name": top["employee_name"],
            "recruitment_score": top["recruitment_score"],
        } if top is not None else None,
        "feature_importance": recommendation.feature_importance(),
        "tier_distribution": tier_distribution,
        "score_distribution": score_distribution,
    }


@app.get("/api/recruitment/candidates")
def get_recruitment_candidates(tiers: Optional[str] = None):
    df = recommendation.compute_recruitment_scores()
    if tiers:
        allowed = [t.strip() for t in tiers.split(",") if t.strip()]
        df = df[df["tier"].isin(allowed)]
    cols = [
        "rank", "employee_name", "job_title", "company_name", "ville_clean",
        "experience_months", "recruitment_score", "tier", "profile_url",
    ]
    return _clean(df[cols].to_dict(orient="records"))


@app.get("/api/recruitment/candidates/detail")
def get_recruitment_candidate_detail(profile_url: str):
    df = recommendation.compute_recruitment_scores()
    match = df[df["profile_url"] == profile_url]
    if match.empty:
        raise HTTPException(status_code=404, detail="Candidate not found")
    row = match.iloc[0]
    profile = _clean_dict(row.to_dict())
    profile["score_breakdown"] = _to_native(recommendation.recruitment_breakdown(row))
    return profile


@app.get("/api/recruitment/top-companies")
def get_recruitment_top_companies(n: int = 8):
    return recommendation.top_companies_by_talent(n)


# --- AI assistant ---

class AssistantMessage(BaseModel):
    role: str
    content: str


class AssistantRequest(BaseModel):
    message: str
    history: list[AssistantMessage] = []


@app.post("/api/assistant")
def post_assistant(req: AssistantRequest):
    history = [{"role": m.role, "content": m.content} for m in req.history]
    return assistant.ask_assistant(req.message, history)


# --- Serve the static frontend ---
FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
