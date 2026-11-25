/* Behaviour tests for planning a recipe from the recipe list in recipe-card.js.
 *
 * Covers the plan_recipe call, the replacement notice, the clear-day call,
 * the seven day chips and their escaping.
 *
 * Run with: node tests/card_plan_assign_test.js
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

const state = {
  calls: [],
  notifications: [],
  renders: 0,
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
  window: { customCards: [], localStorage: { getItem: () => null, setItem() {} } },
};

vm.runInContext(
  `${source}
this.RecipeBoxListCard = RecipeBoxListCard;
this.PLAN_HELPERS = { planDayStripHtml, dayChipLabel, shortDayLabel };`,
  vm.createContext(context)
);

const { RecipeBoxListCard } = context;
const { planDayStripHtml, dayChipLabel } = context.PLAN_HELPERS;

const isoDate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
const todayIso = isoDate(new Date());

const makeCard = () => {
  const card = new RecipeBoxListCard();
  card._hass = {
    callService: async (domain, service, data) => {
      state.calls.push({ domain, service, data });
    },
  };
  card._render = () => {
    state.renders += 1;
  };
  card.dispatchEvent = (event) => state.notifications.push(event.detail.message);
  return card;
};

const reset = () => {
  state.calls = [];
  state.notifications = [];
  state.renders = 0;
};

const run = async () => {
  // 1. A day chip plans the recipe for its date through the existing service.
  reset();
  const card = makeCard();
  await card._plan(todayIso, "sensor.lasagne");
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].service, "plan_recipe");
  assert.equal(state.calls[0].data.date, todayIso);
  assert.equal(state.calls[0].data.entity_id, "sensor.lasagne");
  assert.match(state.notifications[0], /^Für .+ eingeplant\.$/);
  assert.equal(state.renders, 1, "the list is rendered again");

  // 2. Replacing an occupied day says which recipe is replaced.
  reset();
  const replacing = makeCard();
  await replacing._plan(todayIso, "sensor.lasagne", { replaces: "Curry" });
  assert.match(state.notifications[0], /Curry ersetzt\.$/);
  assert.match(state.notifications[0], /^.+: Curry ersetzt\.$/);

  // 3. An empty entity clears the day instead of planning.
  reset();
  const clearing = makeCard();
  await clearing._plan(todayIso, "");
  assert.equal(state.calls[0].service, "clear_meal_plan");
  assert.equal(state.calls[0].data.date, todayIso);
  assert.match(state.notifications[0], /Tag geleert/);

  // 4. The strip offers all seven days and marks an occupied one.
  const planned = new Map([
    [todayIso, { date: todayIso, source_url: "https://example.org/sensor.lasagne" }],
  ]);
  const titles = new Map([["https://example.org/sensor.lasagne", "Lasagne"]]);
  const strip = planDayStripHtml("sensor.lasagne", planned, titles);
  assert.equal((strip.match(/<button class="day-chip/g) || []).length, 7);
  assert.match(strip, /class="day-chip day-chip-planned"[^>]*data-date="/);
  assert.match(strip, /data-replaces="Lasagne"/);
  assert.match(strip, /ersetzt Lasagne/);
  assert.match(strip, /data-entity="sensor.lasagne"/);

  // 5. Empty days carry no replacement text and no dot.
  const emptyStrip = planDayStripHtml("sensor.curry", new Map(), new Map());
  assert.equal((emptyStrip.match(/day-chip-planned/g) || []).length, 0);
  assert.equal((emptyStrip.match(/day-chip-dot/g) || []).length, 0);

  // 6. Chip labels stay short: weekday plus day of the month.
  const label = dayChipLabel(todayIso);
  assert.match(label, /^\w{2,3} \d{2}$/);

  // 7. Recipe titles are escaped inside the strip.
  const tricky = planDayStripHtml(
    "sensor.x",
    new Map([[todayIso, { date: todayIso, source_url: "https://example.org/x" }]]),
    new Map([["https://example.org/x", 'Käse "special"']])
  );
  assert.ok(tricky.includes("&quot;special&quot;"), "quotes are escaped");
  assert.ok(!tricky.includes('"special"'), "no raw quote reaches the markup");

  // 8. A failing service call is reported and still renders the list.
  reset();
  const failing = makeCard();
  failing._hass.callService = async () => {
    throw Object.assign(new Error("boom"), { code: "unknown" });
  };
  await failing._plan(todayIso, "sensor.lasagne");
  assert.match(state.notifications[0], /Wochenplan: boom/);
  assert.equal(state.renders, 1);

  console.log("card_plan_assign_test: 8 checks passed");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
