/* Behaviour tests for filing imported recipes into a group.
 *
 * The import form offers the groups that already exist and sends the choice
 * with the service call, so the recipes are stored with it right away.
 *
 * Run with: node tests/card_import_group_test.js
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

const context = {
  console: { info() {} },
  HTMLElement: class {},
  customElements: { get: () => undefined, define() {} },
  CustomEvent: class {
    constructor(type, init) {
      this.type = type;
      this.detail = init && init.detail;
    }
  },
  document: { createElement: () => ({}) },
  window: { customCards: [] },
};

vm.runInContext(
  `${source}\nthis.RecipeBoxListCard = RecipeBoxListCard;`,
  vm.createContext(context)
);

/* Objects from the vm context have that context's prototypes, so the test
 * compares plain copies of what the card sent. */
const plainCopy = (value) => JSON.parse(JSON.stringify(value));

/* A meal plan sensor carries the groups created in the data tab. */
const hassWithGroups = (groups) => ({
  states: {
    "sensor.recipe_box_wochenplan": {
      attributes: { plan: [], groups },
    },
  },
});

const makeCard = (reply, groups = ["Abendessen", "Mittagessen"]) => {
  const calls = [];
  const messages = [];
  const card = Object.create(context.RecipeBoxListCard.prototype);
  Object.assign(card, {
    _config: { entities: undefined, show_import: true },
    _importUrl: "",
    _importing: false,
    _importGroup: "",
    _signature: null,
    _render() {},
    _recipes() {
      return [];
    },
    dispatchEvent(event) {
      messages.push(event.detail.message);
      return true;
    },
    _hass: {
      ...hassWithGroups(groups),
      callService: async (domain, service, data) => {
        calls.push({ domain, service, data });
        return reply;
      },
    },
  });
  return { card, calls, messages };
};

(async () => {
  // 1. Without a choice the import sends an empty group list.
  const plain = makeCard({
    title: "Schnitzel",
    url: "https://example.com/schnitzel",
  });
  plain.card._importUrl = "https://example.com/schnitzel";
  await plain.card._import();
  assert.equal(plain.calls[0].service, "import_recipe");
  assert.deepEqual(plainCopy(plain.calls[0].data), {
    url: "https://example.com/schnitzel",
    groups: [],
  });
  assert.equal(plain.card._importUrl, "");

  // 2. An existing group goes along with every URL of the import.
  const many = makeCard({
    imported: [{ title: "A" }, { title: "B" }],
    failed: [],
  });
  many.card._importUrl = "https://example.com/a\nhttps://example.com/b";
  many.card._importGroup = "Mittagessen";
  await many.card._import();
  assert.deepEqual(plainCopy(many.calls[0].data), {
    urls: ["https://example.com/a", "https://example.com/b"],
    groups: ["Mittagessen"],
  });
  assert.equal(many.card._importGroup, "Mittagessen");

  // 3. A group that no longer exists is not sent again.
  assert.deepEqual(plainCopy(many.card._importGroups()), ["Mittagessen"]);
  many.card._importGroup = "Gelöscht";
  assert.deepEqual(plainCopy(many.card._importGroups()), []);

  // 4. A failed import leaves the field and the choice for another try.
  const failing = makeCard(undefined);
  failing.card._hass.callService = async () => {
    throw new Error("network");
  };
  failing.card._importUrl = "https://example.com/x";
  failing.card._importGroup = "Abendessen";
  await failing.card._import();
  assert.equal(failing.card._importGroup, "Abendessen");
  assert.equal(failing.card._importUrl, "https://example.com/x");
  assert.match(
    failing.messages[failing.messages.length - 1],
    /Import fehlgeschlagen/
  );

  console.log("card_import_group_test: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
