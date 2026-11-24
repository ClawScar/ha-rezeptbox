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
  `${source}\nthis.RecipeBoxListCard = RecipeBoxListCard;\nthis.GROUP_HELPERS = {
  recipeGroups,
  allGroups,
  knownGroups,
  groupRegistry,
  groupCounts,
  groupTabsHtml,
  groupsManagerHtml,
  filterBarHtml,
  groupsEditorHtml,
};`,
  vm.createContext(context)
);

const {
  recipeGroups,
  allGroups,
  knownGroups,
  groupRegistry,
  groupCounts,
  groupTabsHtml,
  groupsManagerHtml,
  filterBarHtml,
  groupsEditorHtml,
} = context.GROUP_HELPERS;
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

// 5. Group tabs switch the list; the filter bar keeps search and tags only.
const withGroups = filterBarHtml(entries, cardFor({})._filter);
assert.doesNotMatch(withGroups, /filter-group/);
assert.match(withGroups, /filter-search/);
const tabs = groupTabsHtml(["Familie", "Nudeln"], "Familie");
assert.match(tabs, /class="group-tabs"/);
assert.match(
  tabs,
  /class="group-tab active" type="button" role="tab" aria-selected="true" data-group="Familie">Familie<\/button>/
);
assert.match(tabs, /data-group="">Alle<\/button>/);
assert.match(tabs, /data-group="Nudeln">Nudeln<\/button>/);
assert.equal(groupTabsHtml([], ""), "");

// 6. Groups created in the data tab exist before any assignment.
const hass = {
  states: {
    "sensor.rezeptbox_wochenplan": {
      attributes: { plan: [], groups: ["Familie", "Backen"] },
    },
    "sensor.lasagne": {
      attributes: { source_url: "https://example.com", groups: ["Nudeln"] },
    },
  },
};
assert.deepEqual([...groupRegistry(hass)], ["Familie", "Backen"]);
assert.deepEqual([...knownGroups(hass, entries)], [
  "Familie",
  "Backen",
  "Nudeln",
]);
assert.deepEqual([...knownGroups(hass, [])], ["Familie", "Backen"]);
assert.deepEqual([...knownGroups({ states: {} }, entries)], [
  "Familie",
  "Nudeln",
]);
assert.deepEqual([...groupRegistry({ states: {} })], []);

// 7. The data tab manager counts recipes and creates and deletes groups.
assert.equal(groupCounts(entries).get("Familie"), 2);
const manager = groupsManagerHtml(
  ["Familie", "Backen"],
  new Map([["Familie", 2]]),
  "Backen"
);
assert.match(manager, /class="group-create-button"/);
assert.match(manager, /class="group-new-input"/);
assert.match(manager, /<span class="group-count">2 Rezepte<\/span>/);
assert.match(manager, /<span class="group-count">0 Rezepte<\/span>/);
assert.match(manager, /data-group="Familie"/);
assert.match(manager, /class="group-delete confirm"/);
assert.match(manager, /class="group-rename" type="button" data-group="Familie"/);
assert.match(manager, /aria-label="Familie nach oben" disabled>▲<\/button>/);
assert.match(manager, /aria-label="Familie nach unten">▼<\/button>/);
assert.match(manager, /aria-label="Backen nach oben">▲<\/button>/);
assert.match(manager, /aria-label="Backen nach unten" disabled>▼<\/button>/);
assert.ok(
  manager.indexOf('data-group="Familie"') <
    manager.indexOf('data-group="Backen"'),
  "the chips keep the registry order"
);
assert.doesNotMatch(groupsManagerHtml([], new Map(), null), /group-chip/);

// 8. A group is renamed in place, without touching every recipe.
const renaming = groupsManagerHtml(
  ["Familie"],
  new Map([["Familie", 1]]),
  null,
  "Familie"
);
assert.match(renaming, /class="group-chip editing"/);
assert.match(
  renaming,
  /class="group-rename-input" type="text" maxlength="40" value="Familie"/
);
assert.match(renaming, /class="group-rename-save"/);
assert.match(renaming, /class="group-rename-cancel"/);
assert.doesNotMatch(renaming, /class="group-delete/);

// 9. The detail view lists the groups as removable chips and offers a new one.
const editor = groupsEditorHtml(
  { groups: ["Familie", "Backen"] },
  { entityId: "sensor.lasagne", groups: ["Familie", "Backen", "Nudeln"] },
  ["Familie", "Backen", "Nudeln"]
);
assert.match(editor, /class="group-chip"/);
assert.match(editor, /data-group="Familie"/);
assert.match(editor, /class="group-add-button"/);
assert.match(editor, /<select class="group-select"/);
assert.match(editor, /<option value="Nudeln">Nudeln<\/option>/);
assert.doesNotMatch(editor, /<option value="Familie">/);
assert.doesNotMatch(editor, /<datalist/);
assert.match(editor, /class="group-new-button"/);

// 10. Printing and the bare sensor view get no group editor.
assert.equal(groupsEditorHtml({ groups: [] }, { forPrint: true }, []), "");
assert.equal(groupsEditorHtml({ groups: [] }, {}, []), "");

console.log("card_groups_test: 11 checks passed");
