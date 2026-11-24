"""Button platform for Rezeptbox."""

from __future__ import annotations

import hashlib

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
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
    """Add one shopping list button per recipe."""
    hub: RecipeHub = entry.runtime_data

    def add(recipe: Recipe) -> None:
        entity = RecipeShoppingButton(hub, recipe)
        hub.register_entities(recipe.source_url, [entity])
        async_add_entities([entity])

    for recipe in hub.recipes.values():
        add(recipe)
    hub.add_entity_adder(add)


class RecipeShoppingButton(CoordinatorEntity[RecipeHub], ButtonEntity):
    """Add all ingredients of a recipe to the shopping list."""

    _attr_has_entity_name = True
    _attr_translation_key = "shopping_list"
    _attr_icon = "mdi:cart-plus"

    def __init__(self, hub: RecipeHub, recipe: Recipe) -> None:
        super().__init__(hub)
        self._source_url = recipe.source_url
        token = hashlib.sha1(recipe.source_url.encode("utf-8")).hexdigest()[:16]
        self._sensor_unique_id = f"{DOMAIN}_{token}_recipe"
        self._attr_unique_id = f"{DOMAIN}_{token}_shopping_list"
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

    async def async_press(self) -> None:
        """Run the shopping list service for this recipe."""
        entity_id = er.async_get(self.hass).async_get_entity_id(
            "sensor", DOMAIN, self._sensor_unique_id
        )
        if entity_id is None:
            return
        await self.hass.services.async_call(
            DOMAIN,
            "add_to_shopping_list",
            {"entity_id": entity_id},
            blocking=True,
        )
