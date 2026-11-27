"""Read photographed recipe cards with the AI Home Assistant already has.

The card posts its photos to this view; the module writes them into the media
folder, calls ``ai_task.generate_data`` with them attached and deletes them
again. Rezeptbox stores no API key and never talks to a provider itself: the AI
task entity the user configured decides where the photos go, which also allows
a local vision model.
"""

from __future__ import annotations

import logging
import mimetypes
import os
from collections.abc import Sequence
from pathlib import Path
from typing import Any
from uuid import uuid4

from aiohttp import web

from homeassistant.components.http import KEY_HASS, HomeAssistantView
from homeassistant.core import Context, HomeAssistant
from homeassistant.exceptions import HomeAssistantError, Unauthorized, UnknownUser

from .ai_recipe import PROMPT, AiRecipeError, parse_ai_recipe, resolve_ai_prompt
from .const import CONF_AI_PROMPT, DOMAIN

_LOGGER = logging.getLogger(__name__)

SCAN_URL = "/api/recipe_box/ai_scan"
SCAN_FILE_PREFIX = "recipe_box_scan_"
SCAN_TASK_NAME = "rezeptbox_foto"
MAX_PAGES = 6
MAX_UPLOAD = 24 * 1024 * 1024

DATA_AI_SCAN = "recipe_box_ai_scan"


class AiScanError(HomeAssistantError):
    """Raised when the AI cannot read the photos."""


def ai_task_entity_ids(hass: HomeAssistant) -> list[str]:
    """Return the AI task entities that can read photos."""
    try:
        from homeassistant.components.ai_task import AITaskEntityFeature
        from homeassistant.components.ai_task.const import DATA_COMPONENT
    except ImportError:
        # Home Assistant before 2025.7 has no AI tasks at all.
        return []

    # 2025.7 knows AI tasks, but not photo attachments yet: the flag only
    # exists from 2025.8. Without it the card has nothing to offer, so the AI
    # option stays hidden instead of raising an AttributeError.
    attachments_feature = getattr(AITaskEntityFeature, "SUPPORT_ATTACHMENTS", None)
    if attachments_feature is None:
        return []

    component = hass.data.get(DATA_COMPONENT)
    if component is None:
        return []

    found: list[str] = []
    for entity_id in hass.states.async_entity_ids("ai_task"):
        entity = component.get_entity(entity_id)
        if entity is None:
            continue
        try:
            features = AITaskEntityFeature(entity.supported_features or 0)
        except ValueError:
            continue
        if AITaskEntityFeature.GENERATE_DATA not in features:
            continue
        if attachments_feature not in features:
            continue
        found.append(entity_id)
    return sorted(found)


def configured_ai_prompt(hass: HomeAssistant) -> str:
    """Return the instruction from the options, or the built-in one."""
    entries = getattr(getattr(hass, "config_entries", None), "async_entries", None)
    for entry in entries(DOMAIN) if entries else []:
        value = str(entry.options.get(CONF_AI_PROMPT) or "").strip()
        if value:
            return resolve_ai_prompt(value)
    return PROMPT


def _preferred_entity(hass: HomeAssistant) -> str | None:
    """Return the AI task entity the user picked for data tasks, if any."""
    try:
        from homeassistant.components.ai_task.const import DATA_PREFERENCES
    except ImportError:
        return None
    preferences = hass.data.get(DATA_PREFERENCES)
    return getattr(preferences, "gen_data_entity_id", None)


def _media_target(hass: HomeAssistant) -> tuple[str, Path]:
    """Return the media source id and a writable folder inside it."""
    for source_id, folder in (hass.config.media_dirs or {}).items():
        path = Path(folder)
        try:
            path.mkdir(parents=True, exist_ok=True)
        except OSError:
            continue
        if path.is_dir() and os.access(path, os.W_OK):
            return str(source_id), path
    raise AiScanError(
        "Kein beschreibbarer Medienordner gefunden. Für die KI muss Home "
        "Assistant die Fotos aus einem Medienordner anhängen können."
    )


def _suffix(mime_type: str) -> str:
    """Return a file extension the local media source can serve."""
    if mime_type in ("image/jpeg", "image/jpg"):
        return ".jpg"
    return mimetypes.guess_extension(mime_type or "") or ".jpg"


def _write(path: Path, content: bytes) -> None:
    path.write_bytes(content)


def _remove(paths: Sequence[Path]) -> None:
    for path in paths:
        try:
            path.unlink()
        except OSError:
            continue


async def _run_task(
    hass: HomeAssistant,
    attachments: list[dict[str, str]],
    entity_id: str | None,
    context: Context | None,
    instructions: str,
):
    """Run the AI task itself; ``context`` decides whose rights apply."""
    from homeassistant.components.ai_task import async_generate_data

    return await async_generate_data(
        hass,
        task_name=SCAN_TASK_NAME,
        entity_id=entity_id,
        instructions=instructions,
        attachments=attachments,
        context=context,
    )


async def async_scan_recipe(
    hass: HomeAssistant,
    images: Sequence[tuple[str, bytes]],
    entity_id: str | None = None,
    context: Context | None = None,
) -> dict[str, Any]:
    """Let the AI task entity read the photos and return the recipe fields."""
    try:
        from homeassistant.components.ai_task import async_generate_data
    except ImportError as err:
        raise AiScanError(
            "Diese Home-Assistant-Version kennt keine KI-Aufgaben. Bitte Home "
            "Assistant aktualisieren und eine KI einrichten."
        ) from err

    source_id, folder = await hass.async_add_executor_job(_media_target, hass)
    written: list[Path] = []
    attachments: list[dict[str, str]] = []
    for mime_type, content in images:
        name = f"{SCAN_FILE_PREFIX}{uuid4().hex}{_suffix(mime_type)}"
        path = folder / name
        await hass.async_add_executor_job(_write, path, content)
        written.append(path)
        attachments.append(
            {
                "media_content_id": (
                    f"media-source://media_source/{source_id}/{name}"
                ),
                "media_content_type": mime_type,
            }
        )

    instructions = configured_ai_prompt(hass)

    try:
        result = await _run_task(hass, attachments, entity_id, context, instructions)
    except (Unauthorized, UnknownUser) as err:
        # A restricted user may not control the AI entity. The scan itself is
        # harmless, so it runs once more as the integration instead of leaving
        # that user without the AI option.
        if context is None or not context.user_id:
            raise AiScanError(
                f"Die KI konnte die Fotos nicht lesen: {err}"
            ) from err
        _LOGGER.debug(
            "User %s may not run %s, retrying without the user context",
            context.user_id,
            entity_id or SCAN_TASK_NAME,
        )
        try:
            result = await _run_task(
                hass, attachments, entity_id, None, instructions
            )
        except HomeAssistantError as retry_err:
            raise AiScanError(
                f"Die KI konnte die Fotos nicht lesen: {retry_err}"
            ) from retry_err
    except HomeAssistantError as err:
        raise AiScanError(f"Die KI konnte die Fotos nicht lesen: {err}") from err
    except Exception as err:  # noqa: BLE001 - providers raise very different types
        _LOGGER.exception("Unexpected error while reading recipe photos")
        raise AiScanError(f"Die KI konnte die Fotos nicht lesen: {err}") from err
    finally:
        await hass.async_add_executor_job(_remove, written)

    try:
        return parse_ai_recipe(result.data)
    except AiRecipeError as err:
        raise AiScanError(str(err)) from err


def async_register_ai_scan(hass: HomeAssistant) -> None:
    """Register the AI scan view once per Home Assistant instance."""
    if hass.data.get(DATA_AI_SCAN):
        return
    hass.http.register_view(AiScanView())
    hass.data[DATA_AI_SCAN] = True


class AiScanView(HomeAssistantView):
    """Offer the AI scan to the recipe card."""

    url = SCAN_URL
    name = "api:recipe_box:ai_scan"
    requires_auth = True

    async def get(self, request: web.Request) -> web.Response:
        """Report which AI task entities can read photos."""
        return self.json({"entities": ai_task_entity_ids(request.app[KEY_HASS])})

    async def post(self, request: web.Request) -> web.Response:
        """Hand the uploaded photos to the AI task entity."""
        hass: HomeAssistant = request.app[KEY_HASS]
        request._client_max_size = MAX_UPLOAD  # noqa: SLF001

        try:
            fields = await request.post()
        except ValueError:
            return self.json_message(
                "Die Fotos konnten nicht gelesen werden.", status_code=400
            )

        images: list[tuple[str, bytes]] = []
        for field in fields.getall("file", []):
            if not hasattr(field, "file"):
                continue
            content = field.file.read()
            if not content:
                continue
            mime_type = str(getattr(field, "content_type", "") or "").lower()
            if not mime_type.startswith("image/"):
                return self.json_message(
                    "Nur Bilder werden an die KI gegeben.", status_code=400
                )
            images.append((mime_type, content))

        if not images:
            return self.json_message(
                "Es wurden keine Fotos übergeben.", status_code=400
            )
        if len(images) > MAX_PAGES:
            return self.json_message(
                f"Höchstens {MAX_PAGES} Seiten pro Durchlauf.", status_code=400
            )

        allowed = ai_task_entity_ids(hass)
        if not allowed:
            return self.json_message(
                "In Home Assistant ist keine KI für Fotos eingerichtet.",
                status_code=400,
            )
        entity_id = str(fields.get("entity_id") or "").strip() or None
        if entity_id and entity_id not in allowed:
            return self.json_message(
                "Diese KI kann keine Fotos lesen.", status_code=400
            )
        if entity_id is None:
            preferred = _preferred_entity(hass)
            entity_id = preferred if preferred in allowed else allowed[0]

        user = request.get("hass_user")
        context = Context(user_id=user.id) if user is not None else None
        try:
            recipe = await async_scan_recipe(hass, images, entity_id, context)
        except AiScanError as err:
            return self.json_message(str(err), status_code=502)
        return self.json(recipe)
