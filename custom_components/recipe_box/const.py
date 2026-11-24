"""Constants for the Rezeptbox integration."""

from __future__ import annotations

from homeassistant.const import Platform

DOMAIN = "recipe_box"
NAME = "Rezeptbox"
VERSION = "1.3.1"

CONF_URL = "url"
CONF_UPDATE_INTERVAL_HOURS = "update_interval_hours"
DEFAULT_UPDATE_INTERVAL_HOURS = 24

DATA_HUB = "hub"

PLATFORMS: list[Platform] = [Platform.SENSOR]

# Bundled Lovelace card
CARD_URL_PATH = f"/{DOMAIN}"
CARD_FILENAME = "recipe-card.js"
CARD_URL = f"{CARD_URL_PATH}/{CARD_FILENAME}"

# Automatic sidebar page
PANEL_URL_PATH = "rezeptbox"
PANEL_COMPONENT = "recipe-box-panel"
DATA_PANEL = f"{DOMAIN}_panel"

# Local cache of the imported recipes
STORAGE_VERSION = 1

SERVICE_IMPORT_RECIPE = "import_recipe"
SERVICE_REMOVE_RECIPE = "remove_recipe"
SERVICE_ADD_TO_SHOPPING_LIST = "add_to_shopping_list"
ATTR_URL = "url"
ATTR_URLS = "urls"
ATTR_ENTITY_ID = "entity_id"
ATTR_INGREDIENTS = "ingredients"
ATTR_INGREDIENTS_STRUCTURED = "ingredients_structured"
ATTR_SERVINGS = "servings"

KNOWN_IMPORT_ERRORS = {
    "cannot_connect",
    "invalid_url",
    "no_recipe",
    "invalid_response",
}
