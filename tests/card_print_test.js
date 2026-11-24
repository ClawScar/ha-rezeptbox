/* Behaviour tests for the print (Drucken) flow of recipe-card.js.
 *
 * Run with: node tests/card_print_test.js
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
  written: "",
  prints: 0,
  framePrints: 0,
  windowPrints: 0,
  closed: false,
  removed: null,
  timers: [],
  popup: null,
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
    createElement(tag) {
      if (tag !== "iframe") throw new Error(`unexpected element: ${tag}`);
      const frame = {
        style: {},
        setAttribute() {},
        contentWindow: {
          document: {
            open() {},
            write(html) {
              state.written = html;
            },
            close() {},
            images: [],
          },
          focus() {},
          print() {
            state.framePrints += 1;
          },
        },
        parentNode: {
          removeChild(element) {
            state.removed = element;
          },
        },
      };
      return frame;
    },
    body: { appendChild() {} },
  },
  navigator: { maxTouchPoints: 0 },
  URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
  setTimeout: (fn, ms) => {
    state.timers.push({ fn, ms });
    return state.timers.length;
  },
  clearTimeout: () => {},
  window: {
    customCards: [],
    open: () => state.popup,
    print() {
      state.windowPrints += 1;
    },
  },
};

vm.runInContext(
  `${source}\nthis.openPrintWindow = openPrintWindow;
  this.printDocumentHtml = printDocumentHtml;`,
  vm.createContext(context)
);

const RECIPE = {
  attributes: {
    title: "Lasagne",
    servings: 4,
    ingredients: ["500 g Hackfleisch", "2 Zwiebeln"],
    instructions: ["Zwiebeln schälen und würfeln.", "Alles schichten."],
    tags: ["Ofen"],
  },
};

const makePopup = () => ({
  document: {
    images: [],
    open() {},
    write(html) {
      state.written = html;
    },
    close() {},
  },
  focus() {},
  print() {
    state.prints += 1;
  },
  close() {
    state.closed = true;
  },
  onafterprint: null,
});

const reset = () => {
  state.written = "";
  state.prints = 0;
  state.framePrints = 0;
  state.windowPrints = 0;
  state.closed = false;
  state.removed = null;
  state.timers = [];
  state.popup = null;
};

const nextTimer = () => {
  const timer = state.timers.shift();
  assert.ok(timer, "expected a scheduled print step");
  timer.fn();
  return timer;
};

// 1. The print document contains the recipe, but no controls.
const html = context.printDocumentHtml(
  RECIPE,
  { show_image: true, show_steps: true },
  new Set(["2 Zwiebeln"]),
  2
);
assert.match(html, /<title>Lasagne<\/title>/);
assert.match(html, /Hackfleisch/);
assert.match(html, /Zwiebeln schälen und würfeln/);
assert.match(html, /500 g Hackfleisch/);
assert.equal(/<button/.test(html), false, "print view has no buttons");
assert.equal(/class="footer"/.test(html), false, "print view has no footer");
assert.match(html, /@page/);

// 2. A new window is filled with the recipe and the print dialog follows once
//    the images are ready; the window is closed after printing.
reset();
state.popup = makePopup();
assert.equal(context.openPrintWindow(html), true);
assert.equal(state.written, html);
assert.equal(state.prints, 0, "the dialog waits for the readiness check");
const readinessCheck = state.timers.shift().fn;
readinessCheck();
assert.equal(state.prints, 1);
readinessCheck();
assert.equal(state.prints, 1, "the dialog is opened only once");
state.popup.onafterprint();
assert.equal(state.closed, true);

// 3. Pending images delay the dialog, a stalled image cannot block it forever.
reset();
state.popup = makePopup();
state.popup.document.images = [{ complete: false }];
context.openPrintWindow(html);
nextTimer();
assert.equal(state.prints, 0, "waits for the image");
state.popup.document.images[0].complete = true;
nextTimer();
assert.equal(state.prints, 1);

// 4. Without a popup the hidden iframe prints the same document.
reset();
assert.equal(context.openPrintWindow(html), true);
nextTimer();
assert.equal(state.framePrints, 1);
nextTimer();
assert.ok(state.removed, "the iframe is removed after printing");

// 5. When the iframe is unavailable the dashboard print is the last resort.
reset();
context.document.createElement = () => {
  throw new Error("no iframe support");
};
assert.equal(context.openPrintWindow(html), true);
assert.equal(state.windowPrints, 1);

console.log("card_print_test: 5 checks passed");
