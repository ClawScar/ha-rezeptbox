"""Network layer that turns a recipe URL into a :class:`Recipe`."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import aiohttp

from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .parser import (
    Recipe,
    RecipeError,
    chefkoch_recipe_id,
    normalize_url,
    parse_jsonld_html,
    recipe_from_chefkoch,
)

_LOGGER = logging.getLogger(__name__)

CHEFKOCH_API = "https://api.chefkoch.de/v2/recipes/{recipe_id}"
REQUEST_TIMEOUT = aiohttp.ClientTimeout(total=25)

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Rezeptbox/1.0"
)

API_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json",
}

HTML_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
}


async def async_scrape_recipe(hass: HomeAssistant, url: str) -> Recipe:
    """Fetch and parse a recipe from a URL.

    Chefkoch links use the public v2 API first because it is stable and fast;
    every other site is parsed through schema.org JSON-LD.
    """
    url = normalize_url(url)
    recipe_id = chefkoch_recipe_id(url)

    if recipe_id is not None:
        try:
            return await _async_fetch_chefkoch(hass, recipe_id, url)
        except RecipeError as err:
            _LOGGER.debug(
                "Chefkoch API failed for %s (%s), falling back to the web page",
                recipe_id,
                err.code,
            )

    return await _async_fetch_html(hass, url)


async def _async_fetch_chefkoch(
    hass: HomeAssistant, recipe_id: str, url: str
) -> Recipe:
    """Fetch a recipe from the Chefkoch v2 API."""
    session = async_get_clientsession(hass)
    api_url = CHEFKOCH_API.format(recipe_id=recipe_id)

    try:
        async with session.get(
            api_url, headers=API_HEADERS, timeout=REQUEST_TIMEOUT
        ) as response:
            if response.status != 200:
                raise RecipeError(
                    "cannot_connect",
                    f"Chefkoch API returned HTTP {response.status}",
                )
            payload: Any = await response.json(content_type=None)
    except (aiohttp.ClientError, asyncio.TimeoutError) as err:
        raise RecipeError("cannot_connect", str(err)) from err
    except ValueError as err:
        raise RecipeError(
            "invalid_response", "Chefkoch API returned invalid JSON"
        ) from err

    return recipe_from_chefkoch(payload, url)


async def _async_fetch_html(hass: HomeAssistant, url: str) -> Recipe:
    """Fetch a recipe page and parse its schema.org JSON-LD data."""
    session = async_get_clientsession(hass)

    try:
        async with session.get(
            url, headers=HTML_HEADERS, timeout=REQUEST_TIMEOUT
        ) as response:
            final_url = str(response.url)
            if response.status >= 400:
                raise RecipeError(
                    "cannot_connect",
                    f"{final_url} returned HTTP {response.status}",
                )
            page = await response.text(errors="replace")
    except (aiohttp.ClientError, asyncio.TimeoutError) as err:
        raise RecipeError("cannot_connect", str(err)) from err

    recipe = parse_jsonld_html(page, final_url)
    if recipe is None:
        raise RecipeError("no_recipe", f"No schema.org recipe found on {final_url}")
    return recipe
