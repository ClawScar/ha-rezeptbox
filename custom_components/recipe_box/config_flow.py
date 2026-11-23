"""Config flow for Rezeptbox."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers.selector import (
    NumberSelector,
    NumberSelectorConfig,
    NumberSelectorMode,
    TextSelector,
    TextSelectorConfig,
    TextSelectorType,
)

from .const import (
    CONF_UPDATE_INTERVAL_HOURS,
    CONF_URL,
    DEFAULT_UPDATE_INTERVAL_HOURS,
    DOMAIN,
)
from .parser import RecipeError, normalize_url
from .scraper import async_scrape_recipe

_LOGGER = logging.getLogger(__name__)

KNOWN_ERRORS = {"cannot_connect", "invalid_url", "no_recipe", "invalid_response"}


class RecipeBoxConfigFlow(ConfigFlow, domain=DOMAIN):
    """Import a recipe by its URL."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Handle the URL the user pasted."""
        errors: dict[str, str] = {}

        if user_input is not None:
            try:
                url = normalize_url(user_input[CONF_URL])
            except RecipeError:
                errors["base"] = "invalid_url"
            else:
                try:
                    recipe = await async_scrape_recipe(self.hass, url)
                except RecipeError as err:
                    _LOGGER.debug("Recipe import failed for %s: %s", url, err)
                    errors["base"] = (
                        err.code if err.code in KNOWN_ERRORS else "unknown"
                    )
                else:
                    await self.async_set_unique_id(recipe.source_url)
                    self._abort_if_unique_id_configured()
                    return self.async_create_entry(
                        title=recipe.title[:60],
                        data={CONF_URL: recipe.source_url},
                    )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_URL): TextSelector(
                        TextSelectorConfig(type=TextSelectorType.URL)
                    )
                }
            ),
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry) -> "RecipeBoxOptionsFlow":
        """Return the options flow for a recipe."""
        return RecipeBoxOptionsFlow()


class RecipeBoxOptionsFlow(OptionsFlow):
    """Configure how often a recipe is refreshed."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Handle the refresh interval."""
        if user_input is not None:
            return self.async_create_entry(data=user_input)

        current = self.config_entry.options.get(
            CONF_UPDATE_INTERVAL_HOURS, DEFAULT_UPDATE_INTERVAL_HOURS
        )
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_UPDATE_INTERVAL_HOURS, default=current
                    ): NumberSelector(
                        NumberSelectorConfig(
                            min=0,
                            max=168,
                            step=1,
                            mode=NumberSelectorMode.BOX,
                            unit_of_measurement="h",
                        )
                    )
                }
            ),
        )
