/* Tests for choosing scan photos (Fotos wählen).
 *
 * The file input lives outside the card and is reused, so a re-render while
 * the native picker is open cannot drop the selection. Webviews that close
 * the picker without a change event are covered by a polling fallback.
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
  clicked: 0,
  timers: new Map(),
  timerId: 0,
  rendered: 0,
  preview: undefined,
  status: "",
  inputs: [],
  revoked: [],
};

const makeInput = () => {
  const input = {
    type: "",
    accept: "",
    multiple: false,
    value: "",
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
    },
  },
  setInterval: (fn) => {
    state.timerId += 1;
    state.timers.set(state.timerId, fn);
    return state.timerId;
  },
  clearInterval: (id) => state.timers.delete(id),
  URL: {
    createObjectURL: (file) => `blob:${file && file.name}`,
    revokeObjectURL: (url) => state.revoked.push(url),
  },
  setTimeout: () => 0,
  clearTimeout: () => {},
  window: { customCards: [], addEventListener() {}, removeEventListener() {} },
};

vm.runInContext(
  `${source}\nthis.RecipeBoxListCard = RecipeBoxListCard;\nthis.manualFormHtml = manualFormHtml;`,
  vm.createContext(context)
);

const tick = (times = 1) => {
  for (let index = 0; index < times; index += 1) {
    [...state.timers.values()].forEach((fn) => fn());
  }
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
  state.clicked = 0;
  state.timers = new Map();
  state.timerId = 0;
  state.rendered = 0;
  state.preview = undefined;
  state.status = "";
  state.inputs = [];
  state.revoked = [];
};

const run = () => {
  // 1. The form offers a real button instead of a file input inside the card.
  const form = context.manualFormHtml();
  assert.match(form, /<button class="scan-add scan-pick" type="button">/);
  assert.match(form, /Fotos wählen/);
  assert.doesNotMatch(form, /input class="ocr-input"/);
  assert.match(form, /<button class="ocr-run" type="button" disabled>/);

  // 2. The picker input is created outside the card, reused and opens the
  //    dialog from the click.
  reset();
  const card = makeCard();
  card._pickPhotos();
  assert.equal(state.appended, 1, "the input is attached to the document");
  assert.equal(state.clicked, 1, "the picker opens from the click");
  const input = state.inputs[0];
  assert.equal(input.type, "file");
  assert.equal(input.accept, "image/*");
  assert.equal(input.multiple, true);
  assert.equal(input.attributes["aria-hidden"], "true");
  card._pickPhotos();
  assert.equal(state.appended, 1, "the input is reused, not recreated");
  assert.equal(state.inputs.length, 1);
  assert.equal(state.clicked, 2);

  // 3. A change event hands the chosen photos to the list; the input stays
  //    in place, so the next selection works the same way.
  const first = { name: "seite1.jpg", type: "image/jpeg" };
  input.files = [first];
  input.fire("change");
  assert.equal(card._ocrPages.length, 1);
  assert.equal(card._ocrPages[0], first);
  assert.equal(state.rendered, 1);
  assert.equal(state.preview, first);
  assert.match(state.status, /Fotos bereit\. „Text erkennen“/);
  assert.equal(input.value, "");
  assert.equal(input.parentNode, context.document.body);

  // 4. Choosing more photos appends them; the first one stays the photo.
  const second = { name: "seite2.jpg", type: "image/jpeg" };
  card._pickPhotos();
  input.files = [second];
  input.fire("change");
  assert.equal(card._ocrPages.length, 2);
  assert.equal(card._ocrPages[1], second);
  assert.equal(state.preview, first);

  // 4b. The chosen pages are shown with a thumbnail preview; replacing the
  //     list releases the old preview URLs.
  reset();
  const thumbsCard = new context.RecipeBoxListCard();
  const list = { innerHTML: "" };
  thumbsCard.shadowRoot = {
    querySelector: (selector) => (selector === "ol.ocr-pages" ? list : null),
    querySelectorAll: () => [],
  };
  thumbsCard._addPhotos([{ name: "seite1.jpg", type: "image/jpeg" }]);
  assert.match(list.innerHTML, /class="ocr-page-thumb"/);
  assert.match(list.innerHTML, /src="blob:seite1.jpg"/);
  thumbsCard._addPhotos([{ name: "seite2.jpg", type: "image/jpeg" }]);
  assert.match(list.innerHTML, /src="blob:seite2.jpg"/);
  assert.deepEqual(state.revoked, ["blob:seite1.jpg"]);
  thumbsCard._ocrPages = [];
  thumbsCard._renderOcrPages();
  assert.deepEqual(state.revoked, [
    "blob:seite1.jpg",
    "blob:seite1.jpg",
    "blob:seite2.jpg",
  ]);
  assert.doesNotMatch(list.innerHTML, /ocr-page-thumb/);

  // 5. Webviews without a change event: the polling fallback reads the files.
  reset();
  const polling = makeCard();
  polling._pickPhotos();
  const pollInput = state.inputs[0];
  tick(2);
  assert.equal(polling._ocrPages.length, 0, "nothing before a selection");
  const third = { name: "seite3.jpg", type: "image/jpeg" };
  pollInput.files = [third];
  tick();
  assert.equal(polling._ocrPages.length, 1);
  assert.equal(polling._ocrPages[0], third);
  assert.equal(state.timers.size, 0, "polling stops after the selection");

  // 6. The fallback gives up after a while instead of polling forever and
  //    says so, instead of leaving the user without feedback.
  reset();
  const idle = makeCard();
  idle._pickPhotos();
  tick(41);
  assert.equal(state.timers.size, 0);
  assert.equal(idle._ocrPages.length, 0);
  assert.match(state.status, /kam nicht an/);

  console.log("card_scan_pick_test: 8 checks passed");
};

run();
