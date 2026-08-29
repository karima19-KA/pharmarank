"""
AI assistant endpoint support.

Rather than trying to classify intent and fetch only the "relevant"
slice of data (fragile with this data's size), we build one compact
context bundle of real aggregates every time — top pharmacies, top
candidates, sector/city/seniority breakdowns — and hand it to the
model along with the person's question. This is small enough (a few
KB) to send on every call and means the assistant never has to guess:
every number it can mention is one we actually computed from the CSVs.

Uses Google's Gemini API (free tier via a Google AI Studio key) rather
than a paid API, since Gemini's Flash models have a genuine ongoing
free tier with no credit card required.
"""
from __future__ import annotations

import os
import json

import requests

from . import analytics, recommendation
from .pharmacy_scoring import compute_pharmacy_scores
from .data_loader import load_employees

GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_API_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
)


def build_context() -> str:
    pharmacies = compute_pharmacy_scores()
    employees = load_employees()
    recruitment = recommendation.compute_recruitment_scores()

    top_pharmacies = pharmacies[["rank", "company_name", "match_score", "secteur", "employe"]].head(10)
    top_candidates = recruitment[
        ["rank", "employee_name", "job_title", "company_name", "ville_clean", "recruitment_score", "tier"]
    ].head(10)

    context = {
        "nombre_total_pharmacies": int(len(pharmacies)),
        "nombre_total_candidats": int(len(employees)),
        "score_moyen_pharmacies": round(float(pharmacies["match_score"].mean()), 1),
        "score_moyen_recrutement": round(float(recruitment["recruitment_score"].mean()), 1),
        "top_10_pharmacies": top_pharmacies.to_dict(orient="records"),
        "top_10_candidats": top_candidates.to_dict(orient="records"),
        "repartition_par_secteur": analytics.sector_breakdown(),
        "top_10_villes_talent": analytics.top_villes_talent(),
        "repartition_par_seniorite": analytics.seniority_distribution(),
    }
    return json.dumps(context, ensure_ascii=False, default=str)


SYSTEM_PROMPT_TEMPLATE = """Tu es l'assistant intégré du tableau de bord Pharank, une application \
qui classe des pharmacies opérant au Maroc et des candidats à recruter, à partir de données \
scrapées sur LinkedIn et cure.ma.

Réponds toujours en français, de façon concise et directe (quelques phrases, pas d'essai).
Utilise UNIQUEMENT les données fournies ci-dessous dans CONTEXTE — n'invente jamais de chiffre, \
de nom d'entreprise ou de candidat qui n'y figure pas. Si la question porte sur une donnée \
absente du contexte, dis-le clairement plutôt que de deviner.

CONTEXTE (données réelles agrégées depuis la base) :
{context}
"""


def ask_assistant(message: str, history: list[dict]) -> dict:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return {
            "reply": (
                "L'assistant n'est pas encore configuré : il manque la variable "
                "d'environnement GEMINI_API_KEY côté serveur. Récupère une clé API "
                "gratuite sur aistudio.google.com (Get API key), ajoute-la dans "
                "l'environnement où tourne le backend, puis relance le serveur."
            ),
            "error": "missing_api_key",
        }

    context = build_context()
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(context=context)

    # Gemini's REST API doesn't have separate user/assistant message dicts
    # the way Anthropic's does — every turn is a "content" object with a
    # role of "user" or "model" and a list of "parts".
    contents = []
    for turn in history[-10:]:  # cap history sent, keeps requests small
        role = turn.get("role")
        content = turn.get("content")
        if role == "user" and content:
            contents.append({"role": "user", "parts": [{"text": content}]})
        elif role == "assistant" and content:
            contents.append({"role": "model", "parts": [{"text": content}]})
    contents.append({"role": "user", "parts": [{"text": message}]})

    try:
        response = requests.post(
            GEMINI_API_URL,
            params={"key": api_key},
            headers={"content-type": "application/json"},
            json={
                "system_instruction": {"parts": [{"text": system_prompt}]},
                "contents": contents,
                "generationConfig": {"maxOutputTokens": 600},
            },
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
        candidates = data.get("candidates", [])
        parts = candidates[0]["content"]["parts"] if candidates else []
        text = "\n".join(p.get("text", "") for p in parts).strip()
        return {"reply": text or "Je n'ai pas de réponse à proposer pour l'instant."}
    except requests.exceptions.RequestException as exc:
        return {
            "reply": (
                "L'appel à l'API Gemini a échoué. Vérifie que la clé API est valide "
                "et que le serveur a accès à internet."
            ),
            "error": str(exc),
        }
