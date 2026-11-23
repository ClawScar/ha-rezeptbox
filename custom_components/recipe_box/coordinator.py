"""Recipe collection and data update coordinator for Rezeptbox."""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import timedelta
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import (
    CONF_UPDATE_INTERVAL_HOURS,
    DEFAULT_UPDATE_INTERVAL_HOURS,
    DOMAIN,
    STORAGE_VERSION,
)
from .parser import Recipe, RecipeError
from .scraper import async_scrape_recipe

_LOGGER = logging.getLogger(__name__)

EntityAdder = Callable[[Recipe], None]


class RecipeHub(DataUpdateCoordinator[dict[str, Recipe]]):
    """Keep every imported recipe, refresh them together and cache the list."""

    config_entry: ConfigEntry

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        hours = entry.options.get(
            CONF_UPDATE_INTERVAL_HOURS, DEFAULT_UPDATE_INTERVAL_HOURS
        )
        try:
            interval_hours = float(hours)
        except (TypeError, ValueError):
            interval_hours = DEFAULT_UPDATE_INTERVAL_HOURS

        super().__init__(
            hass,
            _LOGGER,
            name=entry.title,
            update_interval=(
                None
                if interval_hours <= 0
                else timedelta(hours=interval_hours)
            ),
            config_entry=entry,
        )
        self.data: dict[str, Recipe] = {}
        self._store = Store(
            hass, STORAGE_VERSION, f"{DOMAIN}.{entry.entry_id}"
        )
        self._entity_adder: EntityAdder | None = None
        self._pending_urls: list[str] = []
        self._entities: dict[str, list[Any]] = {}

    @property
    def recipes(self) -> dict[str, Recipe]:
        """Return all imported recipes keyed by their source URL."""
        return self.data or {}

    def recipe(self, source_url: str) -> Recipe | None:
        """Return one recipe by source URL."""
        return self.recipes.get(source_url)

    def register_url(self, url: str) -> None:
        """Queue a URL for the next refresh (used for old single-recipe entries)."""
        if url not in self.recipes and url not in self._pending_urls:
            self._pending_urls.append(url)

    def set_entity_adder(self, adder: EntityAdder) -> None:
        """Register the callback that creates entities for new recipes."""
        self._entity_adder = adder

    def register_entities(self, source_url: str, entities: list[Any]) -> None:
        """Remember the entities created for a recipe so they can be removed."""
        self._entities[source_url] = entities

    async def async_load_stored_recipes(self) -> None:
        """Load the cached recipe list so it stays available while offline."""
        stored = await self._store.async_load()
        items: list[Any] = []
        if isinstance(stored, dict):
            if isinstance(stored.get("recipes"), list):
                items = stored["recipes"]
            elif stored.get("source_url"):
                # Cache written by 1.x, when one entry held a single recipe.
                items = [stored]
        elif isinstance(stored, list):
            items = stored

        recipes: dict[str, Recipe] = {}
        for item in items:
            if not isinstance(item, dict):
                continue
            try:
                recipe = Recipe.from_dict(item)
            except TypeError:
                continue
            if recipe.source_url:
                recipes[recipe.source_url] = recipe
        self.data = recipes

    async def async_add_recipe(self, recipe: Recipe) -> bool:
        """Store an imported recipe and create its entities.

        Returns True when the recipe is new.
        """
        added = recipe.source_url not in self.recipes
        self.data = {**self.recipes, recipe.source_url: recipe}
        await self._async_save()
        self.async_update_listeners()
        if added and self._entity_adder is not None:
            self._entity_adder(recipe)
        return added

    async def async_remove_recipe(self, source_url: str) -> Recipe | None:
        """Remove a recipe from the collection, including its entities."""
        recipe = self.recipes.get(source_url)
        if recipe is None:
            return None

        self.data = {
            url: item for url, item in self.recipes.items() if url != source_url
        }
        await self._async_save()
        self.async_update_listeners()
        await self._async_remove_entities(source_url)
        _LOGGER.debug("Removed recipe %s", source_url)
        return recipe

    async def async_import(self, url: str) -> Recipe:
        """Fetch a recipe from a URL and add it to the collection."""
        recipe = await async_scrape_recipe(self.hass, url)
        await self.async_add_recipe(recipe)
        return recipe

    async def _async_remove_entities(self, source_url: str) -> None:
        """Delete the entity and device registry entries of a recipe."""
        for entity in self._entities.pop(source_url, []):
            await entity.async_remove()

        registry = dr.async_get(self.hass)
        device = registry.async_get_device(identifiers={(DOMAIN, source_url)})
        if device is not None:
            registry.async_remove_device(device.id)

    async def _async_save(
        self, recipes: dict[str, Recipe] | None = None
    ) -> None:
        """Persist the recipe list."""
        data = self.recipes if recipes is None else recipes
        await self._store.async_save(
            {"recipes": [recipe.as_dict() for recipe in data.values()]}
        )

    async def _async_update_data(self) -> dict[str, Recipe]:
        """Refresh every imported recipe, keeping cached copies on errors."""
        urls = list(self.recipes)
        urls.extend(url for url in self._pending_urls if url not in self.recipes)
        if not urls:
            return {}

        updated: dict[str, Recipe] = {}
        for url in urls:
            cached = self.recipes.get(url)
            try:
                updated[url] = await async_scrape_recipe(self.hass, url)
            except RecipeError as err:
                if cached is not None:
                    _LOGGER.warning(
                        "Could not refresh recipe %s (%s); keeping the cached version",
                        url,
                        err.code,
                    )
                    updated[url] = cached
                else:
                    _LOGGER.warning(
                        "Could not load recipe %s (%s)", url, err.code
                    )

        if not updated:
            raise UpdateFailed(f"Could not load any of {len(urls)} recipes")

        if updated != self.recipes:
            await self._async_save(updated)
        self._pending_urls = []
        return updated
