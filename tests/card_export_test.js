/* Behaviour tests for the backup (Sichern) flow of recipe-card.js.
 *
 * The card opens a dialog and saves, shares or downloads the file from a
 * click in that dialog, so no user gesture is used up by the service call.
 *
 * Run with: node tests/card_export_test.js
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
  serviceData: null,
  dialogShown: 0,
  saved: null,
  pickerOptions: null,
  shared: null,
  notifications: [],
  revoked: [],
  timers: [],
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
  document: { createElement: () => ({}) },
  navigator: { maxTouchPoints: 0 },
  Blob: class {
    constructor(parts, options) {
      this.parts = parts;
      this.options = options;
    }
  },
  File: class {
    constructor(parts, name, options) {
      this.parts = parts;
      this.name = name;
      this.options = options;
    }
  },
  URL: {
    createObjectURL: () => "blob:test",
    revokeObjectURL: (url) => state.revoked.push(url),
  },
  setTimeout: (fn, ms) => {
    state.timers.push({ fn, ms });
    return state.timers.length;
  },
  clearTimeout: () => {},
  window: { customCards: [] },
  state,
};

vm.runInContext(
  `${source}\nthis.RecipeBoxListCard = RecipeBoxListCard;\nthis.backupDialogHtml = backupDialogHtml;`,
  vm.createContext(context)
);

const RECIPES = { recipes: [{ title: "Testrezept" }], plan: {}, missing_images: [] };

const reset = () => {
  state.serviceData = null;
  state.dialogShown = 0;
  state.saved = null;
  state.pickerOptions = null;
  state.shared = null;
  state.notifications = [];
  state.revoked = [];
  state.timers = [];
  delete context.window.showSaveFilePicker;
  delete context.navigator.share;
  delete context.navigator.canShare;
};

const makeCard = (response = RECIPES) => {
  const card = new context.RecipeBoxListCard();
  card.shadowRoot = { querySelector: () => null };
  card._hass = {
    callService: async (domain, service, data) => {
      state.serviceData = { domain, service, data };
      return response;
    },
  };
  card._showBackupDialog = () => {
    state.dialogShown += 1;
  };
  card.dispatchEvent = (event) => state.notifications.push(event.detail.message);
  return card;
};

const run = async () => {
  // 1. The dialog opens with the fetched backup; nothing is written by the
  //    server and no browser API is called yet.
  reset();
  let card = makeCard();
  await card._export();
  assert.deepEqual(
    Object.keys(state.serviceData.data),
    [],
    "no write_backup is sent"
  );
  assert.equal(state.serviceData.service, "export_recipes");
  assert.equal(state.dialogShown, 1, "the dialog is opened");
  assert.match(card._backup.filename, /^rezeptbox-\d{4}-\d{2}-\d{2}\.json$/);
  assert.match(card._backup.blob.parts[0], /"title": "Testrezept"/);
  assert.equal(card._backup.url, "blob:test");
  assert.ok(card._backup.file, "a File for the share sheet exists");
  assert.deepEqual(state.notifications, []);

  // 2. "Speichern…" opens the real save dialog and writes the file.
  reset();
  card = makeCard();
  await card._export();
  context.window.showSaveFilePicker = async (options) => {
    state.pickerOptions = options;
    return {
      name: "gewaehlt.json",
      createWritable: async () => ({
        write: async (blob) => {
          state.saved = blob;
        },
        close: async () => {},
      }),
    };
  };
  const savedBackup = card._backup;
  await card._saveBackupWithPicker(savedBackup, { disabled: false });
  assert.match(state.pickerOptions.suggestedName, /^rezeptbox-.*\.json$/);
  assert.equal(state.saved, savedBackup.blob);
  assert.match(state.saved.parts[0], /"title": "Testrezept"/);
  assert.deepEqual(state.notifications, ["Sicherung gespeichert: gewaehlt.json"]);
  assert.equal(card._backup, null, "the dialog closes after saving");

  // 3. Cancelling the dialog keeps the backup dialog open and reports nothing.
  reset();
  card = makeCard();
  await card._export();
  context.window.showSaveFilePicker = async () => {
    const error = new Error("cancelled");
    error.name = "AbortError";
    throw error;
  };
  const saveButton = { disabled: true };
  await card._saveBackupWithPicker(card._backup, saveButton);
  assert.equal(card._backup !== null, true);
  assert.equal(saveButton.disabled, false, "the button is usable again");
  assert.deepEqual(state.notifications, []);

  // 4. "Teilen…" hands the JSON file to the share sheet.
  reset();
  card = makeCard();
  await card._export();
  context.navigator.canShare = () => true;
  context.navigator.share = async (data) => {
    state.shared = data;
  };
  const sharedBackup = card._backup;
  await card._shareBackup(sharedBackup, { disabled: false });
  assert.equal(state.shared.files[0].name, sharedBackup.filename);
  assert.match(state.shared.files[0].name, /^rezeptbox-\d{4}-\d{2}-\d{2}\.json$/);
  assert.match(state.shared.files[0].parts[0].parts[0], /"title": "Testrezept"/);
  assert.deepEqual(state.notifications, ["Sicherung geteilt."]);
  assert.equal(card._backup, null);

  // 5. Cancelling the share sheet keeps the dialog open.
  reset();
  card = makeCard();
  await card._export();
  context.navigator.share = async () => {
    const error = new Error("cancelled");
    error.name = "AbortError";
    throw error;
  };
  const shareButton = { disabled: true };
  await card._shareBackup(card._backup, shareButton);
  assert.equal(card._backup !== null, true);
  assert.equal(shareButton.disabled, false);
  assert.deepEqual(state.notifications, []);

  // 6. Closing the dialog releases the blob URL, but not immediately.
  reset();
  card = makeCard();
  await card._export();
  card._closeBackup();
  assert.equal(card._backup, null);
  assert.deepEqual(state.revoked, []);
  assert.equal(state.timers.length, 1);
  assert.equal(state.timers[0].ms, 30000);
  state.timers[0].fn();
  assert.deepEqual(state.revoked, ["blob:test"]);

  // 7. A missing service response is reported, no empty backup is offered.
  reset();
  card = makeCard({});
  await card._export();
  assert.equal(card._backup, null);
  assert.equal(state.dialogShown, 0);
  assert.match(
    state.notifications[0],
    /^Sichern fehlgeschlagen: .*Sicherungsdaten/
  );

  // 8. The dialog only offers the actions the device supports.
  reset();
  const plain = context.backupDialogHtml({
    filename: "rezeptbox-2026-11-25.json",
    url: "blob:test",
    file: new context.File([], "rezeptbox-2026-11-25.json", {}),
  });
  assert.match(plain, /a class="backup-download" href="blob:test"/);
  assert.doesNotMatch(plain, /backup-save/);
  assert.doesNotMatch(plain, /backup-share/);

  context.window.showSaveFilePicker = async () => {};
  context.navigator.canShare = () => true;
  context.navigator.share = async () => {};
  const full = context.backupDialogHtml({
    filename: "rezeptbox-2026-11-25.json",
    url: "blob:test",
    file: new context.File([], "rezeptbox-2026-11-25.json", {}),
  });
  assert.match(full, /class="backup-save"/);
  assert.match(full, /class="backup-share"/);
  assert.match(full, /download="rezeptbox-2026-11-25.json"/);

  // 9. The frontend wraps a service response as { context, response };
  //    the card must read the payload from there.
  reset();
  card = makeCard({ context: { id: "ctx" }, response: RECIPES });
  await card._export();
  assert.equal(state.dialogShown, 1);
  assert.match(card._backup.blob.parts[0], /"title": "Testrezept"/);
  assert.deepEqual(state.notifications, []);

  console.log("card_export_test: 9 checks passed");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
