"""
Aggregation functions backing the new dashboard charts. Every function
here reads directly from the existing cleaned CSVs via data_loader — no
fabricated numbers. Where a metric can't be computed directly (e.g. no
explicit hire-date field), the docstring says exactly what proxy is used
and why.
"""
from __future__ import annotations

import re
from collections import Counter

import pandas as pd

from .data_loader import load_companies, load_employees

MONTHS_FR = [
    "Jan", "Fév", "Mar", "Avr", "Mai", "Jun",
    "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc",
]

SENIORITY_LABELS = {
    0: "Non spécifié",
    1: "Junior / Stagiaire",
    2: "Confirmé",
    3: "Senior / Management",
    4: "Senior / Management",  # merged with 3 to match the 4-tier view
}
SENIORITY_ORDER = ["Confirmé", "Senior / Management", "Junior / Stagiaire", "Non spécifié"]


def sector_breakdown() -> list[dict]:
    df = load_companies()
    secteur = df["secteur"].fillna("Secteur non renseigné")
    counts = secteur.value_counts()
    total = counts.sum()
    return [
        {"label": label, "count": int(count), "pct": round(count / total * 100, 1)}
        for label, count in counts.items()
    ]


def top_companies_by_employee_count(n: int = 15) -> list[dict]:
    df = load_companies()
    ranked = df.dropna(subset=["employe"]).sort_values("employe", ascending=False).head(n)
    return [
        {"company_name": row["company_name"], "employe": int(row["employe"])}
        for _, row in ranked.iterrows()
    ]


def top_villes_talent(n: int = 10) -> list[dict]:
    df = load_employees()
    counts = df["ville_clean"][df["ville_clean"] != ""].value_counts().head(n)
    return [{"ville": v, "count": int(c)} for v, c in counts.items()]


def seniority_distribution() -> list[dict]:
    df = load_employees()
    labels = df["seniority_score"].map(SENIORITY_LABELS)
    counts = labels.value_counts()
    return [
        {"label": label, "count": int(counts.get(label, 0))}
        for label in SENIORITY_ORDER
    ]


def hiring_trend_by_month() -> list[dict]:
    """No explicit 'hire date' field exists in the scrape. The closest
    real signal is `exp_date_range`, which for currently-held positions
    is often just a start date like '01/2018'. We parse the month out of
    every parseable MM/YYYY value and aggregate across all years — this
    approximates seasonality in when people started their current roles,
    not month-over-month growth (the sample size, ~40 parseable dates
    out of 356 profiles, is too small for a true trend; treat this as
    directional, not authoritative)."""
    df = load_employees()
    month_counts = Counter()
    pattern = re.compile(r"^(\d{2})/(\d{4})$")
    for val in df["exp_date_range"].dropna():
        m = pattern.match(str(val).strip())
        if m:
            month = int(m.group(1))
            if 1 <= month <= 12:
                month_counts[month] += 1
    return [
        {"month": MONTHS_FR[i], "count": month_counts.get(i + 1, 0)}
        for i in range(12)
    ]


def _minmax_scale_100(series: pd.Series) -> pd.Series:
    lo, hi = series.min(skipna=True), series.max(skipna=True)
    if pd.isna(lo) or pd.isna(hi) or hi == lo:
        return series.fillna(0) * 0
    return ((series - lo) / (hi - lo) * 100).fillna(0)


def compare_companies(company_names: list[str]) -> list[dict]:
    """5-axis comparison for the radar chart. Every axis is a real,
    documented signal scaled 0-100 across *all* companies (not just the
    selected ones) so the radar stays comparable if you change the
    selection."""
    companies = load_companies()
    employees = load_employees()

    companies = companies.copy()
    companies["other_addresses_count"] = (
        companies["other_addresses"].fillna("")
        .apply(lambda s: len([a for a in str(s).split(";") if a.strip()]))
    )
    companies["has_website"] = companies["website"].notna() & (companies["website"].astype(str).str.strip() != "")
    profile_fields = ["website", "date_creation", "secteur", "employe", "primary_address"]
    companies["profile_completeness"] = companies[profile_fields].notna().sum(axis=1) / len(profile_fields)

    avg_experience = employees.groupby("company_name")["experience_months"].mean()
    pct_current = employees.groupby("company_name")["is_current"].mean()
    employee_counts = employees.groupby("company_name").size()

    companies["talent_depth_raw"] = companies["company_name"].map(avg_experience)
    companies["hiring_momentum_raw"] = companies["company_name"].map(pct_current) * 100
    companies["scraped_employee_count"] = companies["company_name"].map(employee_counts).fillna(0)

    companies["workforce_scale"] = _minmax_scale_100(companies["employe"])
    companies["talent_depth"] = _minmax_scale_100(companies["talent_depth_raw"])
    companies["digital_presence"] = (
        companies["has_website"].astype(float) * 50
        + companies["profile_completeness"] * 50
    )
    companies["market_reach"] = _minmax_scale_100(companies["other_addresses_count"])
    companies["hiring_momentum"] = companies["hiring_momentum_raw"].fillna(0)

    result = []
    for name in company_names:
        match = companies[companies["company_name"] == name]
        if match.empty:
            continue
        row = match.iloc[0]
        result.append({
            "company_name": name,
            "talent_depth": round(float(row["talent_depth"]), 1),
            "workforce_scale": round(float(row["workforce_scale"]), 1),
            "digital_presence": round(float(row["digital_presence"]), 1),
            "market_reach": round(float(row["market_reach"]), 1),
            "hiring_momentum": round(float(row["hiring_momentum"]), 1),
        })
    return result
