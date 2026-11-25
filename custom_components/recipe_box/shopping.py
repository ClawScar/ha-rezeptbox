"""Write merged ingredient lines to the shopping list or a to-do list."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from homeassistant.core import HomeAssistant

from .const import CONF_SHOPPING_TARGET, DEFAULT_SHOPPING_TARGET, DOMAIN
from .parser import (
    ingredient_merge_key,
    merge_ingredient_lines,
    parse_ingredient_text,
)

SHOPPING_DOMAIN = "shopping_list"
TODO_DOMAIN = "todo"

# TodoListEntityFeature.UPDATE_TODO_ITEM. The plain number keeps this module
# importable without the to-do component being loaded.
TODO_UPDATE_FEATURE = 4


def _line_key(line: str) -> tuple[str, str] | None:
    """Return the merge key of a rendered line, if it has an amount."""
    item = parse_ingredient_text(line)
    amount = item.get("amount")
    if not isinstance(amount, (int, float)) or isinstance(amount, bool) or amount <= 0:
        return None
    return ingredient_merge_key(item)


def shopping_target(hass: HomeAssistant) -> str:
    """Return the configured to-do entity, or "" for the HA shopping list."""
    entries = getattr(getattr(hass, "config_entries", None), "async_entries", None)
    for entry in entries(DOMAIN) if entries else []:
        target = str(entry.options.get(CONF_SHOPPING_TARGET) or "").strip()
        if target:
            return target
    return DEFAULT_SHOPPING_TARGET


def _existing_items(hass: HomeAssistant) -> list[dict[str, Any]]:
    """Return the current shopping list items if the component exposes them."""
    data = hass.data.get(SHOPPING_DOMAIN)
    items = getattr(data, "items", None)
    if isinstance(items, list):
        return [item for item in items if isinstance(item, dict)]
    return []


async def _todo_items(hass: HomeAssistant, entity_id: str) -> list[dict[str, Any]]:
    """Return the items of a to-do entity through ``todo.get_items``.

    The service answers with ``{entity_id: {"items": [...]}}``; older or
    wrapped responses are unwrapped as well so a merge never silently
    duplicates everything.
    """
    response = await hass.services.async_call(
        TODO_DOMAIN,
        "get_items",
        {"entity_id": entity_id},
        blocking=True,
        return_response=True,
    )
    payload: Any = response
    if isinstance(response, dict) and len(response) == 1:
        payload = next(iter(response.values()))
    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        return []
    return [item for item in items if isinstance(item, dict)]


def _todo_supports_update(hass: HomeAssistant, entity_id: str) -> bool:
    """Return whether the to-do entity can rename an item in place."""
    states = getattr(hass, "states", None)
    state = states.get(entity_id) if states is not None else None
    attributes = getattr(state, "attributes", None) or {}
    features = attributes.get("supported_features")
    if not isinstance(features, int) or isinstance(features, bool):
        return False
    return bool(features & TODO_UPDATE_FEATURE)


async def _replace_component_item(
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


async def _replace_todo_item(
    hass: HomeAssistant, entity_id: str, item: dict[str, Any], name: str
) -> None:
    """Rename a to-do item, or replace it where renaming is unsupported."""
    old_name = str(item.get("summary") or "")
    if old_name == name:
        return
    handle = str(item.get("uid") or old_name)
    if _todo_supports_update(hass, entity_id):
        await hass.services.async_call(
            TODO_DOMAIN,
            "update_item",
            {"entity_id": entity_id, "item": handle, "rename": name},
            blocking=True,
        )
        return
    await hass.services.async_call(
        TODO_DOMAIN,
        "remove_item",
        {"entity_id": entity_id, "item": handle},
        blocking=True,
    )
    await hass.services.async_call(
        TODO_DOMAIN, "add_item", {"entity_id": entity_id, "item": name}, blocking=True
    )


async def _async_merge_into(
    merged: list[str],
    existing: list[dict[str, Any]],
    replace: Callable[[dict[str, Any], str], Awaitable[None]],
    add: Callable[[str], Awaitable[None]],
) -> int:
    """Merge ``merged`` into ``existing`` and return the added line count.

    ``existing`` holds ``{"name": ..., "done": ..., "item": ...}`` entries and
    the callbacks write to whichever list the caller picked.
    """
    matched: set[int] = set()
    added = 0

    for line in merged:
        key = _line_key(line)
        match: tuple[int, dict[str, Any]] | None = None
        if key is not None:
            for position, item in enumerate(existing):
                if position in matched or item.get("done"):
                    continue
                if _line_key(str(item.get("name") or "")) == key:
                    match = (position, item)
                    break

        if match is not None:
            position, item = match
            matched.add(position)
            combined = merge_ingredient_lines([str(item.get("name") or ""), line])
            await replace(item, combined[0] if combined else line)
        else:
            await add(line)
        added += 1

    return added


def _component_entries(
    hass: HomeAssistant,
) -> list[dict[str, Any]]:
    """Describe the items of the built-in shopping list for the merge."""
    return [
        {
            "name": str(item.get("name") or ""),
            "done": bool(item.get("complete")),
            "item": item,
        }
        for item in _existing_items(hass)
    ]


def _todo_entries(
    items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Describe the items of a to-do list for the merge."""
    return [
        {
            "name": str(item.get("summary") or ""),
            "done": str(item.get("status") or "") == "completed",
            "item": item,
        }
        for item in items
    ]


async def async_add_ingredient_lines(
    hass: HomeAssistant, lines: list[str], target: str = ""
) -> int:
    """Merge ``lines`` and add them to the configured list.

    Without ``target`` the built-in shopping list is used, otherwise the
    ingredients go to the given to-do entity (for example the Alexa shopping
    list). In both cases existing items with the same ingredient are updated
    instead of duplicated.
    """
    merged = merge_ingredient_lines(lines)
    if target:
        existing = _todo_entries(await _todo_items(hass, target))

        async def add(name: str) -> None:
            await hass.services.async_call(
                TODO_DOMAIN,
                "add_item",
                {"entity_id": target, "item": name},
                blocking=True,
            )

        async def replace(item: dict[str, Any], name: str) -> None:
            await _replace_todo_item(hass, target, item["item"], name)

        return await _async_merge_into(merged, existing, replace, add)

    async def add_component(name: str) -> None:
        await hass.services.async_call(
            SHOPPING_DOMAIN, "add_item", {"name": name}, blocking=True
        )

    async def replace_component(item: dict[str, Any], name: str) -> None:
        await _replace_component_item(hass, item["item"], name)

    return await _async_merge_into(
        merged, _component_entries(hass), replace_component, add_component
    )
