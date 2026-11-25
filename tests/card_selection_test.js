/* Behaviour tests for the multi-select list and the delete confirmation
 * dialog of recipe-card.js.
 *
 * Run with: node tests/card_selection_test.js
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
  renders: 0,
  timers: [],
  calls: [],
  notifications: [],
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
  setTimeout: (fn) => {
    state.timers.push(fn);
    return state.timers.length;
  },
  clearTimeout: () => {},
  window: { customCards: [], localStorage: { getItem: () => null, setItem() {} } },
};

vm.runInContext(
  `${source}
this.RecipeBoxListCard = RecipeBoxListCard;
this.SELECTION_HELPERS = {
  TABS,
  selectionBarHtml,
  deleteDialogHtml,
  groupsEditorHtml,
};`,
  vm.createContext(context)
);

const {
  TABS,
  selectionBarHtml,
  deleteDialogHtml,
  groupsEditorHtml,
} = context.SELECTION_HELPERS;

// 1. The data tab sits at the far right and the plan comes before it.
assert.deepEqual(
  [...TABS].map((tab) => tab.id),
  ["recipes", "plan", "data"]
);
assert.equal(TABS[TABS.length - 1].label(), "Daten", "labels follow the UI language");

// 2. The selection bar counts, offers groups and all three actions.
const bar = selectionBarHtml(3, ["Familie", "Backen"]);
assert.match(bar, /3 ausgewählt/);
assert.match(bar, /<option value="Familie">Familie<\/option>/);
assert.match(bar, /<option value="Backen">Backen<\/option>/);
assert.match(bar, /class="selection-assign"/);
assert.match(bar, /class="selection-remove"/);
assert.match(bar, /class="selection-delete"/);
assert.match(bar, /class="selection-cancel"/);
assert.match(selectionBarHtml(1, []), /Gruppe wählen/);

// 3. The confirmation dialog is only built with recipes to delete.
assert.equal(deleteDialogHtml([]), "");
assert.equal(deleteDialogHtml(null), "");
const single = deleteDialogHtml(["Lasagne"]);
assert.match(single, /Rezept löschen\?/);
assert.match(single, /„Lasagne“/);
assert.match(single, /class="dialog-confirm"/);
assert.match(single, /class="dialog-cancel"/);
const many = deleteDialogHtml(["A", "B", "C", "D", "E", "F"]);
assert.match(many, /6 Rezepte löschen\?/);
assert.match(many, /und 1 weitere/);

// 4. Existing groups are offered in a real select, not a datalist.
const editor = groupsEditorHtml(
  { groups: [] },
  { entityId: "sensor.a" },
  ["Familie"]
);
assert.match(editor, /<select class="group-select"/);
assert.match(editor, /<option value="Familie">Familie<\/option>/);
assert.match(editor, /class="group-new-button"/);
assert.doesNotMatch(editor, /<datalist/);

const makeCard = () => {
  const card = new context.RecipeBoxListCard();
  state.renders = 0;
  state.calls = [];
  state.notifications = [];
  state.timers = [];
  card._hass = {
    states: {
      "sensor.a": {
        entity_id: "sensor.a",
        attributes: {
          title: "A",
          groups: ["Alt"],
          source_url: "https://example.com/a",
          ingredients: ["1 Ei"],
        },
      },
      "sensor.b": {
        entity_id: "sensor.b",
        attributes: {
          title: "B",
          groups: [],
          source_url: "https://example.com/b",
          ingredients: ["1 Ei"],
        },
      },
    },
    callService: async (domain, service, data) => {
      state.calls.push({ domain, service, data });
    },
  };
  card._config = { entities: undefined, show_delete: true };
  card._render = () => {
    state.renders += 1;
  };
  card.dispatchEvent = (event) => state.notifications.push(event.detail.message);
  return card;
};

const run = async () => {
  // 5. A long press starts the selection, a second press is ignored then.
  const card = makeCard();
  card._startLongPress("sensor.a");
  assert.equal(card._selection.size, 0, "selection waits for the timer");
  state.timers[0]();
  assert.deepEqual([...card._selection], ["sensor.a"]);
  assert.equal(state.renders, 1);
  card._startLongPress("sensor.b");
  assert.equal(state.timers.length, 1, "no second long press in select mode");

  // 6. Tapping toggles recipes and clearing empties the set.
  card._toggleSelection("sensor.b");
  assert.deepEqual([...card._selection], ["sensor.a", "sensor.b"]);
  card._toggleSelection("sensor.a");
  assert.deepEqual([...card._selection], ["sensor.b"]);

  // 7. Marked recipes join the chosen group, existing groups stay.
  card._selection = new Set(["sensor.a", "sensor.b"]);
  await card._assignGroupToSelection("Familie");
  assert.equal(state.calls.length, 2);
  assert.equal(state.calls[0].service, "set_groups");
  assert.deepEqual([...state.calls[0].data.groups], ["Alt", "Familie"]);
  assert.deepEqual([...state.calls[1].data.groups], ["Familie"]);
  assert.equal(card._selection.size, 0, "selection is cleared after assigning");
  assert.match(state.notifications[0], /Familie: 2 Rezepte zugewiesen/);

  // 8. Deleting marked recipes asks first and then removes each one.
  const deleting = makeCard();
  deleting._selection = new Set(["sensor.a", "sensor.b"]);
  deleting._requestSelectionDelete();
  assert.deepEqual([...deleting._confirmDelete], ["sensor.a", "sensor.b"]);
  assert.deepEqual(
    [...deleting._deleteTitles(deleting._confirmDelete)],
    ["A", "B"]
  );
  await deleting._deleteConfirmed();
  assert.equal(state.calls.length, 2);
  assert.equal(state.calls[0].service, "remove_recipe");
  assert.equal(state.calls[0].data.entity_id, "sensor.a");
  assert.equal(state.calls[1].data.entity_id, "sensor.b");
  assert.equal(deleting._confirmDelete, null);
  assert.equal(deleting._selection.size, 0);
  assert.match(state.notifications[0], /2 Rezepte gelöscht/);

  // 9. Removing a group only touches recipes that have it.
  const removing = makeCard();
  removing._selection = new Set(["sensor.a", "sensor.b"]);
  await removing._removeGroupFromSelection("Alt");
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].service, "set_groups");
  assert.deepEqual([...state.calls[0].data.groups], []);
  assert.match(state.notifications[0], /Aus „Alt“ entfernt: 1 Rezept/);
  assert.equal(removing._selection.size, 0);

  // 10. Small finger movements keep the long press, a drag cancels it.
  const pressing = makeCard();
  pressing._startLongPress("sensor.a", { clientX: 10, clientY: 10 });
  assert.ok(pressing._longPressTimer, "the press timer is running");
  pressing._moveLongPress({ clientX: 14, clientY: 18 });
  assert.ok(pressing._longPressTimer, "a few pixels do not cancel the press");
  pressing._moveLongPress({ clientX: 10, clientY: 40 });
  assert.equal(pressing._longPressTimer, null, "scrolling cancels the press");

  // 11. Cancelling the dialog deletes nothing.
  const cancelled = makeCard();
  cancelled._confirmDelete = ["sensor.a"];
  cancelled._cancelDelete();
  assert.equal(cancelled._confirmDelete, null);
  assert.equal(state.calls.length, 0);

  console.log("card_selection_test: 11 checks passed");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
