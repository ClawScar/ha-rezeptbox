"""Turn what a vision model answers about recipe photos into form fields.

This module has no Home Assistant imports: it only cleans up the answer, which
keeps the tricky part testable without a running system. The model is asked for
JSON, but a code fence, a sentence in front of it or a list of objects instead
of plain strings must not break the scan.
"""

from __future__ import annotations

import json
import re
from typing import Any

MAX_TITLE = 120
MAX_SERVINGS = 100

PROMPT = (
    "Lies die angehängten Fotos einer Rezeptkarte. "
    "Antworte ausschließlich mit JSON in dieser Form: "
    '{"title": "...", "servings": 4, "ingredients": ["..."], "instructions": ["..."]}. '
    "title ist die Überschrift des Rezepts, ohne Ziffern oder Verzierungen. "
    "servings ist die Portionszahl als Zahl oder null. "
    "ingredients enthält je eine Zeile mit Menge, Einheit und Zutat genau wie "
    "gedruckt, ohne Aufzählungszeichen und ohne die Überschrift „Zutaten“. "
    "instructions enthält je einen Zubereitungsschritt als ganzen Satz, ohne "
    "Nummerierung und ohne die Überschrift „Zubereitung“. "
    "Übernimm nichts aus Überschriften, Illustrationen oder Nachbarspalten, "
    "erfinde nichts und lass weg, was nicht lesbar ist. "
    "Die Sprache des Rezepts bleibt erhalten."
)

_FENCE = re.compile(r"```(?:json)?\s*(.+?)```", re.S)
_OBJECT = re.compile(r"\{.*\}", re.S)
_BULLET = re.compile(r"^\s*[-*•·–—]\s*")
_NUMBERING = re.compile(r"^\s*\d{1,2}\s*[.)]\s+")
_LINEBREAK = re.compile(r"\r?\n+")
_HEADINGS = {"zutaten", "zutaten:", "zubereitung", "zubereitung:", "ingredients", "instructions"}
_ENTRY_KEYS = ("text", "name", "ingredient", "step", "value")


class AiRecipeError(ValueError):
    """Raised when the answer holds no usable recipe."""


def _payload(answer: Any) -> dict[str, Any]:
    """Return the JSON object inside the answer, however the model wrapped it."""
    if isinstance(answer, dict):
        return answer

    text = str(answer or "").strip()
    if not text:
        raise AiRecipeError("Die KI hat nichts zurückgegeben.")

    candidates = [match.group(1).strip() for match in _FENCE.finditer(text)]
    candidates.append(text)
    block = _OBJECT.search(text)
    if block:
        candidates.append(block.group(0))

    for candidate in candidates:
        try:
            data = json.loads(candidate)
        except (TypeError, ValueError):
            continue
        if isinstance(data, dict):
            return data

    raise AiRecipeError("Die Antwort der KI war kein lesbares JSON.")


def _one_line(value: Any) -> str:
    """Return a single trimmed line, also when the model sent a list."""
    if isinstance(value, (list, tuple)):
        value = " ".join(str(item) for item in value if item is not None)
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[:MAX_TITLE]


def _entries(value: Any) -> list[str]:
    """Flatten a string, a list of strings or a list of objects into lines."""
    if value is None:
        return []
    if isinstance(value, str):
        raw = [value]
    elif isinstance(value, (list, tuple)):
        raw = []
        for entry in value:
            if isinstance(entry, dict):
                for key in _ENTRY_KEYS:
                    if isinstance(entry.get(key), str):
                        raw.append(entry[key])
                        break
            elif entry is not None:
                raw.append(str(entry))
    else:
        return []

    lines: list[str] = []
    for item in raw:
        for part in _LINEBREAK.split(str(item)):
            text = _BULLET.sub("", part).strip()
            if text.casefold() in _HEADINGS:
                continue
            if text:
                lines.append(text)
    return lines


def _instructions(value: Any) -> list[str]:
    """Steps lose their numbering so the form does not number them twice."""
    steps: list[str] = []
    for line in _entries(value):
        text = _NUMBERING.sub("", line).strip()
        if text:
            steps.append(text)
    return steps


def _servings(value: Any) -> int | None:
    """Return the serving count when it is a plausible number."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = int(value)
    else:
        match = re.search(r"\d+", str(value))
        if not match:
            return None
        number = int(match.group(0))
    return number if 1 <= number <= MAX_SERVINGS else None


def parse_ai_recipe(answer: Any) -> dict[str, Any]:
    """Return title, servings, ingredients and instructions from an answer."""
    data = _payload(answer)

    title = _one_line(data.get("title") or data.get("name"))
    ingredients = _entries(data.get("ingredients"))
    raw_steps = data.get("instructions")
    if raw_steps is None:
        raw_steps = data.get("steps")
    instructions = _instructions(raw_steps)

    if not ingredients and not instructions:
        raise AiRecipeError("Die KI hat keine Zutaten und keine Schritte erkannt.")

    servings = data.get("servings")
    if servings is None:
        servings = data.get("portions")

    return {
        "title": title,
        "servings": _servings(servings),
        "ingredients": ingredients,
        "instructions": instructions,
    }
