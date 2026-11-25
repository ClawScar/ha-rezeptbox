/* Tests for reading only the ingredient and preparation zones.
 *
 * The printed headings ("ZUTATEN", "GEWÜRZE", "ZUBEREITUNG") are located in
 * the word boxes of the first pass; the zones between them are read again on
 * their own, so the illustration and the neighbouring section stay out of the
 * ingredient list.
 *
 * Run with: node tests/card_ocr_zones_test.js
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
  customElements: { get: () => undefined, define: () => {} },
  document: { createElement: () => ({}) },
  window: { customCards: [] },
};

vm.runInContext(
  `${source}
   this.ocrHeadingKind = ocrHeadingKind;
   this.ocrNearWord = ocrNearWord;
   this.ocrZoneBands = ocrZoneBands;
   this.ocrZoneText = ocrZoneText;
   this.ocrDataLines = ocrDataLines;`,
  vm.createContext(context)
);

const line = (text, y0, y1, confidence = 90) => ({
  text,
  confidence,
  bbox: { x0: 0, y0, x1: 100, y1 },
});

const run = () => {
  // 1. Misread headings still count: the picture shows "GEWÜRLE" and
  //    "3 N ZUBEREITUNG EI" on the real card.
  assert.equal(context.ocrHeadingKind("GEWÜRLE"), "ingredients");
  assert.equal(context.ocrHeadingKind("ZUTATEN"), "ingredients");
  assert.equal(context.ocrHeadingKind("3 N ZUBEREITUNG EI"), "steps");
  assert.equal(context.ocrHeadingKind("Zubereitung"), "steps");
  assert.equal(context.ocrHeadingKind("20 g TK-Himbeeren"), "");
  assert.equal(context.ocrHeadingKind("Himbeeren in eine Schüssel geben"), "");

  // 2. A near word is found inside a longer line, two letters may differ.
  assert.equal(context.ocrNearWord("GEWURLE", "GEWURZE"), true);
  assert.equal(context.ocrNearWord("NZUBEREITUNGEI", "ZUBEREITUNG"), true);
  assert.equal(context.ocrNearWord("HIMBEEREN", "ZUBEREITUNG"), false);
  assert.equal(context.ocrNearWord("ZUT", "ZUTATEN"), false);

  // 3. The boxes become the two zones, as fractions of the page height.
  const bands = context.ocrZoneBands(
    [
      line("Schneller Himbeer-Kokos-Quark", 20, 60),
      line("GEWÜRLE", 100, 130),
      line("20 g TK-Himbeeren", 140, 165),
      line("120 g Skyr", 170, 195),
      line("3 N ZUBEREITUNG EI", 500, 530),
      line("Himbeeren auftauen lassen.", 540, 570),
    ],
    1000
  );
  assert.ok(bands.ingredients, "ingredients zone found");
  assert.ok(Math.abs(bands.ingredients.top - 0.134) < 0.001);
  assert.ok(Math.abs(bands.ingredients.bottom - 0.496) < 0.001);
  assert.ok(bands.steps, "steps zone found");
  assert.ok(Math.abs(bands.steps.top - 0.534) < 0.001);
  assert.equal(bands.steps.bottom, 1);

  // 4. Without headings there is nothing to crop.
  assert.equal(context.ocrZoneBands([line("Himbeeren", 10, 40)], 1000), null);
  assert.equal(context.ocrZoneBands([], 1000), null);
  assert.equal(context.ocrZoneBands([line("ZUTATEN", 10, 40)], 0), null);

  // 5. Only the ingredients heading: the zone runs to the bottom of the page.
  const onlyIngredients = context.ocrZoneBands(
    [line("ZUTATEN", 100, 130), line("20 g TK-Himbeeren", 140, 165)],
    1000
  );
  assert.ok(onlyIngredients.ingredients);
  assert.equal(onlyIngredients.ingredients.bottom, 0.96);
  assert.equal(onlyIngredients.steps, undefined);

  // 6. Unsure lines are dropped, firm ones stay.
  const zone = context.ocrZoneText({
    blocks: [
      {
        paragraphs: [
          {
            lines: [
              line("20 g TK-Himbeeren", 0, 20, 92),
              line("„EEE Z --- an. 7 ER BE", 20, 40, 21),
              line("120 g Skyr", 40, 60, 88),
              line("TEE", 60, 80, 12),
            ],
          },
        ],
      },
    ],
  });
  assert.equal(zone, "20 g TK-Himbeeren\n120 g Skyr");

  // 7. Without word boxes the plain text is used.
  assert.equal(
    context.ocrZoneText({ text: "20 g TK-Himbeeren\n120 g Skyr" }),
    "20 g TK-Himbeeren\n120 g Skyr"
  );

  // 8. The lines are flattened out of the nested block structure.
  const flattened = context.ocrDataLines({
    blocks: [
      { paragraphs: [{ lines: [line("a", 0, 10)] }, { lines: [line("b", 10, 20)] }] },
      { paragraphs: [{ lines: [{ text: "ohne bbox" }] }] },
    ],
  });
  assert.equal(flattened.length, 2);
  assert.equal(flattened[1].text, "b");

  console.log("card_ocr_zones_test: 8 checks passed");
};

run();
