"""Recipe parsing helpers for Rezeptbox.

This module intentionally has no Home Assistant imports so that it can be
unit-tested with plain Python (see ``tests/test_parser.py``).
"""

from __future__ import annotations

import html
import json
import logging
import re
from dataclasses import asdict, dataclass, field, fields
from typing import Any
from urllib.parse import urljoin, urlparse, urlunparse

_LOGGER = logging.getLogger(__name__)

CHEFKOCH_IMAGE_FORMAT = "crop-960x640"
CHEFKOCH_DIFFICULTIES = {1: "simpel", 2: "normal", 3: "pfiffig"}

LD_JSON_RE = re.compile(
    r"<script[^>]*type\s*=\s*[\"']application/ld\+json[\"'][^>]*>(?P<body>.*?)</script>",
    re.IGNORECASE | re.DOTALL,
)
TAG_RE = re.compile(r"<[^>]+>")
WHITESPACE_RE = re.compile(r"\s+")
NEWLINE_RE = re.compile(r"(?:\r\n|\r|\n)+")
BREAK_RE = re.compile(r"(?i)<(?:br\s*/?|/p\s*|/li\s*|/div\s*|/h[1-6]\s*)>")
LIST_ITEM_RE = re.compile(r"(?i)<li[^>]*>")
DURATION_RE = re.compile(
    r"^P(?:(?P<days>\d+(?:\.\d+)?)D)?"
    r"(?:T(?:(?P<hours>\d+(?:\.\d+)?)H)?"
    r"(?:(?P<minutes>\d+(?:\.\d+)?)M)?"
    r"(?:(?P<seconds>\d+(?:\.\d+)?)S)?)?$",
    re.IGNORECASE,
)
HOUR_RE = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*(?:h\b|std\b|stunden?\b|hours?\b)", re.IGNORECASE
)
MINUTE_RE = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*(?:m\b|min\b|minuten?\b|minutes?\b)", re.IGNORECASE
)
NUMBER_RE = re.compile(r"\d+(?:[.,]\d+)?")
INTEGER_RE = re.compile(r"\d+")

# Ingredients are also kept in a structured form so that the portions can be
# scaled. The list only needs to cover the units that show up in practice;
# anything else stays part of the ingredient name and is not scaled.
INGREDIENT_UNITS = (
    "Messerspitze",
    "Päckchen",
    "Packungen",
    "Packung",
    "Portionen",
    "Portion",
    "Handvoll",
    "Scheiben",
    "Scheibe",
    "Stangen",
    "Stange",
    "Zweige",
    "Zweig",
    "Blätter",
    "Blatt",
    "Zehen",
    "Zehe",
    "Dosen",
    "Dose",
    "Gläser",
    "Glas",
    "Tassen",
    "Tasse",
    "Becher",
    "Würfel",
    "Stiele",
    "Stiel",
    "Stück",
    "Stk.",
    "Prisen",
    "Prise",
    "Bund",
    "Msp.",
    "EL",
    "TL",
    "kg",
    "mg",
    "ml",
    "cl",
    "dl",
    "cm",
    "g",
    "l",
    "cups",
    "cup",
    "tbsp",
    "tsp",
    "oz",
    "lb",
    "pinch",
)

# Units that change between singular and plural when an amount is scaled.
UNIT_PLURALS = {
    "Prise": "Prisen",
    "Messerspitze": "Messerspitzen",
    "Dose": "Dosen",
    "Packung": "Packungen",
    "Scheibe": "Scheiben",
    "Zehe": "Zehen",
    "Glas": "Gläser",
    "Tasse": "Tassen",
    "Blatt": "Blätter",
    "Zweig": "Zweige",
    "Stange": "Stangen",
    "Stiel": "Stiele",
    "Portion": "Portionen",
}

# Ingredient nouns that change between singular and plural with the amount.
# Keys are lowercase so compounds such as "Gemüsezwiebel" and "Süßkartoffel"
# keep working; only the head noun of an ingredient name is inflected, role
# text after a comma and the words before it stay untouched.
INGREDIENT_PLURALS = {
    "ei": "eier",
    "zwiebel": "zwiebeln",
    "tomate": "tomaten",
    "kartoffel": "kartoffeln",
    "karotte": "karotten",
    "möhre": "möhren",
    "gurke": "gurken",
    "schote": "schoten",
    "schalotte": "schalotten",
    "zehe": "zehen",
    "apfel": "äpfel",
    "birne": "birnen",
    "banane": "bananen",
    "zitrone": "zitronen",
    "limette": "limetten",
    "orange": "orangen",
    "beere": "beeren",
    "kirsche": "kirschen",
    "pflaume": "pflaumen",
    "pfirsich": "pfirsiche",
    "aprikose": "aprikosen",
    "dattel": "datteln",
    "feige": "feigen",
    "aubergine": "auberginen",
    "kürbis": "kürbisse",
    "rübe": "rüben",
    "pastinake": "pastinaken",
    "pilz": "pilze",
    "champignon": "champignons",
    "olive": "oliven",
    "erbse": "erbsen",
    "bohne": "bohnen",
    "linse": "linsen",
    "mandel": "mandeln",
    "nuss": "nüsse",
    "semmel": "semmeln",
    "filet": "filets",
    "steak": "steaks",
    "chili": "chilis",
}

INGREDIENT_SINGULARS = {
    plural: singular for singular, plural in INGREDIENT_PLURALS.items()
}

UNICODE_FRACTIONS = {
    "½": "1/2",
    "¼": "1/4",
    "¾": "3/4",
    "⅓": "1/3",
    "⅔": "2/3",
    "⅛": "1/8",
    "⅜": "3/8",
    "⅝": "5/8",
    "⅞": "7/8",
}

_AMOUNT_TOKEN = r"(?:\d+\s+\d+/\d+|\d+/\d+|\d+(?:[.,]\d+)?)"
_UNIT_PATTERN = "|".join(
    sorted((re.escape(unit) for unit in INGREDIENT_UNITS), key=len, reverse=True)
)
INGREDIENT_LINE_RE = re.compile(
    rf"^(?P<amount>{_AMOUNT_TOKEN})"
    rf"(?:\s*(?:-|–|bis)\s*(?P<amount_max>{_AMOUNT_TOKEN}))?"
    rf"\s*(?:(?P<unit>{_UNIT_PATTERN})\.?(?=\s|$)\s*)?"
    r"(?P<name>.+)$",
    re.IGNORECASE,
)


class RecipeError(Exception):
    """Raised when a recipe cannot be imported.

    ``code`` is the translation key used by the config flow.
    """

    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(message or code)
        self.code = code


@dataclass(slots=True)
class Recipe:
    """A single imported recipe."""

    title: str
    source_url: str
    site: str = ""
    description: str = ""
    author: str = ""
    image_url: str = ""
    servings: int | None = None
    prep_minutes: int | None = None
    cook_minutes: int | None = None
    total_minutes: int | None = None
    ingredients: list[str] = field(default_factory=list)
    ingredient_groups: list[dict[str, Any]] = field(default_factory=list)
    ingredients_structured: list[dict[str, Any]] = field(default_factory=list)
    instructions: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    cuisine: str = ""
    category: str = ""
    difficulty: str = ""
    rating: float | None = None
    rating_count: int | None = None
    nutrition: dict[str, str] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        """Return a JSON serializable representation (used for caching)."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Recipe":
        """Rebuild a recipe from cached data."""
        known = {item.name for item in fields(cls)}
        return cls(**{key: value for key, value in data.items() if key in known})

    def as_attributes(self) -> dict[str, Any]:
        """Return the entity attributes shown in Home Assistant."""
        return {
            "title": self.title,
            "source_url": self.source_url,
            "site": self.site,
            "description": self.description,
            "author": self.author,
            "image_url": self.image_url,
            "servings": self.servings,
            "prep_time_minutes": self.prep_minutes,
            "cook_time_minutes": self.cook_minutes,
            "total_time_minutes": self.total_minutes,
            "ingredients": self.ingredients,
            "ingredient_groups": self.ingredient_groups,
            "ingredients_structured": self.ingredients_structured,
            "instructions": self.instructions,
            "tags": self.tags,
            "cuisine": self.cuisine,
            "category": self.category,
            "difficulty": self.difficulty,
            "rating": self.rating,
            "rating_count": self.rating_count,
            "nutrition": self.nutrition,
        }


# ---------------------------------------------------------------------------
# Generic helpers
# ---------------------------------------------------------------------------


def clean_text(value: Any) -> str:
    """Turn a scalar into clean single-line text without markup."""
    if value is None:
        return ""
    text = html.unescape(str(value))
    text = TAG_RE.sub(" ", text)
    text = text.replace("\xa0", " ")
    return WHITESPACE_RE.sub(" ", text).strip()


def as_text(value: Any) -> str:
    """Coerce a JSON-LD value (string, dict or list) into text."""
    if isinstance(value, dict):
        for key in (
            "name",
            "displayName",
            "username",
            "text",
            "@value",
            "value",
            "url",
        ):
            if value.get(key):
                return as_text(value[key])
        return ""
    if isinstance(value, (list, tuple)):
        return ", ".join(item for item in (as_text(entry) for entry in value) if item)
    return clean_text(value)


def as_text_list(value: Any) -> list[str]:
    """Flatten a JSON-LD value into a list of non-empty strings."""
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        result: list[str] = []
        for item in value:
            result.extend(as_text_list(item))
        return result
    text = clean_text(value)
    return [text] if text else []


def split_keywords(value: Any) -> list[str]:
    """Split a keyword field such as ``"suppe, herbst; vegan"``."""
    keywords: list[str] = []
    for text in as_text_list(value):
        keywords.extend(
            part.strip() for part in re.split(r"[,;]", text) if part.strip()
        )
    return list(dict.fromkeys(keywords))


def parse_duration(value: Any) -> int | None:
    """Parse an ISO 8601 duration or a human readable duration into minutes."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        minutes = int(round(value))
        return minutes if minutes > 0 else None

    text = clean_text(value)
    if not text:
        return None

    match = DURATION_RE.match(text)
    if match:
        total = (
            float(match.group("days") or 0) * 1440
            + float(match.group("hours") or 0) * 60
            + float(match.group("minutes") or 0)
            + float(match.group("seconds") or 0) / 60
        )
        return max(int(round(total)), 1) if total > 0 else None

    hours_match = HOUR_RE.search(text)
    minutes_match = MINUTE_RE.search(text)
    if hours_match or minutes_match:
        total = 0.0
        if hours_match:
            total += float(hours_match.group(1).replace(",", ".")) * 60
        if minutes_match:
            total += float(minutes_match.group(1).replace(",", "."))
        return max(int(round(total)), 1) if total > 0 else None

    number_match = NUMBER_RE.search(text)
    if number_match:
        minutes = int(round(float(number_match.group().replace(",", "."))))
        return minutes if minutes > 0 else None
    return None


def parse_servings(value: Any) -> int | None:
    """Extract the number of servings from ``"4 Portionen"``, ``4`` or a list."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value) if value >= 1 else None
    for text in as_text_list(value):
        match = INTEGER_RE.search(text)
        if match:
            number = int(match.group())
            if number >= 1:
                return number
    return None


def to_float(value: Any) -> float | None:
    """Parse a float from a number or a string such as ``"4,7"``."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    match = NUMBER_RE.search(clean_text(value))
    return float(match.group().replace(",", ".")) if match else None


def parse_amount(value: Any) -> float | None:
    """Parse an ingredient amount such as ``"200"``, ``"0,5"`` or ``"1/2"``."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value) if value > 0 else None

    text = clean_text(value).replace(",", ".")
    mixed = re.match(r"^(\d+)\s+(\d+)/(\d+)$", text)
    if mixed:
        whole, numerator, denominator = (float(part) for part in mixed.groups())
        return whole + numerator / denominator if denominator else None
    fraction = re.match(r"^(\d+)/(\d+)$", text)
    if fraction:
        numerator, denominator = (float(part) for part in fraction.groups())
        return numerator / denominator if denominator else None
    number = NUMBER_RE.match(text)
    return float(number.group().replace(",", ".")) if number else None


def format_amount(value: float) -> str:
    """Format a scaled amount for German text without trailing zeros."""
    rounded = round(float(value), 2)
    text = str(int(rounded)) if rounded.is_integer() else f"{rounded:g}"
    return text.replace(".", ",")


def _normalize_fractions(text: str) -> str:
    """Turn unicode fractions such as ``½`` into ``1/2`` for parsing."""
    for character, replacement in UNICODE_FRACTIONS.items():
        text = text.replace(character, f" {replacement}")
    return WHITESPACE_RE.sub(" ", text).strip()


def parse_ingredient_text(text: Any, group: str = "") -> dict[str, Any]:
    """Split an ingredient line into amount, unit and name.

    Lines that do not start with a number keep the full text as ``name`` and
    get no amount, so they are shown unchanged when portions change.
    """
    source = clean_text(text)
    item: dict[str, Any] = {
        "amount": None,
        "amount_max": None,
        "amount_text": "",
        "unit": "",
        "name": source,
        "usage": "",
        "text": source,
        "group": group,
    }
    if not source:
        return item

    normalized = _normalize_fractions(source)
    match = INGREDIENT_LINE_RE.match(normalized)
    if not match:
        return item

    amount = parse_amount(match.group("amount"))
    if amount is None:
        return item

    item["amount"] = amount
    item["amount_text"] = format_amount(amount)
    amount_max = parse_amount(match.group("amount_max"))
    if amount_max is not None and amount_max > amount:
        item["amount_max"] = amount_max
    item["unit"] = clean_text(match.group("unit"))
    name = clean_text(match.group("name"))
    if name:
        item["name"] = name
    return item


def ingredient_unit(item: dict[str, Any], amount: float | None = None) -> str:
    """Return the unit in singular or plural for the given amount."""
    unit = str(item.get("unit") or "")
    plural = UNIT_PLURALS.get(unit)
    if not plural:
        return unit
    value = item.get("amount") if amount is None else amount
    if isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 2:
        return plural
    return unit


def _match_word_case(source: str, replacement: str) -> str:
    """Return ``replacement`` with the capitalisation of ``source``."""
    if source[:1].isupper():
        return replacement[:1].upper() + replacement[1:]
    return replacement


def _replace_word_ending(word: str, ending: str, replacement: str) -> str:
    """Replace ``ending`` at the end of ``word`` and keep its capitalisation."""
    start = len(word) - len(ending)
    return f"{word[:start]}{_match_word_case(word[start:], replacement)}"


def _inflected_word(word: str, plural: bool) -> str | None:
    """Return ``word`` in singular or plural, or ``None`` if it is unknown."""
    key = word.lower()
    forms = INGREDIENT_PLURALS if plural else INGREDIENT_SINGULARS
    for ending, replacement in forms.items():
        if key == ending or (len(ending) >= 4 and key.endswith(ending)):
            return _replace_word_ending(word, ending, replacement)
    return None


# Strong adjective endings that become a plain ``-e`` in the plural.
STRONG_ADJECTIVE_ENDINGS = ("er", "es", "en", "em")

_WORD_RE = re.compile(r"\S+")


def _pluralize_modifier(text: str, modifier: re.Match[str]) -> str:
    """Give a lowercase adjective in front of the noun its plural ``-e``."""
    word = modifier.group()
    if (
        len(word) < 4
        or not word[:1].islower()
        or not word.endswith(STRONG_ADJECTIVE_ENDINGS)
        or not word[:-2].isalpha()
    ):
        return text
    return f"{text[:modifier.start()]}{word[:-2]}e{text[modifier.end():]}"


def _inflect_ingredient_name(name: str, plural: bool) -> str:
    """Inflect the ingredient noun inside the name, leaving the rest intact.

    The noun may stand alone ("Zwiebel"), at the end of a phrase with an
    adjective ("ganzer Apfel") or in front of a qualifier ("Zwiebel rot").
    """
    head_end = len(name)
    for separator in (",", ";", "("):
        index = name.find(separator)
        if index != -1:
            head_end = min(head_end, index)
    head = name[:head_end].rstrip()
    words = list(_WORD_RE.finditer(head))
    for index, word in enumerate(words):
        inflected = _inflected_word(word.group(), plural)
        if inflected is None:
            continue
        text = f"{name[:word.start()]}{inflected}{name[word.end():]}"
        if plural and index:
            text = _pluralize_modifier(text, words[index - 1])
        return text
    return name


def ingredient_name(item: dict[str, Any], amount: float | None = None) -> str:
    """Return the ingredient name with its head noun matched to ``amount``.

    The original line stays untouched at the recipe's own amount, so a recipe
    that already says "2 Eier" is not rewritten. Going below two pluralizes
    back to the singular.
    """
    name = str(item.get("name") or "")
    value = item.get("amount") if amount is None else amount
    if not name or not isinstance(value, (int, float)) or isinstance(value, bool):
        return name
    if value >= 2:
        return _inflect_ingredient_name(name, True)
    original = item.get("amount")
    if (
        isinstance(original, (int, float))
        and not isinstance(original, bool)
        and original >= 2
    ):
        return _inflect_ingredient_name(name, False)
    return name


def ingredient_text(
    item: dict[str, Any],
    amount_text: str | None = None,
    unit: str | None = None,
    amount: float | None = None,
) -> str:
    """Rebuild one ingredient line, optionally with a replaced amount."""
    text = item.get("amount_text", "") if amount_text is None else amount_text
    display_unit = ingredient_unit(item) if unit is None else unit
    line = " ".join(
        part
        for part in (
            str(text or ""),
            display_unit,
            ingredient_name(item, amount),
        )
        if part
    )
    usage = str(item.get("usage") or "")
    if usage and line:
        line = f"{line}{usage}" if usage.startswith((",", ";")) else f"{line}, {usage}"
    return line or str(item.get("text") or "")


def scale_ingredient(item: dict[str, Any], factor: float) -> str:
    """Return one ingredient line with its amount multiplied by ``factor``."""
    amount = item.get("amount")
    if not isinstance(amount, (int, float)) or isinstance(amount, bool) or factor <= 0:
        return ingredient_text(item)
    if abs(float(factor) - 1) < 1e-9:
        return str(item.get("text") or ingredient_text(item))

    scaled = float(amount) * factor
    text = format_amount(scaled)
    largest = scaled
    amount_max = item.get("amount_max")
    if (
        isinstance(amount_max, (int, float))
        and not isinstance(amount_max, bool)
        and amount_max > amount
    ):
        scaled_max = float(amount_max) * factor
        text = f"{text}–{format_amount(scaled_max)}"
        largest = max(largest, scaled_max)
    return ingredient_text(item, text, ingredient_unit(item, largest), largest)


def scale_ingredients(
    structured: list[dict[str, Any]] | None,
    ingredients: list[str] | None,
    factor: float,
) -> list[str]:
    """Scale structured ingredients, falling back to parsing plain text lines."""
    if structured:
        return [scale_ingredient(item, factor) for item in structured if item]
    return [
        scale_ingredient(parse_ingredient_text(str(text)), factor)
        for text in (ingredients or [])
        if str(text).strip()
    ]


def normalize_url(raw: str) -> str:
    """Validate and normalise a user supplied recipe URL."""
    text = (raw or "").strip()
    if not text:
        raise RecipeError("invalid_url", "Empty URL")
    if "://" not in text:
        text = f"https://{text}"

    parsed = urlparse(text)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise RecipeError("invalid_url", f"Invalid URL: {raw}")

    return urlunparse(parsed._replace(fragment=""))


def site_name(url: str) -> str:
    """Return a short site name for a URL."""
    host = (urlparse(url).netloc or "").split(":")[0].lower()
    for prefix in ("www.", "m."):
        host = host.removeprefix(prefix)
    return host


def _image_url(value: Any, base_url: str) -> str:
    """Pick the first usable image URL and make it absolute."""
    if isinstance(value, (list, tuple)):
        for item in value:
            url = _image_url(item, base_url)
            if url:
                return url
        return ""
    if isinstance(value, dict):
        for key in ("url", "contentUrl", "@id", "thumbnailUrl"):
            if value.get(key):
                return _image_url(value[key], base_url)
        return ""
    text = clean_text(value)
    if not text:
        return ""
    if text.startswith("//"):
        text = f"https:{text}"
    return urljoin(base_url, text)


def _html_lines(value: Any) -> list[str]:
    """Split instruction markup/plain text into clean paragraphs."""
    text = str(value)
    text = BREAK_RE.sub("\n", text)
    text = LIST_ITEM_RE.sub("\n", text)
    text = html.unescape(text)
    lines = [clean_text(part) for part in NEWLINE_RE.split(text)]
    return [line for line in lines if line]


def _steps_from_jsonld(value: Any) -> list[str]:
    """Flatten HowToStep/HowToSection structures into plain steps."""
    if value is None:
        return []
    if isinstance(value, str):
        return _html_lines(value)
    if isinstance(value, dict):
        children = value.get("itemListElement") or value.get("steps")
        if children:
            return _steps_from_jsonld(children)
        text = value.get("text") or value.get("name")
        return _html_lines(text) if text else []
    if isinstance(value, (list, tuple)):
        steps: list[str] = []
        for item in value:
            steps.extend(_steps_from_jsonld(item))
        return steps
    return []


def _nutrition(value: Any) -> dict[str, str]:
    """Normalise nutrition data into a plain string mapping."""
    result: dict[str, str] = {}
    if isinstance(value, dict):
        for key, item in value.items():
            if key.startswith("@"):
                continue
            text = clean_text(item)
            if text:
                result[clean_text(key)] = text
    elif isinstance(value, list):
        for item in value:
            if not isinstance(item, dict):
                continue
            key = item.get("name") or item.get("type")
            text = clean_text(item.get("value") or item.get("amount"))
            if key and text:
                result[clean_text(key)] = text
    return result


def _find_recipe_node(data: Any) -> dict[str, Any] | None:
    """Find the first node of ``@type`` Recipe anywhere in a JSON-LD document."""
    if isinstance(data, list):
        for item in data:
            node = _find_recipe_node(item)
            if node is not None:
                return node
        return None
    if not isinstance(data, dict):
        return None

    node_type = data.get("@type")
    types = node_type if isinstance(node_type, list) else [node_type]
    if any(
        isinstance(item, str) and item.lower() == "recipe" for item in types
    ):
        return data

    for value in data.values():
        if isinstance(value, (dict, list)):
            node = _find_recipe_node(value)
            if node is not None:
                return node
    return None


def recipe_from_jsonld(node: dict[str, Any], page_url: str) -> Recipe:
    """Build a Recipe from a schema.org Recipe node."""
    ingredients: list[str] = []
    ingredients_structured: list[dict[str, Any]] = []
    for raw_ingredient in _iter_ingredients(node):
        text = clean_text(raw_ingredient)
        if not text:
            continue
        ingredients.append(text)
        ingredients_structured.append(parse_ingredient_text(text))
    instructions = _steps_from_jsonld(node.get("recipeInstructions"))

    prep = parse_duration(node.get("prepTime"))
    cook = parse_duration(node.get("cookTime"))
    total = parse_duration(node.get("totalTime"))
    if total is None:
        values = [value for value in (prep, cook) if value]
        total = sum(values) or None

    rating_node: Any = node.get("aggregateRating")
    if isinstance(rating_node, list):
        rating_node = rating_node[0] if rating_node else None
    rating = None
    rating_count = None
    if isinstance(rating_node, dict):
        rating = to_float(rating_node.get("ratingValue"))
        rating_count = to_float(
            rating_node.get("ratingCount") or rating_node.get("reviewCount")
        )
        rating_count = int(rating_count) if rating_count else None

    keywords = split_keywords(node.get("keywords"))
    category = as_text(node.get("recipeCategory"))
    tags = list(keywords)
    for item in as_text_list(node.get("recipeCategory")):
        if item not in tags:
            tags.append(item)

    title = as_text(node.get("name"))
    return Recipe(
        title=title,
        source_url=page_url,
        site=site_name(page_url),
        description=as_text(node.get("description")),
        author=as_text(node.get("author")),
        image_url=_image_url(node.get("image"), page_url),
        servings=parse_servings(node.get("recipeYield")),
        prep_minutes=prep,
        cook_minutes=cook,
        total_minutes=total,
        ingredients=ingredients,
        ingredients_structured=ingredients_structured,
        instructions=instructions,
        tags=tags,
        cuisine=as_text(node.get("recipeCuisine")),
        category=category,
        rating=rating,
        rating_count=rating_count,
        nutrition=_nutrition(node.get("nutrition")),
    )


def _iter_ingredients(node: dict[str, Any]):
    """Yield raw ingredient values from the common schema.org field names."""
    for key in ("recipeIngredient", "ingredients"):
        value = node.get(key)
        if isinstance(value, (list, tuple)):
            yield from value
        elif value:
            yield from newline_split(value)


def newline_split(value: Any) -> list[str]:
    """Split a newline separated ingredient blob."""
    return [part for part in NEWLINE_RE.split(clean_text(value)) if part]


def _json_payload(raw: str) -> Any:
    """Decode a JSON-LD script body, tolerating common markup leftovers."""
    text = raw.strip()
    if text.startswith("<!--"):
        text = text[4:]
    if text.endswith("-->"):
        text = text[:-3]
    text = text.strip()
    if text.startswith("<![CDATA["):
        text = text.removeprefix("<![CDATA[").removesuffix("]]>").strip()

    for candidate in (text, text.rstrip(";"), text.rstrip(";").strip()):
        try:
            return json.loads(candidate)
        except (TypeError, ValueError):
            continue
    return None


def parse_jsonld_html(page: str, page_url: str) -> Recipe | None:
    """Extract the first schema.org recipe from an HTML page."""
    for match in LD_JSON_RE.finditer(page or ""):
        data = _json_payload(match.group("body"))
        if data is None:
            continue
        node = _find_recipe_node(data)
        if node is None:
            continue
        recipe = recipe_from_jsonld(node, page_url)
        if recipe.title and (recipe.ingredients or recipe.instructions):
            return recipe
    return None


# ---------------------------------------------------------------------------
# Chefkoch
# ---------------------------------------------------------------------------


def chefkoch_recipe_id(url: str) -> str | None:
    """Return the Chefkoch recipe id for a chefkoch.de recipe URL."""
    parsed = urlparse(url)
    host = (parsed.netloc or "").split(":")[0].lower()
    for prefix in ("www.", "m."):
        host = host.removeprefix(prefix)
    if host != "chefkoch.de":
        return None
    match = re.search(r"/rezepte/(\d+)", parsed.path)
    return match.group(1) if match else None


def _chefkoch_image_url(template: Any) -> str:
    """Resolve a Chefkoch image template to a usable crop URL.

    ``clean_text`` must not be used here: it strips ``<format>`` because it
    looks like an HTML tag.
    """
    if template is None:
        return ""
    text = html.unescape(str(template)).strip()
    if not text:
        return ""
    return text.replace("<format>", CHEFKOCH_IMAGE_FORMAT)


def _format_number(value: Any) -> str:
    """Format an ingredient amount without trailing ``.0``."""
    if value is None or isinstance(value, bool):
        return ""
    if isinstance(value, (int, float)):
        number = float(value)
        return str(int(number)) if number.is_integer() else f"{number:g}"
    return clean_text(value)


def _chefkoch_structured(
    item: Any, group: str, line: str
) -> dict[str, Any]:
    """Build the structured ingredient entry for a Chefkoch API item."""
    if not isinstance(item, dict):
        parsed = parse_ingredient_text(line, group)
        parsed["text"] = line or parsed["text"]
        return parsed

    amount_value = item.get("amount")
    amount = None if isinstance(amount_value, bool) else parse_amount(amount_value)
    return {
        "amount": amount,
        "amount_max": None,
        "amount_text": _format_number(amount_value),
        "unit": clean_text(item.get("unit")),
        "name": clean_text(item.get("name")),
        "usage": clean_text(item.get("usageInfo")),
        "text": line,
        "group": group,
    }


def _chefkoch_ingredient(item: Any) -> str:
    """Format one Chefkoch ingredient as ``200 g Mehl, gesiebt``."""
    if isinstance(item, str):
        return clean_text(item)
    if not isinstance(item, dict):
        return ""

    amount = _format_number(item.get("amount"))
    unit = clean_text(item.get("unit"))
    name = clean_text(item.get("name"))
    line = " ".join(part for part in (amount, unit, name) if part)
    usage = clean_text(item.get("usageInfo"))
    if usage and line:
        line = f"{line}{usage}" if usage.startswith((",", ";")) else f"{line}, {usage}"
    return line


def _positive_minutes(value: Any) -> int | None:
    """Parse a minute value from the Chefkoch API."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value) if value > 0 else None
    return parse_duration(value)


def recipe_from_chefkoch(payload: dict[str, Any], url: str) -> Recipe:
    """Build a Recipe from a Chefkoch v2 API payload."""
    if not isinstance(payload, dict) or not clean_text(payload.get("title")):
        raise RecipeError("invalid_response", "Chefkoch payload without a title")

    groups: list[dict[str, Any]] = []
    ingredients: list[str] = []
    ingredients_structured: list[dict[str, Any]] = []
    for raw_group in payload.get("ingredientGroups") or []:
        if not isinstance(raw_group, dict):
            continue
        group_name = clean_text(raw_group.get("title") or raw_group.get("name"))
        items: list[str] = []
        for raw_item in raw_group.get("ingredients") or []:
            line = _chefkoch_ingredient(raw_item)
            if not line:
                continue
            items.append(line)
            ingredients_structured.append(
                _chefkoch_structured(raw_item, group_name, line)
            )
        if not items:
            continue
        ingredients.extend(items)
        groups.append({"name": group_name, "items": items})

    if not ingredients:
        for raw_item in payload.get("ingredients") or []:
            line = _chefkoch_ingredient(raw_item)
            if line:
                ingredients.append(line)
                ingredients_structured.append(
                    _chefkoch_structured(raw_item, "", line)
                )

    tags: list[str] = []
    for tag in payload.get("fullTags") or payload.get("tags") or []:
        text = as_text(tag)
        if text and text not in tags:
            tags.append(text)

    category = ""
    breadcrumb = payload.get("categoryBreadcrumb") or []
    if isinstance(breadcrumb, list):
        names = [as_text(item) for item in breadcrumb]
        names = [name for name in names if name]
        category = names[-1] if names else ""
    else:
        category = as_text(breadcrumb)

    prep = _positive_minutes(payload.get("preparationTime"))
    cook = _positive_minutes(payload.get("cookingTime"))
    resting = _positive_minutes(payload.get("restingTime"))
    total = _positive_minutes(payload.get("totalTime"))
    if total is None:
        values = [value for value in (prep, cook, resting) if value]
        total = sum(values) or None

    rating_node = payload.get("rating")
    rating = None
    rating_count = None
    if isinstance(rating_node, dict):
        rating = to_float(rating_node.get("rating"))
        votes = to_float(rating_node.get("numVotes"))
        rating_count = int(votes) if votes else None

    nutrition = _nutrition(payload.get("nutrition"))
    kcal = _format_number(payload.get("kCalories"))
    if kcal:
        nutrition.setdefault("Kalorien", f"{kcal} kcal")

    difficulty_value = payload.get("difficulty")
    difficulty = ""
    if isinstance(difficulty_value, (int, float)) and not isinstance(
        difficulty_value, bool
    ):
        difficulty = CHEFKOCH_DIFFICULTIES.get(int(difficulty_value), "")
    elif difficulty_value:
        difficulty = clean_text(difficulty_value)

    source_url = clean_text(payload.get("siteUrl")) or url
    return Recipe(
        title=clean_text(payload.get("title")),
        source_url=source_url,
        site=site_name(source_url),
        description=clean_text(payload.get("subtitle")),
        author=as_text(payload.get("editor")),
        image_url=_chefkoch_image_url(payload.get("previewImageUrlTemplate")),
        servings=parse_servings(payload.get("servings")),
        prep_minutes=prep,
        cook_minutes=cook,
        total_minutes=total,
        ingredients=ingredients,
        ingredient_groups=groups,
        ingredients_structured=ingredients_structured,
        instructions=_html_lines(payload.get("instructions") or ""),
        tags=tags,
        cuisine=as_text(payload.get("recipeCuisine")),
        category=category,
        difficulty=difficulty,
        rating=rating,
        rating_count=rating_count,
        nutrition=nutrition,
    )
