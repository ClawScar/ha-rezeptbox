"""Config flow for Rezeptbox."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers.selector import (
    EntitySelector,
    EntitySelectorConfig,
    NumberSelector,
    NumberSelectorConfig,
    NumberSelectorMode,
    TextSelector,
    TextSelectorConfig,
)

from .const import (
    CONF_BACKUP_PATH,
    CONF_SHOPPING_TARGET,
    CONF_UPDATE_INTERVAL_HOURS,
    DEFAULT_UPDATE_INTERVAL_HOURS,
    DOMAIN,
    NAME,
)


class RecipeBoxConfigFlow(ConfigFlow, domain=DOMAIN):
    """Set up an empty recipe box.

    Recipes are imported later from the dashboard card or the
    ``recipe_box.import_recipe`` service.
    """

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Create the (empty) recipe box."""
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        return self.async_create_entry(title=NAME, data={})

    @staticmethod
    @callback
    def async_get_options_flow(config_entry) -> "RecipeBoxOptionsFlow":
        """Return the options flow for the recipe box."""
        return RecipeBoxOptionsFlow()


class RecipeBoxOptionsFlow(OptionsFlow):
    """Configure the refresh interval and the shopping list target."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Handle the refresh interval and the shopping list target."""
        if user_input is not None:
            data = dict(user_input)
            data[CONF_SHOPPING_TARGET] = str(
                data.get(CONF_SHOPPING_TARGET) or ""
            ).strip()
            data[CONF_BACKUP_PATH] = str(
                data.get(CONF_BACKUP_PATH) or ""
            ).strip()
            return self.async_create_entry(data=data)

        current = self.config_entry.options.get(
            CONF_UPDATE_INTERVAL_HOURS, DEFAULT_UPDATE_INTERVAL_HOURS
        )
        target = str(
            self.config_entry.options.get(CONF_SHOPPING_TARGET) or ""
        ).strip()
        backup_path = str(
            self.config_entry.options.get(CONF_BACKUP_PATH) or ""
        ).strip()
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
                    ),
                    vol.Optional(
                        CONF_SHOPPING_TARGET,
                        description={"suggested_value": target} if target else {},
                    ): EntitySelector(EntitySelectorConfig(domain="todo")),
                    vol.Optional(
                        CONF_BACKUP_PATH,
                        description={
                            "suggested_value": backup_path
                        }
                        if backup_path
                        else {},
                    ): TextSelector(TextSelectorConfig()),
                }
            ),
        )
