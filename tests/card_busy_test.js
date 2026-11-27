/* Tests for the busy spinner on buttons.
 *
 * Every click is wrapped with bindBusyButton: the spinner appears after a
 * short delay, stays until the returned promise settles and the button
 * ignores further taps while the action runs.
 *
 * Run with: node tests/card_busy_test.js
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
  timers: [],
  cleared: [],
  clicks: 0,
  spinnerCss: source.includes("button.busy::before"),
};

const makeButton = () => ({
  classes: new Set(),
  attributes: {},
  listeners: {},
  classList: {
    add(name) {
      this._set.add(name);
    },
    remove(name) {
      this._set.delete(name);
    },
    contains(name) {
      return this._set.has(name);
    },
  },
  addEventListener(type, handler) {
    this.listeners[type] = handler;
  },
  setAttribute(name, value) {
    this.attributes[name] = value;
  },
  removeAttribute(name) {
    delete this.attributes[name];
  },
  fire() {
    return this.listeners.click();
  },
});

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
  document: { createElement: () => ({ style: {} }) },
  setTimeout: (callback, delay) => {
    state.timers.push({ callback, delay });
    return state.timers.length;
  },
  clearTimeout: (id) => {
    state.cleared.push(id);
  },
  window: { customCards: [] },
};

vm.runInContext(
  `${source}\nthis.bindBusyButton = bindBusyButton;\nthis.BUSY_DELAY_MS = BUSY_DELAY_MS;`,
  vm.createContext(context)
);

const makeButtonNode = () => {
  const button = makeButton();
  button.classList._set = button.classes;
  return button;
};

// The spinner styles exist and stop further taps.
assert.ok(state.spinnerCss, "spinner style is defined");
assert.ok(
  /button\.busy \{[^}]*pointer-events: none/.test(source),
  "busy buttons ignore further taps"
);
assert.equal(context.BUSY_DELAY_MS, 200);

// A quick, synchronous action never shows the spinner.
{
  const button = makeButtonNode();
  let calls = 0;
  context.bindBusyButton(button, () => {
    calls += 1;
  });
  button.fire();
  assert.equal(calls, 1);
  assert.equal(button.classes.has("busy"), false, "no spinner for quick taps");
  assert.equal(button.attributes["aria-busy"], undefined);
}

// A slow action shows the spinner only after the delay and hides it when done.
{
  state.timers = [];
  const button = makeButtonNode();
  let resolve;
  const pending = new Promise((done) => {
    resolve = done;
  });
  context.bindBusyButton(button, () => pending);

  button.fire();
  assert.equal(button.classes.has("busy"), false, "spinner waits for the delay");
  assert.equal(state.timers.length, 1);
  assert.equal(state.timers[0].delay, context.BUSY_DELAY_MS);

  state.timers[0].callback();
  assert.equal(button.classes.has("busy"), true, "spinner shows while waiting");
  assert.equal(button.attributes["aria-busy"], "true");

  resolve();
  return pending.then(() => {
    assert.equal(button.classes.has("busy"), false, "spinner hides when done");
    assert.equal(button.attributes["aria-busy"], undefined);

    // A second tap while the action runs is ignored.
    state.timers = [];
    const again = makeButtonNode();
    let calls = 0;
    let finishAgain;
    const slow = new Promise((done) => {
      finishAgain = done;
    });
    context.bindBusyButton(again, () => {
      calls += 1;
      return slow;
    });
    again.fire();
    again.fire();
    again.fire();
    assert.equal(calls, 1, "double taps are ignored while busy");
    state.timers.forEach((timer) => timer.callback());
    assert.equal(again.classes.has("busy"), true);
    finishAgain();
    return slow.then(() => {
      assert.equal(again.classes.has("busy"), false);
      console.log("card_busy_test: all checks passed");
    });
  });
}
