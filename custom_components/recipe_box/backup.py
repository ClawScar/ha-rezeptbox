"""Server-side storage for Rezeptbox backups.

When a target folder is configured, ``recipe_box.export_recipes`` writes the
JSON file there instead of leaving the browser to download it. That keeps
saving reliable in the Home Assistant app, where webviews have no download
dialog and the share sheet depends on a user gesture.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

from .const import CONF_BACKUP_PATH, DOMAIN


class BackupPathError(ValueError):
    """The configured backup folder is not usable."""


def configured_backup_path(hass: Any) -> str:
    """Return the configured backup folder, or "" for browser downloads."""
    entries = getattr(getattr(hass, "config_entries", None), "async_entries", None)
    for entry in entries(DOMAIN) if entries else []:
        target = str(entry.options.get(CONF_BACKUP_PATH) or "").strip()
        if target:
            return target
    return ""


def resolve_backup_dir(hass: Any, configured: str) -> Path:
    """Resolve the folder and keep it inside the Home Assistant config dir."""
    config_dir = Path(hass.config.config_dir).resolve()
    candidate = Path(configured).expanduser()
    target = candidate if candidate.is_absolute() else config_dir / candidate
    resolved = target.resolve()
    if resolved != config_dir and config_dir not in resolved.parents:
        raise BackupPathError(
            "Der Zielordner für Sicherungen muss im Home-Assistant-"
            f"Konfigurationsordner liegen ({config_dir})."
        )
    return resolved


def backup_filename(now: datetime, folder: Path) -> str:
    """Return a dated file name that does not overwrite an existing backup."""
    stem = f"rezeptbox-{now:%Y-%m-%d}"
    name = f"{stem}.json"
    if not (folder / name).exists():
        return name

    stamp = f"{now:%H%M%S}"
    name = f"{stem}-{stamp}.json"
    counter = 2
    while (folder / name).exists():
        name = f"{stem}-{stamp}-{counter}.json"
        counter += 1
    return name


def write_backup(
    hass: Any,
    configured: str,
    text: str,
    now: datetime | None = None,
) -> Path:
    """Write the backup text into the configured folder and return its path."""
    folder = resolve_backup_dir(hass, configured)
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / backup_filename(now or datetime.now(), folder)
    target.write_text(text, encoding="utf-8")
    return target
