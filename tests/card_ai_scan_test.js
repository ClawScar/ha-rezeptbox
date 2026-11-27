/* Tests for reading recipe photos with the AI set up in Home Assistant.
 *
 * The card itself never talks to a provider: it posts the pages to the
 * integration's own view and fills the form with the answer. The checkbox is
 * only offered when Home Assistant reports an AI task entity that can read
 * photos, so older installations keep scanning with Tesseract.
 *
 * Run with: node tests/card_ai_scan_test.js
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
  posts: [],
  filled: [],
  status: [],
  reply: {
    title: "Apfelkuchen",
    servings: 8,
    ingredients: ["4 Äpfel", "200 g Mehl"],
    instructions: ["Äpfel schälen.", "Backen."],
  },
};

class FakeFormData {
  constructor() {
    this.entries = [];
  }

  append(name, value, filename) {
    this.entries.push({ name, value, filename });
  }
}

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
  FormData: FakeFormData,
  document: {},
  URL: { createObjectURL: () => "", revokeObjectURL: () => {} },
  setTimeout: () => 0,
  clearTimeout: () => {},
  window: { customCards: [] },
};

vm.runInContext(
  `${source}\nthis.RecipeBoxListCard = RecipeBoxListCard;\nthis.manualFormHtml = manualFormHtml;`,
  vm.createContext(context)
);

const makeHass = (entities, reply) => ({
  fetchWithAuth: async (url, init) => {
    const options = init || {};
    if ((options.method || "GET") === "GET") {
      return { ok: true, json: async () => ({ entities }) };
    }
    state.posts.push({ url, options });
    return { ok: true, json: async () => reply };
  },
});

const pages = [
  { name: "seite1.jpg", type: "image/jpeg" },
  { name: "seite2.jpg", type: "image/jpeg" },
];

const makeCard = (hass, label) => {
  const card = new context.RecipeBoxListCard();
  card._hass = hass;
  card.shadowRoot = {
    querySelector: (selector) =>
      selector === "label.scan-ai" ? label : null,
  };
  card._scanStatus = (message) => state.status.push(message);
  card._fillManualForm = (scanned) => state.filled.push(scanned);
  return card;
};

const run = async () => {
  // 1. The form offers the option but keeps it hidden until Home Assistant
  //    confirms an AI that accepts photos.
  const form = context.manualFormHtml();
  assert.match(form, /<label class="scan-ai" hidden>/);
  assert.match(form, /<input class="ocr-ai" type="checkbox">/);
  assert.match(form, /Mit KI lesen/);
  // The hint names the limit, so the refusal does not come as a surprise.
  assert.match(form, /höchstens 6 Seiten/);
  assert.doesNotMatch(form, /class="ocr-ai"[^>]*checked/);
  // The choice survives a re-render, so an active AI scan stays active.
  assert.match(
    context.manualFormHtml(null, [], true),
    /class="ocr-ai" type="checkbox" checked/
  );

  // 2. With an AI task entity the checkbox appears.
  let label = { hidden: true };
  let card = makeCard(makeHass(["ai_task.gemini"], state.reply), label);
  card._loadAiScan();
  await card._aiScanLoading;
  assert.equal(label.hidden, false);
  assert.deepEqual(card._aiEntities, ["ai_task.gemini"]);

  // 3. Without one it stays hidden.
  label = { hidden: true };
  card = makeCard(makeHass([], state.reply), label);
  card._loadAiScan();
  await card._aiScanLoading;
  assert.equal(label.hidden, true);

  // 4. A card without fetchWithAuth (old frontend) never shows the option.
  label = { hidden: true };
  card = makeCard({}, label);
  card._loadAiScan();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(label.hidden, true);

  // 5. Reading with the AI posts every page to the integration, not to a
  //    provider, and fills the form with the answer.
  state.posts = [];
  state.filled = [];
  state.status = [];
  label = { hidden: true };
  card = makeCard(makeHass(["ai_task.gemini"], state.reply), label);
  card._aiEntities = ["ai_task.gemini"];
  await card._scanPagesWithAi(pages);
  assert.equal(state.posts.length, 1);
  const post = state.posts[0];
  assert.equal(post.url, "/api/recipe_box/ai_scan");
  assert.equal(post.options.method, "POST");
  assert.equal(post.options.body.entries.length, 2);
  assert.deepEqual(
    post.options.body.entries.map((entry) => entry.filename),
    ["rezeptbox-scan-1.jpg", "rezeptbox-scan-2.jpg"]
  );
  assert.equal(state.filled.length, 1);
  assert.equal(state.filled[0].title, "Apfelkuchen");
  assert.deepEqual(state.filled[0].ingredients, ["4 Äpfel", "200 g Mehl"]);
  assert.equal(state.filled[0].servings, 8);
  assert.equal(state.status[state.status.length - 1], "");

  // 6. An answer without ingredients and steps is reported, not filled in.
  state.filled = [];
  card = makeCard(makeHass(["ai_task.gemini"], { title: "Nur Titel" }), label);
  card._aiEntities = ["ai_task.gemini"];
  await assert.rejects(() => card._scanPagesWithAi(pages), /nichts Lesbares/);
  assert.equal(state.filled.length, 0);

  // 7. A checked box makes "Text erkennen" take the AI path; Tesseract is not
  //    loaded at all.
  let scannedPages = null;
  card = new context.RecipeBoxListCard();
  card._hass = {};
  card._ocrPages = pages;
  card._aiEntities = ["ai_task.gemini"];
  card.shadowRoot = {
    querySelector: (selector) =>
      selector === "input.ocr-ai"
        ? { checked: true }
        : selector === "button.ocr-run"
          ? { disabled: false }
          : null,
  };
  card._scanPagesWithAi = async (chosen) => {
    scannedPages = chosen;
  };
  await card._scanPages();
  assert.deepEqual(scannedPages, pages);
  assert.equal(card._ocrBusy, false, "the button is usable again");

  // 8. Without the checkbox the Tesseract path stays the default.
  card = new context.RecipeBoxListCard();
  card._hass = {};
  card._ocrPages = pages;
  card._aiEntities = ["ai_task.gemini"];
  card.shadowRoot = {
    querySelector: (selector) =>
      selector === "input.ocr-ai"
        ? { checked: false }
        : selector === "button.ocr-run"
          ? { disabled: false }
          : null,
  };
  card._scanPagesWithAi = async () => {
    throw new Error("the AI path must not run");
  };
  // Tesseract cannot load in the test environment; the failure is reported
  // through the card's own status area instead of escaping.
  card._scanStatus = () => {};
  await card._scanPages();
  assert.equal(card._ocrBusy, false);
};

run().then(
  () => console.log("card_ai_scan_test: ok"),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
