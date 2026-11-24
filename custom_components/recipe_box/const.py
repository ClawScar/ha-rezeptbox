"""Constants for the Rezeptbox integration."""

from __future__ import annotations

from homeassistant.const import Platform

DOMAIN = "recipe_box"
NAME = "Rezeptbox"
VERSION = "2.4.0"

CONF_URL = "url"
CONF_UPDATE_INTERVAL_HOURS = "update_interval_hours"
DEFAULT_UPDATE_INTERVAL_HOURS = 24

DATA_HUB = "hub"

PLATFORMS: list[Platform] = [Platform.SENSOR, Platform.BUTTON]

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

# Groups belong to the user, not to the scraped page
MAX_GROUPS = 50
MAX_RECIPE_GROUPS = 20

SERVICE_IMPORT_RECIPE = "import_recipe"
SERVICE_REMOVE_RECIPE = "remove_recipe"
SERVICE_ADD_TO_SHOPPING_LIST = "add_to_shopping_list"
SERVICE_REFRESH_RECIPE = "refresh_recipe"
SERVICE_ADD_RECIPE = "add_recipe"
SERVICE_EXPORT_RECIPES = "export_recipes"
SERVICE_IMPORT_RECIPES = "import_recipes"
SERVICE_PLAN_RECIPE = "plan_recipe"
SERVICE_CLEAR_MEAL_PLAN = "clear_meal_plan"
SERVICE_SET_GROUPS = "set_groups"
SERVICE_SET_RECIPE_IMAGE = "set_recipe_image"
SERVICE_ADD_GROUP = "add_group"
SERVICE_REMOVE_GROUP = "remove_group"
SERVICE_RENAME_GROUP = "rename_group"
SERVICE_MOVE_GROUP = "move_group"
ATTR_URL = "url"
ATTR_URLS = "urls"
ATTR_ENTITY_ID = "entity_id"
ATTR_INGREDIENTS = "ingredients"
ATTR_INGREDIENTS_STRUCTURED = "ingredients_structured"
ATTR_INSTRUCTIONS = "instructions"
ATTR_SERVINGS = "servings"
ATTR_TITLE = "title"
ATTR_TAGS = "tags"
ATTR_GROUPS = "groups"
ATTR_GROUP = "group"
ATTR_NAME = "name"
ATTR_DIRECTION = "direction"
ATTR_IMAGE_URL = "image_url"
ATTR_EXCLUDE = "exclude"
ATTR_MERGE = "merge"
ATTR_RECIPES = "recipes"
ATTR_PLAN = "plan"
ATTR_DATE = "date"
MANUAL_URL_PREFIX = "manual://"

KNOWN_IMPORT_ERRORS = {
    "cannot_connect",
    "invalid_url",
    "no_recipe",
    "invalid_response",
}
