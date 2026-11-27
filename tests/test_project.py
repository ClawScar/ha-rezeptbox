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

    def test_shopping_target_option_translated(self) -> None:
        for data in (self.strings, self.german, self.english):
            step = data["options"]["step"]["init"]
            self.assertEqual(set(step["data_description"]), set(step["data"]))
            self.assertIn("shopping_target", step["data"])
            self.assertIn("shopping_target_missing", data["exceptions"])


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

    def test_panel_toolbar_and_history(self) -> None:
        card = (COMPONENT / "www" / "recipe-card.js").read_text("utf-8")
        self.assertIn('"hass-toggle-menu"', card)
        self.assertIn("viewFromPath", card)
        self.assertIn("viewPath", card)
        self.assertIn('"location-changed"', card)
        self.assertIn("_canGoBack", card)
        self.assertIn("from:", card)

    def test_card_follows_home_assistant_language(self) -> None:
        card = (COMPONENT / "www" / "recipe-card.js").read_text("utf-8")
        for marker in (
            'startsWith("en")',
            "setUiLanguage",
            "const tr = (de, en)",
            'tr("Rezepte", "Recipes")',
            'tr("Zutaten", "Ingredients")',
            'tr("Menü", "Menu")',
        ):
            self.assertIn(marker, card)
        self.assertIn(
            "Sprache der Oberfläche", (BASE / "README.md").read_text("utf-8")
        )

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
            "update_recipe",
            "refresh_recipe",
            "export_recipes",
            "import_recipes",
            "plan_recipe",
            "clear_meal_plan",
            "set_favorite",
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
            'tr("Sichern", "Save")',
            'tr("Laden", "Load")',
            "\"Importieren\"",
            "selection-bar",
            "dialog-confirm",
            "group-select",
            "group-add-button",
            "group-remove",
            "set_groups",
            "set_recipe_image",
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

    def test_favorites_are_shared(self) -> None:
        const = (COMPONENT / "const.py").read_text("utf-8")
        self.assertIn('SERVICE_SET_FAVORITE = "set_favorite"', const)
        self.assertIn('ATTR_FAVORITE = "favorite"', const)

        coordinator = (COMPONENT / "coordinator.py").read_text("utf-8")
        for marker in (
            "self.favorites: set[str] = set()",
            "def is_favorite",
            "async_set_favorite",
            "async_import_favorites",
            "self.favorites.discard(source_url)",
            '"favorites": sorted(self.favorites)',
        ):
            self.assertIn(marker, coordinator)

        sensor = (COMPONENT / "sensor.py").read_text("utf-8")
        self.assertIn('"favorite": self.coordinator.is_favorite', sensor)
        self.assertIn('"favorites": sorted(self.coordinator.favorites)', sensor)

        card = (COMPONENT / "www" / "recipe-card.js").read_text("utf-8")
        self.assertIn('"set_favorite"', card)
        self.assertIn("favoritesFromEntries", card)
        self.assertNotIn("recipe_box:favorites", card)

        services = (COMPONENT / "services.yaml").read_text("utf-8")
        self.assertIn("set_favorite:", services)

        for name in (
            "strings.json",
            "translations/de.json",
            "translations/en.json",
        ):
            data = json.loads((COMPONENT / name).read_text("utf-8"))
            self.assertIn("set_favorite", data["services"])
            self.assertEqual(
                set(data["services"]["set_favorite"]["fields"]),
                {"entity_id", "url", "favorite"},
            )
            self.assertIn(
                "favorites", data["services"]["import_recipes"]["fields"]
            )

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
        # The module URL carries the version, so a HACS update replaces the
        # cached card without clearing the browser cache by hand.
        self.assertIn('CARD_MODULE_URL = f"{CARD_URL}?v={VERSION}"', const)
        self.assertIn("add_extra_js_url(hass, CARD_MODULE_URL)", frontend)
        self.assertIn('"module_url": CARD_MODULE_URL', frontend)

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


class ShoppingTargetFilesTest(unittest.TestCase):
    def test_options_offer_todo_entities(self) -> None:
        flow = (COMPONENT / "config_flow.py").read_text("utf-8")
        self.assertIn("CONF_SHOPPING_TARGET", flow)

    def test_options_offer_the_ai_prompt(self) -> None:
        flow = (COMPONENT / "config_flow.py").read_text("utf-8")
        self.assertIn("CONF_AI_PROMPT", flow)
        self.assertIn("TextSelectorConfig(multiline=True)", flow)
        self.assertIn("custom_ai_prompt", flow)
        # The built-in instruction stays the default of the field.
        self.assertIn("ai_prompt or PROMPT", flow)
        self.assertIn('EntitySelector(EntitySelectorConfig(domain="todo"))', flow)

    def test_shopping_writer_can_target_todo_lists(self) -> None:
        module = (COMPONENT / "shopping.py").read_text("utf-8")
        for marker in (
            "TODO_DOMAIN",
            "shopping_target",
            "get_items",
            "update_item",
            "summary",
        ):
            self.assertIn(marker, module)

    def test_readme_explains_the_shopping_list_target(self) -> None:
        readme = (BASE / "README.md").read_text("utf-8")
        self.assertIn("Ziel-Einkaufsliste", readme)
        self.assertIn("Alexa Devices", readme)


class PhotoScannerAndEditTest(unittest.TestCase):
    def test_ocr_assets_ship_with_the_card(self) -> None:
        ocr = COMPONENT / "www" / "ocr"
        for name in (
            "tesseract.min.js",
            "worker.min.js",
            "lang/deu.traineddata",
            "core/tesseract-core-simd-lstm.wasm.js",
        ):
            self.assertTrue((ocr / name).is_file(), name)
        # A stub or a missing language model would make the scan unusable.
        self.assertGreater(
            (ocr / "lang" / "deu.traineddata").stat().st_size, 500_000
        )

    def test_card_scans_multiple_pages_offline(self) -> None:
        card = (COMPONENT / "www" / "recipe-card.js").read_text("utf-8")
        for marker in (
            "ocrRecipeFromPages",
            "ocrSplitColumns",
            "OCR_BASE",
            "createWorker",
            "workerPath:",
            "langPath:",
            "ocr-page",
            "ocr-run",
            "The first scanned page is the recipe photo",
        ):
            self.assertIn(marker, card)
        # Nothing may be sent to a remote OCR or AI service.
        self.assertNotIn("cdn.jsdelivr.net", card)

    def test_card_edits_stored_recipes(self) -> None:
        card = (COMPONENT / "www" / "recipe-card.js").read_text("utf-8")
        for marker in (
            "update_recipe",
            "manual-cancel",
            "canEdit",
            "Rezept bearbeiten",
            "Rezept aktualisieren",
        ):
            self.assertIn(marker, card)

    def test_update_recipe_service_is_documented(self) -> None:
        self.assertIn(
            'SERVICE_UPDATE_RECIPE = "update_recipe"',
            (COMPONENT / "const.py").read_text("utf-8"),
        )
        init = (COMPONENT / "__init__.py").read_text("utf-8")
        self.assertIn("SERVICE_UPDATE_RECIPE", init)
        self.assertIn("apply_recipe_changes", init)
        services = (COMPONENT / "services.yaml").read_text("utf-8")
        self.assertIn("update_recipe:", services)
        for name in (
            "strings.json",
            "translations/de.json",
            "translations/en.json",
        ):
            data = json.loads((COMPONENT / name).read_text("utf-8"))
            self.assertIn("update_recipe", data["services"])
            self.assertEqual(
                set(data["services"]["update_recipe"]["fields"]),
                {
                    "url",
                    "title",
                    "ingredients",
                    "instructions",
                    "servings",
                    "tags",
                    "image_url",
                },
            )

    def test_readme_explains_scanner_and_edit(self) -> None:
        readme = (BASE / "README.md").read_text("utf-8")
        for marker in ("Foto-Scanner", "Tesseract", "Handschrift", "update_recipe"):
            self.assertIn(marker, readme)


if __name__ == "__main__":
    unittest.main()

class BackupTargetFilesTest(unittest.TestCase):
    def test_export_uses_a_configured_backup_folder(self) -> None:
        module = (COMPONENT / "backup.py").read_text("utf-8")
        for marker in ("configured_backup_path", "resolve_backup_dir", "write_backup"):
            self.assertIn(marker, module)
        init = (COMPONENT / "__init__.py").read_text("utf-8")
        self.assertIn("write_backup", init)
        self.assertIn('data["path"]', init)
        # The card asks for the server-side write only as a fallback.
        const = (COMPONENT / "const.py").read_text("utf-8")
        self.assertIn('ATTR_WRITE_BACKUP = "write_backup"', const)
        self.assertIn("call.data.get(ATTR_WRITE_BACKUP)", init)
        card = (COMPONENT / "www" / "recipe-card.js").read_text("utf-8")
        # The card offers a dialog instead of asking the server to write.
        self.assertNotIn("write_backup", card)
        for marker in ("backupDialogHtml", "showSaveFilePicker", "navigator.share"):
            self.assertIn(marker, card)

    def test_options_offer_a_backup_folder(self) -> None:
        flow = (COMPONENT / "config_flow.py").read_text("utf-8")
        self.assertIn("CONF_BACKUP_PATH", flow)
        self.assertIn("TextSelector", flow)

    def test_readme_explains_the_backup_target(self) -> None:
        readme = (BASE / "README.md").read_text("utf-8")
        self.assertIn("Zielordner für", readme)
        self.assertIn("Konfigurationsordner", readme)
