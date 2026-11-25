"""Meal plan entries: recipes and free-text days such as leftovers."""

from __future__ import annotations

from typing import Any

MAX_PLAN_LABEL = 40


def clean_plan_label(value: Any) -> str:
    """Return a short single-line label for a day without a recipe."""
    return " ".join(str(value or "").split())[:MAX_PLAN_LABEL].strip()


def make_plan_entry(
    url: str = "", servings: Any = None, label: str = ""
) -> dict[str, Any]:
    """Build one stored plan entry; a label replaces the recipe."""
    text = clean_plan_label(label)
    entry: dict[str, Any] = {
        "url": "" if text else str(url or ""),
        "servings": servings,
    }
    if text:
        entry["label"] = text
    return entry


def normalize_plan_entry(entry: Any) -> dict[str, Any] | None:
    """Return a stored plan entry or None when it points at nothing."""
    if not isinstance(entry, dict):
        return None
    label = clean_plan_label(entry.get("label"))
    url = str(entry.get("url") or "")
    if not label and not url:
        return None
    return make_plan_entry(url, entry.get("servings"), label)
