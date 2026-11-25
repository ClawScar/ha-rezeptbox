/* Tests for the browsable meal plan window and free-text days.
 *
 * Covers week offsets, the week range label, recipes and notes in the plan,
 * the cleanup hint for past days, the planned days shown at a recipe row and
 * the week shopping list staying inside the visible window.
 *
 * Run with: node tests/card_plan_window_test.js
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
  window: { customCards: [], localStorage: { getItem: () => null, setItem() {} } },
};

vm.runInContext(
  `${source}
this.RecipeBoxListCard = RecipeBoxListCard;
this.HELPERS = {
  weekDays,
  planRangeLabel,
  planHtml,
  planCallData,
  planNotice,
  planOffsetBounds,
  stepPlanOffset,
  upcomingPlanDates,
  dayChipLabel,
  recipeEntities,
};`,
  vm.createContext(context)
);

const { RecipeBoxListCard, HELPERS } = context;

const count = (markup, needle) => markup.split(needle).length - 1;
const has = (markup, text, message) =>
  assert.ok(markup.includes(text), message || `missing ${JSON.stringify(text)}`);

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

const hassFor = (plan) => ({
  language: "de",
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

const lasagne = {
  date: todayIso,
  title: "Lasagne",
  source_url: "https://example.org/sensor.lasagne",
  servings: 4,
};
const curry = {
  date: inDays(2),
  title: "Curry",
  source_url: "https://example.org/sensor.curry",
};
const note = {
  date: inDays(1),
  title: "Reste",
  label: "Reste",
  source_url: "",
  servings: null,
};
const away = {
  date: inDays(3),
  title: "Auswärts",
  label: "Auswärts",
  source_url: "",
  servings: null,
};

const markupFor = (plan, offset = 0) => {
  const hass = hassFor(plan);
  return HELPERS.planHtml(hass, HELPERS.recipeEntities(hass, null), {}, offset);
};

// 1. weekDays() starts at the requested offset and keeps "today" only there.
const next = HELPERS.weekDays(7, 7);
assert.equal(next.length, 7);
assert.equal(next[0].iso, inDays(7));
assert.equal(next[6].iso, inDays(13));
assert.equal(next.some((day) => day.isToday), false);
assert.equal(HELPERS.weekDays(7, 0)[0].isToday, true);

// 2. The range label names the first and last day of the window.
const range = HELPERS.planRangeLabel(0);
assert.ok(range.includes("."), "the range uses day.month labels");
assert.ok(range.includes("–"), "the range is joined with a dash");
assert.notEqual(range, HELPERS.planRangeLabel(7));

// 3. The plan window counts only its own seven days.
const first = markupFor([lasagne]);
has(first, "1 von 7 Tagen geplant");
has(markupFor([lasagne], 7), "0 von 7 Tagen geplant");
has(markupFor([{ ...lasagne, date: inDays(8) }], 7), "1 von 7 Tagen geplant");
assert.equal(count(first, 'class="plan-row'), 7, "the window always has seven rows");
assert.equal(count(first, "plan-row-today"), 1, "today is only marked in its own week");
assert.equal(
  count(markupFor([lasagne], 7), "plan-row-today"),
  0,
  "other weeks carry no today marker"
);

// 4. The arrows and the range are part of the plan header.
has(first, 'class="plan-prev"');
has(first, 'class="plan-next"');
assert.equal(count(first, "plan-today-button"), 0, "no today button on the current week");
assert.equal(
  count(markupFor([lasagne], 7), "plan-today-button"),
  1,
  "other weeks offer a way back to today"
);
has(first, 'class="plan-head"');

// 5. Past days are offered for cleanup instead of landing on the list.
const past = markupFor([{ ...lasagne, date: inDays(-2) }]);
has(past, "1 vergangener Tag im Plan");
has(past, 'class="plan-prune"');
has(markupFor([lasagne]), "1 von 7 Tagen geplant");
assert.equal(count(markupFor([lasagne]), "plan-prune"), 0, "no cleanup hint without past days");
has(markupFor([{ ...lasagne, date: inDays(-2) }], 7), "1 vergangener Tag im Plan");

// 6. A free-text day renders as a planned day without a recipe.
const leftovers = markupFor([note]);
has(leftovers, "1 von 7 Tagen geplant");
has(leftovers, "plan-row-note");
has(leftovers, 'class="plan-select plan-select-planned"');
has(leftovers, 'value="note:leftovers" selected>Reste</option>');
has(leftovers, "plan-thumb-note");
has(leftovers, "mdi:recycle");
has(leftovers, 'class="plan-clear"');
has(leftovers, 'label="Ohne Rezept"');

// 7. Eating out is the second free-text option and stays a planned day.
const awayMarkup = markupFor([away]);
has(awayMarkup, 'value="note:away" selected>Auswärts</option>');
has(awayMarkup, "mdi:silverware-fork-knife");
has(awayMarkup, "1 von 7 Tagen geplant");

// 8. The select always offers both notes as an extra group.
has(first, "<optgroup");
has(first, 'value="note:leftovers"');
has(first, 'value="note:away"');
has(first, ">Reste</option>");
has(first, ">Auswärts</option>");

// 9. Planning a note uses plan_recipe with a label instead of an entity.
assert.equal(
  JSON.stringify(HELPERS.planCallData(todayIso, "note:leftovers")),
  JSON.stringify({
    service: "plan_recipe",
    data: { date: todayIso, label: "Reste" },
  })
);
assert.equal(
  JSON.stringify(HELPERS.planCallData(todayIso, "sensor.lasagne")),
  JSON.stringify({
    service: "plan_recipe",
    data: { date: todayIso, entity_id: "sensor.lasagne" },
  })
);
assert.equal(
  JSON.stringify(HELPERS.planCallData(todayIso, "")),
  JSON.stringify({ service: "clear_meal_plan", data: { date: todayIso } })
);
assert.match(HELPERS.planNotice(todayIso, "note:away"), /Auswärts eingetragen\.$/);
assert.match(HELPERS.planNotice(todayIso, "sensor.lasagne"), /^Für .+ eingeplant\.$/);
assert.equal(HELPERS.planNotice(todayIso, ""), "Tag geleert.");

// 10. The recipe row knows the upcoming days it is planned for.
assert.deepEqual(
  [...HELPERS.upcomingPlanDates(hassFor([lasagne]), lasagne.source_url)],
  [HELPERS.dayChipLabel(todayIso)]
);
const planned = HELPERS.upcomingPlanDates(
  hassFor([
    lasagne,
    curry,
    { ...lasagne, date: inDays(4) },
    { ...lasagne, date: inDays(-3) },
  ]),
  lasagne.source_url
);
assert.deepEqual(
  [...planned],
  [HELPERS.dayChipLabel(todayIso), HELPERS.dayChipLabel(inDays(4))],
  "past days and other recipes stay out"
);
assert.equal(
  HELPERS.upcomingPlanDates(hassFor([note]), note.source_url).length,
  0,
  "free-text days belong to no recipe"
);
assert.equal(
  HELPERS.upcomingPlanDates(
    hassFor([
      { ...lasagne, date: inDays(1) },
      { ...lasagne, date: inDays(2) },
      { ...lasagne, date: inDays(3) },
      { ...lasagne, date: inDays(4) },
    ]),
    lasagne.source_url
  ).at(-1),
  "+1",
  "more than three days are summarised"
);

// 11. Browsing back is limited to the oldest planned day.
const bounds = HELPERS.planOffsetBounds([{ date: inDays(-10) }]);
assert.equal(bounds.min, -14);
assert.equal(HELPERS.stepPlanOffset(0, -7, [{ date: inDays(-10) }]), -7);
assert.equal(HELPERS.stepPlanOffset(-14, -7, [{ date: inDays(-10) }]), -14);
assert.equal(HELPERS.stepPlanOffset(0, 7, []), 7);
assert.equal(HELPERS.stepPlanOffset(84, 7, []), 84);
assert.equal(HELPERS.stepPlanOffset(0, -7, []), 0, "no past days, no scrolling back");

// 12. Week shopping takes only recipes of the visible window.
const calls = [];
const shoppingHass = {
  ...hassFor([lasagne, curry, note, { ...lasagne, date: inDays(20) }]),
  callService: async (domain, service, data) => {
    calls.push({ domain, service, data });
  },
};
const shoppingCard = new RecipeBoxListCard();
shoppingCard.setConfig({});
shoppingCard._hass = shoppingHass;
shoppingCard.dispatchEvent = () => true;

const runShopping = async (offset) => {
  calls.length = 0;
  shoppingCard._planOffset = offset;
  await shoppingCard._weekShopping();
  return calls.map((call) => call.data.entity_id);
};

const main = async () => {
  assert.deepEqual(await runShopping(0), ["sensor.lasagne", "sensor.curry"]);
  assert.deepEqual(await runShopping(7), []);
  assert.deepEqual(
    await runShopping(14),
    ["sensor.lasagne"],
    "the recipe two weeks ahead counts only in its own window"
  );
  assert.ok(
    calls.every((call) => call.service === "add_to_shopping_list"),
    "every week entry goes through the shopping service"
  );
  assert.ok(
    calls.every((call) => call.data.entity_id !== undefined),
    "free-text days never reach the shopping list"
  );

  // 13. Cleanup removes only past days.
  const pruned = [];
  shoppingCard._hass = {
    ...shoppingHass,
    states: hassFor([lasagne, { ...lasagne, date: inDays(-2) }, note]).states,
    callService: async (domain, service, data) => {
      pruned.push({ service, data });
    },
  };
  shoppingCard._render = () => {};
  await shoppingCard._prunePlan();
  assert.equal(pruned.length, 1, "one past day is cleared");
  assert.equal(pruned[0].service, "clear_meal_plan");
  assert.equal(pruned[0].data.date, inDays(-2));

  console.log("card_plan_window_test: 13 checks passed");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
