"""Serve the bundled Lovelace card and the automatic sidebar panel."""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

from .const import (
    CARD_URL,
    CARD_URL_PATH,
    DATA_PANEL,
    DOMAIN,
    NAME,
    PANEL_COMPONENT,
    PANEL_URL_PATH,
)

_LOGGER = logging.getLogger(__name__)

DATA_FRONTEND = f"{DOMAIN}_frontend"
WWW_PATH = Path(__file__).parent / "www"


async def async_register_frontend(hass: HomeAssistant) -> None:
    """Expose ``/recipe_box/recipe-card.js`` and load it in the frontend."""
    if hass.data.get(DATA_FRONTEND):
        return

    try:
        await hass.http.async_register_static_paths(
            [StaticPathConfig(CARD_URL_PATH, str(WWW_PATH), False)]
        )
    except RuntimeError:
        _LOGGER.debug("Static path %s is already registered", CARD_URL_PATH)

    hass.data[DATA_FRONTEND] = True

    if "frontend" not in hass.config.components:
        _LOGGER.info(
            "Frontend is not loaded yet; add %s as a JavaScript module "
            "resource if the recipe card does not appear",
            CARD_URL,
        )
        return

    try:
        from homeassistant.components.frontend import add_extra_js_url

        add_extra_js_url(hass, CARD_URL)
        _LOGGER.debug("Loaded recipe card module %s", CARD_URL)
    except (KeyError, RuntimeError):
        _LOGGER.info(
            "Could not load the recipe card automatically; add %s as a "
            "JavaScript module resource in your dashboard",
            CARD_URL,
        )


def async_register_panel(hass: HomeAssistant) -> None:
    """Register the automatic ``Rezeptbox`` sidebar page."""
    if hass.data.get(DATA_PANEL):
        return

    if "frontend" not in hass.config.components:
        _LOGGER.debug("Frontend is not loaded; skipping the recipe panel")
        return

    from homeassistant.components.frontend import async_register_built_in_panel

    try:
        async_register_built_in_panel(
            hass,
            "custom",
            sidebar_title=NAME,
            sidebar_icon="mdi:chef-hat",
            frontend_url_path=PANEL_URL_PATH,
            config={
                "_panel_custom": {
                    "name": PANEL_COMPONENT,
                    "module_url": CARD_URL,
                    "embed_iframe": False,
                    "trust_external": False,
                }
            },
            require_admin=False,
        )
    except ValueError:
        _LOGGER.debug("Panel %s is already registered", PANEL_URL_PATH)
        hass.data[DATA_PANEL] = True
        return

    hass.data[DATA_PANEL] = True
    _LOGGER.debug("Registered recipe panel at /%s", PANEL_URL_PATH)


def async_remove_panel(hass: HomeAssistant) -> None:
    """Remove the sidebar page again when the integration is deleted."""
    if not hass.data.pop(DATA_PANEL, None):
        return

    from homeassistant.components.frontend import async_remove_panel as remove

    remove(hass, PANEL_URL_PATH, warn_if_unknown=False)
