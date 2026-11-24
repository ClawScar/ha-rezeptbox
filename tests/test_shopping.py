"""Tests for merging ingredient lines before they reach the shopping list."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE / "custom_components" / "recipe_box"))

import parser as recipe_parser  # noqa: E402

merge_ingredient_lines = recipe_parser.merge_ingredient_lines


class MergeLinesTest(unittest.TestCase):
    def test_counts_add_up(self) -> None:
        self.assertEqual(
            merge_ingredient_lines(["2 Zwiebeln", "3 Zwiebeln"]),
            ["5 Zwiebeln"],
        )
        self.assertEqual(
            merge_ingredient_lines(["1 Prise Salz", "2 Prisen Salz"]),
            ["3 Prisen Salz"],
        )

    def test_singular_and_plural_names_merge(self) -> None:
        self.assertEqual(
            merge_ingredient_lines(["1 Zwiebel", "2 Zwiebeln"]),
            ["3 Zwiebeln"],
        )
        self.assertEqual(
            merge_ingredient_lines(["1 Ei", "1 Ei"]),
            ["2 Eier"],
        )

    def test_mass_and_volume_are_converted(self) -> None:
        self.assertEqual(
            merge_ingredient_lines(["500 g Kartoffeln", "500 g Kartoffeln"]),
            ["1 kg Kartoffeln"],
        )
        self.assertEqual(
            merge_ingredient_lines(["250 g Mehl", "1 kg Mehl"]),
            ["1,25 kg Mehl"],
        )
        self.assertEqual(
            merge_ingredient_lines(["0,5 l Milch", "250 ml Milch"]),
            ["750 ml Milch"],
        )
        self.assertEqual(
            merge_ingredient_lines(["600 ml Wasser", "600 ml Wasser"]),
            ["1,2 l Wasser"],
        )

    def test_ranges_add_up(self) -> None:
        self.assertEqual(
            merge_ingredient_lines(["2–3 EL Öl", "1 EL Öl"]),
            ["3–4 EL Öl"],
        )

    def test_different_units_stay_separate(self) -> None:
        self.assertEqual(
            merge_ingredient_lines(["2 Zwiebeln", "200 g Zwiebeln"]),
            ["2 Zwiebeln", "200 g Zwiebeln"],
        )
        self.assertEqual(
            merge_ingredient_lines(["1 EL Öl", "100 ml Öl"]),
            ["1 EL Öl", "100 ml Öl"],
        )

    def test_lines_without_amount_are_only_deduplicated(self) -> None:
        self.assertEqual(
            merge_ingredient_lines(
                ["Salz und Pfeffer", "Salz und Pfeffer", "Öl"]
            ),
            ["Salz und Pfeffer", "Öl"],
        )

    def test_usage_notes_are_kept(self) -> None:
        self.assertEqual(
            merge_ingredient_lines(
                ["1 Zwiebel, fein gewürfelt", "2 Zwiebeln, fein gewürfelt"]
            ),
            ["3 Zwiebeln, fein gewürfelt"],
        )

    def test_order_of_first_appearance_is_kept(self) -> None:
        self.assertEqual(
            merge_ingredient_lines(["2 Eier", "1 Zwiebel", "1 Ei"]),
            ["3 Eier", "1 Zwiebel"],
        )

    def test_empty_input(self) -> None:
        self.assertEqual(merge_ingredient_lines([]), [])
        self.assertEqual(merge_ingredient_lines(["", "   "]), [])


class CanonicalNameTest(unittest.TestCase):
    def test_singular_and_plural_match(self) -> None:
        self.assertEqual(
            recipe_parser.canonical_ingredient_name("Zwiebeln"),
            recipe_parser.canonical_ingredient_name("Zwiebel"),
        )
        self.assertEqual(
            recipe_parser.canonical_ingredient_name("Eier"),
            recipe_parser.canonical_ingredient_name("Ei"),
        )

    def test_unknown_names_stay_together(self) -> None:
        self.assertEqual(
            recipe_parser.canonical_ingredient_name("Philadelphia"),
            "philadelphia",
        )


if __name__ == "__main__":
    unittest.main()
