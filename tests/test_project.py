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
