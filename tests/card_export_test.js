/* Behaviour tests for the backup (Sichern) flow of recipe-card.js.
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
  saved: null,
  pickerOptions: null,
  download: null,
  objectUrl: null,
  revoked: [],
  timers: [],
  shared: null,
  notifications: [],
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
    createElement: (tag) => {
      const link = {
        tag,
        style: {},
        click() {
          state.download = link;
        },
        remove() {},
      };
      return link;
    },
    body: { appendChild() {} },
  },
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
    createObjectURL: (blob) => {
      state.objectUrl = blob;
      return "blob:test";
    },
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
  `${source}\nthis.RecipeBoxListCard = RecipeBoxListCard;`,
  vm.createContext(context)
);

const RECIPES = { recipes: [{ title: "Testrezept" }], plan: {} };

const makeCard = (response = RECIPES) => {
  const card = new context.RecipeBoxListCard();
  card._hass = {
    callService: async () => response,
  };
  card.dispatchEvent = (event) => state.notifications.push(event.detail.message);
  return card;
};

const reset = () => {
  state.saved = null;
  state.pickerOptions = null;
  state.download = null;
  state.objectUrl = null;
  state.revoked = [];
  state.timers = [];
  state.shared = null;
  state.notifications = [];
  delete context.window.showSaveFilePicker;
  context.navigator.maxTouchPoints = 0;
  delete context.navigator.share;
  delete context.navigator.canShare;
};

const run = async () => {
  // 1. Chromium: the save dialog receives the backup.
  reset();
  context.window.showSaveFilePicker = async (options) => {
    state.pickerOptions = options;
    return {
      name: "sicherung.json",
      createWritable: async () => ({
        write: async (blob) => {
          state.saved = blob;
        },
        close: async () => {},
      }),
    };
  };
  await makeCard()._export();
  assert.equal(state.pickerOptions.suggestedName.startsWith("rezeptbox-"), true);
  assert.match(state.pickerOptions.suggestedName, /\.json$/);
  assert.equal(state.download, null, "no download link when the dialog was used");
  assert.match(state.saved.parts[0], /"title": "Testrezept"/);
  assert.deepEqual(state.notifications, ["Sicherung gespeichert: sicherung.json"]);

  // 2. Cancelling the dialog writes nothing and reports nothing.
  reset();
  context.window.showSaveFilePicker = async () => {
    const error = new Error("cancelled");
    error.name = "AbortError";
    throw error;
  };
  await makeCard()._export();
  assert.equal(state.saved, null);
  assert.equal(state.download, null);
  assert.deepEqual(state.notifications, []);

  // 3. Without the API the JSON is downloaded; the blob URL is kept alive.
  reset();
  await makeCard()._export();
  assert.ok(state.download, "download link was clicked");
  assert.match(state.download.download, /^rezeptbox-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(state.download.href, "blob:test");
  assert.deepEqual(state.revoked, [], "URL is not revoked before the download starts");
  assert.equal(state.timers.length, 1);
  assert.equal(state.timers[0].ms, 30000);
  state.timers[0].fn();
  assert.deepEqual(state.revoked, ["blob:test"]);
  assert.match(state.notifications[0], /^Sicherung heruntergeladen: rezeptbox-/);

  // 4. Touch devices use the share sheet when it accepts files.
  reset();
  context.navigator.maxTouchPoints = 5;
  context.navigator.canShare = () => true;
  context.navigator.share = async (data) => {
    state.shared = data;
  };
  await makeCard()._export();
  assert.equal(state.download, null);
  assert.match(state.shared.files[0].name, /^rezeptbox-\d{4}-\d{2}-\d{2}\.json$/);
  assert.match(state.shared.files[0].parts[0].parts[0], /"title": "Testrezept"/);
  assert.deepEqual(state.notifications, ["Sicherung gespeichert."]);

  // 5. A server-side target folder skips the browser save dialog entirely.
  reset();
  context.window.showSaveFilePicker = async () => {
    throw new Error("must not open");
  };
  await makeCard({
    ...RECIPES,
    path: "/config/backups/rezeptbox-2026-11-25.json",
    filename: "rezeptbox-2026-11-25.json",
  })._export();
  assert.equal(state.pickerOptions, null);
  assert.equal(state.download, null, "the browser stores nothing");
  assert.deepEqual(state.notifications, [
    "Sicherung gespeichert: /config/backups/rezeptbox-2026-11-25.json",
  ]);

  // 6. A missing service response is reported, no empty backup is written.
  reset();
  await makeCard({})._export();
  assert.equal(state.download, null);
  assert.match(
    state.notifications[0],
    /^Sichern fehlgeschlagen: .*Sicherungsdaten/
  );

  console.log("card_export_test: 6 checks passed");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
