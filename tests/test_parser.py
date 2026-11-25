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


class IngredientStructureTest(unittest.TestCase):
    def test_amount_unit_name(self) -> None:
        item = recipe_parser.parse_ingredient_text("500 g Kartoffeln")
        self.assertEqual(item["amount"], 500)
        self.assertEqual(item["unit"], "g")
        self.assertEqual(item["name"], "Kartoffeln")
        self.assertEqual(item["amount_text"], "500")
        self.assertEqual(item["text"], "500 g Kartoffeln")

    def test_fractions_and_plain_counts(self) -> None:
        fraction = recipe_parser.parse_ingredient_text("1/2 TL Salz")
        self.assertEqual(fraction["amount"], 0.5)
        self.assertEqual(fraction["unit"], "TL")
        self.assertEqual(fraction["name"], "Salz")

        unicode = recipe_parser.parse_ingredient_text("½ Zitrone")
        self.assertEqual(unicode["amount"], 0.5)

        plain = recipe_parser.parse_ingredient_text("1 Hokkaido-Kürbis")
        self.assertEqual(plain["amount"], 1)
        self.assertEqual(plain["unit"], "")
        self.assertEqual(plain["name"], "Hokkaido-Kürbis")

        decimal = recipe_parser.parse_ingredient_text("0,5 l Kefir")
        self.assertEqual(decimal["amount"], 0.5)
        self.assertEqual(decimal["unit"], "l")
        self.assertEqual(decimal["name"], "Kefir")

    def test_ranges(self) -> None:
        item = recipe_parser.parse_ingredient_text("2–3 EL Öl")
        self.assertEqual(item["amount"], 2)
        self.assertEqual(item["amount_max"], 3)
        self.assertEqual(item["unit"], "EL")
        self.assertEqual(item["name"], "Öl")

    def test_lines_without_amount(self) -> None:
        item = recipe_parser.parse_ingredient_text("Salz und Pfeffer")
        self.assertIsNone(item["amount"])
        self.assertEqual(item["name"], "Salz und Pfeffer")

    def test_scale_ingredient(self) -> None:
        self.assertEqual(
            recipe_parser.scale_ingredient(
                recipe_parser.parse_ingredient_text("200 g Mehl"), 1.5
            ),
            "300 g Mehl",
        )
        self.assertEqual(
            recipe_parser.scale_ingredient(
                recipe_parser.parse_ingredient_text("1/2 TL Salz"), 2
            ),
            "1 TL Salz",
        )
        self.assertEqual(
            recipe_parser.scale_ingredient(
                recipe_parser.parse_ingredient_text("2–3 EL Öl"), 2
            ),
            "4–6 EL Öl",
        )
        self.assertEqual(
            recipe_parser.scale_ingredient(
                recipe_parser.parse_ingredient_text("Salz"), 2
            ),
            "Salz",
        )

    def test_plural_units(self) -> None:
        def scaled(text: str, factor: float) -> str:
            return recipe_parser.scale_ingredient(
                recipe_parser.parse_ingredient_text(text), factor
            )

        self.assertEqual(scaled("1 Prise Salz", 1), "1 Prise Salz")
        self.assertEqual(scaled("1 Prise Salz", 2), "2 Prisen Salz")
        self.assertEqual(scaled("1 Messerspitze Zucker", 2), "2 Messerspitzen Zucker")
        self.assertEqual(scaled("1 Dose Tomaten", 2), "2 Dosen Tomaten")
        self.assertEqual(scaled("1 Packung Sahne", 2), "2 Packungen Sahne")
        self.assertEqual(scaled("1 Glas Milch", 2), "2 Gläser Milch")
        self.assertEqual(scaled("1 Zehe Knoblauch", 2), "2 Zehen Knoblauch")
        self.assertEqual(scaled("3 Zehen Knoblauch", 1), "3 Zehen Knoblauch")
        self.assertEqual(scaled("2 Prisen Salz", 1), "2 Prisen Salz")
        self.assertEqual(scaled("1–2 Prisen Salz", 2), "2–4 Prisen Salz")

    def test_units_without_plural_stay_unchanged(self) -> None:
        def scaled(text: str, factor: float) -> str:
            return recipe_parser.scale_ingredient(
                recipe_parser.parse_ingredient_text(text), factor
            )

        self.assertEqual(scaled("1 Bund Petersilie", 2), "2 Bund Petersilie")
        self.assertEqual(scaled("1 Stück Butter", 2), "2 Stück Butter")
        self.assertEqual(scaled("1 Päckchen Vanillezucker", 2), "2 Päckchen Vanillezucker")
        self.assertEqual(scaled("200 g Mehl", 2), "400 g Mehl")
        self.assertEqual(scaled("1 EL Öl", 3), "3 EL Öl")

    def test_plural_ingredient_names(self) -> None:
        def scaled(text: str, factor: float) -> str:
            return recipe_parser.scale_ingredient(
                recipe_parser.parse_ingredient_text(text), factor
            )

        self.assertEqual(scaled("1 Ei", 1), "1 Ei")
        self.assertEqual(scaled("1 Ei", 2), "2 Eier")
        self.assertEqual(scaled("1 Ei", 3), "3 Eier")
        self.assertEqual(scaled("1 Zwiebel", 2), "2 Zwiebeln")
        self.assertEqual(scaled("1 Tomate", 2), "2 Tomaten")
        self.assertEqual(scaled("1 Kartoffel", 2), "2 Kartoffeln")
        self.assertEqual(scaled("1 rote Zwiebel", 2), "2 rote Zwiebeln")
        self.assertEqual(
            scaled("1 Zwiebel, fein gewürfelt", 2), "2 Zwiebeln, fein gewürfelt"
        )
        self.assertEqual(scaled("1 Gemüsezwiebel", 2), "2 Gemüsezwiebeln")
        self.assertEqual(scaled("1 Süßkartoffel", 3), "3 Süßkartoffeln")
        self.assertEqual(scaled("1 Apfel", 2), "2 Äpfel")
        self.assertEqual(scaled("1 Hokkaido-Kürbis", 2), "2 Hokkaido-Kürbisse")
        self.assertEqual(scaled("1–2 Zwiebel", 2), "2–4 Zwiebeln")

    def test_plural_ingredient_names_in_phrases(self) -> None:
        def scaled(text: str, factor: float) -> str:
            return recipe_parser.scale_ingredient(
                recipe_parser.parse_ingredient_text(text), factor
            )

        self.assertEqual(scaled("1 ganzer Apfel", 1), "1 ganzer Apfel")
        self.assertEqual(scaled("1 ganzer Apfel", 2), "2 ganze Äpfel")
        self.assertEqual(scaled("1 großer Apfel", 2), "2 große Äpfel")
        self.assertEqual(scaled("1 kleines Ei", 2), "2 kleine Eier")
        self.assertEqual(scaled("1 frisch geriebener Apfel", 2), "2 frisch geriebene Äpfel")
        self.assertEqual(scaled("1 mittelgroße Zwiebel", 2), "2 mittelgroße Zwiebeln")
        self.assertEqual(scaled("1 Zwiebel rot", 2), "2 Zwiebeln rot")
        self.assertEqual(
            scaled("1 Zwiebel rot, geputzt", 2), "2 Zwiebeln rot, geputzt"
        )
        self.assertEqual(scaled("1 Tomate am Stiel", 2), "2 Tomaten am Stiel")

    def test_gender_aware_singular_modifiers(self) -> None:
        def scaled(text: str, factor: float) -> str:
            return recipe_parser.scale_ingredient(
                recipe_parser.parse_ingredient_text(text), factor
            )

        self.assertEqual(scaled("2 ganze Äpfel", 0.5), "1 ganzer Apfel")
        self.assertEqual(scaled("2 große Zwiebeln", 0.5), "1 große Zwiebel")
        self.assertEqual(scaled("2 kleine Eier", 0.5), "1 kleines Ei")
        self.assertEqual(scaled("2 ganze Tomaten", 0.5), "1 ganze Tomate")
        self.assertEqual(scaled("2 frische Gurken", 0.5), "1 frische Gurke")
        self.assertEqual(scaled("2 große Kartoffeln", 0.5), "1 große Kartoffel")
        self.assertEqual(scaled("4 ganze Äpfel", 0.25), "1 ganzer Apfel")
        self.assertEqual(scaled("2 große Steaks", 0.5), "1 großes Steak")
        self.assertEqual(
            scaled("2 große Gemüsezwiebeln", 0.5), "1 große Gemüsezwiebel"
        )
        self.assertEqual(
            scaled("2 ganze Hokkaido-Kürbisse", 0.5), "1 ganzer Hokkaido-Kürbis"
        )
        # Unknown nouns stay as they are instead of inventing a plural.
        self.assertEqual(scaled("1 große Melone", 2), "2 große Melone")
        self.assertEqual(scaled("1 Blumenkohl", 2), "2 Blumenkohl")
        # Increasing portions keeps working.
        self.assertEqual(scaled("2 ganze Äpfel", 2), "4 ganze Äpfel")
        self.assertEqual(scaled("1 ganzer Apfel", 0.5), "0,5 ganzer Apfel")

    def test_phrases_without_ingredient_noun_stay_unchanged(self) -> None:
        def scaled(text: str, factor: float) -> str:
            return recipe_parser.scale_ingredient(
                recipe_parser.parse_ingredient_text(text), factor
            )

        self.assertEqual(scaled("1 Apfelmus", 2), "2 Apfelmus")
        self.assertEqual(scaled("1 Tomatensuppe", 3), "3 Tomatensuppe")
        self.assertEqual(scaled("2 ganze Äpfel", 2), "4 ganze Äpfel")
        self.assertEqual(scaled("1 kl. Zwiebel", 2), "2 kl. Zwiebeln")
        self.assertEqual(
            scaled("1 Packung Philadelphia", 2), "2 Packungen Philadelphia"
        )

    def test_ingredient_names_keep_plural_brands_and_roles(self) -> None:
        def scaled(text: str, factor: float) -> str:
            return recipe_parser.scale_ingredient(
                recipe_parser.parse_ingredient_text(text), factor
            )

        self.assertEqual(scaled("2 Zwiebeln", 2), "4 Zwiebeln")
        self.assertEqual(scaled("1 Dose Tomaten", 2), "2 Dosen Tomaten")
        self.assertEqual(scaled("1 Glas Milch", 2), "2 Gläser Milch")
        self.assertEqual(
            scaled("1 Packung Philadelphia", 2), "2 Packungen Philadelphia"
        )
        self.assertEqual(scaled("2 Eier", 0.25), "0,5 Ei")
        self.assertEqual(scaled("4 Zwiebeln", 0.5), "2 Zwiebeln")
        # The recipe's own amount stays untouched, even when it is already plural.
        self.assertEqual(scaled("1 Dose Tomaten", 0.5), "0,5 Dose Tomaten")

    def test_scaled_line_pairs(self) -> None:
        pairs = recipe_parser.scale_ingredient_lines(
            [recipe_parser.parse_ingredient_text("1 Ei")], None, 2
        )
        self.assertEqual(pairs, [("1 Ei", "2 Eier")])

        fallback = recipe_parser.scale_ingredient_lines(None, ["1 Ei"], 3)
        self.assertEqual(fallback, [("1 Ei", "3 Eier")])

        unchanged = recipe_parser.scale_ingredient_lines(None, ["500 g Mehl"], 1)
        self.assertEqual(unchanged, [("500 g Mehl", "500 g Mehl")])

    def test_text_fallback(self) -> None:
        self.assertEqual(
            recipe_parser.scale_ingredients(
                None, ["500 g Kartoffeln", "1 Ei", "Salz und Pfeffer"], 2
            ),
            ["1000 g Kartoffeln", "2 Eier", "Salz und Pfeffer"],
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
        self.assertEqual(
            len(self.recipe.ingredients_structured), len(self.recipe.ingredients)
        )
        first = self.recipe.ingredients_structured[0]
        self.assertEqual(first["amount"], 1)
        self.assertEqual(first["name"], "Hokkaido-Kürbis")
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

    def test_structured_ingredients(self) -> None:
        structured = {
            item["text"]: item for item in self.recipe.ingredients_structured
        }
        self.assertEqual(len(structured), len(self.recipe.ingredients))

        kartoffeln = structured["500 g Kartoffeln"]
        self.assertEqual(kartoffeln["amount"], 500)
        self.assertEqual(kartoffeln["unit"], "g")
        self.assertEqual(kartoffeln["name"], "Kartoffeln")
        self.assertEqual(kartoffeln["group"], "Für die Suppe")

        scaled = recipe_parser.scale_ingredients(
            self.recipe.ingredients_structured, None, 2
        )
        self.assertIn("1000 g Kartoffeln", scaled)
        self.assertIn("1 l Kefir", scaled)

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


class RecipeGroupsTest(unittest.TestCase):
    def test_groups_roundtrip(self) -> None:
        recipe = recipe_parser.Recipe(
            title="Apfelkuchen", source_url="https://example.com/kuchen"
        )
        self.assertEqual(recipe.groups, [])

        recipe.groups = ["Familie", "Backen"]
        self.assertEqual(recipe.as_dict()["groups"], ["Familie", "Backen"])
        restored = recipe_parser.Recipe.from_dict(recipe.as_dict())
        self.assertEqual(restored.groups, ["Familie", "Backen"])
        self.assertEqual(
            recipe.as_attributes()["groups"], ["Familie", "Backen"]
        )


class ApplyRecipeChangesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.recipe = recipe_parser.Recipe(
            title="Apfelkuchen",
            source_url="manual://apfelkuchen",
            site="Eigenes Rezept",
            description="Omas Rezept",
            image_url="/api/image/serve/abc/original",
            servings=8,
            ingredients=["4 Äpfel", "200 g Mehl"],
            ingredients_structured=[
                recipe_parser.parse_ingredient_text("4 Äpfel"),
                recipe_parser.parse_ingredient_text("200 g Mehl"),
            ],
            instructions=["Backen."],
            tags=["Kuchen"],
            groups=["Backen"],
        )

    def test_replaces_content_and_restructures_ingredients(self) -> None:
        updated = recipe_parser.apply_recipe_changes(
            self.recipe,
            title="Birnenkuchen",
            ingredients=["3 Birnen", "100 g Zucker"],
            instructions=["Schälen.", "Backen."],
        )
        self.assertEqual(updated.title, "Birnenkuchen")
        self.assertEqual(updated.ingredients, ["3 Birnen", "100 g Zucker"])
        self.assertEqual(
            [item["name"] for item in updated.ingredients_structured],
            ["Birnen", "Zucker"],
        )
        self.assertEqual(updated.ingredients_structured[0]["amount"], 3.0)
        self.assertEqual(updated.instructions, ["Schälen.", "Backen."])

    def test_keeps_url_photo_groups_and_untouched_fields(self) -> None:
        updated = recipe_parser.apply_recipe_changes(self.recipe, tags=["Neu"])
        self.assertEqual(updated.source_url, self.recipe.source_url)
        self.assertEqual(updated.site, "Eigenes Rezept")
        self.assertEqual(updated.description, "Omas Rezept")
        self.assertEqual(updated.image_url, self.recipe.image_url)
        self.assertEqual(updated.servings, 8)
        self.assertEqual(updated.groups, ["Backen"])
        self.assertEqual(updated.ingredients, self.recipe.ingredients)
        self.assertEqual(updated.tags, ["Neu"])
        # The original object is never mutated.
        self.assertEqual(self.recipe.tags, ["Kuchen"])

    def test_can_replace_servings_and_remove_the_photo(self) -> None:
        updated = recipe_parser.apply_recipe_changes(
            self.recipe, servings=4, image_url=""
        )
        self.assertEqual(updated.servings, 4)
        self.assertEqual(updated.image_url, "")

    def test_rejects_a_blank_title_or_empty_ingredients(self) -> None:
        with self.assertRaises(recipe_parser.RecipeError):
            recipe_parser.apply_recipe_changes(self.recipe, title="  ")
        with self.assertRaises(recipe_parser.RecipeError):
            recipe_parser.apply_recipe_changes(self.recipe, ingredients=[])
        with self.assertRaises(recipe_parser.RecipeError):
            recipe_parser.apply_recipe_changes(self.recipe, ingredients=["   "])


if __name__ == "__main__":
    unittest.main()
