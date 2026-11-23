"""Constants for the Rezeptbox integration."""

from __future__ import annotations

from homeassistant.const import Platform

DOMAIN = "recipe_box"
NAME = "Rezeptbox"
VERSION = "1.1.0"

CONF_URL = "url"
CONF_UPDATE_INTERVAL_HOURS = "update_interval_hours"
DEFAULT_UPDATE_INTERVAL_HOURS = 24

PLATFORMS: list[Platform] = [Platform.SENSOR]

# Bundled Lovelace card
CARD_URL_PATH = f"/{DOMAIN}"
CARD_FILENAME = "recipe-card.js"
CARD_URL = f"{CARD_URL_PATH}/{CARD_FILENAME}"

# Local cache of the last imported recipe
STORAGE_VERSION = 1

SERVICE_ADD_TO_SHOPPING_LIST = "add_to_shopping_list"
ATTR_ENTITY_ID = "entity_id"
ATTR_INGREDIENTS = "ingredients"
