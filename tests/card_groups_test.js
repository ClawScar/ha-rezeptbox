/* Behaviour tests for recipe groups in recipe-card.js.
 *
 * Run with: node tests/card_groups_test.js
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
  window: { customCards: [], localStorage: { getItem: () => null, setItem() {} } },
};

vm.runInContext(
  `${source}\nthis.RecipeBoxListCard = RecipeBoxListCard;\nthis.GROUP_HELPERS = { recipeGroups, allGroups, filterBarHtml, groupsEditorHtml };`,
  vm.createContext(context)
);

const { recipeGroups, allGroups, filterBarHtml, groupsEditorHtml } =
  context.GROUP_HELPERS;
const { RecipeBoxListCard } = context;

const entry = (title, groups) => ({
  entityId: `sensor.${title.toLowerCase()}`,
  state: {
    entity_id: `sensor.${title.toLowerCase()}`,
    attributes: { title, groups, ingredients: [] },
  },
});

const cardFor = (filter) => {
  const card = Object.create(RecipeBoxListCard.prototype);
  card._filter = {
    query: "",
    tag: "",
    group: "",
    maxTime: "",
    sort: "title",
    ...filter,
  };
  return card;
};

const titles = (list) => list.map(({ state }) => state.attributes.title);

// 1. Only a list of non-empty names counts as groups.
assert.deepEqual([...recipeGroups(entry("A", ["Familie", "Backen"]).state)], [
  "Familie",
  "Backen",
]);
assert.deepEqual([...recipeGroups({ attributes: { groups: "Familie" } })], []);
assert.deepEqual([...recipeGroups({ attributes: {} })], []);
assert.deepEqual([...recipeGroups(undefined)], []);

// 2. Known groups are collected once and sorted.
const entries = [
  entry("Lasagne", ["Familie", "Nudeln"]),
  entry("Curry", ["Familie"]),
  entry("Brot", []),
];
assert.deepEqual([...allGroups(entries)], ["Familie", "Nudeln"]);

// 3. The group filter keeps only the members of the chosen group.
assert.deepEqual(
  titles(cardFor({ group: "Familie" })._filtered(entries)),
  ["Lasagne", "Curry"]
);
assert.deepEqual(
  titles(cardFor({ group: "Nudeln" })._filtered(entries)),
  ["Lasagne"]
);
assert.deepEqual(titles(cardFor({ group: "" })._filtered(entries)), [
  "Lasagne",
  "Curry",
  "Brot",
]);

// 4. Group and search filter work together.
assert.deepEqual(
  titles(cardFor({ group: "Familie", query: "curry" })._filtered(entries)),
  ["Curry"]
);

// 5. The filter bar offers the groups only when there are some.
const withGroups = filterBarHtml(entries, cardFor({})._filter);
assert.match(withGroups, /<select class="filter-group">/);
assert.match(withGroups, /Alle Gruppen/);
assert.match(withGroups, /<option value="Familie">Familie<\/option>/);
const withoutGroups = filterBarHtml([entry("Brot", [])], cardFor({})._filter);
assert.doesNotMatch(withoutGroups, /filter-group/);

// 6. The detail view lists the groups as removable chips and offers a new one.
const editor = groupsEditorHtml(
  { groups: ["Familie", "Backen"] },
  { entityId: "sensor.lasagne", groups: ["Familie", "Backen", "Nudeln"] },
  ["Familie", "Backen", "Nudeln"]
);
assert.match(editor, /class="group-chip"/);
assert.match(editor, /data-group="Familie"/);
assert.match(editor, /class="group-add-button"/);
assert.match(editor, /<option value="Nudeln"><\/option>/);
assert.doesNotMatch(editor, /<option value="Familie"><\/option>/);

// 7. Printing and the bare sensor view get no group editor.
assert.equal(groupsEditorHtml({ groups: [] }, { forPrint: true }, []), "");
assert.equal(groupsEditorHtml({ groups: [] }, {}, []), "");

console.log("card_groups_test: 7 checks passed");
