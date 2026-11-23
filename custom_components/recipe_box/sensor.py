"""Sensor platform for Rezeptbox."""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN, NAME
from .coordinator import RecipeCoordinator
from .parser import Recipe


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the sensors for one imported recipe."""
    coordinator: RecipeCoordinator = entry.runtime_data
    async_add_entities(
        [
            RecipeSensor(coordinator),
            RecipeServingsSensor(coordinator),
        ]
    )


class RecipeSensorBase(CoordinatorEntity[RecipeCoordinator], SensorEntity):
    """Common base for the recipe entities."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: RecipeCoordinator, unique_suffix: str) -> None:
        super().__init__(coordinator)
        entry = coordinator.config_entry
        recipe = coordinator.data
        self._attr_unique_id = f"{entry.entry_id}_{unique_suffix}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=coordinator.recipe_title[:60],
            manufacturer=NAME,
            model=(recipe.site if recipe else "") or "Rezept",
            entry_type=DeviceEntryType.SERVICE,
            configuration_url=(recipe.source_url if recipe else None),
        )

    @property
    def recipe(self) -> Recipe | None:
        """Return the current recipe data."""
        return self.coordinator.data

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

    def __init__(self, coordinator: RecipeCoordinator) -> None:
        super().__init__(coordinator, "recipe")

    @property
    def native_value(self) -> int | None:
        """Return the total time in minutes."""
        return self.recipe.total_minutes if self.recipe else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return all recipe details as attributes."""
        if self.recipe is None:
            return {}
        return {"integration": DOMAIN, **self.recipe.as_attributes()}

    @property
    def entity_picture(self) -> str | None:
        """Return the recipe image."""
        if self.recipe is None:
            return None
        return self.recipe.image_url or None


class RecipeServingsSensor(RecipeSensorBase):
    """Number of servings the recipe is written for."""

    _attr_translation_key = "servings"
    _attr_icon = "mdi:account-group"
    _attr_suggested_display_precision = 0

    def __init__(self, coordinator: RecipeCoordinator) -> None:
        super().__init__(coordinator, "servings")

    @property
    def native_value(self) -> int | None:
        """Return the number of servings."""
        return self.recipe.servings if self.recipe else None
