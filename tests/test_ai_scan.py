"""Tests for cleaning up what the AI answers about recipe photos."""

from __future__ import annotations

import sys
import types
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
COMPONENT = BASE / "custom_components" / "recipe_box"
sys.path.insert(0, str(BASE / "custom_components"))

# ai_recipe.py needs no Home Assistant, but importing it through the package
# would run __init__.py and its dependencies. A stub package keeps the test
# usable in a bare environment.
if "recipe_box" not in sys.modules:  # pragma: no cover - import guard
    package = types.ModuleType("recipe_box")
    package.__path__ = [str(COMPONENT)]
    sys.modules["recipe_box"] = package

from recipe_box.ai_recipe import (  # noqa: E402
    AiRecipeError,
    parse_ai_recipe,
)


class ParseAiRecipeTest(unittest.TestCase):
    def test_plain_json_object(self) -> None:
        recipe = parse_ai_recipe(
            '{"title": "Apfelkuchen", "servings": 8, '
            '"ingredients": ["4 Äpfel", "200 g Mehl"], '
            '"instructions": ["Äpfel schälen.", "Teig ausrollen und backen."]}'
        )
        self.assertEqual(recipe["title"], "Apfelkuchen")
        self.assertEqual(recipe["servings"], 8)
        self.assertEqual(recipe["ingredients"], ["4 Äpfel", "200 g Mehl"])
        self.assertEqual(
            recipe["instructions"],
            ["Äpfel schälen.", "Teig ausrollen und backen."],
        )

    def test_markdown_fence_is_removed(self) -> None:
        answer = '```json\n{"title": "Suppe", "ingredients": ["1 Zwiebel"]}\n```'
        recipe = parse_ai_recipe(answer)
        self.assertEqual(recipe["title"], "Suppe")
        self.assertEqual(recipe["ingredients"], ["1 Zwiebel"])

    def test_sentence_around_the_json_is_ignored(self) -> None:
        answer = (
            "Hier ist das Rezept:\n"
            '{"title": "Lasagne", "instructions": ["Schichten.", "Backen."]}\n'
            "Viel Spaß beim Kochen!"
        )
        recipe = parse_ai_recipe(answer)
        self.assertEqual(recipe["title"], "Lasagne")
        self.assertEqual(recipe["instructions"], ["Schichten.", "Backen."])

    def test_objects_and_newlines_become_lines(self) -> None:
        recipe = parse_ai_recipe(
            {
                "title": "Salat",
                "ingredients": [{"name": "1 Salat"}, {"text": "2 Tomaten"}],
                "instructions": "Waschen.\nMischen.\n",
            }
        )
        self.assertEqual(recipe["ingredients"], ["1 Salat", "2 Tomaten"])
        self.assertEqual(recipe["instructions"], ["Waschen.", "Mischen."])

    def test_bullets_and_headings_are_dropped(self) -> None:
        recipe = parse_ai_recipe(
            {
                "title": "Kuchen",
                "ingredients": ["Zutaten:", "- 3 Eier", "• 100 g Zucker"],
                "instructions": ["Zubereitung:", "1. Eier schlagen."],
            }
        )
        self.assertEqual(recipe["ingredients"], ["3 Eier", "100 g Zucker"])
        self.assertEqual(recipe["instructions"], ["Eier schlagen."])

    def test_a_printed_quantity_keeps_its_number(self) -> None:
        recipe = parse_ai_recipe(
            {"ingredients": ["2 EL Öl", "1/2 TL Salz"], "instructions": []}
        )
        self.assertEqual(recipe["ingredients"], ["2 EL Öl", "1/2 TL Salz"])

    def test_servings_from_text(self) -> None:
        recipe = parse_ai_recipe(
            {"servings": "für 4 Portionen", "ingredients": ["1 Ei"]}
        )
        self.assertEqual(recipe["servings"], 4)

    def test_unusable_servings_are_dropped(self) -> None:
        for value in ("viele", 0, 250, True):
            with self.subTest(value=value):
                recipe = parse_ai_recipe(
                    {"servings": value, "ingredients": ["1 Ei"]}
                )
                self.assertIsNone(recipe["servings"])

    def test_missing_title_stays_empty(self) -> None:
        recipe = parse_ai_recipe({"ingredients": ["1 Ei"]})
        self.assertEqual(recipe["title"], "")
        self.assertEqual(recipe["instructions"], [])

    def test_answers_without_a_recipe_raise(self) -> None:
        for answer in ("", "   ", "Ich kann das Bild nicht lesen.", "{}", []):
            with self.subTest(answer=answer):
                with self.assertRaises(AiRecipeError):
                    parse_ai_recipe(answer)


if __name__ == "__main__":
    unittest.main()
