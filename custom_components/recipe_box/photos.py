"""Pure helpers for recipe photos.

This module has no Home Assistant imports: it only decides which images belong
to Rezeptbox and which of them no recipe uses any more. That keeps the
selection testable, which matters because cleaning up deletes files for good.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from typing import Any

PHOTO_NAME_PREFIX = "rezeptbox-"

IMAGE_SERVE_RE = re.compile(r"/api/image/serve/([0-9a-f]{32})/")


def image_id_from_url(url: Any) -> str:
    """Return the Home Assistant image id from a served image URL."""
    match = IMAGE_SERVE_RE.search(str(url or ""))
    return match.group(1) if match else ""


def owned_photo_ids(
    owned_ids: Iterable[Any] | None,
    upload_names: Mapping[Any, Any] | None = None,
    prefix: str = PHOTO_NAME_PREFIX,
) -> set[str]:
    """Return the image ids that Rezeptbox uploaded itself.

    An image counts as ours when Rezeptbox registered it or when its upload
    name carries the Rezeptbox prefix. Profile photos and images from other
    integrations are never included.
    """
    owned = {str(item) for item in (owned_ids or []) if item}
    marker = prefix.casefold()
    for image_id, name in (upload_names or {}).items():
        if str(name or "").casefold().startswith(marker):
            owned.add(str(image_id))
    return {item for item in owned if item}


def orphaned_photo_ids(
    owned_ids: Iterable[Any] | None,
    referenced_ids: Iterable[Any] | None,
    upload_names: Mapping[Any, Any] | None = None,
    prefix: str = PHOTO_NAME_PREFIX,
) -> list[str]:
    """Return the ids of Rezeptbox photos that no recipe references.

    Sorted for a stable result; an image used by any recipe (also one that
    was imported or shares its photo) is always kept.
    """
    referenced = {str(item) for item in (referenced_ids or []) if item}
    owned = owned_photo_ids(owned_ids, upload_names, prefix)
    return sorted(item for item in owned if item not in referenced)
