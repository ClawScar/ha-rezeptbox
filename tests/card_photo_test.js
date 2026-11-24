/* Tests for the optional photo on manually created recipes.
 *
 * Run with: node tests/card_photo_test.js
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

const state = { calls: [], uploads: [], notifications: [] };

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
    createElement: () => ({ style: {} }),
    body: { appendChild() {} },
  },
  FormData: class {
    constructor() {
      this.entries = [];
    }
    append(...args) {
      this.entries.push(args);
    }
  },
  setTimeout: () => 0,
  clearTimeout: () => {},
  window: { customCards: [], localStorage: { getItem: () => null, setItem() {} } },
};

vm.runInContext(
  `${source}
this.RecipeBoxListCard = RecipeBoxListCard;
this.PHOTO_HELPERS = { manualFormHtml };`,
  vm.createContext(context)
);

const { manualFormHtml } = context.PHOTO_HELPERS;

// 1. The manual form offers a photo picker with a preview and a remove button.
const form = manualFormHtml();
assert.match(form, /class="manual-photo" type="file" accept="image\/\*"/);
assert.match(form, /class="manual-photo-label"/);
assert.match(form, /class="manual-photo-preview"/);
assert.match(form, /class="manual-photo-remove"/);
assert.match(form, /Foto hinzufügen/);

const makeCard = () => {
  const card = new context.RecipeBoxListCard();
  state.calls = [];
  state.uploads = [];
  state.notifications = [];
  card._hass = {
    states: {},
    callService: async (domain, service, data) => {
      state.calls.push({ domain, service, data });
    },
    callApi: async (method, path, body) => {
      state.uploads.push({ method, path, form: body });
      return { id: "abc123" };
    },
  };
  card._config = {};
  card._render = () => {};
  card._rememberTab = () => {};
  card.dispatchEvent = (event) => state.notifications.push(event.detail.message);
  return card;
};

const formRoot = (photoFile) => {
  const fields = {
    "input.manual-title": { value: "Omas Kuchen" },
    "textarea.manual-ingredients": { value: "200 g Mehl\n3 Eier" },
    "textarea.manual-instructions": { value: "Alles verrühren und backen." },
    "input.manual-tags": { value: "Kuchen, Familie" },
    "input.manual-servings": { value: "8" },
    "input.manual-photo": { files: photoFile ? [photoFile] : [] },
    "button.manual-save": { disabled: false },
  };
  return { querySelector: (selector) => fields[selector] || null };
};

const run = async () => {
  // 2. The upload goes through Home Assistant's image upload and returns a URL.
  const uploading = makeCard();
  uploading._shrinkPhoto = async () => ({ size: 1, type: "image/jpeg" });
  const file = { name: "Omas Karte.JPG", size: 4096, type: "image/jpeg" };
  const url = await uploading._uploadPhoto(file);
  assert.equal(state.uploads.length, 1);
  assert.equal(state.uploads[0].method, "POST");
  assert.equal(state.uploads[0].path, "image/upload");
  assert.equal(state.uploads[0].form.entries.length, 1);
  assert.equal(state.uploads[0].form.entries[0][2], "Omas-Karte.jpg");
  assert.equal(url, "/api/image/serve/abc123/original");

  // 3. Saving a manual recipe forwards the uploaded photo as image_url.
  const saving = makeCard();
  saving.shadowRoot = formRoot(file);
  saving._shrinkPhoto = async () => ({ size: 1 });
  await saving._saveManual();
  assert.equal(state.uploads.length, 1);
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].service, "add_recipe");
  assert.equal(
    state.calls[0].data.image_url,
    "/api/image/serve/abc123/original"
  );
  assert.deepEqual([...state.calls[0].data.ingredients], ["200 g Mehl", "3 Eier"]);
  assert.match(state.notifications[0], /Rezept gespeichert: Omas Kuchen/);

  // 4. A failed upload aborts the save so the recipe is not stored silently.
  const failing = makeCard();
  failing.shadowRoot = formRoot(file);
  failing._hass.callApi = async () => {
    throw new Error("kaputt");
  };
  await failing._saveManual();
  assert.equal(state.calls.length, 0, "no recipe without its photo");
  assert.match(state.notifications[0], /Foto: kaputt/);
  assert.equal(failing.shadowRoot.querySelector("button.manual-save").disabled, false);

  // 5. Without a photo the recipe is saved exactly as before.
  const plain = makeCard();
  plain.shadowRoot = formRoot(null);
  await plain._saveManual();
  assert.equal(state.uploads.length, 0);
  assert.equal(state.calls.length, 1);
  assert.equal("image_url" in state.calls[0].data, false);

  // 6. Without a canvas the original file is uploaded untouched.
  const fallback = makeCard();
  assert.equal(await fallback._shrinkPhoto(file), file);

  // 7. Removing the photo clears the picker and hides the preview.
  const clearing = makeCard();
  let srcRemoved = false;
  const input = { value: "C:\\fakepath\\karte.jpg" };
  const preview = {
    hidden: false,
    querySelector: () => ({ removeAttribute: () => (srcRemoved = true) }),
  };
  clearing.shadowRoot = {
    querySelector: (selector) =>
      selector === "input.manual-photo"
        ? input
        : selector === ".manual-photo-preview"
          ? preview
          : null,
  };
  clearing._clearPhoto();
  assert.equal(input.value, "");
  assert.equal(preview.hidden, true);
  assert.equal(srcRemoved, true);

  console.log("card_photo_test: 7 checks passed");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
