"""The Rezeptbox integration."""

from __future__ import annotations

import logging
from functools import partial
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import ATTR_ENTITY_ID
from homeassistant.core import (
    HomeAssistant,
    ServiceCall,
    SupportsResponse,
)
from homeassistant.exceptions import (
    HomeAssistantError,
    ServiceValidationError,
)
from homeassistant.helpers import config_validation as cv

from .const import (
    ATTR_INGREDIENTS,
    ATTR_URL,
    CONF_URL,
    DATA_HUB,
    DOMAIN,
    KNOWN_IMPORT_ERRORS,
    NAME,
    PLATFORMS,
    SERVICE_ADD_TO_SHOPPING_LIST,
    SERVICE_IMPORT_RECIPE,
)
from .coordinator import RecipeHub
from .frontend import async_register_frontend
from .parser import RecipeError

_LOGGER = logging.getLogger(__name__)

type RecipeBoxConfigEntry = ConfigEntry[RecipeHub]

ADD_TO_SHOPPING_LIST_SCHEMA = vol.Schema(
    {vol.Required(ATTR_ENTITY_ID): cv.entity_ids}
)

IMPORT_RECIPE_SCHEMA = vol.Schema({vol.Required(ATTR_URL): cv.string})


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    """Register services and the bundled Lovelace card."""
    hass.data.setdefault(DOMAIN, {})

    if not hass.services.has_service(DOMAIN, SERVICE_IMPORT_RECIPE):
        hass.services.async_register(
            DOMAIN,
            SERVICE_IMPORT_RECIPE,
            partial(_async_import_recipe, hass),
            schema=IMPORT_RECIPE_SCHEMA,
            supports_response=SupportsResponse.OPTIONAL,
        )

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
    """Set up the recipe box."""
    hub = RecipeHub(hass, entry)
    await hub.async_load_stored_recipes()

    legacy_url = entry.data.get(CONF_URL)
    if legacy_url:
        # Entries created by 1.x hold a single recipe URL.
        hub.register_url(legacy_url)

    await hub.async_config_entry_first_refresh()

    entry.runtime_data = hub
    hass.data.setdefault(DOMAIN, {})
    if legacy_url:
        hass.data[DOMAIN].setdefault(DATA_HUB, hub)
    else:
        hass.data[DOMAIN][DATA_HUB] = hub

    if legacy_url:
        hass.config_entries.async_update_entry(
            entry, data={}, title=NAME
        )

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_reload_entry))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: RecipeBoxConfigEntry) -> bool:
    """Unload the recipe box."""
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if not unloaded:
        return False

    hub = hass.data.get(DOMAIN, {}).get(DATA_HUB)
    if hub is getattr(entry, "runtime_data", None):
        hass.data[DOMAIN].pop(DATA_HUB, None)
    return True


def _get_hub(hass: HomeAssistant) -> RecipeHub | None:
    """Return the active recipe hub."""
    return hass.data.get(DOMAIN, {}).get(DATA_HUB)


async def _async_reload_entry(
    hass: HomeAssistant, entry: RecipeBoxConfigEntry
) -> None:
    """Reload the recipe box after its options changed."""
    await hass.config_entries.async_reload(entry.entry_id)


async def _async_import_recipe(
    hass: HomeAssistant, call: ServiceCall
) -> dict[str, Any]:
    """Import a recipe from a URL into the recipe box."""
    hub = _get_hub(hass)
    if hub is None:
        raise HomeAssistantError("Die Rezeptbox ist nicht eingerichtet.")

    url = str(call.data[ATTR_URL])
    try:
        recipe = await hub.async_import(url)
    except RecipeError as err:
        _LOGGER.debug("Recipe import failed for %s: %s", url, err)
        code = err.code if err.code in KNOWN_IMPORT_ERRORS else "unknown"
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key=code,
        ) from err

    _LOGGER.debug("Imported recipe %s from %s", recipe.title, recipe.source_url)
    return {"title": recipe.title, "url": recipe.source_url}


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
