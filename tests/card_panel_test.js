/* Behaviour tests for the sidebar panel toolbar and its URL history.
 *
 * Run with: node tests/card_panel_test.js
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

const createdCards = [];
const historyCalls = [];
const events = [];

const node = () => ({
  textContent: "",
  children: [],
  listeners: {},
  addEventListener(type, handler) {
    (this.listeners[type] = this.listeners[type] || []).push(handler);
  },
  appendChild(child) {
    this.children.push(child);
    return child;
  },
});

const shadowRoot = () => {
  const nodes = {};
  return {
    innerHTML: "",
    querySelector(selector) {
      if (!nodes[selector]) nodes[selector] = node();
      return nodes[selector];
    },
  };
};

const context = {
  console: { info() {} },
  HTMLElement: class {
    constructor() {
      this.events = [];
      this.shadowRoot = null;
    }
    attachShadow() {
      this.shadowRoot = shadowRoot();
      return this.shadowRoot;
    }
    dispatchEvent(event) {
      this.events.push(event);
      return true;
    }
  },
  customElements: { get: () => undefined, define: () => {} },
  CustomEvent: class {
    constructor(type, init) {
      this.type = type;
      this.detail = init && init.detail;
      this.bubbles = Boolean(init && init.bubbles);
      this.composed = Boolean(init && init.composed);
    }
  },
  document: {
    createElement(name) {
      const card = {
        name,
        config: null,
        views: [],
        setConfig(config) {
          this.config = config;
        },
        applyView(view) {
          this.views.push(view);
        },
      };
      createdCards.push(card);
      return card;
    },
    body: { appendChild() {} },
  },
  navigator: { maxTouchPoints: 0 },
  setTimeout: () => 0,
  clearTimeout: () => {},
  window: {
    customCards: [],
    localStorage: { getItem: () => null, setItem() {} },
    location: { pathname: "/rezeptbox" },
    history: {
      state: null,
      pushState(state, title, url) {
        this.state = state;
        historyCalls.push({ type: "push", url, state });
      },
      replaceState(state, title, url) {
        this.state = state;
        historyCalls.push({ type: "replace", url, state });
      },
      back() {
        historyCalls.push({ type: "back" });
      },
    },
    listeners: {},
    addEventListener(type, handler) {
      (this.listeners[type] = this.listeners[type] || []).push(handler);
    },
    removeEventListener(type, handler) {
      this.listeners[type] = (this.listeners[type] || []).filter(
        (item) => item !== handler
      );
    },
    dispatchEvent(event) {
      events.push(event);
      return true;
    },
  },
};

vm.runInContext(
  `${source}
this.RecipeBoxPanel = RecipeBoxPanel;
this.RecipeBoxListCard = RecipeBoxListCard;
this.VIEW = { viewPath, viewFromPath };`,
  vm.createContext(context)
);

const { RecipeBoxPanel, RecipeBoxListCard, VIEW } = context;
const settings = { url_path: "rezeptbox", title: "Rezeptbox" };

const freshPanel = () => {
  const panel = new RecipeBoxPanel();
  panel.panel = settings;
  panel.hass = { states: {} };
  return { panel, card: createdCards[createdCards.length - 1] };
};

// 1. Tabs map to URLs; the recipe tab has no suffix.
assert.equal(VIEW.viewPath("/rezeptbox", { tab: "recipes" }), "/rezeptbox");
assert.equal(VIEW.viewPath("/rezeptbox", { tab: "plan" }), "/rezeptbox/plan");
assert.equal(VIEW.viewPath("/rezeptbox", { tab: "data" }), "/rezeptbox/data");
assert.equal(VIEW.viewPath("/rezeptbox/", { tab: "data" }), "/rezeptbox/data");

// 2. An open recipe lives under /recipe/ with an encoded entity id.
assert.equal(
  VIEW.viewPath("/rezeptbox", { tab: "recipes", selected: "sensor.käse" }),
  "/rezeptbox/recipe/sensor.k%C3%A4se"
);

// 3. URLs map back to a view.
const same = (actual, expected) =>
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
same(VIEW.viewFromPath(""), { tab: "recipes", selected: null });
same(VIEW.viewFromPath("/plan"), { tab: "plan", selected: null });
same(VIEW.viewFromPath("/data/"), { tab: "data", selected: null });
same(VIEW.viewFromPath("/recipe/sensor.lasagne"), {
  tab: "recipes",
  selected: "sensor.lasagne",
});
assert.equal(
  VIEW.viewFromPath("/recipe/sensor.k%C3%A4se").selected,
  "sensor.käse"
);
same(VIEW.viewFromPath("/unbekannt"), {
  tab: "recipes",
  selected: null,
});

// 4. The panel brings its own toolbar with the sidebar menu button.
const { panel } = freshPanel();
const markup = panel.shadowRoot.innerHTML;
assert.match(markup, /class="menu"/);
assert.match(markup, /aria-label="Menü"/);
assert.match(markup, />Rezeptbox</);
assert.match(markup, /hamburger|d="M3 6h18v2/);

// 5. The menu button opens Home Assistant's sidebar.
const menu = panel.shadowRoot.querySelector("button.menu");
menu.listeners.click[0]();
const toggle = panel.events.find((event) => event.type === "hass-toggle-menu");
assert.ok(toggle, "the button dispatches hass-toggle-menu");
assert.equal(toggle.bubbles, true);
assert.equal(toggle.composed, true);

// 6. The card is configured to report navigation back to the panel.
const second = freshPanel();
assert.equal(second.card.name, "recipe-box-list");
assert.equal(typeof second.card.config.navigate, "function");
assert.equal(typeof second.card.config.goBack, "function");

// 7. A route selects tab and recipe on the card.
second.panel.route = { path: "/plan" };
same(second.card.views[second.card.views.length - 1], {
  tab: "plan",
  selected: null,
});
second.panel.route = { path: "/recipe/sensor.lasagne" };
same(second.card.views[second.card.views.length - 1], {
  tab: "recipes",
  selected: "sensor.lasagne",
});

// 8. Navigating pushes a history entry and asks Home Assistant to re-route.
events.length = 0;
historyCalls.length = 0;
context.window.location.pathname = "/rezeptbox";
context.window.history.state = null;
second.card.config.navigate({ tab: "data", selected: null });
const pushed = historyCalls[historyCalls.length - 1];
assert.equal(pushed.type, "push");
assert.equal(pushed.url, "/rezeptbox/data");
assert.equal(pushed.state.from, "/rezeptbox");
assert.equal(events[events.length - 1].type, "location-changed");

// 9. The same URL is not pushed twice.
context.window.location.pathname = "/rezeptbox/data";
const before = historyCalls.length;
second.card.config.navigate({ tab: "data", selected: null });
assert.equal(historyCalls.length, before);

// 10. Back steps one history entry back, not out of the page.
context.window.history.state = { from: "/rezeptbox" };
second.card.config.goBack();
assert.equal(historyCalls[historyCalls.length - 1].type, "back");

// 11. Without an entry of its own, back replaces the URL with the list.
context.window.history.state = null;
second.card.config.goBack();
assert.equal(historyCalls[historyCalls.length - 1].type, "replace");
assert.equal(historyCalls[historyCalls.length - 1].url, "/rezeptbox");

// 12. The card applies a view and re-renders only when something changed.
const list = Object.create(RecipeBoxListCard.prototype);
list._config = { entities: undefined, navigate() {} };
list._tab = "recipes";
list._selected = null;
list._signature = "old";
let renders = 0;
list._render = () => {
  renders += 1;
};
list.applyView({ tab: "plan", selected: null });
assert.equal(list._tab, "plan");
assert.equal(renders, 1);
list.applyView({ tab: "plan", selected: null });
assert.equal(renders, 1);
list.applyView({ tab: "unbekannt", selected: "sensor.x" });
assert.equal(list._tab, "recipes");
assert.equal(list._selected, "sensor.x");
assert.equal(renders, 2);

// 13. Card actions report the view that the panel should put in the URL.
const reported = [];
list._config.navigate = (view) => reported.push(view);
list._viewChanged({ tab: "data", selected: null });
same(reported[reported.length - 1], { tab: "data", selected: null });

// 13b. Editing opens its own dialog: it neither switches the tab nor reports
// a view, so the panel's URL cannot put the open recipe back over the form.
const editing = Object.create(RecipeBoxListCard.prototype);
const editViews = [];
editing._config = { entities: undefined, navigate: (view) => editViews.push(view) };
editing._hass = { states: {} };
editing._tab = "recipes";
editing._selected = "sensor.schnitzel";
editing._recipes = () => [
  {
    entityId: "sensor.schnitzel",
    state: {
      attributes: {
        title: "Schnitzel",
        ingredients: ["Fleisch"],
        instructions: ["Braten"],
        source_url: "manual://schnitzel",
      },
    },
  },
];
editing._render = () => {};
editing._startEdit("manual://schnitzel");
assert.equal(editing._edit.title, "Schnitzel");
assert.equal(editing._tab, "recipes");
assert.equal(editing._selected, "sensor.schnitzel");
assert.equal(editViews.length, 0);
editing._cancelEdit();
assert.equal(editing._edit, null);
assert.equal(editing._tab, "recipes");
assert.equal(editViews.length, 0);

// 13c. The dialog is part of the rendered HTML: a ShadowRoot is a
// DocumentFragment and has no insertAdjacentHTML, so the markup goes into
// both view templates instead.
const mounted = Object.create(RecipeBoxListCard.prototype);
mounted._edit = { title: "Schnitzel", ingredients: ["Fleisch"] };
mounted._ocrPages = [];
mounted._aiRead = false;
const dialogHtml = mounted._editDialogHtml();
assert.match(dialogHtml, /dialog-backdrop edit-backdrop/);
assert.match(dialogHtml, /dialog edit-dialog/);
assert.match(dialogHtml, /manual-title/);
assert.match(dialogHtml, /Rezept bearbeiten/);
assert.equal(
  (source.match(/\$\{this\._editDialogHtml\(\)\}/g) || []).length,
  2,
  "detail and list render the edit dialog"
);
assert.equal(mounted._bindEditDialog(), undefined);
mounted.shadowRoot = { querySelector: () => null };
assert.equal(mounted._bindEditDialog(), undefined);
mounted._edit = null;
assert.equal(mounted._editDialogHtml(), "");

// 13d. While the dialog is open the card behind it holds still, so an incoming
// state update cannot replace the dialog and wipe the typed fields.
const frozen = Object.create(RecipeBoxListCard.prototype);
frozen._edit = { title: "Schnitzel" };
frozen._selected = null;
frozen._recipes = () => [];
let frozenRenders = 0;
frozen._renderList = () => {
  frozenRenders += 1;
};
frozen.shadowRoot = { querySelector: () => ({}) };
frozen._render();
assert.equal(frozenRenders, 0);

// 14. Without a panel the card applies views itself and does no URL work.
const plain = Object.create(RecipeBoxListCard.prototype);
plain._config = {};
plain._signature = null;
let plainRenders = 0;
plain._render = () => {
  plainRenders += 1;
};
plain._viewChanged({ tab: "data", selected: null });
assert.equal(plain._tab, undefined, "without navigate nothing is reported");
plain.applyView({ tab: "plan", selected: null });
assert.equal(plain._tab, "plan");
assert.equal(plainRenders, 1);

// 15. The bar only shows where the app has no sidebar toggle next to it.
const phone = freshPanel();
assert.equal(phone.panel._toolbar.hidden, false, "shown while narrow is unknown");
phone.panel.narrow = true;
assert.equal(phone.panel._toolbar.hidden, false);
phone.panel.narrow = false;
assert.equal(phone.panel._toolbar.hidden, true, "hidden next to a docked sidebar");
phone.panel.hass = { states: {}, dockedSidebar: "always_hidden" };
assert.equal(phone.panel._toolbar.hidden, false, "always_hidden needs the bar");

console.log("card_panel_test: 15 checks passed");
