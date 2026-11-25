/* Tests for the remaining cleaning of the recognised card text.
 *
 * The lines below are the ones a real phone photo produced: junk before and
 * between the amounts, a fragment on its own line, a stray capital inside a
 * sentence, and a decoration digit behind the title.
 *
 * Run with: node tests/card_ocr_clean_test.js
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
   this.ocrRecipeFromPages = ocrRecipeFromPages;
   this.ocrIngredientParts = ocrIngredientParts;`,
  vm.createContext(context)
);

const list = (value) => Array.from(value);

const run = () => {
  const page = [
    "Schneller Himbeer-Kokos-Quark 5",
    "1",
    "ZUTATEN",
    ".Z * 20 g TK-Himbeeren a « 120 g Skyr",
    "_ o— e 15 g Kokosraspeln",
    "Er=>",
    "ZUBEREITUNG",
    "um rt 1.",
    "Himbeeren in eine Schüssel geben, auftauen lassen oder kurz in E die Mikrowelle geben.",
    "Mit Skyr, Kokosraspeln und optional etwas Süße vermischen.",
  ].join("\n");

  const parsed = context.ocrRecipeFromPages([page]);

  // 1. The decoration digit behind the title is gone.
  assert.equal(parsed.title, "Schneller Himbeer-Kokos-Quark");

  // 2. Two ingredients in one line are separated, junk around them dropped.
  assert.deepEqual(list(parsed.ingredients), [
    "20 g TK-Himbeeren",
    "120 g Skyr",
    "15 g Kokosraspeln",
  ]);

  // 3. The fragment "Er=>" is not an ingredient.
  assert.equal(parsed.ingredients.length, 3);

  // 4. "um rt 1." is not a step; the real steps stay in order.
  assert.deepEqual(list(parsed.instructions), [
    "Himbeeren in eine Schüssel geben, auftauen lassen oder kurz in die Mikrowelle geben.",
    "Mit Skyr, Kokosraspeln und optional etwas Süße vermischen.",
  ]);

  // 5. A stray capital inside a sentence is dropped, a unit is not.
  assert.deepEqual(list(context.ocrIngredientParts("500 g Spätzle, frisch")), [
    "500 g Spätzle, frisch",
  ]);
  assert.deepEqual(list(context.ocrIngredientParts("2 EL Öl")), ["2 EL Öl"]);

  // 6. A single ingredient keeps its amount and its punctuation.
  assert.deepEqual(list(context.ocrIngredientParts("1 Prise Salz.")), [
    "1 Prise Salz.",
  ]);

  console.log("card_ocr_clean_test: 6 checks passed");
};

run();
