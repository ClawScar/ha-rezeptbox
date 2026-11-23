"""The Rezeptbox integration."""

from __future__ import annotations

import logging
from functools import partial
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import ATTR_ENTITY_ID
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv

from .const import (
    ATTR_INGREDIENTS,
    DOMAIN,
    PLATFORMS,
    SERVICE_ADD_TO_SHOPPING_LIST,
)
from .coordinator import RecipeCoordinator
from .frontend import async_register_frontend

_LOGGER = logging.getLogger(__name__)

type RecipeBoxConfigEntry = ConfigEntry[RecipeCoordinator]

ADD_TO_SHOPPING_LIST_SCHEMA = vol.Schema(
    {vol.Required(ATTR_ENTITY_ID): cv.entity_ids}
)


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    """Register services and the bundled Lovelace card."""
    hass.data.setdefault(DOMAIN, {})

    if not hass.services.has_service(DOMAIN, SERVICE_ADD_TO_SHOPPING_LIST):
        hass.services.async_register(
            DOMAIN,
            SERVICE_ADD_TO_SHOPPING_LIST,
            partial(_async_add_to_shopping_list, hass),
            schema=ADD_TO_SHOPPING_LIST_SCHEMA,
        )

    try:
        await async_register_frontend(hass)
    except RuntimeError as err:
        _LOGGER.warning("Could not register the Rezeptbox card: %s", err)

    return True


async def async_setup_entry(hass: HomeAssistant, entry: RecipeBoxConfigEntry) -> bool:
    """Set up one imported recipe."""
    coordinator = RecipeCoordinator(hass, entry)
    await coordinator.async_load_stored_recipe()
    await coordinator.async_config_entry_first_refresh()

    entry.runtime_data = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_reload_entry))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: RecipeBoxConfigEntry) -> bool:
    """Unload a recipe."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def _async_reload_entry(
    hass: HomeAssistant, entry: RecipeBoxConfigEntry
) -> None:
    """Reload a recipe after its options changed."""
    await hass.config_entries.async_reload(entry.entry_id)


async def _async_add_to_shopping_list(
    hass: HomeAssistant, call: ServiceCall
) -> None:
    """Add every ingredient of the selected recipe to the shopping list."""
    if "shopping_list" not in hass.config.components:
        raise HomeAssistantError(
            "The Home Assistant shopping list (shopping_list) is not set up."
        )

    entity_ids = call.data.get(ATTR_ENTITY_ID, [])
    if isinstance(entity_ids, str):
        entity_ids = [entity_ids]

    added = 0
    for entity_id in entity_ids:
        state = hass.states.get(entity_id)
        if state is None:
            _LOGGER.warning("Unknown Rezeptbox entity %s", entity_id)
            continue

        for ingredient in state.attributes.get(ATTR_INGREDIENTS) or []:
            name = str(ingredient).strip()
            if not name:
                continue
            await hass.services.async_call(
                "shopping_list",
                "add_item",
                {"name": name},
                blocking=True,
            )
            added += 1

    if not added:
        _LOGGER.warning("No ingredients were found for %s", entity_ids)
    else:
        _LOGGER.debug("Added %s ingredients to the shopping list", added)
