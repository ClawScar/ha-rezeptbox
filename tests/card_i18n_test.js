/* Language tests for the cards and the sidebar page.
 *
 * English when hass.language starts with "en", German for everything else.
 *
 * Run with: node tests/card_i18n_test.js
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
  window: {
    customCards: [],
    localStorage: { getItem: () => null, setItem() {} },
    location: { pathname: "/rezeptbox" },
    history: { state: null, pushState() {}, replaceState() {}, back() {} },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  },
};

vm.runInContext(
  `${source}
this.RecipeBoxListCard = RecipeBoxListCard;
this.RecipeBoxCard = RecipeBoxCard;
this.RecipeBoxPanel = RecipeBoxPanel;
this.HELPERS = { manualFormHtml, formatServings, formatMinutes, setUiLanguage };`,
  vm.createContext(context)
);

const { RecipeBoxListCard, RecipeBoxCard, RecipeBoxPanel, HELPERS } = context;

const has = (markup, text, message) =>
  assert.ok(markup.includes(text), message || `missing ${JSON.stringify(text)}`);
const hasNot = (markup, text, message) =>
  assert.ok(
    !markup.includes(text),
    message || `unexpected ${JSON.stringify(text)}`
  );

const recipeState = (id, title) => ({
  entity_id: id,
  last_updated: "2026-11-25T10:00:00",
  attributes: {
    integration: "recipe_box",
    title,
    source_url: `https://example.org/${id}`,
    servings: 2,
    total_time_minutes: 65,
    tags: ["Pasta"],
    ingredients: ["2 Zwiebeln", "1 EL Öl"],
    instructions: ["Zwiebeln schneiden.", "20 Minuten backen."],
  },
});

const hassFor = (language) => ({
  language,
  states: {
    "sensor.lasagne": recipeState("sensor.lasagne", "Lasagne"),
    "sensor.curry": recipeState("sensor.curry", "Curry"),
  },
});

const listMarkup = (language, tab = "recipes") => {
  const card = new RecipeBoxListCard();
  card.setConfig({ show_import: true, show_tools: true });
  card._tab = tab;
  card.hass = hassFor(language);
  return card.shadowRoot.innerHTML;
};

const detailMarkup = (language) => {
  const card = new RecipeBoxCard();
  card.setConfig({ entity: "sensor.lasagne" });
  card.hass = hassFor(language);
  return card.shadowRoot.innerHTML;
};

const panelMarkup = (language) => {
  const panel = new RecipeBoxPanel();
  panel.panel = { url_path: "rezeptbox", title: "Rezeptbox" };
  panel.hass = hassFor(language);
  return panel.shadowRoot.innerHTML;
};

// 1. The data tab of the list card is English in an English Home Assistant.
const englishData = listMarkup("en", "data");
has(englishData, "Import recipes");
has(englishData, ">Backup<");
has(englishData, ">Save<");
has(englishData, ">Load<");
hasNot(englishData, "Rezepte importieren");

// 2. Every English locale counts, not only the exact code.
has(listMarkup("en-GB", "data"), "Import recipes");
has(listMarkup("en_US", "data"), "Import recipes");

// 3. German is the default and covers every other language.
has(listMarkup("de", "data"), "Rezepte importieren");
has(listMarkup("fr", "data"), "Rezepte importieren");
has(listMarkup(undefined, "data"), "Rezepte importieren");

// 4. The tabs follow the language as well.
const englishRecipes = listMarkup("en");
has(englishRecipes, ">Recipes<");
has(englishRecipes, ">Meal plan<");
has(englishRecipes, ">Data<");
has(listMarkup("de"), ">Wochenplan<");

// 5. Search, tag and sort fields are translated.
has(englishRecipes, 'placeholder="Search recipes"');
has(englishRecipes, ">All tags<");
has(englishRecipes, ">Any time<");
has(englishRecipes, ">What to cook?<");
has(listMarkup("de"), 'placeholder="Rezepte durchsuchen"');
has(listMarkup("de"), ">Alle Tags<");

// 6. The empty state follows, and a configured title stays untouched.
const emptyCard = new RecipeBoxListCard();
emptyCard.setConfig({ title: "Küche" });
emptyCard.hass = { language: "en", states: {} };
has(emptyCard.shadowRoot.innerHTML, "No recipes yet");
has(emptyCard.shadowRoot.innerHTML, "<h2>Küche</h2>");
const untitledCard = new RecipeBoxListCard();
untitledCard.setConfig({});
untitledCard.hass = { language: "en", states: {} };
has(untitledCard.shadowRoot.innerHTML, "<h2>Recipes</h2>");

// 7. The detail view speaks English too.
const englishDetail = detailMarkup("en");
has(englishDetail, ">Ingredients<");
has(englishDetail, ">Preparation<");
has(englishDetail, ">Print<");
has(englishDetail, ">Refresh<");
has(englishDetail, "Original recipe");
has(englishDetail, "More servings");
has(englishDetail, "Add the ingredients");
has(detailMarkup("de"), ">Zubereitung<");
has(detailMarkup("de"), ">Zutaten<");

// 8. Formatting helpers use the matching language.
HELPERS.setUiLanguage({ language: "de" });
assert.equal(HELPERS.formatServings(1), "1 Portion");
assert.equal(HELPERS.formatServings(3), "3 Portionen");
assert.equal(HELPERS.formatMinutes(65), "1 Std. 5 Min.");
HELPERS.setUiLanguage({ language: "en" });
assert.equal(HELPERS.formatServings(1), "1 serving");
assert.equal(HELPERS.formatServings(3), "3 servings");
assert.equal(HELPERS.formatMinutes(65), "1 h 5 min");

// 9. The manual recipe form switches with the language.
has(HELPERS.manualFormHtml(), ">Save recipe<");
has(HELPERS.manualFormHtml(), "Add a photo");
HELPERS.setUiLanguage({ language: "de" });
has(HELPERS.manualFormHtml(), ">Rezept speichern<");
has(HELPERS.manualFormHtml(), "Eigenes Rezept");

// 10. The sidebar page labels its menu button in the active language.
has(panelMarkup("en"), 'aria-label="Menu"');
has(panelMarkup("de"), 'aria-label="Menü"');

// 11. The card picker describes the cards in the active language.
HELPERS.setUiLanguage({ language: "en" });
assert.equal(context.window.customCards[0].name, "Rezeptbox list");
has(context.window.customCards[0].description, "Shows all recipes as a list");
HELPERS.setUiLanguage({ language: "de" });
assert.equal(context.window.customCards[0].name, "Rezeptbox Liste");
has(context.window.customCards[0].description, "Zeigt alle Rezepte als Liste");

// 12. A render without a language falls back to German.
has(detailMarkup(undefined), ">Zubereitung<");
has(listMarkup(undefined, "data"), "Rezepte importieren");

console.log("card_i18n_test: 12 checks passed");
