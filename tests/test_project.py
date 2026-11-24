"""Structural checks for the Rezeptbox integration files."""

from __future__ import annotations

import json
import re
import struct
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
COMPONENT = BASE / "custom_components" / "recipe_box"


class ManifestTest(unittest.TestCase):
    def setUp(self) -> None:
        self.manifest = json.loads((COMPONENT / "manifest.json").read_text("utf-8"))

    def test_required_keys(self) -> None:
        self.assertEqual(self.manifest["domain"], "recipe_box")
        self.assertTrue(self.manifest["config_flow"])
        self.assertIn("version", self.manifest)
        self.assertEqual(self.manifest["iot_class"], "cloud_polling")

    def test_version_matches_const(self) -> None:
        const = (COMPONENT / "const.py").read_text("utf-8")
        match = re.search(r'VERSION = "([^"]+)"', const)
        self.assertIsNotNone(match)
        self.assertEqual(match.group(1), self.manifest["version"])

    def test_version_matches_card(self) -> None:
        card = (COMPONENT / "www" / "recipe-card.js").read_text("utf-8")
        match = re.search(r'CARD_VERSION = "([^"]+)"', card)
        self.assertIsNotNone(match)
        self.assertEqual(match.group(1), self.manifest["version"])


class TranslationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.strings = json.loads((COMPONENT / "strings.json").read_text("utf-8"))
        self.german = json.loads(
            (COMPONENT / "translations" / "de.json").read_text("utf-8")
        )
        self.english = json.loads(
            (COMPONENT / "translations" / "en.json").read_text("utf-8")
        )

    def test_same_top_level_sections(self) -> None:
        self.assertEqual(set(self.strings), set(self.german))
        self.assertEqual(set(self.strings), set(self.english))

    def test_services_translated(self) -> None:
        expected = set(self.strings["services"])
        self.assertEqual(set(self.german["services"]), expected)
        self.assertEqual(set(self.english["services"]), expected)

    def test_exceptions_translated(self) -> None:
        expected = set(self.strings["exceptions"])
        self.assertEqual(set(self.german["exceptions"]), expected)
        self.assertEqual(set(self.english["exceptions"]), expected)

    def test_options_match(self) -> None:
        self.assertEqual(
            set(self.german["options"]["step"]["init"]["data"]),
            set(self.strings["options"]["step"]["init"]["data"]),
        )


class FilesTest(unittest.TestCase):
    def test_card_exists(self) -> None:
        card = COMPONENT / "www" / "recipe-card.js"
        content = card.read_text("utf-8")
        self.assertIn("customElements.define", content)
        self.assertIn("recipe_box", content)
        self.assertIn("recipe-box-list", content)
        self.assertIn("recipe-box-card", content)
        self.assertIn("recipe-box-panel", content)
        self.assertIn("import_recipe", content)
        self.assertIn("remove_recipe", content)
        self.assertIn("urls", content)

    def test_services_yaml(self) -> None:
        content = (COMPONENT / "services.yaml").read_text("utf-8")
        self.assertIn("import_recipe", content)
        self.assertIn("urls", content)
        self.assertIn("remove_recipe", content)
        self.assertIn("add_to_shopping_list", content)
        self.assertIn("servings", content)

    def test_portions_scaling(self) -> None:
        card = (COMPONENT / "www" / "recipe-card.js").read_text("utf-8")
        self.assertIn("ingredients_structured", card)
        self.assertIn("scaleIngredient", card)
        self.assertIn("servings-button", card)
        self.assertIn("params.servings", card)

        strings = json.loads((COMPONENT / "strings.json").read_text("utf-8"))
        fields = strings["services"]["add_to_shopping_list"]["fields"]
        self.assertIn("servings", fields)

    def test_ingredient_plural_tables_match(self) -> None:
        def table(source: str, marker: str) -> dict[str, str]:
            start = source.index(marker)
            block = source[start : source.index("}", start)]
            return dict(re.findall(r'"([^"]+)":\s*"([^"]+)"', block))

        parser_source = (COMPONENT / "parser.py").read_text("utf-8")
        card_source = (COMPONENT / "www" / "recipe-card.js").read_text("utf-8")

        plurals = table(parser_source, "INGREDIENT_PLURALS = {")
        self.assertIn("ei", plurals)
        self.assertIn("zwiebel", plurals)
        self.assertEqual(
            plurals, table(card_source, "const INGREDIENT_PLURALS = {")
        )

        genders = table(parser_source, "INGREDIENT_GENDERS = {")
        self.assertEqual(genders, table(card_source, "const INGREDIENT_GENDERS = {"))
        self.assertEqual(set(genders), set(plurals))
        self.assertTrue(all(value in {"m", "f", "n"} for value in genders.values()))

    def test_new_services_are_documented(self) -> None:
        services = (COMPONENT / "services.yaml").read_text("utf-8")
        strings = json.loads((COMPONENT / "strings.json").read_text("utf-8"))
        for name in (
            "add_recipe",
            "refresh_recipe",
            "export_recipes",
            "import_recipes",
            "plan_recipe",
            "clear_meal_plan",
        ):
            self.assertIn(name, strings["services"])
            self.assertIn(f"{name}:", services)

        fields = strings["services"]["add_to_shopping_list"]["fields"]
        self.assertIn("exclude", fields)
        self.assertIn("merge", fields)

    def test_button_and_plan_platform(self) -> None:
        button = (COMPONENT / "button.py").read_text("utf-8")
        self.assertIn("ButtonEntity", button)
        self.assertIn("add_to_shopping_list", button)
        self.assertIn("Platform.BUTTON", (COMPONENT / "const.py").read_text("utf-8"))

        sensor = (COMPONENT / "sensor.py").read_text("utf-8")
        self.assertIn("meal_plan", sensor)
        self.assertIn("update_error", sensor)

    def test_card_extras(self) -> None:
        card = (COMPONENT / "www" / "recipe-card.js").read_text("utf-8")
        for marker in (
            "filter-search",
            "localStorage",
            "step-timer",
            "nutrition",
            "@media print",
            "manual-save",
            "week-shopping",
            "export_recipes",
            "only-missing-input",
            "showSaveFilePicker",
            "createWritable",
            "Sicherung gespeichert",
            "printDocumentHtml",
            "openPrintWindow",
            "forPrint",
        ):
            self.assertIn(marker, card)

    def test_card_has_tabs(self) -> None:
        card = (COMPONENT / "www" / "recipe-card.js").read_text("utf-8")
        self.assertIn('role="tablist"', card)
        self.assertIn('data-tab="${tab.id}"', card)
        self.assertIn("const TABS = [", card)
        for tab in ("recipes", "data", "plan"):
            self.assertIn(f'{{ id: "{tab}"', card)
        self.assertIn("Daten", card)
        self.assertIn("Eigenes Rezept", card)
        self.assertIn("manual-photo", card)
        self.assertIn("image/upload", card)
        self.assertIn("photo-edit-input", card)
        self.assertIn("set_recipe_image", card)
        self.assertIn("cleanup-photos", card)
        self.assertIn("cleanup_recipe_images", card)
        self.assertIn("rezeptbox-", card)
        self.assertIn("missingImageWarning", card)
        self.assertIn("HEIC", card)
        self.assertIn("Wochenplan", card)
        self.assertIn("tabsHtml", card)
        self.assertIn("recipe_box:tab:", card)
        self.assertIn("readTab(", card)
        self.assertIn("writeTab(", card)
        self.assertIn("_rememberTab(", card)
        self.assertNotIn('<details class="manual">', card)
        self.assertNotIn('<details class="plan">', card)

    def test_recipe_groups(self) -> None:
        card = (COMPONENT / "www" / "recipe-card.js").read_text("utf-8")
        for marker in (
            "recipeGroups",
            "allGroups",
            "knownGroups",
            "groupRegistry",
            "group-tabs",
            "group-tab",
            "groups-manager",
            "group-create-button",
            "group-delete",
            "group-rename",
            "group-rename-input",
            "group-move",
            "data-panel",
            "data-section",
            ">Sichern<",
            ">Laden<",
            "\"Importieren\"",
            "selection-bar",
            "dialog-confirm",
            "group-select",
            "group-add-button",
            "group-remove",
            "set_groups",
            "set_recipe_image",
            "cleanup_recipe_images",
            "add_group",
            "remove_group",
            "rename_group",
            "move_group",
            "Rezepte importieren",
            "Sicherung",
            "Eigenes Rezept",
        ):
            self.assertIn(marker, card)

        services = (COMPONENT / "services.yaml").read_text("utf-8")
        for name in (
            "set_groups",
            "set_recipe_image",
            "cleanup_recipe_images",
            "add_group",
            "remove_group",
            "rename_group",
            "move_group",
        ):
            self.assertIn(f"{name}:", services)

        for name in (
            "strings.json",
            "translations/de.json",
            "translations/en.json",
        ):
            data = json.loads((COMPONENT / name).read_text("utf-8"))
            self.assertIn("set_groups", data["services"])
            self.assertIn("groups", data["services"]["set_groups"]["fields"])
            for service in ("add_group", "remove_group"):
                self.assertIn(service, data["services"])
                self.assertIn("group", data["services"][service]["fields"])
            self.assertIn("rename_group", data["services"])
            self.assertEqual(
                set(data["services"]["rename_group"]["fields"]),
                {"group", "name"},
            )
            self.assertEqual(
                set(data["services"]["move_group"]["fields"]),
                {"group", "direction"},
            )
            self.assertIn("invalid_group", data["exceptions"])

        const = (COMPONENT / "const.py").read_text("utf-8")
        self.assertIn('SERVICE_SET_GROUPS = "set_groups"', const)
        self.assertIn('SERVICE_ADD_GROUP = "add_group"', const)
        self.assertIn('SERVICE_REMOVE_GROUP = "remove_group"', const)
        self.assertIn('SERVICE_RENAME_GROUP = "rename_group"', const)
        self.assertIn('SERVICE_MOVE_GROUP = "move_group"', const)

        coordinator = (COMPONENT / "coordinator.py").read_text("utf-8")
        for marker in (
            "async_add_group",
            "async_remove_group",
            "async_rename_group",
            "async_move_group",
            "async_import_groups",
            'self.groups: list[str] = []',
        ):
            self.assertIn(marker, coordinator)

        sensor = (COMPONENT / "sensor.py").read_text("utf-8")
        self.assertIn('"groups": self.coordinator.groups', sensor)

    def test_config_flow_has_no_url_step(self) -> None:
        content = (COMPONENT / "config_flow.py").read_text("utf-8")
        self.assertNotIn("CONF_URL", content)
        self.assertIn("async_create_entry", content)

    def test_frontend_registers_sidebar_panel(self) -> None:
        frontend = (COMPONENT / "frontend.py").read_text("utf-8")
        const = (COMPONENT / "const.py").read_text("utf-8")
        self.assertIn("async_register_built_in_panel", frontend)
        self.assertIn("PANEL_COMPONENT", frontend)
        self.assertIn('PANEL_COMPONENT = "recipe-box-panel"', const)

    def test_brand_icon(self) -> None:
        icon = COMPONENT / "brand" / "icon.png"
        hd_icon = COMPONENT / "brand" / "icon@2x.png"
        self.assertTrue(icon.is_file())
        self.assertTrue(hd_icon.is_file())

        with icon.open("rb") as handle:
            header = handle.read(24)
        self.assertEqual(header[:8], b"\x89PNG\r\n\x1a\n")
        width, height = struct.unpack(">II", header[16:24])
        self.assertEqual((width, height), (256, 256))

    def test_hacs_manifest(self) -> None:
        hacs = json.loads((BASE / "hacs.json").read_text("utf-8"))
        self.assertEqual(hacs["name"], "Rezeptbox")


if __name__ == "__main__":
    unittest.main()
