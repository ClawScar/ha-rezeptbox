"""The Rezeptbox integration."""

from __future__ import annotations

import logging
import re
from functools import partial
from typing import Any
from uuid import uuid4

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
    ATTR_DATE,
    ATTR_DIRECTION,
    ATTR_EXCLUDE,
    ATTR_FAVORITES,
    ATTR_FAVORITE,
    ATTR_GROUP,
    ATTR_GROUPS,
    ATTR_IMAGE_URL,
    ATTR_INGREDIENTS,
    ATTR_INGREDIENTS_STRUCTURED,
    ATTR_INSTRUCTIONS,
    ATTR_LABEL,
    ATTR_MERGE,
    ATTR_NAME,
    ATTR_PLAN,
    ATTR_RECIPES,
    ATTR_SERVINGS,
    ATTR_TAGS,
    ATTR_TITLE,
    ATTR_URL,
    ATTR_URLS,
    CONF_URL,
    DATA_HUB,
    DOMAIN,
    KNOWN_IMPORT_ERRORS,
    MANUAL_URL_PREFIX,
    MAX_RECIPE_GROUPS,
    NAME,
    PLATFORMS,
    SERVICE_ADD_GROUP,
    SERVICE_ADD_RECIPE,
    SERVICE_ADD_TO_SHOPPING_LIST,
    SERVICE_CLEAR_MEAL_PLAN,
    SERVICE_EXPORT_RECIPES,
    SERVICE_IMPORT_RECIPE,
    SERVICE_IMPORT_RECIPES,
    SERVICE_PLAN_RECIPE,
    SERVICE_REFRESH_RECIPE,
    SERVICE_MOVE_GROUP,
    SERVICE_REMOVE_GROUP,
    SERVICE_REMOVE_RECIPE,
    SERVICE_RENAME_GROUP,
    SERVICE_SET_GROUPS,
    SERVICE_SET_RECIPE_IMAGE,
    SERVICE_SET_FAVORITE,
    SERVICE_CLEANUP_RECIPE_IMAGES,
)
from .coordinator import RecipeHub, normalize_group_names
from .frontend import (
    async_register_frontend,
    async_register_panel,
    async_remove_panel,
)
from .parser import (
    Recipe,
    RecipeError,
    clean_text,
    normalize_url,
    parse_ingredient_text,
    scale_ingredient_lines,
)
from .plan import clean_plan_label
from .shopping import TODO_DOMAIN, async_add_ingredient_lines, shopping_target

_LOGGER = logging.getLogger(__name__)

type RecipeBoxConfigEntry = ConfigEntry[RecipeHub]

ADD_TO_SHOPPING_LIST_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_ENTITY_ID): cv.entity_ids,
        vol.Optional(ATTR_SERVINGS): vol.All(
            vol.Coerce(float), vol.Range(min=0.5, max=100)
        ),
        vol.Optional(ATTR_EXCLUDE): vol.All(cv.ensure_list, [cv.string]),
        vol.Optional(ATTR_MERGE, default=True): cv.boolean,
    }
)

ADD_RECIPE_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_TITLE): cv.string,
        vol.Required(ATTR_INGREDIENTS): vol.All(cv.ensure_list, [cv.string]),
        vol.Optional(ATTR_INSTRUCTIONS, default=[]): vol.All(
            cv.ensure_list, [cv.string]
        ),
        vol.Optional(ATTR_SERVINGS): vol.All(
            vol.Coerce(int), vol.Range(min=1, max=100)
        ),
        vol.Optional(ATTR_TAGS, default=[]): vol.All(cv.ensure_list, [cv.string]),
        vol.Optional(ATTR_IMAGE_URL, default=""): cv.string,
        vol.Optional(ATTR_URL, default=""): cv.string,
    }
)

REFRESH_RECIPE_SCHEMA = vol.All(
    vol.Schema(
        {
            vol.Optional(ATTR_URL): cv.string,
            vol.Optional(ATTR_ENTITY_ID): cv.entity_id,
        }
    ),
    cv.has_at_least_one_key(ATTR_URL, ATTR_ENTITY_ID),
)

PLAN_RECIPE_SCHEMA = vol.All(
    vol.Schema(
        {
            vol.Required(ATTR_DATE): cv.date,
            vol.Optional(ATTR_URL): cv.string,
            vol.Optional(ATTR_ENTITY_ID): cv.entity_id,
            vol.Optional(ATTR_SERVINGS): vol.All(
                vol.Coerce(float), vol.Range(min=0.5, max=100)
            ),
            vol.Optional(ATTR_LABEL): vol.All(
                cv.string, vol.Length(min=1, max=40)
            ),
        }
    ),
    cv.has_at_least_one_key(ATTR_URL, ATTR_ENTITY_ID, ATTR_LABEL),
)

CLEAR_MEAL_PLAN_SCHEMA = vol.Schema({vol.Optional(ATTR_DATE): cv.date})

SET_GROUPS_SCHEMA = vol.All(
    vol.Schema(
        {
            vol.Required(ATTR_GROUPS): vol.All(cv.ensure_list, [cv.string]),
            vol.Optional(ATTR_URL): cv.string,
            vol.Optional(ATTR_ENTITY_ID): cv.entity_id,
        }
    ),
    cv.has_at_least_one_key(ATTR_URL, ATTR_ENTITY_ID),
)

SET_RECIPE_IMAGE_SCHEMA = vol.All(
    vol.Schema(
        {
            vol.Optional(ATTR_IMAGE_URL, default=""): cv.string,
            vol.Optional(ATTR_URL): cv.string,
            vol.Optional(ATTR_ENTITY_ID): cv.entity_id,
        }
    ),
    cv.has_at_least_one_key(ATTR_URL, ATTR_ENTITY_ID),
)

CLEANUP_IMAGES_SCHEMA = vol.Schema({})

SET_FAVORITE_SCHEMA = vol.All(
    vol.Schema(
        {
            vol.Optional(ATTR_FAVORITE): cv.boolean,
            vol.Optional(ATTR_URL): cv.string,
            vol.Optional(ATTR_ENTITY_ID): cv.entity_id,
        }
    ),
    cv.has_at_least_one_key(ATTR_URL, ATTR_ENTITY_ID),
)

GROUP_SCHEMA = vol.Schema({vol.Required(ATTR_GROUP): cv.string})

RENAME_GROUP_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_GROUP): cv.string,
        vol.Required(ATTR_NAME): cv.string,
    }
)

MOVE_GROUP_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_GROUP): cv.string,
        vol.Required(ATTR_DIRECTION): vol.In(["up", "down"]),
    }
)

IMPORT_RECIPES_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_RECIPES): vol.All(cv.ensure_list, [dict]),
        vol.Optional(ATTR_PLAN, default=dict): dict,
        vol.Optional(ATTR_FAVORITES, default=list): vol.All(
            cv.ensure_list, [cv.string]
        ),
        vol.Optional(ATTR_GROUPS, default=list): vol.All(
            cv.ensure_list, [cv.string]
        ),
    }
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


CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


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

    if not hass.services.has_service(DOMAIN, SERVICE_ADD_RECIPE):
        hass.services.async_register(
            DOMAIN,
            SERVICE_ADD_RECIPE,
            partial(_async_add_recipe, hass),
            schema=ADD_RECIPE_SCHEMA,
            supports_response=SupportsResponse.OPTIONAL,
        )

    if not hass.services.has_service(DOMAIN, SERVICE_REFRESH_RECIPE):
        hass.services.async_register(
            DOMAIN,
            SERVICE_REFRESH_RECIPE,
            partial(_async_refresh_recipe, hass),
            schema=REFRESH_RECIPE_SCHEMA,
            supports_response=SupportsResponse.OPTIONAL,
        )

    if not hass.services.has_service(DOMAIN, SERVICE_EXPORT_RECIPES):
        hass.services.async_register(
            DOMAIN,
            SERVICE_EXPORT_RECIPES,
            partial(_async_export_recipes, hass),
            schema=vol.Schema({}),
            supports_response=SupportsResponse.ONLY,
        )

    if not hass.services.has_service(DOMAIN, SERVICE_IMPORT_RECIPES):
        hass.services.async_register(
            DOMAIN,
            SERVICE_IMPORT_RECIPES,
            partial(_async_import_recipes, hass),
            schema=IMPORT_RECIPES_SCHEMA,
            supports_response=SupportsResponse.OPTIONAL,
        )

    if not hass.services.has_service(DOMAIN, SERVICE_PLAN_RECIPE):
        hass.services.async_register(
            DOMAIN,
            SERVICE_PLAN_RECIPE,
            partial(_async_plan_recipe, hass),
            schema=PLAN_RECIPE_SCHEMA,
            supports_response=SupportsResponse.OPTIONAL,
        )

    if not hass.services.has_service(DOMAIN, SERVICE_CLEAR_MEAL_PLAN):
        hass.services.async_register(
            DOMAIN,
            SERVICE_CLEAR_MEAL_PLAN,
            partial(_async_clear_meal_plan, hass),
            schema=CLEAR_MEAL_PLAN_SCHEMA,
            supports_response=SupportsResponse.OPTIONAL,
        )

    if not hass.services.has_service(DOMAIN, SERVICE_SET_GROUPS):
        hass.services.async_register(
            DOMAIN,
            SERVICE_SET_GROUPS,
            partial(_async_set_groups, hass),
            schema=SET_GROUPS_SCHEMA,
            supports_response=SupportsResponse.OPTIONAL,
        )

    if not hass.services.has_service(DOMAIN, SERVICE_SET_RECIPE_IMAGE):
        hass.services.async_register(
            DOMAIN,
            SERVICE_SET_RECIPE_IMAGE,
            partial(_async_set_recipe_image, hass),
            schema=SET_RECIPE_IMAGE_SCHEMA,
            supports_response=SupportsResponse.OPTIONAL,
        )

    if not hass.services.has_service(DOMAIN, SERVICE_CLEANUP_RECIPE_IMAGES):
        hass.services.async_register(
            DOMAIN,
            SERVICE_CLEANUP_RECIPE_IMAGES,
            partial(_async_cleanup_recipe_images, hass),
            schema=CLEANUP_IMAGES_SCHEMA,
            supports_response=SupportsResponse.OPTIONAL,
        )

    if not hass.services.has_service(DOMAIN, SERVICE_SET_FAVORITE):
        hass.services.async_register(
            DOMAIN,
            SERVICE_SET_FAVORITE,
            partial(_async_set_favorite, hass),
            schema=SET_FAVORITE_SCHEMA,
            supports_response=SupportsResponse.OPTIONAL,
        )

    if not hass.services.has_service(DOMAIN, SERVICE_ADD_GROUP):
        hass.services.async_register(
            DOMAIN,
            SERVICE_ADD_GROUP,
            partial(_async_add_group, hass),
            schema=GROUP_SCHEMA,
            supports_response=SupportsResponse.OPTIONAL,
        )

    if not hass.services.has_service(DOMAIN, SERVICE_REMOVE_GROUP):
        hass.services.async_register(
            DOMAIN,
            SERVICE_REMOVE_GROUP,
            partial(_async_remove_group, hass),
            schema=GROUP_SCHEMA,
            supports_response=SupportsResponse.OPTIONAL,
        )

    if not hass.services.has_service(DOMAIN, SERVICE_RENAME_GROUP):
        hass.services.async_register(
            DOMAIN,
            SERVICE_RENAME_GROUP,
            partial(_async_rename_group, hass),
            schema=RENAME_GROUP_SCHEMA,
            supports_response=SupportsResponse.OPTIONAL,
        )

    if not hass.services.has_service(DOMAIN, SERVICE_MOVE_GROUP):
        hass.services.async_register(
            DOMAIN,
            SERVICE_MOVE_GROUP,
            partial(_async_move_group, hass),
            schema=MOVE_GROUP_SCHEMA,
            supports_response=SupportsResponse.OPTIONAL,
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
    text = str(url or "").strip()
    recipe = hub.recipe(text)
    if recipe is not None:
        return text, recipe

    try:
        wanted = normalize_url(text)
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
    """Add the ingredients of the selected recipes to the configured list."""
    target = shopping_target(hass)
    if target:
        if hass.states.get(target) is None:
            raise ServiceValidationError(
                translation_domain=DOMAIN,
                translation_key="shopping_target_missing",
                translation_placeholders={"entity_id": target},
            )
    elif "shopping_list" not in hass.config.components:
        raise HomeAssistantError(
            "The Home Assistant shopping list (shopping_list) is not set up."
        )

    entity_ids = call.data.get(ATTR_ENTITY_ID, [])
    if isinstance(entity_ids, str):
        entity_ids = [entity_ids]

    target_servings = call.data.get(ATTR_SERVINGS)
    excluded = {
        str(item) for item in (call.data.get(ATTR_EXCLUDE) or []) if str(item)
    }
    lines: list[str] = []

    for entity_id in entity_ids:
        state = hass.states.get(entity_id)
        if state is None:
            _LOGGER.warning("Unknown Rezeptbox entity %s", entity_id)
            continue

        factor = 1.0
        base_servings = state.attributes.get(ATTR_SERVINGS)
        if (
            target_servings
            and isinstance(base_servings, (int, float))
            and not isinstance(base_servings, bool)
            and base_servings > 0
        ):
            factor = float(target_servings) / float(base_servings)

        pairs = scale_ingredient_lines(
            state.attributes.get(ATTR_INGREDIENTS_STRUCTURED) or [],
            state.attributes.get(ATTR_INGREDIENTS) or [],
            factor,
        )
        lines.extend(
            scaled
            for original, scaled in pairs
            if original not in excluded and str(scaled).strip()
        )

    if not lines:
        _LOGGER.warning("No ingredients were found for %s", entity_ids)
        return

    if call.data.get(ATTR_MERGE, True):
        added = await async_add_ingredient_lines(hass, lines, target=target)
    else:
        added = 0
        for name in lines:
            name = str(name).strip()
            if not name:
                continue
            if target:
                await hass.services.async_call(
                    TODO_DOMAIN,
                    "add_item",
                    {"entity_id": target, "item": name},
                    blocking=True,
                )
            else:
                await hass.services.async_call(
                    "shopping_list",
                    "add_item",
                    {"name": name},
                    blocking=True,
                )
            added += 1

    _LOGGER.debug("Added %s ingredients to %s", added, target or "the shopping list")


def _call_recipe_url(hass: HomeAssistant, call: ServiceCall) -> str:
    """Return the recipe URL from the service call or the entity."""
    url = call.data.get(ATTR_URL)
    if url:
        return str(url)

    entity_id = call.data.get(ATTR_ENTITY_ID)
    state = hass.states.get(entity_id) if entity_id else None
    source_url = state.attributes.get("source_url") if state else None
    if not source_url:
        raise ServiceValidationError(
            translation_domain=DOMAIN, translation_key="recipe_not_found"
        )
    return str(source_url)


def _manual_source_url(title: str) -> str:
    """Return a stable-looking key for a manually created recipe."""
    slug = re.sub(r"[^a-z0-9]+", "-", title.casefold()).strip("-")[:40]
    return f"{MANUAL_URL_PREFIX}{slug or 'rezept'}-{uuid4().hex[:8]}"


async def _async_add_recipe(
    hass: HomeAssistant, call: ServiceCall
) -> dict[str, Any]:
    """Create a recipe without a source page (family recipes, cards, PDFs)."""
    hub = _get_hub(hass)
    if hub is None:
        raise HomeAssistantError("Die Rezeptbox ist nicht eingerichtet.")

    title = clean_text(call.data.get(ATTR_TITLE))
    ingredients = [
        text
        for text in (clean_text(item) for item in call.data.get(ATTR_INGREDIENTS) or [])
        if text
    ]
    if not title or not ingredients:
        raise ServiceValidationError(
            translation_domain=DOMAIN, translation_key="invalid_recipe"
        )

    instructions = [
        text
        for text in (
            clean_text(item) for item in call.data.get(ATTR_INSTRUCTIONS) or []
        )
        if text
    ]
    tags = [
        text
        for text in (clean_text(item) for item in call.data.get(ATTR_TAGS) or [])
        if text
    ]

    source_url = str(call.data.get(ATTR_URL) or "").strip()
    if source_url:
        try:
            source_url = normalize_url(source_url)
        except RecipeError as err:
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="invalid_url"
            ) from err
    else:
        source_url = _manual_source_url(title)

    recipe = Recipe(
        title=title,
        source_url=source_url,
        site="Eigenes Rezept",
        image_url=str(call.data.get(ATTR_IMAGE_URL) or ""),
        servings=call.data.get(ATTR_SERVINGS),
        ingredients=ingredients,
        ingredients_structured=[
            parse_ingredient_text(text) for text in ingredients
        ],
        instructions=instructions,
        tags=tags,
    )
    await hub.async_add_recipe(recipe)
    _LOGGER.debug("Added manual recipe %s", recipe.title)
    return {"title": recipe.title, "url": recipe.source_url}


async def _async_set_recipe_image(
    hass: HomeAssistant, call: ServiceCall
) -> dict[str, Any]:
    """Set or clear the photo of a manually created recipe."""
    hub = _get_hub(hass)
    if hub is None:
        raise HomeAssistantError("Die Rezeptbox ist nicht eingerichtet.")

    source_url, recipe = _resolve_recipe(hub, _call_recipe_url(hass, call))
    if not source_url.startswith(MANUAL_URL_PREFIX):
        # A refresh would replace the photo of an imported recipe again.
        raise ServiceValidationError(
            translation_domain=DOMAIN, translation_key="not_manual_recipe"
        )

    image_url = str(call.data.get(ATTR_IMAGE_URL) or "").strip()
    await hub.async_set_image(source_url, image_url)
    _LOGGER.debug("Set image for %s", source_url)
    return {
        "title": recipe.title,
        "url": source_url,
        "image_url": image_url,
    }


async def _async_set_favorite(
    hass: HomeAssistant, call: ServiceCall
) -> dict[str, Any]:
    """Mark or unmark a recipe as a favorite for the whole installation."""
    hub = _get_hub(hass)
    if hub is None:
        raise HomeAssistantError("Die Rezeptbox ist nicht eingerichtet.")

    source_url, recipe = _resolve_recipe(hub, _call_recipe_url(hass, call))
    favorite = call.data.get(ATTR_FAVORITE)
    if favorite is None:
        # Without an explicit value the star simply flips.
        favorite = not hub.is_favorite(source_url)
    favorite = await hub.async_set_favorite(source_url, favorite)
    _LOGGER.debug("Set favorite %s for %s", favorite, source_url)
    return {
        "title": recipe.title,
        "url": source_url,
        "favorite": favorite,
    }


async def _async_cleanup_recipe_images(
    hass: HomeAssistant, call: ServiceCall
) -> dict[str, Any]:
    """Delete photos of own recipes that are no longer used."""
    hub = _get_hub(hass)
    if hub is None:
        raise HomeAssistantError("Die Rezeptbox ist nicht eingerichtet.")
    return await hub.async_cleanup_images()


async def _async_refresh_recipe(
    hass: HomeAssistant, call: ServiceCall
) -> dict[str, Any]:
    """Reload one recipe from its source page."""
    hub = _get_hub(hass)
    if hub is None:
        raise HomeAssistantError("Die Rezeptbox ist nicht eingerichtet.")

    source_url, _recipe = _resolve_recipe(hub, _call_recipe_url(hass, call))
    if not source_url.startswith(("http://", "https://")):
        raise ServiceValidationError(
            translation_domain=DOMAIN, translation_key="manual_recipe"
        )

    try:
        recipe = await hub.async_refresh_recipe(source_url)
    except RecipeError as err:
        code = err.code if err.code in KNOWN_IMPORT_ERRORS else "unknown"
        raise ServiceValidationError(
            translation_domain=DOMAIN, translation_key=code
        ) from err

    return {"title": recipe.title, "url": recipe.source_url}


async def _async_export_recipes(
    hass: HomeAssistant, call: ServiceCall
) -> dict[str, Any]:
    """Return all recipes and the meal plan as a JSON serialisable dict."""
    hub = _get_hub(hass)
    if hub is None:
        raise HomeAssistantError("Die Rezeptbox ist nicht eingerichtet.")
    return {
        "recipes": [recipe.as_dict() for recipe in hub.recipes.values()],
        "plan": hub.plan,
        "groups": hub.groups,
        "favorites": sorted(hub.favorites),
        # Recipes whose photo was cleaned up still import fine, but the card
        # warns while saving so a backup is not mistaken for a complete one.
        "missing_images": hub.missing_image_titles(),
    }


async def _async_import_recipes(
    hass: HomeAssistant, call: ServiceCall
) -> dict[str, Any]:
    """Add recipes from a previous export back to the recipe box."""
    hub = _get_hub(hass)
    if hub is None:
        raise HomeAssistantError("Die Rezeptbox ist nicht eingerichtet.")

    imported = 0
    failed = 0
    for data in call.data.get(ATTR_RECIPES) or []:
        if not isinstance(data, dict):
            failed += 1
            continue
        try:
            recipe = Recipe.from_dict(data)
        except (TypeError, KeyError):
            failed += 1
            continue
        if not recipe.title or not recipe.source_url:
            failed += 1
            continue
        await hub.async_add_recipe(recipe)
        imported += 1

    plan = call.data.get(ATTR_PLAN) or {}
    if isinstance(plan, dict) and plan:
        await hub.async_import_plan(plan)

    groups = [str(item) for item in (call.data.get(ATTR_GROUPS) or [])]
    if groups:
        await hub.async_import_groups(groups)

    favorites = [str(item) for item in (call.data.get(ATTR_FAVORITES) or [])]
    if favorites:
        await hub.async_import_favorites(favorites)

    _LOGGER.debug("Imported %s recipes, %s failed", imported, failed)
    return {"imported": imported, "failed": failed}


async def _async_plan_recipe(
    hass: HomeAssistant, call: ServiceCall
) -> dict[str, Any]:
    """Plan a recipe for one day."""
    hub = _get_hub(hass)
    if hub is None:
        raise HomeAssistantError("Die Rezeptbox ist nicht eingerichtet.")

    date = str(call.data.get(ATTR_DATE))
    label = clean_plan_label(call.data.get(ATTR_LABEL))
    if label:
        # Leftovers, eating out and similar days have no recipe of their own.
        await hub.async_set_plan(
            date, "", call.data.get(ATTR_SERVINGS), label
        )
        return {"date": date, "title": label, "url": ""}

    source_url, recipe = _resolve_recipe(hub, _call_recipe_url(hass, call))
    await hub.async_set_plan(date, source_url, call.data.get(ATTR_SERVINGS))
    return {"date": date, "title": recipe.title, "url": source_url}


async def _async_clear_meal_plan(
    hass: HomeAssistant, call: ServiceCall
) -> dict[str, Any]:
    """Clear one day or the whole meal plan."""
    hub = _get_hub(hass)
    if hub is None:
        raise HomeAssistantError("Die Rezeptbox ist nicht eingerichtet.")

    date = call.data.get(ATTR_DATE)
    await hub.async_clear_plan(str(date) if date else None)
    return {"cleared": str(date) if date else "all"}


def _group_name(value: Any) -> str:
    """Return a cleaned group name or raise a translated service error."""
    name = clean_text(str(value or ""))[:40].strip()
    if not name:
        raise ServiceValidationError(
            translation_domain=DOMAIN, translation_key="invalid_group"
        )
    return name


async def _async_set_groups(
    hass: HomeAssistant, call: ServiceCall
) -> dict[str, Any]:
    """Replace the groups a recipe belongs to."""
    hub = _get_hub(hass)
    if hub is None:
        raise HomeAssistantError("Die Rezeptbox ist nicht eingerichtet.")

    source_url, recipe = _resolve_recipe(hub, _call_recipe_url(hass, call))
    groups = normalize_group_names(
        [str(item) for item in call.data.get(ATTR_GROUPS) or []],
        MAX_RECIPE_GROUPS,
    )
    await hub.async_set_groups(source_url, groups)
    return {"title": recipe.title, "url": source_url, "groups": groups}


async def _async_add_group(
    hass: HomeAssistant, call: ServiceCall
) -> dict[str, Any]:
    """Create a group without assigning a recipe."""
    hub = _get_hub(hass)
    if hub is None:
        raise HomeAssistantError("Die Rezeptbox ist nicht eingerichtet.")

    name = _group_name(call.data.get(ATTR_GROUP))
    groups = await hub.async_add_group(name)
    return {"group": name, "groups": groups}


async def _async_remove_group(
    hass: HomeAssistant, call: ServiceCall
) -> dict[str, Any]:
    """Delete a group and its assignments."""
    hub = _get_hub(hass)
    if hub is None:
        raise HomeAssistantError("Die Rezeptbox ist nicht eingerichtet.")

    name = _group_name(call.data.get(ATTR_GROUP))
    groups = await hub.async_remove_group(name)
    return {"group": name, "groups": groups}


async def _async_rename_group(
    hass: HomeAssistant, call: ServiceCall
) -> dict[str, Any]:
    """Rename a group and keep all of its assignments."""
    hub = _get_hub(hass)
    if hub is None:
        raise HomeAssistantError("Die Rezeptbox ist nicht eingerichtet.")

    old_name = _group_name(call.data.get(ATTR_GROUP))
    new_name = _group_name(call.data.get(ATTR_NAME))
    groups = await hub.async_rename_group(old_name, new_name)
    return {"group": new_name, "old_group": old_name, "groups": groups}


async def _async_move_group(
    hass: HomeAssistant, call: ServiceCall
) -> dict[str, Any]:
    """Move a group one step up or down in the tab order."""
    hub = _get_hub(hass)
    if hub is None:
        raise HomeAssistantError("Die Rezeptbox ist nicht eingerichtet.")

    name = _group_name(call.data.get(ATTR_GROUP))
    direction = call.data.get(ATTR_DIRECTION)
    groups = await hub.async_move_group(name, direction)
    return {"group": name, "direction": direction, "groups": groups}
