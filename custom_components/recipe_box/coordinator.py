"""Data update coordinator for Rezeptbox."""

from __future__ import annotations

import logging
from datetime import timedelta

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import (
    CONF_UPDATE_INTERVAL_HOURS,
    CONF_URL,
    DEFAULT_UPDATE_INTERVAL_HOURS,
    DOMAIN,
    STORAGE_VERSION,
)
from .parser import Recipe, RecipeError
from .scraper import async_scrape_recipe

_LOGGER = logging.getLogger(__name__)


class RecipeCoordinator(DataUpdateCoordinator[Recipe]):
    """Fetch a recipe and keep the last good copy on disk."""

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
        self._store = Store(
            hass, STORAGE_VERSION, f"{DOMAIN}.{entry.entry_id}"
        )

    @property
    def recipe_title(self) -> str:
        """Return a display name for the recipe."""
        return self.data.title if self.data is not None else self.config_entry.title

    async def async_load_stored_recipe(self) -> None:
        """Load the cached recipe so it stays available while offline."""
        stored = await self._store.async_load()
        if not isinstance(stored, dict):
            return
        try:
            self.data = Recipe.from_dict(stored)
        except TypeError:
            _LOGGER.debug("Ignoring incomplete cached recipe for %s", self.name)

    async def _async_update_data(self) -> Recipe:
        """Fetch the recipe from its source, falling back to the cached copy."""
        url = self.config_entry.data.get(CONF_URL)
        if not url:
            raise UpdateFailed("No recipe URL configured")

        try:
            recipe = await async_scrape_recipe(self.hass, url)
        except RecipeError as err:
            if self.data is not None:
                _LOGGER.warning(
                    "Could not refresh recipe %s (%s); keeping the cached version",
                    self.name,
                    err.code,
                )
                return self.data
            raise UpdateFailed(f"{err.code}: {err}") from err

        if recipe != self.data:
            await self._store.async_save(recipe.as_dict())
        return recipe
