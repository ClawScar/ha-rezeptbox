/* Tests for choosing scan photos (Foto hinzufügen).
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
  flushes: 0,
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
  state.flushes = 0;
};

const run = () => {
  // 1. The form offers a native file input in a label, not a scripted button.
  const form = context.manualFormHtml();
  assert.match(form, /<label class="scan-add scan-pick">/);
  /* Android only hands the chosen file to a plain input: no photo filter,
   * no multiple selection. One picture per pick, further pages by tapping
   * again. */
  const scanInput = (form.match(/<input class="scan-input"[^>]*>/) || [""])[0];
  assert.match(scanInput, /type="file"/);
  assert.doesNotMatch(scanInput, /accept=/);
  assert.doesNotMatch(scanInput, /multiple/);
  assert.match(form, /Foto hinzufügen/);
  assert.match(form, /ein Bild pro Auswahl/);
  assert.doesNotMatch(form, /button class="scan-add/);
  assert.equal((form.match(/class="scan-input"/g) || []).length, 1);
  assert.match(form, /<button class="ocr-run" type="button" disabled>/);
  /* A desktop browser has no camera picker, so the button stays away. */
  assert.doesNotMatch(form, /Foto aufnehmen/);

  // 1b. On a touch device a second label opens the camera directly, and its
  //     photos go through the same scan input wiring.
  context.navigator = { maxTouchPoints: 5 };
  context.document.createElement = () => ({ ...makeInput(), capture: "" });
  const phoneForm = context.manualFormHtml();
  assert.match(phoneForm, /Foto aufnehmen/);
  const cameraInput = (
    phoneForm.match(/<input class="scan-input scan-camera"[^>]*>/) || [""]
  )[0];
  assert.match(cameraInput, /type="file"/);
  assert.match(cameraInput, /accept="image\/\*"/);
  assert.match(cameraInput, /capture="environment"/);
  assert.equal(
    (phoneForm.match(/class="scan-input/g) || []).length,
    2,
    "both labels feed the same scan list"
  );

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

  // 7. While the picker is open the card does not replace its DOM, so the
  //    Android webview keeps the chosen files attached to the input.
  reset();
  const holdCard = makeCard();
  holdCard.shadowRoot = {};
  const input2 = makeInput();
  holdCard._attachScanInput(input2);
  input2.fire("click");
  assert.ok(holdCard._picking > 0, "the picker is marked open");
  holdCard._render();
  assert.equal(holdCard._renderPending, true, "the render is postponed");
  assert.equal(holdCard.shadowRoot.innerHTML, undefined, "no DOM was replaced");

  // 8. When the files arrive, the postponed render runs and the photos are in
  //    the form.
  holdCard._render = () => {
    state.flushes += 1;
  };
  const arrival = { name: "seite1.jpg", type: "image/jpeg" };
  input2.files = [arrival];
  input2.fire("change");
  assert.equal(holdCard._picking, 0);
  assert.equal(holdCard._renderPending, false);
  assert.equal(state.flushes, 1, "the skipped render is applied");
  assert.equal(holdCard._ocrPages.length, 1);

  // 9. A dialog that closes without files says so.
  reset();
  const emptyCard = makeCard();
  const input3 = makeInput();
  emptyCard._attachScanInput(input3);
  input3.files = [];
  input3.fire("change");
  assert.match(state.status, /keine Dateien geliefert/);

  // 10. One picture per pick still fills the page list.
  reset();
  const singleCard = makeCard();
  const singleInput = makeInput();
  singleInput.type = "file";
  singleCard._attachScanInput(singleInput);
  const single = { name: "seite9.jpg", type: "image/jpeg" };
  singleInput.files = [single];
  singleInput.fire("change");
  assert.equal(singleCard._ocrPages.length, 1);
  assert.equal(singleCard._ocrPages[0], single);
  assert.equal(state.rendered, 1);

  console.log("card_scan_pick_test: 10 checks passed");
};

run();
