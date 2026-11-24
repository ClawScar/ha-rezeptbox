/* Behaviour tests for the ingredient scaling helpers of recipe-card.js.
 *
 * Run with: node tests/card_scaling_test.js
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
const start = source.indexOf("const FRACTION_TEXT = {");
const end = source.indexOf("const structuredIngredients");
assert.ok(start !== -1 && end > start, "scaling helpers not found in recipe-card.js");

const context = vm.createContext({});
vm.runInContext(
  `${source.slice(start, end)}
this.helpers = { parseIngredientLine, scaleIngredient };`,
  context
);

const { parseIngredientLine, scaleIngredient } = context.helpers;
const scaled = (text, factor) => scaleIngredient(parseIngredientLine(text), factor);

const cases = [
  // Plural units still work.
  ["1 Prise Salz", 2, "2 Prisen Salz"],
  ["1 Glas Milch", 2, "2 Gläser Milch"],
  // Plural ingredient names.
  ["1 Ei", 2, "2 Eier"],
  ["1 Zwiebel", 2, "2 Zwiebeln"],
  ["1 Tomate", 2, "2 Tomaten"],
  ["1 Kartoffel", 2, "2 Kartoffeln"],
  ["1 rote Zwiebel", 2, "2 rote Zwiebeln"],
  ["1 Zwiebel, fein gewürfelt", 2, "2 Zwiebeln, fein gewürfelt"],
  ["1 Gemüsezwiebel", 2, "2 Gemüsezwiebeln"],
  ["1 Süßkartoffel", 3, "3 Süßkartoffeln"],
  ["1 Apfel", 2, "2 Äpfel"],
  ["1 Hokkaido-Kürbis", 2, "2 Hokkaido-Kürbisse"],
  ["1–2 Zwiebel", 2, "2–4 Zwiebeln"],
  // Nouns inside a phrase with an adjective or a qualifier.
  ["1 ganzer Apfel", 2, "2 ganze Äpfel"],
  ["1 großer Apfel", 2, "2 große Äpfel"],
  ["1 kleines Ei", 2, "2 kleine Eier"],
  ["1 frisch geriebener Apfel", 2, "2 frisch geriebene Äpfel"],
  ["1 mittelgroße Zwiebel", 2, "2 mittelgroße Zwiebeln"],
  ["1 Zwiebel rot", 2, "2 Zwiebeln rot"],
  ["1 Zwiebel rot, geputzt", 2, "2 Zwiebeln rot, geputzt"],
  ["1 Tomate am Stiel", 2, "2 Tomaten am Stiel"],
  ["1 Apfelmus", 2, "2 Apfelmus"],
  ["1 Tomatensuppe", 3, "3 Tomatensuppe"],
  ["2 ganze Äpfel", 2, "4 ganze Äpfel"],
  ["1 kl. Zwiebel", 2, "2 kl. Zwiebeln"],
  // Unchanged amount, already plural names, brands and non-nouns stay as they are.
  ["1 Ei", 1, "1 Ei"],
  ["2 Zwiebeln", 2, "4 Zwiebeln"],
  ["1 Dose Tomaten", 2, "2 Dosen Tomaten"],
  ["1 Packung Philadelphia", 2, "2 Packungen Philadelphia"],
  ["Salz und Pfeffer", 2, "Salz und Pfeffer"],
  ["1/2 TL Salz", 1, "1/2 TL Salz"],
  // Going below two back to the singular.
  ["2 Eier", 0.25, "0,5 Ei"],
  ["4 Zwiebeln", 0.5, "2 Zwiebeln"],
  ["1 Dose Tomaten", 0.5, "0,5 Dose Tomaten"],
  // Gender decides the adjective ending when portions shrink again.
  ["2 ganze Äpfel", 0.5, "1 ganzer Apfel"],
  ["2 große Zwiebeln", 0.5, "1 große Zwiebel"],
  ["2 kleine Eier", 0.5, "1 kleines Ei"],
  ["2 ganze Tomaten", 0.5, "1 ganze Tomate"],
  ["2 frische Gurken", 0.5, "1 frische Gurke"],
  ["2 große Kartoffeln", 0.5, "1 große Kartoffel"],
  ["4 ganze Äpfel", 0.25, "1 ganzer Apfel"],
  ["2 große Steaks", 0.5, "1 großes Steak"],
  ["2 große Gemüsezwiebeln", 0.5, "1 große Gemüsezwiebel"],
  ["2 ganze Hokkaido-Kürbisse", 0.5, "1 ganzer Hokkaido-Kürbis"],
  ["1 große Melone", 2, "2 große Melone"],
  ["1 Blumenkohl", 2, "2 Blumenkohl"],
  ["2 ganze Äpfel", 2, "4 ganze Äpfel"],
  ["1 ganzer Apfel", 0.5, "0,5 ganzer Apfel"],
];

for (const [text, factor, expected] of cases) {
  assert.equal(scaled(text, factor), expected, `${text} × ${factor}`);
}

console.log(`card_scaling_test: ${cases.length} checks passed`);
