"""Write merged ingredient lines to the Home Assistant shopping list."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant

from .parser import (
    ingredient_merge_key,
    merge_ingredient_lines,
    parse_ingredient_text,
)

SHOPPING_DOMAIN = "shopping_list"


def _line_key(line: str) -> tuple[str, str] | None:
    """Return the merge key of a rendered line, if it has an amount."""
    item = parse_ingredient_text(line)
    amount = item.get("amount")
    if not isinstance(amount, (int, float)) or isinstance(amount, bool) or amount <= 0:
        return None
    return ingredient_merge_key(item)


def _existing_items(hass: HomeAssistant) -> list[dict[str, Any]]:
    """Return the current shopping list items if the component exposes them."""
    data = hass.data.get(SHOPPING_DOMAIN)
    items = getattr(data, "items", None)
    if isinstance(items, list):
        return [item for item in items if isinstance(item, dict)]
    return []


async def _replace_item(
    hass: HomeAssistant, item: dict[str, Any], name: str
) -> None:
    """Replace an existing shopping list item with the merged line.

    The shopping list component has no rename service, so the old entry is
    removed by name and the merged one is added again.
    """
    old_name = str(item.get("name") or "")
    if old_name == name:
        return
    await hass.services.async_call(
        SHOPPING_DOMAIN, "remove_item", {"name": old_name}, blocking=True
    )
    await hass.services.async_call(
        SHOPPING_DOMAIN, "add_item", {"name": name}, blocking=True
    )


async def async_add_ingredient_lines(hass: HomeAssistant, lines: list[str]) -> int:
    """Merge ``lines`` and add them to the shopping list.

    Existing items with the same ingredient are updated instead of duplicated,
    so adding a second recipe does not produce ``2 Zwiebeln`` twice.
    """
    merged = merge_ingredient_lines(lines)
    existing = _existing_items(hass)
    matched: set[int] = set()
    added = 0

    for line in merged:
        key = _line_key(line)
        match: tuple[int, dict[str, Any]] | None = None
        if key is not None:
            for position, item in enumerate(existing):
                if position in matched:
                    continue
                if item.get("complete"):
                    continue
                if _line_key(str(item.get("name") or "")) == key:
                    match = (position, item)
                    break

        if match is not None:
            position, item = match
            matched.add(position)
            combined = merge_ingredient_lines([str(item.get("name") or ""), line])
            await _replace_item(hass, item, combined[0] if combined else line)
        else:
            await hass.services.async_call(
                SHOPPING_DOMAIN, "add_item", {"name": line}, blocking=True
            )
        added += 1

    return added
