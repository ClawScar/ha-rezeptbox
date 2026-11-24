"""Recipe collection and data update coordinator for Rezeptbox."""

from __future__ import annotations

import logging
from collections.abc import Callable, Iterable
from datetime import timedelta
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from .const import (
    CONF_UPDATE_INTERVAL_HOURS,
    DEFAULT_UPDATE_INTERVAL_HOURS,
    DOMAIN,
    MAX_GROUPS,
    MAX_RECIPE_GROUPS,
    STORAGE_VERSION,
)
from .parser import Recipe, RecipeError, clean_text
from .scraper import async_scrape_recipe

_LOGGER = logging.getLogger(__name__)

EntityAdder = Callable[[Recipe], None]


def normalize_group_names(
    values: Iterable[Any], limit: int = MAX_RECIPE_GROUPS
) -> list[str]:
    """Trim, shorten and de-duplicate group names, keeping their order."""
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        if value is None:
            continue
        name = clean_text(str(value))[:40].strip()
        if not name:
            continue
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        result.append(name)
    return result[:limit]


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
        self._entity_adders: list[EntityAdder] = []
        self._pending_urls: list[str] = []
        self._entities: dict[str, list[Any]] = {}
        self.plan: dict[str, dict[str, Any]] = {}
        self.status: dict[str, dict[str, Any]] = {}
        self.groups: list[str] = []

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

    def add_entity_adder(self, adder: EntityAdder) -> None:
        """Register a callback that creates entities for new recipes."""
        if adder not in self._entity_adders:
            self._entity_adders.append(adder)

    def register_entities(self, source_url: str, entities: list[Any]) -> None:
        """Remember the entities created for a recipe so they can be removed."""
        self._entities.setdefault(source_url, []).extend(entities)

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

        plan = stored.get("plan") if isinstance(stored, dict) else None
        if isinstance(plan, dict):
            self.plan = {
                str(date): entry
                for date, entry in plan.items()
                if isinstance(entry, dict) and entry.get("url")
            }

        status = stored.get("status") if isinstance(stored, dict) else None
        if isinstance(status, dict):
            self.status = {
                str(url): entry
                for url, entry in status.items()
                if isinstance(entry, dict)
            }

        saved_groups = stored.get("groups") if isinstance(stored, dict) else None
        names: list[Any] = (
            list(saved_groups) if isinstance(saved_groups, list) else []
        )
        for recipe in recipes.values():
            # Assignments from 2.1 have no registry entry yet.
            names.extend(recipe.groups)
        self.groups = normalize_group_names(names, MAX_GROUPS)

    async def async_add_recipe(self, recipe: Recipe) -> bool:
        """Store an imported recipe and create its entities.

        Returns True when the recipe is new.
        """
        added = recipe.source_url not in self.recipes
        self.data = {**self.recipes, recipe.source_url: recipe}
        if recipe.groups:
            self.groups = normalize_group_names(
                [*self.groups, *recipe.groups], MAX_GROUPS
            )
        await self._async_save()
        self.async_update_listeners()
        if added:
            for adder in self._entity_adders:
                adder(recipe)
        return added

    async def async_remove_recipe(self, source_url: str) -> Recipe | None:
        """Remove a recipe from the collection, including its entities."""
        recipe = self.recipes.get(source_url)
        if recipe is None:
            return None

        self.data = {
            url: item for url, item in self.recipes.items() if url != source_url
        }
        self.plan = {
            date: entry
            for date, entry in self.plan.items()
            if entry.get("url") != source_url
        }
        self.status.pop(source_url, None)
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

    async def async_set_groups(
        self, source_url: str, groups: list[str]
    ) -> Recipe | None:
        """Replace the groups a recipe belongs to."""
        recipe = self.recipes.get(source_url)
        if recipe is None:
            return None
        recipe.groups = list(groups)
        self.groups = normalize_group_names(
            [*self.groups, *groups], MAX_GROUPS
        )
        await self._async_save()
        self.async_update_listeners()
        return recipe

    async def async_add_group(self, name: str) -> list[str]:
        """Create a group even before a recipe is assigned to it."""
        groups = normalize_group_names([*self.groups, name], MAX_GROUPS)
        if groups == self.groups:
            return list(self.groups)
        self.groups = groups
        await self._async_save()
        self.async_update_listeners()
        return list(self.groups)

    async def async_remove_group(self, name: str) -> list[str]:
        """Delete a group and every assignment to it."""
        key = str(name or "").strip().casefold()
        if not key:
            return list(self.groups)
        self.groups = [
            group for group in self.groups if group.casefold() != key
        ]
        for recipe in self.recipes.values():
            remaining = [
                group for group in recipe.groups if group.casefold() != key
            ]
            if remaining != recipe.groups:
                recipe.groups = remaining
        await self._async_save()
        self.async_update_listeners()
        return list(self.groups)

    async def async_move_group(self, name: str, direction: str) -> list[str]:
        """Move a group one step up or down in the tab order."""
        key = str(name or "").strip().casefold()
        step = {"up": -1, "down": 1}.get(str(direction or "").strip().lower())
        if not key or step is None:
            return list(self.groups)

        groups = list(self.groups)
        index = next(
            (i for i, group in enumerate(groups) if group.casefold() == key),
            None,
        )
        if index is None:
            return groups
        target = index + step
        if target < 0 or target >= len(groups):
            return groups

        groups[index], groups[target] = groups[target], groups[index]
        self.groups = groups
        await self._async_save()
        self.async_update_listeners()
        return list(self.groups)

    async def async_import_groups(self, groups: list[Any]) -> None:
        """Merge the groups of an export into the recipe box."""
        merged = normalize_group_names([*self.groups, *groups], MAX_GROUPS)
        if merged == self.groups:
            return
        self.groups = merged
        await self._async_save()
        self.async_update_listeners()

    async def async_rename_group(
        self, old_name: str, new_name: str
    ) -> list[str]:
        """Rename a group in the list and in every recipe assignment."""
        old_key = str(old_name or "").strip().casefold()
        cleaned = normalize_group_names([new_name], MAX_GROUPS)
        if not old_key or not cleaned:
            return list(self.groups)
        name = cleaned[0]

        assigned = any(
            group.casefold() == old_key
            for recipe in self.recipes.values()
            for group in recipe.groups
        )
        if not assigned and not any(
            group.casefold() == old_key for group in self.groups
        ):
            return list(self.groups)

        renamed = [
            name if group.casefold() == old_key else group
            for group in self.groups
        ]
        self.groups = normalize_group_names([*renamed, name], MAX_GROUPS)

        for recipe in self.recipes.values():
            mapped = [
                name if group.casefold() == old_key else group
                for group in recipe.groups
            ]
            updated = normalize_group_names(mapped, MAX_RECIPE_GROUPS)
            if updated != recipe.groups:
                recipe.groups = updated

        await self._async_save()
        self.async_update_listeners()
        return list(self.groups)

    async def async_refresh_recipe(self, source_url: str) -> Recipe:
        """Reload a single recipe from its source page."""
        try:
            recipe = await async_scrape_recipe(self.hass, source_url)
        except RecipeError as err:
            self._set_status(source_url, err.code)
            await self._async_save()
            self.async_update_listeners()
            raise

        current = self.recipes.get(recipe.source_url)
        if current is not None:
            # Groups belong to the user, a refresh only replaces the page data.
            recipe.groups = list(current.groups)
        self.data = {**self.recipes, recipe.source_url: recipe}
        self._set_status(recipe.source_url, None)
        await self._async_save()
        self.async_update_listeners()
        return recipe

    def _set_status(self, source_url: str, error: str | None) -> None:
        """Remember when a recipe was refreshed and whether it failed."""
        self.status[source_url] = {
            "updated_at": dt_util.utcnow().isoformat(),
            "error": error,
        }

    async def async_set_plan(
        self,
        date: str,
        source_url: str,
        servings: float | None = None,
    ) -> None:
        """Plan one recipe for a date."""
        self.plan[date] = {"url": source_url, "servings": servings}
        await self._async_save()
        self.async_update_listeners()

    async def async_clear_plan(self, date: str | None = None) -> None:
        """Clear one day or the whole meal plan."""
        if date is None:
            self.plan = {}
        else:
            self.plan.pop(date, None)
        await self._async_save()
        self.async_update_listeners()

    async def async_import_plan(self, plan: dict[str, Any]) -> None:
        """Merge a stored plan from an export back into the recipe box."""
        for date, entry in plan.items():
            if isinstance(entry, dict) and entry.get("url"):
                self.plan[str(date)] = {
                    "url": str(entry["url"]),
                    "servings": entry.get("servings"),
                }
        await self._async_save()
        self.async_update_listeners()

    def plan_entries(self) -> list[dict[str, Any]]:
        """Return the meal plan with the recipe data of each day."""
        entries: list[dict[str, Any]] = []
        for date in sorted(self.plan):
            entry = self.plan[date]
            recipe = self.recipes.get(str(entry.get("url") or ""))
            if recipe is None:
                continue
            entries.append(
                {
                    "date": date,
                    "title": recipe.title,
                    "source_url": recipe.source_url,
                    "servings": entry.get("servings"),
                }
            )
        return entries

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
            {
                "recipes": [recipe.as_dict() for recipe in data.values()],
                "plan": self.plan,
                "status": self.status,
                "groups": self.groups,
            }
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
                recipe = await async_scrape_recipe(self.hass, url)
            except RecipeError as err:
                self._set_status(url, err.code)
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
            else:
                if cached is not None:
                    recipe.groups = list(cached.groups)
                updated[url] = recipe
                self._set_status(url, None)

        if not updated:
            raise UpdateFailed(f"Could not load any of {len(urls)} recipes")

        await self._async_save(updated)
        self._pending_urls = []
        return updated
