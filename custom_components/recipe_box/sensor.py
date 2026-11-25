"""Sensor platform for Rezeptbox."""

from __future__ import annotations

import hashlib
from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN, NAME
from .coordinator import RecipeHub
from .parser import Recipe


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up one sensor pair for every imported recipe."""
    hub: RecipeHub = entry.runtime_data

    def add(recipe: Recipe) -> None:
        entities: list[RecipeSensorBase] = [
            RecipeSensor(hub, recipe),
            RecipeServingsSensor(hub, recipe),
        ]
        hub.register_entities(recipe.source_url, entities)
        async_add_entities(entities)

    for recipe in hub.recipes.values():
        add(recipe)
    hub.add_entity_adder(add)
    async_add_entities([RecipePlanSensor(hub)])


class RecipeSensorBase(CoordinatorEntity[RecipeHub], SensorEntity):
    """Common base for the recipe entities."""

    _attr_has_entity_name = True

    def __init__(
        self, hub: RecipeHub, recipe: Recipe, unique_suffix: str
    ) -> None:
        super().__init__(hub)
        self._source_url = recipe.source_url
        token = hashlib.sha1(
            recipe.source_url.encode("utf-8")
        ).hexdigest()[:16]
        self._attr_unique_id = f"{DOMAIN}_{token}_{unique_suffix}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, recipe.source_url)},
            name=recipe.title[:60],
            manufacturer=NAME,
            model=recipe.site or "Rezept",
            entry_type=DeviceEntryType.SERVICE,
            configuration_url=(
                recipe.source_url
                if recipe.source_url.startswith(("http://", "https://"))
                else None
            ),
        )

    @property
    def recipe(self) -> Recipe | None:
        """Return the current recipe data."""
        return self.coordinator.recipe(self._source_url)

    @property
    def available(self) -> bool:
        """Return True as long as a recipe is available (cached or fresh)."""
        return self.recipe is not None


class RecipeSensor(RecipeSensorBase):
    """Main sensor holding the recipe and all of its details."""

    _attr_name = None
    _attr_icon = "mdi:silverware-fork-knife"
    _attr_device_class = SensorDeviceClass.DURATION
    _attr_native_unit_of_measurement = "min"
    _attr_suggested_display_precision = 0

    def __init__(self, hub: RecipeHub, recipe: Recipe) -> None:
        super().__init__(hub, recipe, "recipe")

    @property
    def native_value(self) -> int | None:
        """Return the total time in minutes."""
        return self.recipe.total_minutes if self.recipe else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return all recipe details as attributes."""
        if self.recipe is None:
            return {}
        status = self.coordinator.status.get(self._source_url) or {}
        return {
            "integration": DOMAIN,
            **self.recipe.as_attributes(),
            "favorite": self.coordinator.is_favorite(self._source_url),
            "updated_at": status.get("updated_at"),
            "update_error": status.get("error"),
        }

    @property
    def entity_picture(self) -> str | None:
        """Return the recipe image."""
        if self.recipe is None:
            return None
        return self.recipe.image_url or None


class RecipePlanSensor(CoordinatorEntity[RecipeHub], SensorEntity):
    """Number of planned meals with the whole plan as attributes."""

    _attr_has_entity_name = True
    _attr_name = None
    _attr_translation_key = "meal_plan"
    _attr_icon = "mdi:calendar-week"
    _attr_unique_id = f"{DOMAIN}_meal_plan"

    def __init__(self, hub: RecipeHub) -> None:
        super().__init__(hub)
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, "meal_plan")},
            name=f"{NAME} Wochenplan",
            manufacturer=NAME,
            entry_type=DeviceEntryType.SERVICE,
        )

    @property
    def native_value(self) -> int:
        """Return how many days are planned."""
        return len(self.coordinator.plan_entries())

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return the planned recipes with date and servings."""
        return {
            "plan": self.coordinator.plan_entries(),
            "groups": self.coordinator.groups,
            "favorites": sorted(self.coordinator.favorites),
        }


class RecipeServingsSensor(RecipeSensorBase):
    """Number of servings the recipe is written for."""

    _attr_translation_key = "servings"
    _attr_icon = "mdi:account-group"
    _attr_suggested_display_precision = 0

    def __init__(self, hub: RecipeHub, recipe: Recipe) -> None:
        super().__init__(hub, recipe, "servings")

    @property
    def native_value(self) -> int | None:
        """Return the number of servings."""
        return self.recipe.servings if self.recipe else None
