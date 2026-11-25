/* Layout tests for the meal plan tab in recipe-card.js.
 *
 * Covers the "today" marker, empty days rendered as "+ Rezept", the
 * "X von 7 Tagen geplant" summary, the planned/empty select classes, the
 * wide-screen day grid, the full-width week shopping button, the recipe
 * thumbnails and the day picker in the recipe list.
 *
 * Run with: node tests/card_plan_test.js
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
  },
};

vm.runInContext(
  `${source}
this.RecipeBoxListCard = RecipeBoxListCard;
this.HELPERS = { weekDays, planHtml };`,
  vm.createContext(context)
);

const { RecipeBoxListCard, HELPERS } = context;

const count = (markup, needle) => markup.split(needle).length - 1;
const has = (markup, text, message) =>
  assert.ok(markup.includes(text), message || `missing ${JSON.stringify(text)}`);
const hasNot = (markup, text, message) =>
  assert.ok(
    !markup.includes(text),
    message || `unexpected ${JSON.stringify(text)}`
  );

const isoDate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
const today = new Date();
const todayIso = isoDate(today);
const inDays = (offset) =>
  isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset));

const recipeState = (id, title, image) => ({
  entity_id: id,
  attributes: {
    integration: "recipe_box",
    title,
    source_url: `https://example.org/${id}`,
    ingredients: ["2 Zwiebeln"],
    ...(image ? { image_url: image } : {}),
  },
});

const hassFor = (language, plan) => ({
  language,
  states: {
    "sensor.lasagne": recipeState(
      "sensor.lasagne",
      "Lasagne",
      "https://example.org/lasagne.jpg"
    ),
    "sensor.curry": recipeState("sensor.curry", "Curry"),
    "sensor.recipe_box": { entity_id: "sensor.recipe_box", attributes: { plan } },
  },
});

const planMarkup = (language, plan) => {
  const card = new RecipeBoxListCard();
  card.setConfig({});
  card._tab = "plan";
  card.hass = hassFor(language, plan);
  return card.shadowRoot.innerHTML;
};

const lasagne = {
  date: todayIso,
  title: "Lasagne",
  source_url: "https://example.org/sensor.lasagne",
  servings: 4,
};
const curry = {
  date: inDays(3),
  title: "Curry",
  source_url: "https://example.org/sensor.curry",
};

// 1. weekDays() returns seven consecutive days and only the first is today.
const days = HELPERS.weekDays();
assert.equal(days.length, 7);
assert.equal(days[0].iso, todayIso);
assert.equal(days[0].isToday, true);
assert.equal(days[6].iso, inDays(6));
assert.equal(
  days.map((day) => day.isToday).join(","),
  "true,false,false,false,false,false,false"
);

// 2. The header counts the planned days of the visible week.
const german = planMarkup("de", [lasagne]);
has(german, "1 von 7 Tagen geplant");
hasNot(german, "0 von 7 Tagen geplant");
has(planMarkup("de", []), "0 von 7 Tagen geplant");

// 3. Today is marked with a badge and a highlighted row.
has(german, 'class="plan-row plan-row-today');
has(german, ">Heute<");

// 4. The planned day carries the planned select, the others stay empty.
assert.equal(count(german, 'class="plan-select plan-select-planned"'), 1);
assert.equal(count(german, 'class="plan-select plan-select-empty"'), 6);
assert.equal(count(german, 'class="plan-row'), 7);
assert.equal(count(german, 'class="plan-row plan-row-today'), 1);
assert.equal(count(german, "plan-row-planned"), 1);
assert.equal(count(german, "plan-row-empty"), 6);
has(german, "selected>Lasagne</option>");
assert.equal(count(german, "+ Rezept"), 7, "every select offers + Rezept");
hasNot(german, ">—</option>", "the old dash placeholder is gone");

// 5. Only the planned day offers the clear button.
assert.equal(count(german, 'class="plan-clear"'), 1);
has(german, `data-date="${todayIso}"`);

// 6. Entries outside the week or without a matching recipe are not counted.
const stale = planMarkup("de", [
  lasagne,
  {
    date: inDays(30),
    title: "Alt",
    source_url: "https://example.org/sensor.lasagne",
  },
  { date: inDays(2), title: "Weg", source_url: "https://example.org/deleted" },
]);
has(stale, "1 von 7 Tagen geplant", "only the visible, existing recipe counts");
assert.equal(count(stale, 'class="plan-select plan-select-planned"'), 1);
assert.equal(count(stale, 'class="plan-select plan-select-empty"'), 6);
assert.equal(count(stale, "plan-row-empty"), 6);
assert.equal(
  count(stale, 'class="plan-clear"'),
  2,
  "today and the day with the unknown recipe can both be cleared"
);

// 7. English Home Assistant gets English plan strings.
const english = planMarkup("en", [lasagne]);
has(english, "1 of 7 days planned");
has(english, ">Today<");
has(english, "+ Recipe");
hasNot(english, "von 7 Tagen geplant");

// 8. Two planned days count twice and keep their own selection.
const two = planMarkup("de", [lasagne, curry]);
has(two, "2 von 7 Tagen geplant");
assert.equal(count(two, 'class="plan-select plan-select-planned"'), 2);
assert.equal(count(two, 'class="plan-select plan-select-empty"'), 5);
assert.equal(count(two, 'class="plan-clear"'), 2);

// 9. Wide screens turn the seven stacked rows into an adaptive day grid.
has(german, ".plan-body { display: grid;", "the plan body is a grid");
has(german, "grid-template-columns: minmax(0, 1fr);", "phones keep one column");
has(german, "@media (min-width: 700px)", "the grid starts on wide screens");
has(
  german,
  "grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));",
  "wide screens fill a row with day cards"
);
has(
  german,
  'grid-template-areas: "day day clear" "thumb select select";',
  "phones put the photo beside the recipe field"
);
has(
  german,
  'grid-template-areas: "day day" "thumb select";',
  "wide cards put the photo beside the recipe field as well"
);
has(german, ".plan-row-picture .plan-select { min-height: 44px; }");
has(german, ".plan-row-clearable .plan-day { padding-right: 34px; }");

// 10. Rows with a plan entry are flagged so a card can reserve room for the ✕.
assert.equal(count(german, 'plan-row-clearable">'), 1);
assert.equal(count(stale, 'plan-row-clearable">'), 2);
assert.equal(
  count(stale, 'plan-row-clearable">'),
  count(stale, 'class="plan-clear"'),
  "every clear button sits in a clearable row"
);

// 11. The week button fills the phone width and shrinks next to the grid.
has(german, "button.week-shopping { grid-column: 1 / -1; width: 100%;");
has(
  german,
  "button.week-shopping { width: auto; min-width: 260px; justify-self: start; }"
);
has(german, 'class="week-shopping" type="button"');
has(
  english,
  'class="week-shopping" type="button"',
  "English offers the week button as well"
);

// 12. Planned days show the recipe photo, a chef hat or an empty tile.
has(german, 'class="plan-thumb" src="https://example.org/lasagne.jpg"');
assert.equal(count(german, 'class="plan-thumb'), 7, "every day keeps a tile");
assert.equal(
  count(german, 'class="plan-thumb plan-thumb-placeholder plan-thumb-empty"'),
  6,
  "six days are still empty"
);
assert.equal(count(german, "mdi:calendar-blank-outline"), 6);
has(two, "mdi:chef-hat", "a planned recipe without a photo gets the chef hat");
assert.equal(
  count(two, 'class="plan-thumb plan-thumb-placeholder plan-thumb-empty"'),
  5
);
assert.equal(count(two, 'class="plan-thumb'), 7);

const withoutImages = new RecipeBoxListCard();
withoutImages.setConfig({ show_image: false });
withoutImages._tab = "plan";
withoutImages.hass = hassFor("de", [lasagne]);
hasNot(withoutImages.shadowRoot.innerHTML, 'class="plan-thumb');
hasNot(withoutImages.shadowRoot.innerHTML, 'plan-row-picture"');

// 13. Each recipe row offers a day picker with the next seven days.
const listCard = new RecipeBoxListCard();
listCard.setConfig({});
listCard.hass = hassFor("de", [lasagne]);
const listEntries = listCard._recipes();
let list = listCard.shadowRoot.innerHTML;
assert.equal(count(list, 'class="plan-add'), 2, "one calendar button per recipe");
assert.equal(
  count(list, 'class="plan-add plan-add-planned"'),
  1,
  "the already planned recipe marks its calendar button"
);
has(list, 'aria-expanded="false"');
has(list, 'title="Einem Tag zuordnen"');
hasNot(list, 'class="day-strip"', "the strip stays closed until tapped");

listCard._planPicker = "sensor.lasagne";
listCard._renderList(listEntries);
list = listCard.shadowRoot.innerHTML;
has(list, 'class="day-strip"');
has(list, 'role="group" aria-label="Tag wählen"');
has(list, 'aria-expanded="true"');
assert.equal(
  count(list, '<button class="day-chip'),
  7,
  "the strip lists seven days"
);
has(list, "day-chip day-chip-planned");
has(list, 'data-replaces="Lasagne"', "a planned day names what it replaces");
has(list, 'title="Für ');

const englishList = new RecipeBoxListCard();
englishList.setConfig({});
englishList.hass = hassFor("en", []);
englishList._planPicker = "sensor.lasagne";
englishList._renderList(englishList._recipes());
const englishPicker = englishList.shadowRoot.innerHTML;
has(englishPicker, 'title="Assign to a day"');
has(englishPicker, 'aria-label="Choose a day"');
has(englishPicker, 'title="Plan for ');

console.log("card_plan_test: 13 checks passed");
