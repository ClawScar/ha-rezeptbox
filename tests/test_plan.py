"""Tests for meal plan entries with free-text labels."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE / "custom_components" / "recipe_box"))

import plan as meal_plan  # noqa: E402


class PlanEntryTest(unittest.TestCase):
    def test_recipe_entry_keeps_url_and_servings(self) -> None:
        entry = meal_plan.make_plan_entry("https://example.org/x", 4)
        self.assertEqual(entry, {"url": "https://example.org/x", "servings": 4})

    def test_label_replaces_the_recipe(self) -> None:
        entry = meal_plan.make_plan_entry("https://example.org/x", None, "Reste")
        self.assertEqual(entry, {"url": "", "servings": None, "label": "Reste"})

    def test_label_is_trimmed_and_shortened(self) -> None:
        entry = meal_plan.make_plan_entry(label="  Essen   bei Oma  ")
        self.assertEqual(entry["label"], "Essen bei Oma")
        long = meal_plan.make_plan_entry(label="x" * 100)
        self.assertEqual(len(long["label"]), meal_plan.MAX_PLAN_LABEL)

    def test_entries_without_target_are_dropped(self) -> None:
        self.assertIsNone(meal_plan.normalize_plan_entry({"url": "", "label": " "}))
        self.assertIsNone(meal_plan.normalize_plan_entry("Reste"))
        self.assertEqual(
            meal_plan.normalize_plan_entry({"url": "https://example.org/x"}),
            {"url": "https://example.org/x", "servings": None},
        )

    def test_stored_entries_are_normalized(self) -> None:
        normalized = meal_plan.normalize_plan_entry(
            {"url": "https://example.org/x", "label": " Auswärts ", "servings": 2}
        )
        self.assertEqual(normalized, {"url": "", "servings": 2, "label": "Auswärts"})


if __name__ == "__main__":
    unittest.main()
