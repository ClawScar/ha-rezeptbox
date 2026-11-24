"""Smoke tests for recipe_box.add_to_shopping_list on Home Assistant."""

from __future__ import annotations

from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.recipe_box.const import DOMAIN
from custom_components.recipe_box.parser import Recipe, parse_ingredient_text

SHOPPING_DOMAIN = "shopping_list"

MIXED_INGREDIENTS = ["500 g Kartoffeln", "1 Prise Salz", "1/2 TL Kümmel"]


async def _setup_shopping_list(hass: HomeAssistant) -> None:
    """Set up the built-in shopping list with an empty list."""
    entry = MockConfigEntry(domain=SHOPPING_DOMAIN, data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    # The shopping list persists to disk and the test harness reuses its
    # config directory, so start every test from an empty list.
    hass.data[SHOPPING_DOMAIN].items.clear()


async def _setup_recipe_box(hass: HomeAssistant, recipe: Recipe) -> str:
    """Set up the recipe box, add one recipe and return its sensor entity id."""
    entry = MockConfigEntry(domain=DOMAIN, title="Rezeptbox", data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    hub = entry.runtime_data
    await hub.async_add_recipe(recipe)
    await hass.async_block_till_done()

    for state in hass.states.async_all("sensor"):
        if state.attributes.get("source_url") == recipe.source_url:
            return state.entity_id
    raise AssertionError(f"No recipe sensor was created for {recipe.source_url}")


def _shopping_items(hass: HomeAssistant) -> list[str]:
    """Return the names currently stored in the shopping list."""
    return [str(item["name"]) for item in hass.data[SHOPPING_DOMAIN].items]


async def _add_to_shopping_list(
    hass: HomeAssistant,
    entity_id: str,
    servings: float | None = None,
    exclude: list[str] | None = None,
    merge: bool | None = None,
) -> None:
    """Call the Rezeptbox shopping list service."""
    data: dict[str, object] = {"entity_id": entity_id}
    if servings is not None:
        data["servings"] = servings
    if exclude is not None:
        data["exclude"] = exclude
    if merge is not None:
        data["merge"] = merge
    await hass.services.async_call(
        DOMAIN, "add_to_shopping_list", data, blocking=True
    )
    await hass.async_block_till_done()


def _structured_recipe() -> Recipe:
    """Return a recipe with structured ingredients for four servings."""
    return Recipe(
        title="Kartoffelsuppe",
        source_url="https://example.com/kartoffelsuppe",
        servings=4,
        ingredients=list(MIXED_INGREDIENTS),
        ingredients_structured=[
            parse_ingredient_text(text) for text in MIXED_INGREDIENTS
        ],
        instructions=["Kochen."],
    )


async def test_shopping_list_with_servings(hass: HomeAssistant) -> None:
    """Structured ingredients are scaled and units are pluralized."""
    await _setup_shopping_list(hass)
    recipe = _structured_recipe()
    entity_id = await _setup_recipe_box(hass, recipe)

    state = hass.states.get(entity_id)
    assert state is not None
    assert len(state.attributes["ingredients_structured"]) == 3
    assert state.attributes["servings"] == 4

    await _add_to_shopping_list(hass, entity_id, servings=8)

    assert _shopping_items(hass) == [
        "1000 g Kartoffeln",
        "2 Prisen Salz",
        "1 TL Kümmel",
    ]


async def test_shopping_list_pluralizes_ingredient_names(
    hass: HomeAssistant,
) -> None:
    """Ingredient nouns follow the scaled amount on the shopping list."""
    await _setup_shopping_list(hass)
    ingredients = [
        "1 Ei",
        "1 Zwiebel",
        "1 Tomate",
        "1 Kartoffel",
        "1 ganzer Apfel",
        "1 Zwiebel rot",
    ]
    recipe = Recipe(
        title="Gemüsepfanne",
        source_url="https://example.com/gemuesepfanne",
        servings=2,
        ingredients=list(ingredients),
        ingredients_structured=[
            parse_ingredient_text(text) for text in ingredients
        ],
        instructions=["Kochen."],
    )
    entity_id = await _setup_recipe_box(hass, recipe)

    await _add_to_shopping_list(hass, entity_id, servings=4)

    assert _shopping_items(hass) == [
        "2 Eier",
        "2 Zwiebeln",
        "2 Tomaten",
        "2 Kartoffeln",
        "2 ganze Äpfel",
        "2 Zwiebeln rot",
    ]


async def test_shopping_list_singularizes_with_gender(hass: HomeAssistant) -> None:
    """Shrinking portions restores the adjective ending of the noun's gender."""
    await _setup_shopping_list(hass)
    ingredients = ["2 ganze Äpfel", "2 große Zwiebeln", "2 kleine Eier"]
    recipe = Recipe(
        title="Obstkorb",
        source_url="https://example.com/obstkorb",
        servings=2,
        ingredients=list(ingredients),
        ingredients_structured=[
            parse_ingredient_text(text) for text in ingredients
        ],
        instructions=["Kochen."],
    )
    entity_id = await _setup_recipe_box(hass, recipe)

    await _add_to_shopping_list(hass, entity_id, servings=1)

    assert _shopping_items(hass) == [
        "1 ganzer Apfel",
        "1 große Zwiebel",
        "1 kleines Ei",
    ]


async def test_shopping_list_merges_repeated_adds(hass: HomeAssistant) -> None:
    """Adding the same recipe twice sums its ingredients instead of duplicating."""
    await _setup_shopping_list(hass)
    ingredients = ["500 g Kartoffeln", "2 Zwiebeln"]
    recipe = Recipe(
        title="Kartoffelsuppe",
        source_url="https://example.com/kartoffelsuppe",
        servings=4,
        ingredients=list(ingredients),
        ingredients_structured=[
            parse_ingredient_text(text) for text in ingredients
        ],
        instructions=["Kochen."],
    )
    entity_id = await _setup_recipe_box(hass, recipe)

    await _add_to_shopping_list(hass, entity_id)
    await _add_to_shopping_list(hass, entity_id)

    items = _shopping_items(hass)
    assert len(items) == 2
    assert set(items) == {"1 kg Kartoffeln", "4 Zwiebeln"}


async def test_shopping_list_skips_excluded_ingredients(
    hass: HomeAssistant,
) -> None:
    """Checked ingredients can be left off the list."""
    await _setup_shopping_list(hass)
    recipe = _structured_recipe()
    entity_id = await _setup_recipe_box(hass, recipe)

    await _add_to_shopping_list(hass, entity_id, exclude=["1 Prise Salz"])

    assert _shopping_items(hass) == ["500 g Kartoffeln", "1/2 TL Kümmel"]


async def test_add_recipe_service_creates_sensor(hass: HomeAssistant) -> None:
    """Manually created recipes get entities like imported ones."""
    entry = MockConfigEntry(domain=DOMAIN, title="Rezeptbox", data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    await hass.services.async_call(
        DOMAIN,
        "add_recipe",
        {
            "title": "Omas Apfelkuchen",
            "ingredients": ["2 Äpfel", "200 g Mehl"],
            "instructions": ["Backen."],
            "servings": 8,
            "tags": ["Kuchen"],
        },
        blocking=True,
    )
    await hass.async_block_till_done()

    states = [
        state
        for state in hass.states.async_all("sensor")
        if state.attributes.get("title") == "Omas Apfelkuchen"
    ]
    assert len(states) == 1
    attributes = states[0].attributes
    assert attributes["servings"] == 8
    assert attributes["tags"] == ["Kuchen"]
    assert attributes["ingredients_structured"][1]["amount"] == 200


async def test_plan_recipe_service(hass: HomeAssistant) -> None:
    """The meal plan is exposed on its own sensor and can be cleared."""
    await _setup_shopping_list(hass)
    recipe = _structured_recipe()
    entity_id = await _setup_recipe_box(hass, recipe)

    await hass.services.async_call(
        DOMAIN,
        "plan_recipe",
        {"date": "2026-11-25", "entity_id": entity_id},
        blocking=True,
    )
    await hass.async_block_till_done()

    plan_states = [
        state
        for state in hass.states.async_all("sensor")
        if isinstance(state.attributes.get("plan"), list)
    ]
    assert len(plan_states) == 1
    plan_state = plan_states[0]
    assert plan_state.attributes["plan"] == [
        {
            "date": "2026-11-25",
            "title": "Kartoffelsuppe",
            "source_url": recipe.source_url,
            "servings": None,
        }
    ]

    await hass.services.async_call(DOMAIN, "clear_meal_plan", {}, blocking=True)
    await hass.async_block_till_done()

    updated = hass.states.get(plan_state.entity_id)
    assert updated is not None
    assert updated.attributes["plan"] == []


async def test_refresh_recipe_service(hass: HomeAssistant, monkeypatch) -> None:
    """A single recipe can be reloaded and reports its timestamp."""
    recipe = _structured_recipe()
    entity_id = await _setup_recipe_box(hass, recipe)

    async def fake_scrape(_hass: HomeAssistant, _url: str) -> Recipe:
        updated = _structured_recipe()
        updated.title = "Kartoffelsuppe neu"
        return updated

    monkeypatch.setattr(
        "custom_components.recipe_box.coordinator.async_scrape_recipe",
        fake_scrape,
    )

    await hass.services.async_call(
        DOMAIN, "refresh_recipe", {"entity_id": entity_id}, blocking=True
    )
    await hass.async_block_till_done()

    state = hass.states.get(entity_id)
    assert state is not None
    assert state.attributes["title"] == "Kartoffelsuppe neu"
    assert state.attributes["updated_at"]
    assert state.attributes.get("update_error") is None


async def test_export_and_import_recipes(hass: HomeAssistant) -> None:
    """The export can be read back through the import service."""
    recipe = _structured_recipe()
    await _setup_recipe_box(hass, recipe)

    exported = await hass.services.async_call(
        DOMAIN, "export_recipes", {}, blocking=True, return_response=True
    )
    assert exported is not None
    assert exported["recipes"][0]["title"] == "Kartoffelsuppe"

    exported["recipes"][0]["title"] = "Kartoffelsuppe (Sicherung)"
    imported = await hass.services.async_call(
        DOMAIN,
        "import_recipes",
        {"recipes": exported["recipes"], "plan": {}},
        blocking=True,
        return_response=True,
    )
    assert imported == {"imported": 1, "failed": 0}

    titles = [
        state.attributes.get("title")
        for state in hass.states.async_all("sensor")
        if state.attributes.get("source_url") == recipe.source_url
    ]
    assert "Kartoffelsuppe (Sicherung)" in titles


async def test_shopping_list_without_servings(hass: HomeAssistant) -> None:
    """Without servings the original ingredient lines are used unchanged."""
    await _setup_shopping_list(hass)
    recipe = _structured_recipe()
    entity_id = await _setup_recipe_box(hass, recipe)

    await _add_to_shopping_list(hass, entity_id)

    assert _shopping_items(hass) == MIXED_INGREDIENTS


async def test_shopping_list_old_recipe_without_structured_data(
    hass: HomeAssistant,
) -> None:
    """Recipes from 1.2.x are scaled through the text fallback."""
    await _setup_shopping_list(hass)
    recipe = Recipe(
        title="Altes Rezept",
        source_url="https://example.com/altes-rezept",
        servings=4,
        ingredients=["500 g Kartoffeln", "1 Prise Salz", "Salz und Pfeffer"],
        instructions=["Kochen."],
    )
    entity_id = await _setup_recipe_box(hass, recipe)

    state = hass.states.get(entity_id)
    assert state is not None
    assert not state.attributes.get("ingredients_structured")

    await _add_to_shopping_list(hass, entity_id, servings=6)

    assert _shopping_items(hass) == [
        "750 g Kartoffeln",
        "1,5 Prise Salz",
        "Salz und Pfeffer",
    ]
