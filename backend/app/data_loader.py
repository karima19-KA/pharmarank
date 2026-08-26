
from __future__ import annotations

import re
from pathlib import Path
from functools import lru_cache

import pandas as pd

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

COMPANIES_FILE = DATA_DIR / "labos_linkedin_merged_clean.csv"
EMPLOYEES_FILE = DATA_DIR / "labos_linkedin_employees_with_experience_clean.csv"
INSIGHTS_FILE = DATA_DIR / "labos_linkedin_people_insights_wide.csv"

INSIGHT_CATEGORY_COLUMNS = [
    "Lieu de résidence",
    "Lieu d'études",
    "Occupation",
    "Compétences",
    "Études",
    "Connexion",
]


def _split_count_label(cell: str | float) -> tuple[float | None, str | None]:
    """Cells look like '982 | Maroc' -> (982.0, 'Maroc'). Some cells are
    just a bare count-less label or NaN; handle both gracefully."""
    if pd.isna(cell):
        return None, None
    cell = str(cell)
    if "|" in cell:
        count_part, label_part = cell.split("|", 1)
        digits = re.sub(r"[^\d]", "", count_part)
        count = float(digits) if digits else None
        return count, label_part.strip()
    return None, cell.strip()


DURATION_PATTERN = re.compile(
    r"(?:(\d+)\s*an[s]?)?\s*(?:(\d+)\s*mois)?", re.IGNORECASE
)


def _parse_duration_months(*candidates: str | float) -> float | None:
    """The employee-experience scrape shifts columns unpredictably row to
    row (a known artifact of the source scraper), so instead of trusting
    one fixed column we scan every candidate field for a 'X ans Y mois'
    style pattern and take the first real match. Returns total months."""
    for value in candidates:
        if value is None or (isinstance(value, float) and pd.isna(value)):
            continue
        text = str(value)
        if text.strip().lower() in ("none", "nan", ""):
            continue
        m = re.search(r"(\d+)\s*an[s]?", text, re.IGNORECASE)
        years = int(m.group(1)) if m else 0
        m2 = re.search(r"(\d+)\s*mois", text, re.IGNORECASE)
        months = int(m2.group(1)) if m2 else 0
        if years or months:
            return years * 12 + months
    return None


SENIORITY_KEYWORDS = [
    # (score, keywords) — highest match wins. Score is on a 0-4 scale.
    (4, ["directeur", "director", "head of", "chef d'entreprise", "fondateur",
         "founder", "ceo", "gérant", "président"]),
    (3, ["manager", "responsable", "chef de", "lead ", "superviseur"]),
    (2, ["ingénieur", "pharmacien", "spécialiste", "consultant", "chargé"]),
    (1, ["technicien", "assistant", "stagiaire", "stage", "opérateur"]),
]


def _seniority_score(job_title: str | float) -> int:
    if job_title is None or (isinstance(job_title, float) and pd.isna(job_title)):
        return 0
    text = str(job_title).lower()
    for score, keywords in SENIORITY_KEYWORDS:
        if any(k in text for k in keywords):
            return score
    return 0


def _is_currently_employed(state: str | float) -> bool:
    if state is None or (isinstance(state, float) and pd.isna(state)):
        return False
    return "aujourd" in str(state).lower()


@lru_cache
def load_companies() -> pd.DataFrame:
    df = pd.read_csv(COMPANIES_FILE)
    # Sanofi was scraped twice (visible as two rows with slightly different
    # employee counts, likely re-scraped on different days) — keep the
    # first occurrence so it doesn't appear twice across the app.
    df = df.drop_duplicates(subset=["company_name"], keep="first")
    df["employe"] = pd.to_numeric(df["employe"], errors="coerce")
    df["has_website"] = df["website"].notna() & (df["website"].astype(str).str.strip() != "")
    df["other_addresses_count"] = (
        df["other_addresses"]
        .fillna("")
        .apply(lambda s: len([a for a in str(s).split(";") if a.strip()]))
    )
    df["has_primary_address"] = df["primary_address"].notna()
    df["company_slug"] = (
        df["linkedin_url"].str.extract(r"company/([^/]+)/")[0]
    )
    return df


@lru_cache
def load_insights() -> pd.DataFrame:
    """Wide 5-rows-per-company file -> tidy per-company aggregates.

    For each category column we sum the parsed counts across the 5 ranked
    rows to get a rough 'total signal volume' per company (e.g. total
    people counted under 'Lieu de résidence' approximates the size of the
    company's LinkedIn-indexed workforce), and we keep the #1-ranked label
    per category as the dominant value (e.g. most common Occupation)."""
    df = pd.read_csv(INSIGHTS_FILE)
    records = []
    for company, group in df.groupby("company_name"):
        group = group.sort_values("rank")
        rec = {"company_name": company, "linkedin_url": group["linkedin_url"].iloc[0]}
        for col in INSIGHT_CATEGORY_COLUMNS:
            if col not in group.columns:
                continue
            counts, labels = [], []
            for cell in group[col]:
                c, l = _split_count_label(cell)
                if c is not None:
                    counts.append(c)
                if l:
                    labels.append(l)
            safe_col = col.replace("'", "").replace("’", "").replace(" ", "_").lower()
            rec[f"{safe_col}_total"] = sum(counts) if counts else None
            rec[f"{safe_col}_top"] = labels[0] if labels else None
        records.append(rec)
    return pd.DataFrame(records)


@lru_cache
def _normalize_name(name: str) -> str:
    """Raw scraped names mix ALL CAPS, lowercase, and Title Case — normalize
    to Title Case for consistent display, while respecting hyphens and
    apostrophes (e.g. 'jean-paul o'brien' -> 'Jean-Paul O'Brien')."""
    name = str(name).strip()
    if not name:
        return name
    return re.sub(
        r"[A-Za-zÀ-ÖØ-öø-ÿ]+",
        lambda m: m.group(0).capitalize(),
        name,
    )


def load_employees() -> pd.DataFrame:
    df = pd.read_csv(EMPLOYEES_FILE)
    df["employee_name"] = df["employee_name"].fillna("").apply(_normalize_name)
    df["experience_months"] = df.apply(
        lambda r: _parse_duration_months(
            r.get("exp_duration"), r.get("exp_date_range"),
            r.get("work_type"), r.get("exp_job_title"), r.get("exp_company"),
        ),
        axis=1,
    )
    df["seniority_score"] = df["job_title"].apply(_seniority_score)
    df["is_current"] = df["state"].apply(_is_currently_employed)
    df["ville_clean"] = (
        df["ville"].fillna("").apply(lambda s: str(s).split(",")[0].strip())
    )
    df.loc[df["ville_clean"].str.lower() == "none", "ville_clean"] = ""
    return df


def clear_cache() -> None:
    load_companies.cache_clear()
    load_insights.cache_clear()
    load_employees.cache_clear()
