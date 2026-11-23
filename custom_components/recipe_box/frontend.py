"""Serve the bundled Lovelace card."""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

from .const import CARD_URL, CARD_URL_PATH, DOMAIN

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
