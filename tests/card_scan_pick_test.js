/* Tests for choosing scan photos (Fotos wählen).
 *
 * The file input lives inside the form as part of a label: Android webviews
 * only open the photo picker for a tapped input in the page, not for a hidden
 * input that script clicks. The listener sits on the input itself, so a
 * re-render while the picker is open cannot lose the chosen files.
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
  rendered: 0,
  preview: undefined,
  status: "",
  revoked: [],
};

const makeInput = () => ({
  type: "",
  accept: "",
  multiple: false,
  value: "",
  files: [],
  attributes: {},
  listeners: {},
  addEventListener(type, handler) {
    this.listeners[type] = handler;
  },
  fire(type) {
    if (this.listeners[type]) this.listeners[type]();
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
  document: { createElement: () => makeInput() },
  URL: {
    createObjectURL: (file) => `blob:${file && file.name}`,
    revokeObjectURL: (url) => state.revoked.push(url),
  },
  setTimeout: () => 0,
  clearTimeout: () => {},
  window: { customCards: [] },
};

vm.runInContext(
  `${source}\nthis.RecipeBoxListCard = RecipeBoxListCard;\nthis.manualFormHtml = manualFormHtml;`,
  vm.createContext(context)
);

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
  state.rendered = 0;
  state.preview = undefined;
  state.status = "";
  state.revoked = [];
};

const run = () => {
  // 1. The form offers a native file input in a label, not a scripted button.
  const form = context.manualFormHtml();
  assert.match(form, /<label class="scan-add scan-pick">/);
  assert.match(form, /<input class="scan-input" type="file" accept="image\/\*" multiple>/);
  assert.match(form, /Fotos wählen/);
  assert.doesNotMatch(form, /button class="scan-add/);
  assert.match(form, /<button class="ocr-run" type="button" disabled>/);

  // 2. The tap goes straight to the input, so Android opens the picker.
  reset();
  const card = makeCard();
  const input = makeInput();
  card._attachScanInput(input);
  const first = { name: "seite1.jpg", type: "image/jpeg" };
  input.files = [first];
  input.fire("change");
  assert.equal(card._ocrPages.length, 1);
  assert.equal(card._ocrPages[0], first);
  assert.equal(input.value, "", "the input is ready for the next pick");
  assert.equal(state.rendered, 1);
  assert.equal(state.preview, first);
  assert.match(state.status, /Fotos bereit\. „Text erkennen“/);

  // 3. A second pick appends; the first photo stays the recipe photo.
  const second = { name: "seite2.jpg", type: "image/jpeg" };
  input.files = [second];
  input.fire("change");
  assert.equal(card._ocrPages.length, 2);
  assert.equal(card._ocrPages[1], second);
  assert.equal(state.preview, first);

  // 4. Attaching twice does not add each photo twice.
  const before = card._ocrPages.length;
  card._attachScanInput(input);
  input.files = [second];
  input.fire("change");
  assert.equal(card._ocrPages.length, before + 1);

  // 5. Closing the picker without files changes nothing.
  const empty = makeInput();
  card._attachScanInput(empty);
  empty.files = [];
  empty.fire("change");
  assert.equal(card._ocrPages.length, 3);
  assert.equal(empty.value, "");

  // 6. The chosen pages are shown with a thumbnail preview; replacing the
  //    list releases the old preview URLs.
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

  console.log("card_scan_pick_test: 6 checks passed");
};

run();
