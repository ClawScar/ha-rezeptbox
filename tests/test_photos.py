"""Tests for the pure photo helpers.

The cleanup deletes files for good, so the selection is tested without a
running Home Assistant: these helpers only receive ids, URLs and names.

Run with: python3 -m unittest tests.test_photos
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE / "custom_components" / "recipe_box"))

import photos  # noqa: E402

IMAGE_A = "0123456789abcdef0123456789abcdef"
IMAGE_B = "fedcba9876543210fedcba9876543210"
IMAGE_C = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"


class ImageIdTest(unittest.TestCase):
    def test_served_urls(self) -> None:
        self.assertEqual(
            photos.image_id_from_url(f"/api/image/serve/{IMAGE_A}/original"),
            IMAGE_A,
        )
        self.assertEqual(
            photos.image_id_from_url(f"/api/image/serve/{IMAGE_A}/512x512"),
            IMAGE_A,
        )
        self.assertEqual(
            photos.image_id_from_url(f"https://ha.local/api/image/serve/{IMAGE_B}/original"),
            IMAGE_B,
        )

    def test_non_image_urls(self) -> None:
        self.assertEqual(photos.image_id_from_url("https://example.com/a.jpg"), "")
        self.assertEqual(photos.image_id_from_url("/local/photo.jpg"), "")
        self.assertEqual(
            photos.image_id_from_url(f"/api/image/serve/{IMAGE_A}0/original"), ""
        )
        self.assertEqual(photos.image_id_from_url(None), "")
        self.assertEqual(photos.image_id_from_url(""), "")


class OwnedPhotoIdsTest(unittest.TestCase):
    def test_registry_ids_are_owned(self) -> None:
        self.assertEqual(photos.owned_photo_ids([IMAGE_A, IMAGE_B]), {IMAGE_A, IMAGE_B})

    def test_prefix_names_are_owned(self) -> None:
        owned = photos.owned_photo_ids(
            None,
            {IMAGE_A: "rezeptbox-Omas-Kuchen.jpg", IMAGE_B: "IMG_1234.HEIC"},
        )
        self.assertEqual(owned, {IMAGE_A})

    def test_prefix_is_case_insensitive(self) -> None:
        owned = photos.owned_photo_ids(
            [], {IMAGE_C: "RezeptBox-Karte.JPG"}, "RezeptBox-"
        )
        self.assertEqual(owned, {IMAGE_C})

    def test_foreign_images_are_never_owned(self) -> None:
        owned = photos.owned_photo_ids(
            None,
            {IMAGE_A: "profile.jpg", IMAGE_B: "other-integration.png"},
        )
        self.assertEqual(owned, set())

    def test_empty_inputs(self) -> None:
        self.assertEqual(photos.owned_photo_ids(None), set())
        self.assertEqual(photos.owned_photo_ids([None, ""]), set())


class OrphanedPhotoIdsTest(unittest.TestCase):
    def test_unused_photos_are_orphans(self) -> None:
        self.assertEqual(
            photos.orphaned_photo_ids([IMAGE_A, IMAGE_B], [IMAGE_A]),
            [IMAGE_B],
        )

    def test_used_photos_are_kept(self) -> None:
        self.assertEqual(
            photos.orphaned_photo_ids([IMAGE_A], [IMAGE_A]),
            [],
        )

    def test_shared_photo_is_kept(self) -> None:
        # Two recipes pointing at the same image protect it.
        self.assertEqual(
            photos.orphaned_photo_ids([IMAGE_A], [IMAGE_A, IMAGE_A]),
            [],
        )

    def test_referenced_foreign_image_is_not_reported(self) -> None:
        self.assertEqual(
            photos.orphaned_photo_ids(None, [IMAGE_A], {IMAGE_A: "profile.jpg"}),
            [],
        )

    def test_prefix_upload_outside_registry_is_orphan(self) -> None:
        self.assertEqual(
            photos.orphaned_photo_ids(
                [], [], {IMAGE_C: "rezeptbox-karte.jpg"}
            ),
            [IMAGE_C],
        )

    def test_foreign_upload_is_not_orphan(self) -> None:
        self.assertEqual(
            photos.orphaned_photo_ids([], [], {IMAGE_C: "profile.jpg"}),
            [],
        )

    def test_result_is_sorted_and_deduplicated(self) -> None:
        self.assertEqual(
            photos.orphaned_photo_ids(
                [IMAGE_B, IMAGE_A, IMAGE_B],
                [],
                {IMAGE_A: "rezeptbox-a.jpg"},
            ),
            [IMAGE_A, IMAGE_B],
        )

    def test_empty_inputs(self) -> None:
        self.assertEqual(photos.orphaned_photo_ids(None, None), [])
        self.assertEqual(photos.orphaned_photo_ids([], []), [])
        self.assertEqual(photos.orphaned_photo_ids([None, ""], [None]), [])


if __name__ == "__main__":
    unittest.main()
