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
    ATTR_URLS,
    CONF_URL,
    DATA_HUB,
    DOMAIN,
    KNOWN_IMPORT_ERRORS,
    NAME,
    PLATFORMS,
    SERVICE_ADD_TO_SHOPPING_LIST,
    SERVICE_IMPORT_RECIPE,
    SERVICE_REMOVE_RECIPE,
)
from .coordinator import RecipeHub
from .frontend import (
    async_register_frontend,
    async_register_panel,
    async_remove_panel,
)
from .parser import Recipe, RecipeError, normalize_url

_LOGGER = logging.getLogger(__name__)

type RecipeBoxConfigEntry = ConfigEntry[RecipeHub]

ADD_TO_SHOPPING_LIST_SCHEMA = vol.Schema(
    {vol.Required(ATTR_ENTITY_ID): cv.entity_ids}
)

IMPORT_RECIPE_SCHEMA = vol.All(
    vol.Schema(
        {
            vol.Optional(ATTR_URL): cv.string,
            vol.Optional(ATTR_URLS): vol.All(cv.ensure_list, [cv.string]),
        }
    ),
    cv.has_at_least_one_key(ATTR_URL, ATTR_URLS),
)

REMOVE_RECIPE_SCHEMA = vol.All(
    vol.Schema(
        {
            vol.Optional(ATTR_URL): cv.string,
            vol.Optional(ATTR_ENTITY_ID): cv.entity_id,
        }
    ),
    cv.has_at_least_one_key(ATTR_URL, ATTR_ENTITY_ID),
)


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

    if not hass.services.has_service(DOMAIN, SERVICE_REMOVE_RECIPE):
        hass.services.async_register(
            DOMAIN,
            SERVICE_REMOVE_RECIPE,
            partial(_async_remove_recipe, hass),
            schema=REMOVE_RECIPE_SCHEMA,
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
    async_register_panel(hass)
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


async def async_remove_entry(
    hass: HomeAssistant, entry: RecipeBoxConfigEntry
) -> None:
    """Remove the sidebar page when the last recipe box is deleted."""
    remaining = [
        item
        for item in hass.config_entries.async_entries(DOMAIN)
        if item.entry_id != entry.entry_id
    ]
    if not remaining:
        async_remove_panel(hass)


def _get_hub(hass: HomeAssistant) -> RecipeHub | None:
    """Return the active recipe hub."""
    return hass.data.get(DOMAIN, {}).get(DATA_HUB)


def _resolve_recipe(hub: RecipeHub, url: str) -> tuple[str, Recipe]:
    """Find an imported recipe by URL, tolerating small URL differences."""
    try:
        wanted = normalize_url(url)
    except RecipeError as err:
        raise ServiceValidationError(
            translation_domain=DOMAIN, translation_key="invalid_url"
        ) from err

    recipe = hub.recipe(wanted)
    if recipe is not None:
        return wanted, recipe

    for key, item in hub.recipes.items():
        try:
            if normalize_url(key) == wanted:
                return key, item
        except RecipeError:
            continue

    raise ServiceValidationError(
        translation_domain=DOMAIN, translation_key="recipe_not_found"
    )


async def _async_reload_entry(
    hass: HomeAssistant, entry: RecipeBoxConfigEntry
) -> None:
    """Reload the recipe box after its options changed."""
    await hass.config_entries.async_reload(entry.entry_id)


def _collect_import_urls(call: ServiceCall) -> list[str]:
    """Return the requested URLs, normalised and without duplicates."""
    raw: list[str] = []
    url = call.data.get(ATTR_URL)
    if url:
        raw.append(str(url))

    urls = call.data.get(ATTR_URLS) or []
    if isinstance(urls, str):
        urls = [urls]
    raw.extend(str(item) for item in urls)

    result: list[str] = []
    seen: set[str] = set()
    for item in raw:
        text = item.strip()
        if not text:
            continue
        try:
            key = normalize_url(text)
        except RecipeError:
            key = text
        if key in seen:
            continue
        seen.add(key)
        result.append(key)
    return result


async def _import_single(hub: RecipeHub, url: str) -> Recipe:
    """Import one recipe or raise a translated service error."""
    try:
        return await hub.async_import(url)
    except RecipeError as err:
        _LOGGER.debug("Recipe import failed for %s: %s", url, err)
        code = err.code if err.code in KNOWN_IMPORT_ERRORS else "unknown"
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key=code,
        ) from err


async def _async_import_recipe(
    hass: HomeAssistant, call: ServiceCall
) -> dict[str, Any]:
    """Import one or more recipes into the recipe box."""
    hub = _get_hub(hass)
    if hub is None:
        raise HomeAssistantError("Die Rezeptbox ist nicht eingerichtet.")

    urls = _collect_import_urls(call)
    if not urls:
        raise ServiceValidationError(
            translation_domain=DOMAIN, translation_key="invalid_url"
        )

    if len(urls) == 1:
        recipe = await _import_single(hub, urls[0])
        _LOGGER.debug(
            "Imported recipe %s from %s", recipe.title, recipe.source_url
        )
        return {"title": recipe.title, "url": recipe.source_url}

    imported: list[dict[str, str]] = []
    failed: list[dict[str, str]] = []
    for url in urls:
        try:
            recipe = await hub.async_import(url)
        except RecipeError as err:
            code = err.code if err.code in KNOWN_IMPORT_ERRORS else "unknown"
            _LOGGER.debug("Recipe import failed for %s: %s", url, err)
            failed.append({"url": url, "error": code})
        else:
            imported.append({"title": recipe.title, "url": recipe.source_url})

    _LOGGER.debug(
        "Imported %s of %s recipes (%s failed)",
        len(imported),
        len(urls),
        len(failed),
    )
    return {
        "imported": imported,
        "failed": failed,
        "total": len(urls),
    }


async def _async_remove_recipe(
    hass: HomeAssistant, call: ServiceCall
) -> dict[str, Any]:
    """Remove a recipe from the recipe box."""
    hub = _get_hub(hass)
    if hub is None:
        raise HomeAssistantError("Die Rezeptbox ist nicht eingerichtet.")

    url = call.data.get(ATTR_URL)
    if not url:
        entity_id = call.data.get(ATTR_ENTITY_ID)
        state = hass.states.get(entity_id) if entity_id else None
        if state is None:
            raise ServiceValidationError(
                translation_domain=DOMAIN,
                translation_key="recipe_not_found",
            )
        url = state.attributes.get("source_url")
        if not url:
            raise ServiceValidationError(
                translation_domain=DOMAIN,
                translation_key="recipe_not_found",
            )

    source_url, recipe = _resolve_recipe(hub, str(url))
    await hub.async_remove_recipe(source_url)
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
