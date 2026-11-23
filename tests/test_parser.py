"""Tests for the pure parsing helpers of Rezeptbox."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE / "custom_components" / "recipe_box"))

import parser as recipe_parser  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"


class DurationTest(unittest.TestCase):
    def test_iso_durations(self) -> None:
        self.assertEqual(recipe_parser.parse_duration("PT1H30M"), 90)
        self.assertEqual(recipe_parser.parse_duration("PT45M"), 45)
        self.assertEqual(recipe_parser.parse_duration("P1DT2H"), 1560)
        self.assertEqual(recipe_parser.parse_duration("PT30S"), 1)
        self.assertEqual(recipe_parser.parse_duration("PT0M"), None)
        self.assertEqual(recipe_parser.parse_duration(None), None)
        self.assertEqual(recipe_parser.parse_duration(""), None)

    def test_human_durations(self) -> None:
        self.assertEqual(recipe_parser.parse_duration("1 Std. 30 Min."), 90)
        self.assertEqual(recipe_parser.parse_duration("45 Minuten"), 45)
        self.assertEqual(recipe_parser.parse_duration("2 hours"), 120)
        self.assertEqual(recipe_parser.parse_duration("40"), 40)
        self.assertEqual(recipe_parser.parse_duration(30), 30)


class ServingsTest(unittest.TestCase):
    def test_servings(self) -> None:
        self.assertEqual(recipe_parser.parse_servings("4 Portionen"), 4)
        self.assertEqual(recipe_parser.parse_servings("Für 2 Personen"), 2)
        self.assertEqual(recipe_parser.parse_servings(6), 6)
        self.assertEqual(recipe_parser.parse_servings(["4", "8"]), 4)
        self.assertIsNone(recipe_parser.parse_servings(None))
        self.assertIsNone(recipe_parser.parse_servings("keine Angabe"))


class TextTest(unittest.TestCase):
    def test_clean_text(self) -> None:
        self.assertEqual(
            recipe_parser.clean_text("  <b>Kürbis</b>&nbsp;würfeln\n"), "Kürbis würfeln"
        )
        self.assertEqual(recipe_parser.as_text({"@type": "Person", "name": "Anna"}), "Anna")
        self.assertEqual(recipe_parser.as_text(["A", {"name": "B"}]), "A, B")

    def test_keywords(self) -> None:
        self.assertEqual(
            recipe_parser.split_keywords("suppe, herbst; vegetarisch"),
            ["suppe", "herbst", "vegetarisch"],
        )


class UrlTest(unittest.TestCase):
    def test_normalize_url(self) -> None:
        self.assertEqual(
            recipe_parser.normalize_url("www.chefkoch.de/rezepte/123/Test.html#top"),
            "https://www.chefkoch.de/rezepte/123/Test.html",
        )
        with self.assertRaises(recipe_parser.RecipeError):
            recipe_parser.normalize_url("")
        with self.assertRaises(recipe_parser.RecipeError):
            recipe_parser.normalize_url("ftp://example.com/rezept")

    def test_chefkoch_recipe_id(self) -> None:
        self.assertEqual(
            recipe_parser.chefkoch_recipe_id(
                "https://www.chefkoch.de/rezepte/4291431709202820/Spargel-Pesto.html"
            ),
            "4291431709202820",
        )
        self.assertEqual(
            recipe_parser.chefkoch_recipe_id("https://m.chefkoch.de/rezepte/123/Test.html"),
            "123",
        )
        self.assertIsNone(
            recipe_parser.chefkoch_recipe_id("https://example.com/rezepte/123/Test.html")
        )


class JsonLdTest(unittest.TestCase):
    def setUp(self) -> None:
        self.recipe = recipe_parser.parse_jsonld_html(
            (FIXTURES / "recipe_jsonld.html").read_text(encoding="utf-8"),
            "https://example.com/rezepte/kuerbissuppe",
        )

    def test_recipe_is_found_in_graph(self) -> None:
        self.assertIsNotNone(self.recipe)
        assert self.recipe is not None
        self.assertEqual(self.recipe.title, "Kürbissuppe mit Ingwer")
        self.assertEqual(self.recipe.servings, 4)
        self.assertEqual(self.recipe.total_minutes, 40)
        self.assertEqual(self.recipe.prep_minutes, 15)
        self.assertEqual(self.recipe.cook_minutes, 25)
        self.assertEqual(self.recipe.site, "example.com")
        self.assertEqual(self.recipe.author, "Anna Muster")

    def test_image_and_text_fields(self) -> None:
        assert self.recipe is not None
        self.assertEqual(
            self.recipe.image_url, "https://example.com/bilder/kuerbissuppe.jpg"
        )
        self.assertIn("Herbst", self.recipe.description)
        self.assertEqual(self.recipe.category, "Suppe")
        self.assertEqual(self.recipe.cuisine, "Deutsch")
        self.assertIn("vegetarisch", self.recipe.tags)
        self.assertEqual(self.recipe.rating, 4.7)
        self.assertEqual(self.recipe.rating_count, 128)
        self.assertEqual(self.recipe.nutrition.get("calories"), "210 kcal")

    def test_ingredients_and_steps(self) -> None:
        assert self.recipe is not None
        self.assertEqual(len(self.recipe.ingredients), 3)
        self.assertIn("1 Hokkaido-Kürbis", self.recipe.ingredients)
        self.assertEqual(len(self.recipe.instructions), 3)
        self.assertEqual(self.recipe.instructions[0], "Kürbis waschen und würfeln.")
        self.assertEqual(self.recipe.instructions[1], "Ingwer fein hacken.")
        self.assertEqual(
            self.recipe.instructions[2], "Alles 25 Minuten köcheln lassen."
        )

    def test_page_without_recipe(self) -> None:
        page = (FIXTURES / "no_recipe.html").read_text(encoding="utf-8")
        self.assertIsNone(
            recipe_parser.parse_jsonld_html(page, "https://example.com/blog")
        )

    def test_broken_json_is_skipped(self) -> None:
        page = (
            '<script type="application/ld+json">{not json}</script>'
            '<script type="application/ld+json">'
            '{"@type":"Recipe","name":"Test","recipeIngredient":["1 Ei"]}'
            "</script>"
        )
        recipe = recipe_parser.parse_jsonld_html(page, "https://example.com/x")
        self.assertIsNotNone(recipe)
        assert recipe is not None
        self.assertEqual(recipe.title, "Test")


class ChefkochTest(unittest.TestCase):
    def setUp(self) -> None:
        payload = json.loads(
            (FIXTURES / "chefkoch_recipe.json").read_text(encoding="utf-8")
        )
        self.recipe = recipe_parser.recipe_from_chefkoch(
            payload,
            "https://www.chefkoch.de/rezepte/2060241333351072/Test.html",
        )

    def test_basic_fields(self) -> None:
        self.assertEqual(self.recipe.title, "Die beste Okroschka nach Mamas Rezept")
        self.assertEqual(self.recipe.servings, 4)
        self.assertEqual(self.recipe.total_minutes, 90)
        self.assertEqual(self.recipe.prep_minutes, 30)
        self.assertEqual(self.recipe.difficulty, "normal")
        self.assertEqual(self.recipe.rating, 4.58)
        self.assertEqual(self.recipe.rating_count, 84)
        self.assertEqual(self.recipe.category, "Kalte Suppen")
        self.assertEqual(self.recipe.cuisine, "Russisch")
        self.assertEqual(self.recipe.nutrition.get("Kalorien"), "210 kcal")

    def test_ingredients(self) -> None:
        self.assertIn(
            "1 Ring/e Geflügelfleischwurst, fein gewürfelt", self.recipe.ingredients
        )
        self.assertIn("500 g Kartoffeln", self.recipe.ingredients)
        self.assertIn("0.5 l Kefir", self.recipe.ingredients)
        self.assertEqual(len(self.recipe.ingredient_groups), 2)
        self.assertEqual(self.recipe.ingredient_groups[0]["name"], "Für die Suppe")

    def test_image_and_instructions(self) -> None:
        self.assertIn("crop-960x640", self.recipe.image_url)
        self.assertNotIn("<format>", self.recipe.image_url)
        self.assertEqual(len(self.recipe.instructions), 3)
        self.assertEqual(
            self.recipe.instructions[-1], "Mit Kefir verrühren und abschmecken."
        )
        self.assertEqual(self.recipe.tags, ["Hauptspeise", "Kartoffeln", "Schnell"])

    def test_payload_without_title(self) -> None:
        with self.assertRaises(recipe_parser.RecipeError):
            recipe_parser.recipe_from_chefkoch({}, "https://www.chefkoch.de/x")


if __name__ == "__main__":
    unittest.main()
