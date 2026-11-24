/* Behaviour tests for the remembered card tab in recipe-card.js.
 *
 * Run with: node tests/card_tab_test.js
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
  broken: false,
  getItem(key) {
    if (this.broken) throw new Error("blocked");
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    if (this.broken) throw new Error("blocked");
    storage.set(key, String(value));
  },
};

const context = {
  console: { info() {} },
  HTMLElement: class {
    attachShadow() {
      return {};
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
    createElement: () => ({ style: {}, click() {}, remove() {} }),
    body: { appendChild() {} },
  },
  navigator: { maxTouchPoints: 0 },
  setTimeout: () => 0,
  clearTimeout: () => {},
  window: { customCards: [], localStorage },
};

vm.runInContext(
  `${source}\nthis.RecipeBoxListCard = RecipeBoxListCard;\nthis.TAB_HELPERS = { readTab, writeTab, tabStorageKey, readGroup, writeGroup, groupStorageKey };`,
  vm.createContext(context)
);

const { readTab, writeTab, tabStorageKey, readGroup, writeGroup, groupStorageKey } =
  context.TAB_HELPERS;
const { RecipeBoxListCard } = context;

const makeCard = (entities) => {
  const card = new RecipeBoxListCard();
  card._render = () => {};
  card.setConfig(entities ? { entities } : {});
  return card;
};

// 1. Without stored state the list starts on the recipe tab.
storage.clear();
assert.equal(readTab(null), "recipes");
assert.equal(makeCard()._tab, "recipes");

// 2. A written tab is read back, so a reload stays on it.
writeTab(["sensor.recipe"], "data");
assert.equal(storage.get(tabStorageKey(["sensor.recipe"])), "data");
assert.equal(readTab(["sensor.recipe"]), "data");
assert.equal(makeCard("sensor.recipe")._tab, "data");

// 3. Cards remember their own tab; the order of the entities does not matter.
assert.equal(readTab(["sensor.other"]), "recipes");
writeTab(["sensor.a", "sensor.b"], "plan");
assert.equal(readTab(["sensor.b", "sensor.a"]), "plan");

// 4. Unknown stored values fall back to the recipe tab.
storage.set(tabStorageKey(["sensor.recipe"]), "bogus");
assert.equal(readTab(["sensor.recipe"]), "recipes");

// 5. Tab changes are stored through the card.
const card = makeCard("sensor.recipe");
card._rememberTab("data");
assert.equal(readTab(["sensor.recipe"]), "data");
card._rememberTab("bogus");
assert.equal(readTab(["sensor.recipe"]), "data", "unknown tabs are not stored");

// 6. A blocked localStorage never breaks the card.
localStorage.broken = true;
assert.equal(readTab(["sensor.recipe"]), "recipes");
writeTab(["sensor.recipe"], "plan");
assert.equal(makeCard("sensor.recipe")._tab, "recipes");
localStorage.broken = false;

// 7. The chosen group tab is remembered per card like the main tab.
writeGroup(["sensor.recipe"], "Familie");
assert.equal(storage.get(groupStorageKey(["sensor.recipe"])), "Familie");
assert.equal(readGroup(["sensor.recipe"]), "Familie");
assert.equal(makeCard("sensor.recipe")._filter.group, "Familie");

// 8. Group and main tab are independent, also when the order changes.
writeTab(["sensor.recipe"], "data");
assert.equal(readGroup(["sensor.recipe"]), "Familie");
assert.equal(readTab(["sensor.recipe"]), "data");
writeGroup(["sensor.a", "sensor.b"], "Backen");
assert.equal(readGroup(["sensor.b", "sensor.a"]), "Backen");
assert.equal(readGroup(["sensor.other"]), "");

// 9. "Alle" is stored as an empty value; a broken storage never breaks the card.
writeGroup(["sensor.recipe"], "");
assert.equal(readGroup(["sensor.recipe"]), "");
localStorage.broken = true;
assert.equal(readGroup(["sensor.recipe"]), "");
writeGroup(["sensor.recipe"], "Familie");
assert.equal(makeCard("sensor.recipe")._filter.group, "");
localStorage.broken = false;

console.log("card_tab_test: 9 checks passed");
