/* Tests for planning from the list, favorites and the random picker.
 *
 * Covers the compact day strip in the recipe list, the favorite star in row
 * and detail, the "Was kochen?" weighting and its short history, and that the
 * recipe detail stays free of its own planning block.
 *
 * Run with: node tests/card_detail_plan_test.js
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const CARD = path.join(
  __dirname,
  "..",
  "custom_components",
  "recipe_box",
  "www",
  "recipe-card.js"
);
const source = fs.readFileSync(CARD, "utf8");

const storage = new Map();
const localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
};

const shadowRoot = () => ({
  innerHTML: "",
  querySelector: () => null,
  querySelectorAll: () => [],
});

const context = {
  console: { info() {} },
  HTMLElement: class {
    constructor() {
      this.shadowRoot = null;
    }
    attachShadow() {
      this.shadowRoot = shadowRoot();
      return this.shadowRoot;
    }
    dispatchEvent() {
      return true;
    }
  },
  customElements: { get: () => undefined, define: () => {} },
  CustomEvent: class {
    constructor(type, init) {
      this.type = type;
      this.detail = init && init.detail;
    }
  },
  document: {
    createElement: () => ({ setConfig() {}, applyView() {} }),
    body: { appendChild() {} },
  },
  navigator: { maxTouchPoints: 0 },
  setTimeout: () => 0,
  clearTimeout: () => {},
  window: { customCards: [], localStorage },
};

vm.runInContext(
  `${source}
this.RecipeBoxListCard = RecipeBoxListCard;
this.RecipeBoxCard = RecipeBoxCard;
this.HELPERS = {
  detailHtml,
  pickRandomEntry,
  favoritesFromEntries,
  readRandomHistory,
  rememberRandomPick,
  setUiLanguage,
};`,
  vm.createContext(context)
);

const { RecipeBoxListCard, RecipeBoxCard, HELPERS } = context;

const count = (markup, needle) => markup.split(needle).length - 1;
const has = (markup, text, message) =>
  assert.ok(markup.includes(text), message || `missing ${JSON.stringify(text)}`);
const hasNot = (markup, text, message) =>
  assert.ok(!markup.includes(text), message || `unexpected ${JSON.stringify(text)}`);

const isoDate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
const today = new Date();
const todayIso = isoDate(today);
const inDays = (offset) =>
  isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset));

const recipeState = (id, title) => ({
  entity_id: id,
  attributes: {
    integration: "recipe_box",
    title,
    source_url: `https://example.org/${id}`,
    servings: 4,
    ingredients: ["2 Zwiebeln", "1 EL Öl"],
    instructions: ["Zwiebeln schneiden."],
  },
});

const lasagne = recipeState("sensor.lasagne", "Lasagne");
const curry = recipeState("sensor.curry", "Curry");
const lasagneUrl = "https://example.org/sensor.lasagne";
const curryUrl = "https://example.org/sensor.curry";

const plan = [
  { date: todayIso, title: "Lasagne", source_url: lasagneUrl, servings: 4 },
  { date: inDays(2), title: "Curry", source_url: curryUrl },
];

const hassFor = (entries = plan) => ({
  language: "de",
  states: {
    "sensor.lasagne": lasagne,
    "sensor.curry": curry,
    "sensor.recipe_box": {
      entity_id: "sensor.recipe_box",
      attributes: { plan: entries },
    },
  },
});

// 1. The recipe detail no longer carries its own day picker: the recipe
//    itself stays the focus, planning happens in the list and the plan tab.
const hass = hassFor();
HELPERS.setUiLanguage({ language: "de" });
const detailCard = new RecipeBoxCard();
detailCard.setConfig({ entity: "sensor.lasagne" });
detailCard.hass = hass;
const detail = detailCard.shadowRoot.innerHTML;
has(detail, 'class="favorite-toggle');
has(detail, ">Favorit<");
hasNot(detail, "Einplanen");
hasNot(detail, 'class="detail-day-search"');
hasNot(detail, 'class="detail-day-list"');
hasNot(detail, 'class="detail-day-chip');
has(detail, "Zutaten", "ingredients follow the recipe without a picker");

const listPlan = new RecipeBoxListCard();
listPlan.setConfig({});
listPlan.hass = hass;
has(listPlan.shadowRoot.innerHTML, 'class="plan-add', "planning stays in the list");

// 2. English labels the favorite without any planning block.
HELPERS.setUiLanguage({ language: "en" });
const englishCard = new RecipeBoxCard();
englishCard.setConfig({ entity: "sensor.curry" });
englishCard.hass = hass;
const english = englishCard.shadowRoot.innerHTML;
has(english, "Favorite");
hasNot(english, "Plan it");
HELPERS.setUiLanguage({ language: "de" });

// 3. Favorites come from the shared recipe entities, not from localStorage.
storage.clear();
const entriesOf = () => [
  { entityId: "sensor.lasagne", state: lasagne },
  { entityId: "sensor.curry", state: curry },
];
assert.equal(HELPERS.favoritesFromEntries(entriesOf()).size, 0);
lasagne.attributes.favorite = true;
assert.equal(
  JSON.stringify([...HELPERS.favoritesFromEntries(entriesOf())]),
  JSON.stringify([lasagneUrl])
);
assert.equal(storage.size, 0, "no favorite is written into the browser");

// 4. A favorite turns the star in the detail view and in the recipe row.
const favoriteCard = new RecipeBoxCard();
favoriteCard.setConfig({ entity: "sensor.lasagne" });
favoriteCard.hass = hass;
has(favoriteCard.shadowRoot.innerHTML, "favorite-toggle active");
has(favoriteCard.shadowRoot.innerHTML, 'data-favorite="true"');
has(favoriteCard.shadowRoot.innerHTML, "mdi:star");

const listCard = new RecipeBoxListCard();
listCard.setConfig({});
listCard.hass = hass;
const list = listCard.shadowRoot.innerHTML;
assert.equal(count(list, 'class="recipe-favorite'), 2, "every recipe row has a star");
assert.equal(count(list, "recipe-favorite active"), 1, "only the favorite is filled");
has(list, "mdi:star-outline");
has(list, 'class="filter-favorites');
has(list, 'class="filter-favorites" type="button" aria-pressed="false"');

// 5. The recipe tab filters the collection down to favorites.
const favoritesCard = new RecipeBoxListCard();
favoritesCard.setConfig({});
favoritesCard.hass = hass;
favoritesCard._filter.onlyFavorites = true;
favoritesCard._renderList(favoritesCard._recipes());
const favoritesList = favoritesCard.shadowRoot.innerHTML;
has(favoritesList, 'class="filter-favorites active"');
has(favoritesList, 'aria-pressed="true"');
has(favoritesList, ">Nur Favoriten<");
assert.equal(
  count(favoritesList, 'class="recipe-item"'),
  1,
  "only the favorite stays in the list"
);
has(favoritesList, 'class="item-title">Lasagne<');

lasagne.attributes.favorite = false;
const emptyFavorites = new RecipeBoxListCard();
emptyFavorites.setConfig({});
emptyFavorites.hass = hass;
emptyFavorites._filter.onlyFavorites = true;
emptyFavorites._renderList(emptyFavorites._recipes());
has(
  emptyFavorites.shadowRoot.innerHTML,
  "Keine Favoriten in der aktuellen Auswahl."
);

// 6. The random picker skips recent suggestions and prefers favorites.
const pool = [
  { entityId: "sensor.lasagne", state: lasagne },
  { entityId: "sensor.curry", state: curry },
];
assert.equal(HELPERS.pickRandomEntry([], new Set(), []), null);
assert.equal(
  HELPERS.pickRandomEntry(pool, new Set(), [lasagneUrl], () => 0).entityId,
  "sensor.curry",
  "the last suggestion is not repeated"
);
assert.equal(
  HELPERS.pickRandomEntry(pool, new Set(), [], () => 0).entityId,
  "sensor.lasagne"
);
assert.equal(
  HELPERS.pickRandomEntry(pool, new Set([curryUrl]), [], () => 0.99).entityId,
  "sensor.curry",
  "favorites win the higher share"
);
assert.equal(
  HELPERS.pickRandomEntry(pool, new Set(), [lasagneUrl, curryUrl], () => 0)
    .entityId,
  "sensor.lasagne",
  "when every recipe is recent the pool is used again"
);

// 7. The history keeps the newest pick first and stays short.
storage.clear();
HELPERS.rememberRandomPick(lasagneUrl);
HELPERS.rememberRandomPick(curryUrl);
assert.equal(
  JSON.stringify(HELPERS.readRandomHistory()),
  JSON.stringify([curryUrl, lasagneUrl])
);
HELPERS.rememberRandomPick(lasagneUrl);
assert.equal(
  JSON.stringify(HELPERS.readRandomHistory()),
  JSON.stringify([lasagneUrl, curryUrl])
);
for (let index = 0; index < 25; index += 1) {
  HELPERS.rememberRandomPick(`https://example.org/${index}`);
}
assert.equal(HELPERS.readRandomHistory().length, 20);

const main = async () => {
  // 8. "Was kochen?" skips the last suggestion and remembers the new one.
  storage.clear();
  HELPERS.rememberRandomPick(curryUrl);
  const randomCard = new RecipeBoxListCard();
  randomCard.setConfig({});
  randomCard.hass = hass;
  const messages = [];
  randomCard.dispatchEvent = (event) => messages.push(event.detail.message);
  randomCard._openRandom(randomCard._recipes());
  assert.equal(
    randomCard._selected,
    "sensor.lasagne",
    "the only non-recent recipe wins"
  );
  assert.ok(messages.some((message) => message.includes("Vorschlag: Lasagne")));
  assert.equal(HELPERS.readRandomHistory()[0], lasagneUrl);

  // 9. A free-text day goes through plan_recipe with a label, not an entity.
  const calls = [];
  const planCard = new RecipeBoxListCard();
  planCard.setConfig({});
  planCard._hass = {
    callService: async (domain, service, data) =>
      calls.push({ domain, service, data }),
  };
  planCard._render = () => {};
  const planMessages = [];
  planCard.dispatchEvent = (event) => planMessages.push(event.detail.message);
  await planCard._plan(todayIso, "note:away");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].service, "plan_recipe");
  assert.equal(calls[0].data.label, "Auswärts");
  assert.equal(calls[0].data.entity_id, undefined);
  assert.match(planMessages[0], /Auswärts eingetragen\.$/);

  console.log("card_detail_plan_test: 9 checks passed");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
