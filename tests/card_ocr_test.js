/* Behaviour tests for the photo scanner helpers of recipe-card.js.
 *
 * The OCR engine itself is not run here; these checks cover the text merge
 * that turns the recognised pages into one recipe draft.
 *
 * Run with: node tests/card_ocr_test.js
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
    createElement: () => ({ style: {}, remove() {}, addEventListener() {} }),
    body: { appendChild() {} },
    head: { appendChild() {} },
  },
  navigator: { maxTouchPoints: 0 },
  Blob: class {},
  File: class {},
  URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
  setTimeout: () => 0,
  clearTimeout: () => {},
  window: { customCards: [] },
};
vm.runInContext(
  `${source}
this.ocrRecipeFromPages = ocrRecipeFromPages;
this.ocrSplitColumns = ocrSplitColumns;`,
  vm.createContext(context)
);

const { ocrRecipeFromPages, ocrSplitColumns } = context;
/* Values come from the card's VM realm; copy them into this realm. */
const toPlain = (value) => JSON.parse(JSON.stringify(value));

const PAGE_ONE = `Omas Käsespätzle
Hauptgericht · 4 Portionen · 40 Minuten
Zutaten
• 500 g Spätzle, frisch
• 250 g Bergkäse, gerieben
* 2 Zwiebeln
  getrocknet
Zubereitung
1. Zwiebeln schälen und in feine Ringe
schneiden.
2. Butter in einer Pfanne erhitzen.`;

const PAGE_TWO = `Omas Käsespätzle – Seite 2
12
Zutaten
° 1 Prise Muskatnuss
Zubereitung
3. Form 25 Minuten in den Ofen geben.
4. Vor dem Servieren ruhen lassen.`;

// 1. One page: title, servings, ingredients and steps.
const single = ocrRecipeFromPages([PAGE_ONE]);
assert.equal(single.title, "Omas Käsespätzle");
assert.equal(single.servings, 4);
assert.deepEqual(toPlain(single.ingredients), [
  "500 g Spätzle, frisch",
  "250 g Bergkäse, gerieben",
  "2 Zwiebeln getrocknet",
]);
assert.deepEqual(toPlain(single.instructions), [
  "Zwiebeln schälen und in feine Ringe schneiden.",
  "Butter in einer Pfanne erhitzen.",
]);

// 2. Later pages continue the same sections instead of starting over.
const multi = ocrRecipeFromPages([PAGE_ONE, PAGE_TWO]);
assert.equal(multi.title, "Omas Käsespätzle", "the page heading is dropped");
assert.equal(multi.ingredients.length, 4);
assert.equal(multi.ingredients[3], "1 Prise Muskatnuss");
assert.equal(multi.instructions.length, 4);
assert.equal(multi.instructions[3], "Vor dem Servieren ruhen lassen.");

// 3. A later page continues the ingredients without repeating the heading.
const pageBreak = ocrRecipeFromPages([
  PAGE_ONE,
  `Omas Käsespätzle – Seite 2
• 1 Prise Muskatnuss
Zubereitung
6. Form 25 Minuten in den Ofen geben.`,
]);
assert.deepEqual(toPlain(pageBreak.ingredients).slice(-1), ["1 Prise Muskatnuss"]);
assert.deepEqual(toPlain(pageBreak.instructions).slice(-1), [
  "Form 25 Minuten in den Ofen geben.",
]);

// 4. Two-column ingredient lists come back as one line and are split.
assert.deepEqual(
  toPlain(ocrSplitColumns("* 300 g rote Linsen * 800 ml Gemüsebrühe")).map(
    (line) => line.replace(/^[*•]\s*/, "")
  ),
  ["300 g rote Linsen", "800 ml Gemüsebrühe"]
);
const columns = ocrRecipeFromPages([
  `Linsensuppe
Für 6 Personen
Zutaten
* 300 g rote Linsen * 800 ml Gemüsebrühe
* 1 Zwiebel * 2 Tomaten
Zubereitung
1. Linsen waschen.
2. Alles köcheln lassen.`,
]);
assert.deepEqual(toPlain(columns.ingredients), [
  "300 g rote Linsen",
  "800 ml Gemüsebrühe",
  "1 Zwiebel",
  "2 Tomaten",
]);
assert.equal(columns.servings, 6);

// 5. Bullets that OCR returns as guillemets still count as ingredients.
const guillemets = ocrRecipeFromPages([
  `Omas Käsespätzle
Zutaten
° 500 g Spätzle, frisch
Zubereitung
1. Kochen.`,
  `Omas Käsespätzle - Seite 2
« 1 Prise Muskatnuss
« 2 EL Röstzwiebeln
Zubereitung
2. Backen.`,
]);
assert.deepEqual(toPlain(guillemets.ingredients).slice(-2), [
  "1 Prise Muskatnuss",
  "2 EL Röstzwiebeln",
]);
assert.deepEqual(toPlain(guillemets.instructions), ["Kochen.", "Backen."]);

// 6. Without the word "Zutaten" the numbered steps still become steps.
const noHeadings = ocrRecipeFromPages([
  `Kartoffelsalat
500 g Kartoffeln
1 Zwiebel
1. Kartoffeln kochen.
2. Alles mischen.`,
]);
assert.equal(noHeadings.title, "Kartoffelsalat");
assert.deepEqual(toPlain(noHeadings.ingredients), [
  "500 g Kartoffeln",
  "1 Zwiebel",
]);
assert.deepEqual(toPlain(noHeadings.instructions), [
  "Kartoffeln kochen.",
  "Alles mischen.",
]);

// 7. Page numbers, separators and the repeated title are ignored.
const ignored = ocrRecipeFromPages([
  `Tomatensuppe
3 / 7
Zutaten
• 500 g Tomaten`,
  `Tomatensuppe – Seite 2
Zubereitung
1. Tomaten kochen.`,
]);
assert.deepEqual(toPlain(ignored.ingredients), ["500 g Tomaten"]);
assert.deepEqual(toPlain(ignored.instructions), ["Tomaten kochen."]);
assert.equal(ignored.title, "Tomatensuppe");

// 8. Overlapping photos do not duplicate the last ingredient.
const overlap = ocrRecipeFromPages([
  `Suppe
Zutaten
• 2 Karotten`,
  `Suppe – Seite 2
Zutaten
• 2 Karotten`,
]);
assert.deepEqual(toPlain(overlap.ingredients), ["2 Karotten"]);

// 9. Empty input stays an empty draft instead of throwing.
assert.deepEqual(toPlain(ocrRecipeFromPages([undefined, ""])), {
  title: "",
  servings: null,
  ingredients: [],
  instructions: [],
});

// 10. A printed breakfast card ("Schneller Himbeer-Kokos-Quark"): the
//     collection name above the title, the time label, the servings line and
//     the printed checkbox row are not ingredients; the longest real header
//     line becomes the title; "GEWÜRZE:" is a label and the optional note is
//     dropped.
const CARD_ONE = `GESAMTZEIT
2-3 Minuten
FRÜHSTÜCKS-
IDEEN
FÜR DIE WOCHE
SCHNELLER HIMBEER-KOKOS-QUARK
Für 1 Portion
ZUTATEN
• 20 g TK-Himbeeren
• 120 g Skyr
• 15 g Kokosraspeln
GEWÜRZE:
OPTIONAL: ETWAS SÜSSE (Z.B. HONIG)
Ja X Nein`;
const CARD_TWO = `ZUBEREITUNG
1. Himbeeren in eine Schüssel geben, auftauen lassen oder kurz in
die Mikrowelle geben.
2. Mit Skyr, Kokosraspeln und optional etwas Süße vermischen.
TIPP: DER QUARK SCHMECKT AUCH SUPER LECKER IN DEM MÜSLI-CUPS-REZEPT.`;
const breakfast = ocrRecipeFromPages([CARD_ONE, CARD_TWO]);
assert.equal(breakfast.title, "Schneller Himbeer-Kokos-Quark");
assert.equal(breakfast.servings, 1);
assert.deepEqual(toPlain(breakfast.ingredients), [
  "20 g TK-Himbeeren",
  "120 g Skyr",
  "15 g Kokosraspeln",
]);
assert.deepEqual(toPlain(breakfast.instructions), [
  "Himbeeren in eine Schüssel geben, auftauen lassen oder kurz in die Mikrowelle geben.",
  "Mit Skyr, Kokosraspeln und optional etwas Süße vermischen.",
]);

console.log("card_ocr_test: 10 checks passed");
