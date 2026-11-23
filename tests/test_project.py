"""Structural checks for the Rezeptbox integration files."""

from __future__ import annotations

import json
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


class TranslationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.strings = json.loads((COMPONENT / "strings.json").read_text("utf-8"))
        self.german = json.loads(
            (COMPONENT / "translations" / "de.json").read_text("utf-8")
        )
        self.english = json.loads(
            (COMPONENT / "translations" / "en.json").read_text("utf-8")
        )

    def test_same_structure_as_english(self) -> None:
        self.assertEqual(self.strings.keys(), self.english.keys())
        self.assertEqual(
            self.strings["config"]["step"].keys(),
            self.english["config"]["step"].keys(),
        )
        self.assertEqual(
            self.strings["config"]["error"].keys(),
            self.english["config"]["error"].keys(),
        )

    def test_german_covers_all_errors(self) -> None:
        expected = set(self.strings["config"]["error"])
        self.assertEqual(set(self.german["config"]["error"]), expected)
        self.assertEqual(
            set(self.german["config"]["step"]["user"]["data"]),
            set(self.strings["config"]["step"]["user"]["data"]),
        )
        self.assertEqual(
            set(self.german["options"]["step"]["init"]["data"]),
            set(self.strings["options"]["step"]["init"]["data"]),
        )

    def test_services_match(self) -> None:
        self.assertEqual(
            set(self.strings["services"]), set(self.german["services"])
        )


class FilesTest(unittest.TestCase):
    def test_card_exists(self) -> None:
        card = COMPONENT / "www" / "recipe-card.js"
        content = card.read_text("utf-8")
        self.assertIn("customElements.define", content)
        self.assertIn("recipe_box", content)
        self.assertIn("recipe-box-list", content)
        self.assertIn("recipe-box-card", content)

    def test_services_yaml(self) -> None:
        content = (COMPONENT / "services.yaml").read_text("utf-8")
        self.assertIn("add_to_shopping_list", content)

    def test_hacs_manifest(self) -> None:
        hacs = json.loads((BASE / "hacs.json").read_text("utf-8"))
        self.assertEqual(hacs["name"], "Rezeptbox")


if __name__ == "__main__":
    unittest.main()
