"""Tests for the configurable shopping list target (for example Alexa)."""

from __future__ import annotations

import asyncio
import sys
import types
import unittest
from pathlib import Path
from types import SimpleNamespace

BASE = Path(__file__).resolve().parents[1]
COMPONENT = BASE / "custom_components" / "recipe_box"

sys.path.insert(0, str(BASE / "custom_components"))

# shopping.py only needs the Home Assistant types for annotations. The test
# environment has no Home Assistant, so small stubs keep the module importable.
try:  # pragma: no cover - depends on the test environment
    import homeassistant  # noqa: F401
except ModuleNotFoundError:  # pragma: no cover
    ha = types.ModuleType("homeassistant")
    ha.__path__ = []
    core = types.ModuleType("homeassistant.core")
    core.HomeAssistant = type("HomeAssistant", (), {})
    const = types.ModuleType("homeassistant.const")

    class Platform:
        """Stand-in for the Home Assistant platform enum."""

        SENSOR = "sensor"
        BUTTON = "button"

    const.Platform = Platform
    exceptions = types.ModuleType("homeassistant.exceptions")

    class HomeAssistantError(Exception):
        """Stand-in for the Home Assistant error base class."""

    exceptions.HomeAssistantError = HomeAssistantError
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

from recipe_box import shopping  # noqa: E402

TARGET = "todo.alexa_einkaufsliste"


class FakeState:
    """Minimal state object with the to-do feature flags."""

    def __init__(self, features: int) -> None:
        self.attributes = {"supported_features": features}


class FakeStates:
    def __init__(self, features: int | None) -> None:
        self._features = features

    def get(self, entity_id: str) -> FakeState | None:
        if self._features is None:
            return None
        return FakeState(self._features)


class FakeServices:
    """Record service calls and answer ``todo.get_items``."""

    def __init__(self, items: list[dict] | None = None) -> None:
        self.items = list(items or [])
        self.calls: list[tuple[str, str, dict]] = []

    async def async_call(
        self,
        domain: str,
        service: str,
        data: dict,
        blocking: bool = False,
        return_response: bool = False,
    ):
        self.calls.append((domain, service, dict(data)))
        if service == "get_items":
            return {data["entity_id"]: {"items": [dict(item) for item in self.items]}}
        return None

    def called(self, service: str) -> list[dict]:
        return [data for _domain, name, data in self.calls if name == service]


class FakeEntry:
    def __init__(self, options: dict) -> None:
        self.options = options


class FakeConfigEntries:
    def __init__(self, entries: list[FakeEntry]) -> None:
        self.entries = entries

    def async_entries(self, domain: str) -> list[FakeEntry]:
        return list(self.entries)


class FakeHass:
    def __init__(
        self,
        *,
        items: list[dict] | None = None,
        features: int | None = 4,
        options: dict | None = None,
        component_items: list[dict] | None = None,
    ) -> None:
        self.services = FakeServices(items)
        self.states = FakeStates(features)
        self.config_entries = FakeConfigEntries([FakeEntry(options or {})])
        self.data = {
            "shopping_list": SimpleNamespace(items=list(component_items or []))
        }


class ShoppingTargetTest(unittest.TestCase):
    def test_reads_configured_target(self) -> None:
        hass = FakeHass(options={"shopping_target": f" {TARGET} "})
        self.assertEqual(shopping.shopping_target(hass), TARGET)

    def test_without_option_uses_builtin_list(self) -> None:
        self.assertEqual(shopping.shopping_target(FakeHass()), "")

    def test_adds_merged_lines_to_todo_list(self) -> None:
        hass = FakeHass()
        added = asyncio.run(
            shopping.async_add_ingredient_lines(
                hass, ["2 Zwiebeln", "3 Zwiebeln"], target=TARGET
            )
        )
        self.assertEqual(added, 1)
        self.assertEqual(hass.services.called("get_items"), [{"entity_id": TARGET}])
        self.assertEqual(
            hass.services.called("add_item"),
            [{"entity_id": TARGET, "item": "5 Zwiebeln"}],
        )
        self.assertEqual(hass.services.called("update_item"), [])

    def test_merges_with_existing_todo_item(self) -> None:
        hass = FakeHass(
            items=[
                {
                    "uid": "abc",
                    "summary": "500 g Kartoffeln",
                    "status": "needs_action",
                }
            ]
        )
        added = asyncio.run(
            shopping.async_add_ingredient_lines(
                hass, ["500 g Kartoffeln"], target=TARGET
            )
        )
        self.assertEqual(added, 1)
        self.assertEqual(
            hass.services.called("update_item"),
            [
                {
                    "entity_id": TARGET,
                    "item": "abc",
                    "rename": "1 kg Kartoffeln",
                }
            ],
        )
        self.assertEqual(hass.services.called("add_item"), [])

    def test_replaces_item_when_renaming_is_unsupported(self) -> None:
        hass = FakeHass(
            items=[
                {
                    "uid": "abc",
                    "summary": "500 g Kartoffeln",
                    "status": "needs_action",
                }
            ],
            features=0,
        )
        asyncio.run(
            shopping.async_add_ingredient_lines(
                hass, ["500 g Kartoffeln"], target=TARGET
            )
        )
        self.assertEqual(hass.services.called("update_item"), [])
        self.assertEqual(
            hass.services.called("remove_item"),
            [{"entity_id": TARGET, "item": "abc"}],
        )
        self.assertEqual(
            hass.services.called("add_item"),
            [{"entity_id": TARGET, "item": "1 kg Kartoffeln"}],
        )

    def test_completed_items_are_not_merged(self) -> None:
        hass = FakeHass(
            items=[
                {
                    "uid": "abc",
                    "summary": "500 g Kartoffeln",
                    "status": "completed",
                }
            ]
        )
        asyncio.run(
            shopping.async_add_ingredient_lines(
                hass, ["500 g Kartoffeln"], target=TARGET
            )
        )
        self.assertEqual(hass.services.called("update_item"), [])
        self.assertEqual(hass.services.called("remove_item"), [])
        self.assertEqual(
            hass.services.called("add_item"),
            [{"entity_id": TARGET, "item": "500 g Kartoffeln"}],
        )

    def test_builtin_list_still_merges(self) -> None:
        hass = FakeHass(component_items=[{"name": "500 g Kartoffeln"}])
        added = asyncio.run(
            shopping.async_add_ingredient_lines(hass, ["500 g Kartoffeln"])
        )
        self.assertEqual(added, 1)
        self.assertEqual(hass.services.called("get_items"), [])
        self.assertEqual(
            hass.services.called("remove_item"), [{"name": "500 g Kartoffeln"}]
        )
        self.assertEqual(
            hass.services.called("add_item"), [{"name": "1 kg Kartoffeln"}]
        )


if __name__ == "__main__":
    unittest.main()
