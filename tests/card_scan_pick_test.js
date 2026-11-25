/* Tests for choosing scan photos (Fotos wählen).
 *
 * The file input lives outside the card, so a re-render while the native
 * picker is open cannot drop the selection.
 *
 * Run with: node tests/card_scan_pick_test.js
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
  appended: 0,
  removed: 0,
  clicked: 0,
  timers: [],
  focusListeners: [],
  rendered: 0,
  preview: undefined,
  status: "",
  inputs: [],
};

const makeInput = () => {
  const input = {
    type: "",
    accept: "",
    multiple: false,
    style: {},
    files: [],
    parentNode: null,
    attributes: {},
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    click() {
      state.clicked += 1;
    },
    fire(type) {
      if (this.listeners[type]) this.listeners[type]();
    },
  };
  state.inputs.push(input);
  return input;
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
    createElement: () => makeInput(),
    body: {
      appendChild: (element) => {
        element.parentNode = context.document.body;
        state.appended += 1;
      },
      removeChild: (element) => {
        element.parentNode = null;
        state.removed += 1;
      },
    },
  },
  setTimeout: (fn) => {
    state.timers.push(fn);
    return state.timers.length;
  },
  clearTimeout: () => {},
  window: {
    customCards: [],
    addEventListener: (type, handler) => {
      if (type === "focus") state.focusListeners.push(handler);
    },
    removeEventListener: (type, handler) => {
      state.focusListeners = state.focusListeners.filter(
        (item) => item !== handler
      );
    },
  },
};

vm.runInContext(
  `${source}\nthis.RecipeBoxListCard = RecipeBoxListCard;\nthis.manualFormHtml = manualFormHtml;`,
  vm.createContext(context)
);

const flushTimers = () => {
  const pending = state.timers;
  state.timers = [];
  pending.forEach((fn) => fn());
};

const makeCard = () => {
  const card = new context.RecipeBoxListCard();
  card._renderOcrPages = () => {
    state.rendered += 1;
  };
  card._previewPhoto = (file) => {
    state.preview = file;
  };
  card._scanStatus = (message) => {
    state.status = message;
  };
  return card;
};

const reset = () => {
  state.appended = 0;
  state.removed = 0;
  state.clicked = 0;
  state.timers = [];
  state.focusListeners = [];
  state.rendered = 0;
  state.preview = undefined;
  state.status = "";
  state.inputs = [];
};

const run = () => {
  // 1. The form offers a real button instead of a file input inside the card.
  const form = context.manualFormHtml();
  assert.match(form, /<button class="scan-add scan-pick" type="button">/);
  assert.match(form, /Fotos wählen/);
  assert.doesNotMatch(form, /input class="ocr-input"/);
  assert.match(form, /<button class="ocr-run" type="button" disabled>/);

  // 2. The picker input is created outside the card and opens the dialog.
  reset();
  let card = makeCard();
  card._pickPhotos();
  assert.equal(state.appended, 1, "the input is attached to the document");
  assert.equal(state.clicked, 1, "the picker opens from the click");
  const input = state.inputs[0];
  assert.equal(input.type, "file");
  assert.equal(input.accept, "image/*");
  assert.equal(input.multiple, true);
  assert.equal(input.attributes["aria-hidden"], "true");
  assert.equal(state.focusListeners.length, 1, "a focus fallback is registered");

  // 3. A change event hands the chosen photos to the list and removes the
  //    temporary input again.
  const first = { name: "seite1.jpg", type: "image/jpeg" };
  input.files = [first];
  input.fire("change");
  assert.equal(card._ocrPages.length, 1);
  assert.equal(card._ocrPages[0], first);
  assert.equal(state.rendered, 1);
  assert.equal(state.preview, first);
  assert.match(state.status, /Fotos bereit\. „Text erkennen“/);
  assert.equal(state.removed, 1, "the temporary input is gone");
  assert.equal(state.focusListeners.length, 0);

  // 4. Choosing more photos appends them to the existing pages.
  reset();
  card = makeCard();
  card._ocrPages = [first];
  card._pickPhotos();
  const second = { name: "seite2.jpg", type: "image/jpeg" };
  state.inputs[0].files = [second];
  state.inputs[0].fire("change");
  assert.equal(card._ocrPages.length, 2);
  assert.equal(card._ocrPages[0], first);
  assert.equal(card._ocrPages[1], second);
  assert.equal(state.preview, first, "the first photo stays the recipe photo");

  // 5. Cancelling the picker adds nothing and cleans up.
  reset();
  card = makeCard();
  card._pickPhotos();
  state.inputs[0].fire("cancel");
  assert.equal(card._ocrPages.length, 0);
  assert.equal(state.rendered, 0);
  assert.equal(state.removed, 1);

  // 6. Webviews without a change event: the files are read when the window
  //    comes back.
  reset();
  card = makeCard();
  card._pickPhotos();
  const third = { name: "seite3.jpg", type: "image/jpeg" };
  state.inputs[0].files = [third];
  state.focusListeners[0]();
  flushTimers();
  assert.equal(card._ocrPages.length, 1);
  assert.equal(card._ocrPages[0], third);
  assert.equal(state.rendered, 1);

  console.log("card_scan_pick_test: 6 checks passed");
};

run();
