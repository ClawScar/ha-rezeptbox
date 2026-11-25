/* Tests for turning the preparation into numbered, ordered steps.
 *
 * Printed steps often run as one paragraph and continue on the next photo.
 * The detail view shows an <ol>, so each sentence becomes its own entry and
 * the order of the pages is kept.
 *
 * Run with: node tests/card_ocr_steps_test.js
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
   this.ocrSplitSteps = ocrSplitSteps;
   this.ocrSplitSentences = ocrSplitSentences;
   this.ocrSplitNumbered = ocrSplitNumbered;
   this.ocrRecipeFromPages = ocrRecipeFromPages;`,
  vm.createContext(context)
);

const run = () => {
  // 1. A long paragraph becomes one step per sentence.
  const paragraph =
    "Himbeeren in eine Schüssel geben, auftauen lassen oder kurz in der Mikrowelle erwärmen. Mit Skyr, Kokosraspeln und optional etwas Süße verrühren. In Gläser schichten und kalt stellen.";
  const steps = context.ocrSplitSteps([paragraph]);
  assert.equal(steps.length, 3);
  assert.match(steps[0], /^Himbeeren in eine Schüssel/);
  assert.match(steps[1], /^Mit Skyr/);
  assert.match(steps[2], /^In Gläser/);

  // 2. Abbreviations do not start a new step.
  const abbreviation = context.ocrSplitSteps([
    "Die Himbeeren ca. 5 Min. in der Mikrowelle auftauen lassen und dann mit dem Skyr verrühren.",
  ]);
  assert.equal(abbreviation.length, 1);

  // 3. Two numbered steps in one recognised line are two steps.
  const numbered = context.ocrSplitSteps([
    "1. Himbeeren auftauen. 2. Mit Skyr verrühren. 3. Kalt stellen.",
  ]);
  assert.deepEqual(Array.from(numbered), [
    "Himbeeren auftauen.",
    "Mit Skyr verrühren.",
    "Kalt stellen.",
  ]);

  // 4. Fragments from the drawing ("E E &") are not steps.
  const noisy = context.ocrSplitSteps([
    "Himbeeren in eine Schüssel geben, auftauen lassen oder kurz in der Mikrowelle erwärmen. E E &",
  ]);
  assert.deepEqual(Array.from(noisy), [
    "Himbeeren in eine Schüssel geben, auftauen lassen oder kurz in der Mikrowelle erwärmen.",
  ]);

  // 5. A sentence that continues in lowercase stays in its step.
  const wrapped = context.ocrSplitSteps([
    "Die Himbeeren in eine Schüssel geben und auftauen lassen, dann mit dem Skyr und den Kokosraspeln verrühren. anschließend kalt stellen.",
  ]);
  assert.equal(wrapped.length, 1);

  // 6. Both photos keep their order: page one's steps come first.
  const parsed = context.ocrRecipeFromPages([
    [
      "SCHNELLER HIMBEER-KOKOS-QUARK",
      "ZUTATEN",
      "20 g TK-Himbeeren",
      "120 g Skyr",
      "ZUBEREITUNG",
      "Himbeeren in eine Schüssel geben, auftauen lassen oder kurz in der Mikrowelle erwärmen. Mit Skyr, Kokosraspeln und optional etwas Süße verrühren.",
    ].join("\n"),
    [
      "In Gläser schichten und kalt stellen. Vor dem Servieren noch einmal kurz durchrühren.",
    ].join("\n"),
  ]);
  assert.deepEqual(Array.from(parsed.instructions), [
    "Himbeeren in eine Schüssel geben, auftauen lassen oder kurz in der Mikrowelle erwärmen.",
    "Mit Skyr, Kokosraspeln und optional etwas Süße verrühren.",
    "In Gläser schichten und kalt stellen.",
    "Vor dem Servieren noch einmal kurz durchrühren.",
  ]);
  assert.deepEqual(Array.from(parsed.ingredients), ["20 g TK-Himbeeren", "120 g Skyr"]);

  // 7. A new photo never continues the line of the previous photo.
  const crossPage = context.ocrRecipeFromPages([
    "ZUTATEN\n20 g TK-Himbeeren,",
    "120 g Skyr\nZUBEREITUNG\nHimbeeren auftauen",
    "mit Skyr verrühren.",
  ]);
  assert.deepEqual(Array.from(crossPage.ingredients), [
    "20 g TK-Himbeeren",
    "120 g Skyr",
  ]);
  assert.deepEqual(Array.from(crossPage.instructions), [
    "Himbeeren auftauen",
    "mit Skyr verrühren.",
  ]);

  console.log("card_ocr_steps_test: 7 checks passed");
};

run();
