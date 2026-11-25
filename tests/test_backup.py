"""Tests for writing backups into a configured target folder."""

from __future__ import annotations

import sys
import types
import unittest
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

BASE = Path(__file__).resolve().parents[1]
COMPONENT = BASE / "custom_components" / "recipe_box"

sys.path.insert(0, str(BASE / "custom_components"))

# backup.py only needs DOMAIN from const, which imports the Platform enum.
# The test environment has no Home Assistant, so a small stub keeps it usable.
try:  # pragma: no cover - depends on the test environment
    import homeassistant  # noqa: F401
except ModuleNotFoundError:  # pragma: no cover
    ha = types.ModuleType("homeassistant")
    ha.__path__ = []
    const = types.ModuleType("homeassistant.const")

    class Platform:
        SENSOR = "sensor"
        BUTTON = "button"

    const.Platform = Platform
    core = types.ModuleType("homeassistant.core")
    core.HomeAssistant = type("HomeAssistant", (), {})
    exceptions = types.ModuleType("homeassistant.exceptions")
    exceptions.HomeAssistantError = type("HomeAssistantError", (Exception,), {})
    ha.const = const
    ha.core = core
    ha.exceptions = exceptions
    sys.modules.update(
        {
            "homeassistant": ha,
            "homeassistant.const": const,
            "homeassistant.core": core,
            "homeassistant.exceptions": exceptions,
        }
    )

if "recipe_box" not in sys.modules:  # pragma: no cover - import guard
    package = types.ModuleType("recipe_box")
    package.__path__ = [str(COMPONENT)]
    sys.modules["recipe_box"] = package

from recipe_box import backup  # noqa: E402

NOW = datetime(2026, 11, 25, 12, 0, 0)


class FakeEntry:
    def __init__(self, options: dict) -> None:
        self.options = options


class FakeConfigEntries:
    def __init__(self, options: dict) -> None:
        self.entries = [FakeEntry(options)]

    def async_entries(self, domain: str) -> list[FakeEntry]:
        return list(self.entries)


class FakeHass:
    def __init__(self, config_dir: str, options: dict | None = None) -> None:
        self.config = SimpleNamespace(config_dir=config_dir)
        self.config_entries = FakeConfigEntries(options or {})


class BackupTargetTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = TemporaryDirectory()
        self.config_dir = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_without_option_the_browser_saves(self) -> None:
        self.assertEqual(backup.configured_backup_path(FakeHass(str(self.config_dir))), "")

    def test_configured_folder_is_trimmed(self) -> None:
        hass = FakeHass(str(self.config_dir), {"backup_path": "  backups  "})
        self.assertEqual(backup.configured_backup_path(hass), "backups")

    def test_relative_folder_is_created_and_written(self) -> None:
        hass = FakeHass(str(self.config_dir))
        path = backup.write_backup(hass, "backups", '{"recipes": []}', now=NOW)
        self.assertEqual(path.name, "rezeptbox-2026-11-25.json")
        self.assertEqual(path.parent, self.config_dir / "backups")
        self.assertEqual(path.read_text(encoding="utf-8"), '{"recipes": []}')

    def test_absolute_folder_inside_the_config_dir_is_allowed(self) -> None:
        hass = FakeHass(str(self.config_dir))
        folder = self.config_dir / "sicherungen" / "rezepte"
        path = backup.write_backup(hass, str(folder), "{}", now=NOW)
        self.assertEqual(path.parent, folder)

    def test_second_backup_on_the_same_day_gets_a_time_suffix(self) -> None:
        hass = FakeHass(str(self.config_dir))
        first = backup.write_backup(hass, "backups", "{}", now=NOW)
        second = backup.write_backup(hass, "backups", "{}", now=NOW)
        self.assertEqual(first.name, "rezeptbox-2026-11-25.json")
        self.assertEqual(second.name, "rezeptbox-2026-11-25-120000.json")

    def test_folder_outside_the_config_dir_is_rejected(self) -> None:
        hass = FakeHass(str(self.config_dir))
        with self.assertRaises(backup.BackupPathError):
            backup.write_backup(hass, "../aussen", "{}", now=NOW)

    def test_absolute_folder_outside_the_config_dir_is_rejected(self) -> None:
        hass = FakeHass(str(self.config_dir))
        with TemporaryDirectory() as other:
            with self.assertRaises(backup.BackupPathError):
                backup.write_backup(hass, other, "{}", now=NOW)


if __name__ == "__main__":
    unittest.main()
