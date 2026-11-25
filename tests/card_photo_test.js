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

const state = { calls: [], uploads: [], notifications: [], ws: [] };

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
  Blob: class {
    constructor(parts, options) {
      this.parts = parts;
      this.type = (options && options.type) || "";
      this.size = 1;
    }
  },
  setTimeout: () => 0,
  clearTimeout: () => {},
  atob: (value) => Buffer.from(String(value), "base64").toString("binary"),
  window: { customCards: [], localStorage: { getItem: () => null, setItem() {} } },
};

vm.runInContext(
  `${source}
this.RecipeBoxListCard = RecipeBoxListCard;
this.PHOTO_HELPERS = {
  manualFormHtml,
  detailHtml,
  photoErrorMessage,
  bindDetail,
  missingImageWarning,
  photoTestHtml,
};`,
  vm.createContext(context)
);

const {
  manualFormHtml,
  detailHtml,
  photoErrorMessage,
  bindDetail,
  missingImageWarning,
  photoTestHtml,
} = context.PHOTO_HELPERS;

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
  state.ws = [];
  card._hass = {
    states: {},
    callService: async (domain, service, data) => {
      state.calls.push({ domain, service, data });
    },
    fetchWithAuth: async (path, init) => {
      state.uploads.push({ path, form: init && init.body });
      return { ok: true, json: async () => ({ id: "abc123" }) };
    },
    callWS: async (message) => {
      state.ws.push(message);
      return [];
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
  assert.equal(state.uploads[0].path, "/api/image/upload");
  assert.equal(state.uploads[0].form.entries.length, 1);
  assert.equal(
    state.uploads[0].form.entries[0][2],
    "rezeptbox-Omas-Karte.jpg",
    "the upload name marks the photo as ours"
  );
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
  failing._hass.fetchWithAuth = async () => ({
    ok: false,
    status: 400,
    statusText: "Bad Request",
    text: async () => "",
  });
  await failing._saveManual();
  assert.equal(state.calls.length, 0, "no recipe without its photo");
  assert.match(
    state.notifications[0],
    /Foto hochladen fehlgeschlagen \(Rezeptbox [\d.]+\): Dieses Bildformat wird nicht unterstützt/
  );
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

  // 8. Own recipes offer changing and removing the photo, imported ones do not.
  const detailOptions = { show_image: true, show_steps: true };
  const manualState = {
    entity_id: "sensor.manual",
    attributes: {
      title: "Omas Kuchen",
      source_url: "manual://omas-kuchen-1a2b3c4d",
      ingredients: ["1 Ei"],
      groups: [],
    },
  };
  const meta = { entityId: "sensor.manual", groups: [] };
  const withoutPhoto = detailHtml(manualState, detailOptions, new Set(), 2, meta);
  assert.match(withoutPhoto, /class="photo-edit-input"/);
  assert.match(withoutPhoto, /Foto hinzufügen/);
  assert.doesNotMatch(withoutPhoto, /photo-remove/);

  const withPhotoState = {
    entity_id: "sensor.manual",
    attributes: {
      ...manualState.attributes,
      image_url: "/api/image/serve/abc123/original",
    },
  };
  const withPhoto = detailHtml(withPhotoState, detailOptions, new Set(), 2, meta);
  assert.match(withPhoto, /Foto ändern/);
  assert.match(withPhoto, /class="photo-remove"/);

  const imported = detailHtml(
    {
      entity_id: "sensor.web",
      attributes: {
        title: "Lasagne",
        source_url: "https://example.com/lasagne",
        ingredients: ["1 Ei"],
        groups: [],
      },
    },
    detailOptions,
    new Set(),
    2,
    { entityId: "sensor.web", groups: [] }
  );
  assert.doesNotMatch(imported, /photo-edit/);

  // 9. HEIC photos get a concrete hint instead of a bare upload error.
  const heicFile = { name: "IMG_1234.HEIC", type: "image/heic", size: 10 };
  assert.match(
    photoErrorMessage(new Error("400: Bad Request"), heicFile),
    /HEIC-Fotos kann dieser Browser nicht umwandeln/
  );
  assert.match(
    photoErrorMessage(new Error("400: Bad Request"), {
      name: "karte.jpg",
      type: "image/jpeg",
    }),
    /Bitte JPG oder PNG verwenden/
  );
  assert.match(
    photoErrorMessage(new Error("413: Payload Too Large"), heicFile),
    /HEIC-Fotos/
  );
  assert.equal(
    photoErrorMessage(new Error("kaputt"), { name: "karte.jpg" }),
    "kaputt"
  );

  // 10. An HEIC file the browser cannot convert is rejected with that hint.
  const heicUpload = makeCard();
  heicUpload._shrinkPhoto = async (item) => item;
  await assert.rejects(
    () => heicUpload._uploadPhoto(heicFile),
    /HEIC-Fotos kann dieser Browser nicht umwandeln/
  );
  assert.equal(state.uploads.length, 0, "nothing is uploaded for HEIC");

  // 11. The photo picker is usable again after a successful upload, even
  //     when the card does not re-render.
  const changing = makeCard();
  let changeHandler = null;
  const picker = {
    disabled: false,
    value: "C:\\fakepath\\karte.jpg",
    files: [{ name: "karte.jpg", type: "image/jpeg", size: 10 }],
    addEventListener: (type, handler) => {
      if (type === "change") changeHandler = handler;
    },
  };
  const root = {
    querySelectorAll: () => [],
    querySelector: (selector) =>
      selector === "input.photo-edit-input" ? picker : null,
  };
  bindDetail(root, changing._hass, "sensor.manual", new Set(), changing, {});
  assert.equal(typeof changeHandler, "function", "the picker is bound");
  await changeHandler();
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].service, "set_recipe_image");
  assert.equal(
    state.calls[0].data.image_url,
    "/api/image/serve/abc123/original"
  );
  assert.equal(picker.disabled, false, "the picker is enabled again");
  assert.equal(picker.value, "", "the same file can be chosen again");

  // 12. The cleanup button reports what it did.
  const cleanup = makeCard();
  await cleanup._cleanupPhotos();
  assert.equal(state.calls[0].service, "cleanup_recipe_images");
  assert.match(state.notifications[0], /Keine verwaisten Fotos gefunden/);

  // 13. Removed photos are counted in the message.
  const cleaning = makeCard();
  cleaning._hass.callService = async (domain, service) => {
    state.calls.push({ domain, service });
    return { removed: 2, kept: 1, available: true };
  };
  await cleaning._cleanupPhotos();
  assert.match(state.notifications[0], /2 Fotos aufgeräumt/);

  // 14. Saving a backup warns about recipes whose photo is gone.
  assert.equal(missingImageWarning({ recipes: [] }), "");
  assert.match(
    missingImageWarning({ missing_images: ["A"] }),
    /fehlende Fotos bei 1 Rezept\./
  );
  assert.match(
    missingImageWarning({ missing_images: ["A", "B"] }),
    /fehlende Fotos bei 2 Rezepten\./
  );

  // 15. Without fetchWithAuth the upload falls back to fetch with the token
  //     instead of callApi, which would serialise the multipart body as JSON.
  const legacy = makeCard();
  legacy._hass.fetchWithAuth = undefined;
  legacy._hass.hassUrl = (path) => `https://ha.example${path}`;
  legacy._hass.auth = { data: { access_token: "token-1" } };
  legacy._shrinkPhoto = async () => ({ size: 1, type: "image/jpeg" });
  context.fetch = async (url, init) => {
    state.uploads.push({ url, init });
    return { ok: true, json: async () => ({ id: "abc123" }) };
  };
  const legacyUrl = await legacy._uploadPhoto({
    name: "karte.jpg",
    type: "image/jpeg",
  });
  assert.equal(state.uploads[0].url, "https://ha.example/api/image/upload");
  assert.equal(
    state.uploads[0].init.headers.authorization,
    "Bearer token-1"
  );
  assert.equal(legacyUrl, "/api/image/serve/abc123/original");

  // 16. A too large upload gets its own hint.
  const big = makeCard();
  big._hass.fetchWithAuth = async () => ({
    ok: false,
    status: 413,
    statusText: "Payload Too Large",
    text: async () => "",
  });
  big._shrinkPhoto = async () => ({ size: 1 });
  await assert.rejects(
    () => big._uploadPhoto({ name: "karte.jpg", type: "image/jpeg" }),
    /413: Payload Too Large/
  );
  assert.match(
    photoErrorMessage(
      new Error("413: Payload Too Large"),
      { name: "karte.jpg" }
    ),
    /zu groß/
  );

  // 17. A file without MIME type gets one from its name, so Home Assistant
  //     does not reject the upload as an unknown format.
  const typed = makeCard();
  typed._shrinkPhoto = async (item) => item;
  const typedUrl = await typed._uploadPhoto({
    name: "Kuchen.PNG",
    type: "",
    size: 4096,
  });
  assert.equal(state.uploads[0].form.entries[0][1].type, "image/png");
  assert.equal(state.uploads[0].form.entries[0][2], "rezeptbox-Kuchen.png");
  assert.equal(typedUrl, "/api/image/serve/abc123/original");

  // 18. Plain objects thrown by Home Assistant no longer lose their message.
  assert.match(
    photoErrorMessage(
      { error: "Response error: 500", status_code: 500 },
      { name: "karte.jpg", type: "image/jpeg" }
    ),
    /Response error: 500/
  );
  assert.match(
    photoErrorMessage(new Error("404: Not Found"), {
      name: "karte.jpg",
      type: "image/jpeg",
    }),
    /image_upload/
  );

  // 19. A failing set_recipe_image is reported as a save error after upload.
  const saveError = makeCard();
  saveError._hass.callService = async () => {
    throw { error: "Response error: 500", status_code: 500 };
  };
  let saveHandler = null;
  const savePicker = {
    disabled: false,
    value: "C:\\fakepath\\karte.jpg",
    files: [{ name: "karte.jpg", type: "image/jpeg", size: 10 }],
    addEventListener: (type, handler) => {
      if (type === "change") saveHandler = handler;
    },
  };
  bindDetail(
    {
      querySelectorAll: () => [],
      querySelector: (selector) =>
        selector === "input.photo-edit-input" ? savePicker : null,
    },
    saveError._hass,
    "sensor.manual",
    new Set(),
    saveError,
    {}
  );
  await saveHandler();
  assert.match(
    state.notifications[0],
    /Foto speichern fehlgeschlagen: Response error: 500/
  );
  assert.equal(savePicker.disabled, false);
  assert.equal(savePicker.value, "");

  // 20. The photo test checks the server, uploads a real test picture through
  //     the normal path, cleans it up and keeps the report on the card so a
  //     re-render cannot hide it.
  const tested = makeCard();
  let testRenders = 0;
  tested._render = () => {
    testRenders += 1;
  };
  tested._hass.callWS = async (message) => {
    state.ws.push(message);
    return [{ id: "a" }, { id: "b" }];
  };
  tested._hass.callService = async (domain, service) => {
    state.calls.push({ domain, service });
    return { removed: 1, kept: 0, available: true };
  };
  await tested._runPhotoTest();
  const report = photoTestHtml(
    tested._photoTest.lines,
    tested._photoTest.verdict
  );
  assert.equal(state.ws[0].type, "image/list");
  assert.match(report, /image_upload vorhanden, 2 Bilder/);
  assert.match(report, /Upload über \/api\/image\/upload erfolgreich/);
  assert.match(report, /Foto-Upload funktioniert/);
  assert.equal(tested._photoTest.running, false);
  assert.ok(
    testRenders >= 4,
    "the report is rendered before, during and after the test"
  );
  assert.equal(state.uploads.length, 1, "the test uploads one picture");
  assert.equal(
    state.uploads[0].form.entries[0][2].startsWith("rezeptbox-foto-test"),
    true,
    "the test picture is recognised as ours and cleaned up"
  );
  assert.equal(state.calls[0].service, "cleanup_recipe_images");

  // 21. A working server plus a failing browser upload names the browser.
  const browserFail = makeCard();
  browserFail._hass.fetchWithAuth = async () => ({
    ok: false,
    status: 400,
    statusText: "Bad Request",
    text: async () => "Only jpeg, png, and gif images are allowed",
  });
  await browserFail._runPhotoTest();
  const failReport = photoTestHtml(
    browserFail._photoTest.lines,
    browserFail._photoTest.verdict
  );
  assert.match(failReport, /Server: image_upload vorhanden/);
  assert.match(failReport, /Browser: Upload fehlgeschlagen – Dieses Bildformat/);
  assert.match(failReport, /Der Server ist bereit/);
  assert.equal(state.calls.length, 0, "nothing to clean up after a failed upload");

  // 22. Without image_upload the test blames the server, not the browser.
  const allFail = makeCard();
  allFail._hass.callWS = async () => {
    throw { code: "unknown_command", message: "Unknown command." };
  };
  allFail._hass.fetchWithAuth = async () => ({
    ok: false,
    status: 404,
    statusText: "Not Found",
    text: async () => "",
  });
  await allFail._runPhotoTest();
  const allFailReport = photoTestHtml(
    allFail._photoTest.lines,
    allFail._photoTest.verdict
  );
  assert.match(allFailReport, /Server: image_upload fehlt oder antwortet nicht/);
  assert.match(allFailReport, /Home Assistant nimmt keine Fotos an/);

  console.log("card_photo_test: 22 checks passed");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
