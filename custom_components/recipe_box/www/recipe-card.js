/* Rezeptbox – Lovelace cards
 *
 * Detail card:
 *   type: custom:recipe-box-card
 *   entity: sensor.lasagne
 *
 * List card (all recipes, import new ones, click one to open it):
 *   type: custom:recipe-box-list
 *   title: Rezepte                # optional
 *   entities:                    # optional, defaults to all recipes
 *     - sensor.lasagne
 *     - sensor.curry
 *   show_image: true             # optional
 *   show_steps: true             # optional
  *   show_import: true             # optional, shows the import field (accepts multiple URLs)
 *   show_delete: true            # optional, shows the delete buttons
 *
 * The detail view shows a -/+ control for the servings and rescales the
 * ingredient amounts live. The shopping list button passes the chosen
 * servings along, so the shopping list also gets the scaled amounts.
 */

const CARD_VERSION = "1.3.2";
const DETAIL_TYPE = "recipe-box-card";
const LIST_TYPE = "recipe-box-list";
const PANEL_TYPE = "recipe-box-panel";
const INTEGRATION = "recipe_box";

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);

const formatMinutes = (value) => {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (!hours) return `${rest} Min.`;
  return rest ? `${hours} Std. ${rest} Min.` : `${hours} Std.`;
};

const formatRating = (value, count) => {
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating <= 0) return "";
  const votes = Number(count);
  return `★ ${rating.toFixed(1)}${
    Number.isFinite(votes) && votes > 0 ? ` (${votes})` : ""
  }`;
};

const formatServings = (value) => {
  const servings = Number(value);
  if (!Number.isFinite(servings) || servings <= 0) return "";
  return `${servings} ${servings === 1 ? "Portion" : "Portionen"}`;
};

const FRACTION_TEXT = {
  "½": "1/2",
  "¼": "1/4",
  "¾": "3/4",
  "⅓": "1/3",
  "⅔": "2/3",
  "⅛": "1/8",
  "⅜": "3/8",
  "⅝": "5/8",
  "⅞": "7/8",
};

const UNITS = [
  "Messerspitze",
  "Päckchen",
  "Packungen",
  "Packung",
  "Portionen",
  "Portion",
  "Handvoll",
  "Scheiben",
  "Scheibe",
  "Stangen",
  "Stange",
  "Zweige",
  "Zweig",
  "Blätter",
  "Blatt",
  "Zehen",
  "Zehe",
  "Dosen",
  "Dose",
  "Gläser",
  "Glas",
  "Tassen",
  "Tasse",
  "Becher",
  "Würfel",
  "Stiele",
  "Stiel",
  "Stück",
  "Stk.",
  "Prisen",
  "Prise",
  "Bund",
  "Msp.",
  "EL",
  "TL",
  "kg",
  "mg",
  "ml",
  "cl",
  "dl",
  "cm",
  "g",
  "l",
  "cups",
  "cup",
  "tbsp",
  "tsp",
  "oz",
  "lb",
  "pinch",
];

const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const UNIT_PLURALS = {
  "Prise": "Prisen",
  "Messerspitze": "Messerspitzen",
  "Dose": "Dosen",
  "Packung": "Packungen",
  "Scheibe": "Scheiben",
  "Zehe": "Zehen",
  "Glas": "Gläser",
  "Tasse": "Tassen",
  "Blatt": "Blätter",
  "Zweig": "Zweige",
  "Stange": "Stangen",
  "Stiel": "Stiele",
  "Portion": "Portionen",
};

// Ingredient nouns that change between singular and plural with the amount.
// Keys are lowercase so compounds such as "Gemüsezwiebel" and "Süßkartoffel"
// keep working; only the head noun of an ingredient name is inflected, role
// text after a comma and the words before it stay untouched.
const INGREDIENT_PLURALS = {
  "ei": "eier",
  "zwiebel": "zwiebeln",
  "tomate": "tomaten",
  "kartoffel": "kartoffeln",
  "karotte": "karotten",
  "möhre": "möhren",
  "gurke": "gurken",
  "schote": "schoten",
  "schalotte": "schalotten",
  "zehe": "zehen",
  "apfel": "äpfel",
  "birne": "birnen",
  "banane": "bananen",
  "zitrone": "zitronen",
  "limette": "limetten",
  "orange": "orangen",
  "beere": "beeren",
  "kirsche": "kirschen",
  "pflaume": "pflaumen",
  "pfirsich": "pfirsiche",
  "aprikose": "aprikosen",
  "dattel": "datteln",
  "feige": "feigen",
  "aubergine": "auberginen",
  "kürbis": "kürbisse",
  "rübe": "rüben",
  "pastinake": "pastinaken",
  "pilz": "pilze",
  "champignon": "champignons",
  "olive": "oliven",
  "erbse": "erbsen",
  "bohne": "bohnen",
  "linse": "linsen",
  "mandel": "mandeln",
  "nuss": "nüsse",
  "semmel": "semmeln",
  "filet": "filets",
  "steak": "steaks",
  "chili": "chilis",
};

const INGREDIENT_SINGULARS = Object.fromEntries(
  Object.entries(INGREDIENT_PLURALS).map(([singular, plural]) => [plural, singular])
);

const matchWordCase = (source, replacement) =>
  source[0] === source[0].toUpperCase()
    ? replacement[0].toUpperCase() + replacement.slice(1)
    : replacement;

const replaceWordEnding = (word, ending, replacement) => {
  const start = word.length - ending.length;
  return `${word.slice(0, start)}${matchWordCase(word.slice(start), replacement)}`;
};

const inflectedWord = (word, plural) => {
  const key = word.toLowerCase();
  const forms = plural ? INGREDIENT_PLURALS : INGREDIENT_SINGULARS;
  for (const [ending, replacement] of Object.entries(forms)) {
    if (key === ending || (ending.length >= 4 && key.endsWith(ending))) {
      return replaceWordEnding(word, ending, replacement);
    }
  }
  return null;
};

const inflectName = (name, plural) => {
  let headEnd = name.length;
  for (const separator of [",", ";", "("]) {
    const index = name.indexOf(separator);
    if (index !== -1) headEnd = Math.min(headEnd, index);
  }
  const head = name.slice(0, headEnd).trimEnd();
  const start = head.lastIndexOf(" ") + 1;
  const word = head.slice(start);
  if (!word) return name;
  const inflected = inflectedWord(word, plural);
  if (inflected === null) return name;
  return `${name.slice(0, start)}${inflected}${name.slice(start + word.length)}`;
};

// The original line stays untouched at the recipe's own amount, so a recipe
// that already says "2 Eier" is not rewritten. Going below two pluralizes back
// to the singular.
const displayName = (item, amount) => {
  const name = String((item && item.name) || "");
  if (!name) return name;
  const value = Number(amount ?? (item && item.amount));
  if (!Number.isFinite(value)) return name;
  if (value >= 2) return inflectName(name, true);
  const original = Number(item && item.amount);
  if (Number.isFinite(original) && original >= 2) return inflectName(name, false);
  return name;
};

const displayUnit = (item, amount) => {
  const unit = String((item && item.unit) || "");
  const plural = UNIT_PLURALS[unit];
  if (!plural) return unit;
  const value = Number(amount ?? (item && item.amount));
  return Number.isFinite(value) && value >= 2 ? plural : unit;
};

const UNIT_PATTERN = [...UNITS]
  .sort((first, second) => second.length - first.length)
  .map(escapeRegExp)
  .join("|");

const AMOUNT_TOKEN = "\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?";
const INGREDIENT_LINE_RE = new RegExp(
  `^(?<amount>${AMOUNT_TOKEN})` +
    `(?:\\s*(?:-|–|bis)\\s*(?<amountMax>${AMOUNT_TOKEN}))?` +
    `\\s*(?:(?<unit>${UNIT_PATTERN})\\.?(?=\\s|$)\\s*)?` +
    "(?<name>.+)$",
  "i"
);

const normalizeFractions = (value) =>
  String(value ?? "")
    .replace(/[½¼¾⅓⅔⅛⅜⅝⅞]/g, (character) => ` ${FRACTION_TEXT[character]}`)
    .replace(/\s+/g, " ")
    .trim();

const parseAmountValue = (value) => {
  const text = String(value ?? "")
    .trim()
    .replace(",", ".");
  const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const denominator = Number(mixed[3]);
    return denominator ? Number(mixed[1]) + Number(mixed[2]) / denominator : null;
  }
  const fraction = text.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator ? Number(fraction[1]) / denominator : null;
  }
  const number = Number(text);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const formatAmountValue = (value) =>
  String(Math.round(Number(value) * 100) / 100).replace(".", ",");

const parseIngredientLine = (text, group = "") => {
  const source = normalizeFractions(String(text ?? "").trim());
  const item = {
    amount: null,
    amount_max: null,
    amount_text: "",
    unit: "",
    name: source,
    usage: "",
    text: String(text ?? "").trim(),
    group,
  };
  const match = source.match(INGREDIENT_LINE_RE);
  if (!match) return item;

  const amount = parseAmountValue(match.groups.amount);
  if (amount === null) return item;

  item.amount = amount;
  item.amount_text = formatAmountValue(amount);
  const amountMax = parseAmountValue(match.groups.amountMax);
  if (amountMax !== null && amountMax > amount) item.amount_max = amountMax;
  item.unit = (match.groups.unit || "").trim();
  item.name = (match.groups.name || "").trim() || source;
  return item;
};

const ingredientText = (item, amountText, unit, amount) => {
  const text = amountText ?? (item && item.amount_text) ?? "";
  const display = unit === undefined ? displayUnit(item) : unit;
  const line = [text, display, displayName(item, amount)]
    .filter(Boolean)
    .join(" ");
  const usage = String((item && item.usage) || "");
  if (!usage || !line) return line || String((item && item.text) || "");
  return usage.startsWith(",") || usage.startsWith(";")
    ? `${line}${usage}`
    : `${line}, ${usage}`;
};

const scaleIngredient = (item, factor) => {
  const amount = Number(item && item.amount);
  const scale = Number(factor);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(scale) || scale <= 0) {
    return ingredientText(item);
  }
  if (Math.abs(scale - 1) < 1e-9) {
    return String((item && item.text) || ingredientText(item));
  }
  const scaled = amount * scale;
  let amountText = formatAmountValue(scaled);
  let largest = scaled;
  const amountMax = Number(item.amount_max);
  if (Number.isFinite(amountMax) && amountMax > amount) {
    const scaledMax = amountMax * scale;
    amountText = `${amountText}–${formatAmountValue(scaledMax)}`;
    largest = Math.max(largest, scaledMax);
  }
  return ingredientText(item, amountText, displayUnit(item, largest), largest);
};

const structuredIngredients = (attributes) => {
  const structured = Array.isArray(attributes.ingredients_structured)
    ? attributes.ingredients_structured.filter(
        (item) => item && typeof item === "object"
      )
    : [];
  if (structured.length) return structured;

  return (Array.isArray(attributes.ingredients) ? attributes.ingredients : [])
    .filter(Boolean)
    .map((text) => parseIngredientLine(String(text)));
};

const isRecipeState = (state) => {
  const attributes = (state && state.attributes) || {};
  if (attributes.integration === INTEGRATION) return true;
  return Boolean(attributes.source_url) && Array.isArray(attributes.ingredients);
};

const parseUrls = (value) =>
  [
    ...new Set(
      String(value || "")
        .split(/[\s,;]+/)
        .map((part) => part.trim())
        .filter(Boolean)
    ),
  ];

const recipeTitle = (state) => {
  const attributes = (state && state.attributes) || {};
  return attributes.title || attributes.friendly_name || (state ? state.entity_id : "");
};

const recipeEntities = (hass, filter) => {
  const wanted = Array.isArray(filter) && filter.length ? filter : null;
  const result = [];
  for (const [entityId, state] of Object.entries((hass && hass.states) || {})) {
    if (!entityId.startsWith("sensor.")) continue;
    if (wanted && !wanted.includes(entityId)) continue;
    if (!isRecipeState(state)) continue;
    result.push({ entityId, state });
  }
  result.sort((first, second) =>
    recipeTitle(first.state).localeCompare(recipeTitle(second.state), "de")
  );
  return result;
};

const chipsHtml = (attributes, servings) => {
  const chips = [];
  const time = formatMinutes(attributes.total_time_minutes);
  if (time) chips.push(time);
  const chosen = Number(servings);
  const servingsText = formatServings(
    Number.isFinite(chosen) && chosen > 0 ? chosen : attributes.servings
  );
  if (servingsText) chips.push(servingsText);
  const rating = formatRating(attributes.rating, attributes.rating_count);
  if (rating) chips.push(rating);
  if (attributes.difficulty) chips.push(attributes.difficulty);
  if (!chips.length) return "";
  return `<div class="chips">${chips
    .map((chip) => `<span class="chip">${escapeHtml(chip)}</span>`)
    .join("")}</div>`;
};

const tagsHtml = (attributes) => {
  const tags = Array.isArray(attributes.tags)
    ? attributes.tags.filter(Boolean).slice(0, 8)
    : [];
  if (!tags.length) return "";
  return `<div class="tags">${tags
    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join("")}</div>`;
};

const ingredientRow = (item, checked, factor) => {
  const key = String(item.text || ingredientText(item));
  const text = scaleIngredient(item, factor);
  const isChecked = checked.has(key) ? " checked" : "";
  return `<li>
    <label>
      <input type="checkbox" data-ingredient="${escapeHtml(key)}"${isChecked}>
      <span>${escapeHtml(text)}</span>
    </label>
  </li>`;
};

const servingsControlHtml = (attributes, servings) => {
  const base = Number(attributes.servings);
  if (!Number.isFinite(base) || base <= 0) return "";
  const chosen = Number(servings);
  const value = Number.isFinite(chosen) && chosen > 0 ? chosen : base;
  return `<div class="servings">
    <button class="servings-button" type="button" data-step="-1" aria-label="Weniger Portionen"${value <= 1 ? " disabled" : ""}>−</button>
    <span class="servings-value">${escapeHtml(formatServings(value))}</span>
    <button class="servings-button" type="button" data-step="1" aria-label="Mehr Portionen"${value >= 99 ? " disabled" : ""}>+</button>
  </div>`;
};

const ingredientsHtml = (attributes, checked, factor) => {
  const items = structuredIngredients(attributes);
  if (!items.length) return "";

  const groups = [];
  for (const item of items) {
    const name = String(item.group || "").trim();
    const last = groups[groups.length - 1];
    if (!last || last.name !== name) groups.push({ name, items: [] });
    groups[groups.length - 1].items.push(item);
  }

  if (groups.length > 1) {
    return groups
      .map(
        (group) => `
          <h4>${escapeHtml(group.name || "Zutaten")}</h4>
          <ul class="ingredients">${group.items
            .map((item) => ingredientRow(item, checked, factor))
            .join("")}</ul>`
      )
      .join("");
  }

  return `<ul class="ingredients">${items
    .map((item) => ingredientRow(item, checked, factor))
    .join("")}</ul>`;
};

const stepsHtml = (attributes) => {
  const steps = Array.isArray(attributes.instructions)
    ? attributes.instructions.filter(Boolean)
    : [];
  if (!steps.length) return "";
  return `<div class="section"><h3>Zubereitung</h3><ol class="steps">${steps
    .map((step) => `<li>${escapeHtml(step)}</li>`)
    .join("")}</ol></div>`;
};

const detailHtml = (state, options, checked, servings) => {
  const attributes = state.attributes || {};
  const baseServings = Number(attributes.servings);
  const chosenServings = Number(servings);
  const factor =
    Number.isFinite(baseServings) &&
    baseServings > 0 &&
    Number.isFinite(chosenServings) &&
    chosenServings > 0
      ? chosenServings / baseServings
      : 1;
  const image =
    options.show_image && attributes.image_url
      ? `<img class="recipe-image" src="${escapeHtml(attributes.image_url)}" alt="${escapeHtml(recipeTitle(state))}" loading="lazy">`
      : "";
  const description = attributes.description
    ? `<p class="description">${escapeHtml(attributes.description)}</p>`
    : "";
  const ingredients = ingredientsHtml(attributes, checked, factor);
  const steps = options.show_steps ? stepsHtml(attributes) : "";
  const source = attributes.source_url
    ? `<a class="source" href="${escapeHtml(attributes.source_url)}" target="_blank" rel="noopener noreferrer">Originalrezept ↗</a>`
    : "<span></span>";
  const shopping =
    Array.isArray(attributes.ingredients) && attributes.ingredients.length
      ? `<button class="shopping" type="button">Zutaten auf die Liste</button>`
      : "";

  return `${image}
    <div class="content">
      <h2>${escapeHtml(recipeTitle(state))}</h2>
      ${chipsHtml(attributes, chosenServings)}
      ${description}
      ${tagsHtml(attributes)}
      ${ingredients ? `<div class="section"><h3>Zutaten</h3>${servingsControlHtml(attributes, chosenServings)}${ingredients}</div>` : ""}
      ${steps}
      <div class="footer">${source}${shopping}</div>
    </div>`;
};

const deleteButtonHtml = (entityId, pending) => `<button class="delete${pending ? " confirm" : ""}" type="button" data-entity="${escapeHtml(entityId)}" title="Rezept löschen" aria-label="Rezept löschen">${pending ? "Löschen?" : `<ha-icon icon="mdi:delete-outline"></ha-icon>`}</button>`;

const notify = (target, message) => {
  if (!target || typeof target.dispatchEvent !== "function") return;
  target.dispatchEvent(
    new CustomEvent("hass-notification", {
      detail: { message },
      bubbles: true,
      composed: true,
    })
  );
};

const bindDetail = (root, hass, entityId, checked, dispatcher, options = {}) => {
  root.querySelectorAll("input[data-ingredient]").forEach((input) => {
    input.addEventListener("change", () => {
      const value = input.getAttribute("data-ingredient") || "";
      if (input.checked) checked.add(value);
      else checked.delete(value);
    });
  });

  root.querySelectorAll("button.servings-button").forEach((button) => {
    button.addEventListener("click", () => {
      const step = Number(button.getAttribute("data-step")) || 0;
      const current = Number(options.servings) || 1;
      const next = Math.max(1, Math.min(99, current + step));
      if (typeof options.onServings === "function") options.onServings(next);
    });
  });

  const button = root.querySelector("button.shopping");
  if (!button || !hass) return;

  button.addEventListener("click", async () => {
    button.disabled = true;
    const params = { entity_id: entityId };
    const servings = Number(options.servings);
    if (Number.isFinite(servings) && servings > 0) params.servings = servings;
    try {
      await hass.callService("recipe_box", "add_to_shopping_list", params);
      notify(dispatcher, "Zutaten zur Einkaufsliste hinzugefügt.");
    } catch (error) {
      notify(dispatcher, `Einkaufsliste: ${error.message || error}`);
    } finally {
      button.disabled = false;
    }
  });
};

const STYLES = `<style>
  :host { display: block; }
  ha-card { overflow: hidden; }
  .recipe-image { display: block; width: 100%; max-height: 260px; object-fit: cover; }
  .content { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  h2 { margin: 0; font-size: 1.25rem; font-weight: 600; color: var(--primary-text-color); }
  h3 { margin: 0 0 6px; font-size: 0.85rem; letter-spacing: 0.05em; text-transform: uppercase; color: var(--secondary-text-color); font-weight: 600; }
  h4 { margin: 8px 0 4px; font-size: 0.9rem; color: var(--primary-text-color); font-weight: 600; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { background: var(--secondary-background-color, rgba(127, 127, 127, 0.15)); color: var(--primary-text-color); font-size: 0.8rem; padding: 2px 10px; border-radius: 999px; }
  .tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .tag { color: var(--secondary-text-color); border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.3)); font-size: 0.75rem; padding: 1px 8px; border-radius: 999px; }
  .description { margin: 0; font-size: 0.9rem; color: var(--secondary-text-color); }
  .section { display: flex; flex-direction: column; }
  ul.ingredients { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  ul.ingredients label { display: flex; gap: 8px; align-items: flex-start; padding: 4px 0; font-size: 0.92rem; color: var(--primary-text-color); cursor: pointer; }
  ul.ingredients input { margin-top: 2px; accent-color: var(--primary-color); }
  ul.ingredients input:checked + span { text-decoration: line-through; color: var(--secondary-text-color); }
  ol.steps { margin: 0; padding-left: 1.2rem; display: flex; flex-direction: column; gap: 6px; font-size: 0.92rem; color: var(--primary-text-color); }
  .footer { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; border-top: 1px solid var(--divider-color, rgba(127, 127, 127, 0.25)); padding-top: 12px; }
  a.source { color: var(--primary-color); font-size: 0.9rem; text-decoration: none; }
  button.shopping { background: var(--primary-color); color: var(--text-primary-color, #fff); border: none; border-radius: 6px; padding: 8px 14px; font-size: 0.9rem; cursor: pointer; }
  button.shopping:hover { opacity: 0.9; }
  button.shopping:disabled { opacity: 0.6; cursor: default; }
  .servings { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; }
  button.servings-button { width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); background: var(--secondary-background-color, rgba(127, 127, 127, 0.1)); color: var(--primary-text-color); font-size: 1.15rem; line-height: 1; cursor: pointer; }
  button.servings-button:hover { border-color: var(--primary-color); }
  button.servings-button:disabled { opacity: 0.45; cursor: default; }
  .servings-value { font-size: 0.9rem; font-weight: 600; min-width: 92px; text-align: center; color: var(--primary-text-color); }
  .empty { margin: 0; padding: 8px 0; color: var(--secondary-text-color); font-size: 0.9rem; }
  .list-header { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .count { color: var(--secondary-text-color); font-size: 0.85rem; }
  .import-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; }
  textarea.import-input { flex: 1 1 220px; min-width: 0; min-height: 44px; resize: vertical; padding: 9px 10px; border-radius: 6px; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); background: var(--card-background-color, transparent); color: var(--primary-text-color); font-size: 0.9rem; font-family: inherit; }
  textarea.import-input:focus { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  button.import-button { flex: 0 0 auto; background: var(--primary-color); color: var(--text-primary-color, #fff); border: none; border-radius: 6px; padding: 9px 14px; font-size: 0.9rem; cursor: pointer; }
  button.import-button:disabled { opacity: 0.6; cursor: default; }
  ul.recipe-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  ul.recipe-list li + li { border-top: 1px solid var(--divider-color, rgba(127, 127, 127, 0.2)); }
  li.recipe-row { display: flex; align-items: center; gap: 2px; }
  button.recipe-item { display: flex; flex: 1 1 auto; min-width: 0; align-items: center; gap: 12px; padding: 10px 0; background: none; border: none; text-align: left; color: var(--primary-text-color); cursor: pointer; }
  button.delete { flex: 0 0 auto; display: inline-flex; align-items: center; background: none; border: none; color: var(--secondary-text-color); cursor: pointer; padding: 8px 6px; border-radius: 6px; font-size: 0.78rem; --mdc-icon-size: 20px; }
  button.delete:hover { color: var(--error-color, #db4437); background: rgba(219, 68, 55, 0.08); }
  button.delete.confirm { color: var(--error-color, #db4437); font-weight: 600; }
  .list-bar button.delete { margin-left: auto; }
  button.recipe-item:hover { background: var(--secondary-background-color, rgba(127, 127, 127, 0.08)); }
  .thumb { width: 48px; height: 48px; border-radius: 8px; object-fit: cover; flex: 0 0 auto; }
  .thumb.placeholder { display: flex; align-items: center; justify-content: center; background: var(--secondary-background-color, rgba(127, 127, 127, 0.15)); color: var(--secondary-text-color); }
  .item-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .item-title { font-size: 0.95rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .item-meta { font-size: 0.8rem; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  ha-icon.chevron { margin-left: auto; color: var(--secondary-text-color); --mdc-icon-size: 20px; flex: 0 0 auto; }
  .list-bar { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-bottom: 1px solid var(--divider-color, rgba(127, 127, 127, 0.25)); }
  button.back { background: none; border: none; padding: 4px 0; color: var(--primary-color); font-size: 0.9rem; cursor: pointer; white-space: nowrap; }
  .list-bar-title { color: var(--secondary-text-color); font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>`;

class RecipeBoxCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._checked = new Set();
    this._servings = new Map();
    this._state = undefined;
    this._hass = undefined;
  }

  static getStubConfig(hass) {
    const [first] = recipeEntities(hass, null);
    return { entity: first ? first.entityId : "" };
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("recipe-box-card: Bitte 'entity' angeben.");
    }
    this._config = { show_image: true, show_steps: true, ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    const state = hass.states[this._config.entity];
    if (state === this._state) return;
    this._state = state;
    this._render();
  }

  getCardSize() {
    return 12;
  }

  _render() {
    if (!this.shadowRoot) return;

    if (!this._state) {
      this.shadowRoot.innerHTML = `${STYLES}
        <ha-card>
          <p class="empty">Entität ${escapeHtml(this._config ? this._config.entity : "")} nicht gefunden.</p>
        </ha-card>`;
      return;
    }

    const entityId = this._config.entity;
    const baseServings = Number((this._state.attributes || {}).servings);
    const servings = this._servings.has(entityId)
      ? this._servings.get(entityId)
      : baseServings;

    this.shadowRoot.innerHTML = `${STYLES}
      <ha-card>${detailHtml(this._state, this._config, this._checked, servings)}</ha-card>`;
    bindDetail(
      this.shadowRoot,
      this._hass,
      entityId,
      this._checked,
      this,
      {
        servings,
        onServings: (next) => {
          this._servings.set(entityId, next);
          this._render();
        },
      }
    );
  }
}

class RecipeBoxListCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._checked = new Set();
    this._servings = new Map();
    this._selected = null;
    this._signature = null;
    this._hass = undefined;
    this._importUrl = "";
    this._importing = false;
    this._pendingDelete = null;
    this._deleteTimer = null;
  }

  static getStubConfig() {
    return { title: "Rezepte" };
  }

  setConfig(config) {
    const entities =
      typeof (config || {}).entities === "string"
        ? [config.entities]
        : (config || {}).entities;
    this._config = {
      title: "Rezepte",
      show_image: true,
      show_steps: true,
      show_import: true,
      show_delete: true,
      ...config,
      entities,
    };
    this._signature = null;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;

    const recipes = this._recipes();
    if (this._selected && !recipes.some((entry) => entry.entityId === this._selected)) {
      this._selected = null;
    }
    const signature =
      recipes
        .map(({ entityId, state }) => `${entityId}:${state.last_updated}`)
        .join("|") + `#${this._selected || ""}`;
    if (signature === this._signature) return;
    this._signature = signature;
    this._render(recipes);
  }

  getCardSize() {
    return Math.min(20, 2 + this._recipes().length * 2);
  }

  _recipes() {
    return this._hass ? recipeEntities(this._hass, this._config.entities) : [];
  }

  _render(recipes) {
    if (!this.shadowRoot) return;
    const entries = recipes || this._recipes();

    if (this._selected) {
      const selected = entries.find((entry) => entry.entityId === this._selected);
      if (selected) {
        this._renderDetail(selected);
        return;
      }
      this._selected = null;
    }

    this._renderList(entries);
  }

  async _import() {
    const urls = parseUrls(this._importUrl);
    if (!urls.length) {
      notify(this, "Bitte mindestens eine Rezept-URL einfügen.");
      return;
    }
    if (this._importing || !this._hass) return;

    this._importing = true;
    this._render();
    try {
      if (urls.length === 1) {
        const response = await this._hass.callService(
          "recipe_box",
          "import_recipe",
          { url: urls[0] },
          undefined,
          false,
          true
        );
        this._importUrl = "";
        const title = response && response.title;
        notify(this, title ? `Rezept importiert: ${title}` : "Rezept importiert.");
      } else {
        const response = await this._hass.callService(
          "recipe_box",
          "import_recipe",
          { urls },
          undefined,
          false,
          true
        );
        this._importUrl = "";
        const imported = (response && response.imported) || [];
        const failed = (response && response.failed) || [];
        notify(this, this._importSummary(imported.length, failed));
      }
    } catch (error) {
      notify(
        this,
        `Import fehlgeschlagen: ${(error && (error.message || error.code)) || "unbekannter Fehler"}`
      );
    } finally {
      this._importing = false;
      this._signature = null;
      this._render();
    }
  }

  _importSummary(importedCount, failed) {
    const total = importedCount + failed.length;
    if (!failed.length) {
      return `${importedCount} von ${total} Rezepten importiert.`;
    }
    const first = failed[0] || {};
    const raw = String(first.url || "");
    const label = raw.length > 60 ? `${raw.slice(0, 57)}…` : raw;
    return `${importedCount} von ${total} importiert, ${failed.length} fehlgeschlagen (${label}: ${first.error || "Fehler"}).`;
  }

  _requestDelete(entityId) {
    if (!entityId || !this._config.show_delete || !this._hass) return;

    if (this._pendingDelete === entityId) {
      this._delete(entityId);
      return;
    }

    this._pendingDelete = entityId;
    clearTimeout(this._deleteTimer);
    this._deleteTimer = setTimeout(() => {
      this._pendingDelete = null;
      this._signature = null;
      this._render();
    }, 4000);
    this._signature = null;
    this._render();
  }

  async _delete(entityId) {
    clearTimeout(this._deleteTimer);
    const entry = this._recipes().find((item) => item.entityId === entityId);
    const title = entry ? recipeTitle(entry.state) : "";
    this._pendingDelete = null;
    try {
      await this._hass.callService("recipe_box", "remove_recipe", {
        entity_id: entityId,
      });
      notify(this, title ? `Rezept gelöscht: ${title}` : "Rezept gelöscht.");
      if (this._selected === entityId) this._selected = null;
    } catch (error) {
      notify(
        this,
        `Löschen fehlgeschlagen: ${(error && (error.message || error.code)) || "unbekannter Fehler"}`
      );
    } finally {
      this._signature = null;
      this._render();
    }
  }

  _renderList(entries) {
    const items = entries.map(({ entityId, state }) => {
      const attributes = state.attributes || {};
      const meta = [
        formatMinutes(attributes.total_time_minutes),
        formatServings(attributes.servings),
        formatRating(attributes.rating, attributes.rating_count),
      ]
        .filter(Boolean)
        .join(" · ");
      const thumb =
        this._config.show_image && attributes.image_url
          ? `<img class="thumb" src="${escapeHtml(attributes.image_url)}" alt="" loading="lazy">`
          : `<span class="thumb placeholder"><ha-icon icon="mdi:chef-hat"></ha-icon></span>`;

      const removeButton = this._config.show_delete
        ? deleteButtonHtml(entityId, this._pendingDelete === entityId)
        : "";

      return `<li class="recipe-row">
        <button class="recipe-item" type="button" data-entity="${escapeHtml(entityId)}">
          ${thumb}
          <span class="item-text">
            <span class="item-title">${escapeHtml(recipeTitle(state))}</span>
            <span class="item-meta">${escapeHtml(meta)}</span>
          </span>
          <ha-icon class="chevron" icon="mdi:chevron-right"></ha-icon>
        </button>
        ${removeButton}
      </li>`;
    });

    const importBar = this._config.show_import
      ? `<div class="import-bar">
          <textarea class="import-input" rows="2" placeholder="Rezept-URLs – eine pro Zeile"${this._importing ? " disabled" : ""}>${escapeHtml(this._importUrl)}</textarea>
          <button class="import-button" type="button"${this._importing ? " disabled" : ""}>${this._importing ? "Importiere…" : "Importieren"}</button>
        </div>`
      : "";

    const body = entries.length
      ? `<ul class="recipe-list">${items.join("")}</ul>`
      : `<p class="empty">Noch keine Rezepte. Füge oben eine oder mehrere Rezept-URLs ein – zum Beispiel von Chefkoch.</p>`;

    this.shadowRoot.innerHTML = `${STYLES}
      <ha-card>
        <div class="content">
          ${importBar}
          <div class="list-header">
            <h2>${escapeHtml(this._config.title)}</h2>
            <span class="count">${entries.length}</span>
          </div>
          ${body}
        </div>
      </ha-card>`;

    this.shadowRoot.querySelectorAll("button.recipe-item").forEach((button) => {
      button.addEventListener("click", () => {
        this._selected = button.getAttribute("data-entity");
        this._signature = null;
        this._render();
      });
    });

    this.shadowRoot.querySelectorAll("button.delete").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this._requestDelete(button.getAttribute("data-entity"));
      });
    });

    const input = this.shadowRoot.querySelector("textarea.import-input");
    if (input) {
      input.addEventListener("input", () => {
        this._importUrl = input.value;
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          this._import();
        }
      });
    }
    const importButton = this.shadowRoot.querySelector("button.import-button");
    if (importButton) {
      importButton.addEventListener("click", () => this._import());
    }
  }

  _renderDetail(entry) {
    const baseServings = Number((entry.state.attributes || {}).servings);
    const servings = this._servings.has(entry.entityId)
      ? this._servings.get(entry.entityId)
      : baseServings;

    this.shadowRoot.innerHTML = `${STYLES}
      <ha-card>
        <div class="list-bar">
          <button class="back" type="button">← ${escapeHtml(this._config.title || "Rezepte")}</button>
          <span class="list-bar-title">${escapeHtml(recipeTitle(entry.state))}</span>
          ${this._config.show_delete ? deleteButtonHtml(entry.entityId, this._pendingDelete === entry.entityId) : ""}
        </div>
        ${detailHtml(entry.state, this._config, this._checked, servings)}
      </ha-card>`;

    bindDetail(
      this.shadowRoot,
      this._hass,
      entry.entityId,
      this._checked,
      this,
      {
        servings,
        onServings: (next) => {
          this._servings.set(entry.entityId, next);
          this._render();
        },
      }
    );

    this.shadowRoot.querySelectorAll("button.delete").forEach((button) => {
      button.addEventListener("click", () => {
        this._requestDelete(button.getAttribute("data-entity"));
      });
    });

    const back = this.shadowRoot.querySelector("button.back");
    if (back) {
      back.addEventListener("click", () => {
        this._selected = null;
        this._signature = null;
        this._render();
      });
    }
  }
}

class RecipeBoxPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._card = null;
    this._hass = undefined;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._card) {
      this.shadowRoot.innerHTML = `<style>
        :host { display: block; padding: 16px; box-sizing: border-box; }
        recipe-box-list { display: block; max-width: 960px; margin: 0 auto; }
      </style>`;
      this._card = document.createElement(LIST_TYPE);
      this._card.setConfig({
        title: "Rezepte",
        show_import: true,
        show_delete: true,
      });
      this.shadowRoot.appendChild(this._card);
    }
    this._card.hass = hass;
  }

  set narrow(value) {
    this._narrow = value;
  }

  set route(value) {
    this._route = value;
  }

  set panel(value) {
    this._panel = value;
  }
}

if (!customElements.get(DETAIL_TYPE)) {
  customElements.define(DETAIL_TYPE, RecipeBoxCard);
}

if (!customElements.get(PANEL_TYPE)) {
  customElements.define(PANEL_TYPE, RecipeBoxPanel);
}

if (!customElements.get(LIST_TYPE)) {
  customElements.define(LIST_TYPE, RecipeBoxListCard);
}

window.customCards = window.customCards || [];
const CUSTOM_CARDS = [
  {
    type: LIST_TYPE,
    name: "Rezeptbox Liste",
    description:
      "Zeigt alle Rezepte als Liste und importiert neue Rezepte per URL; ein Rezept antippen öffnet die Details.",
    preview: false,
  },
  {
    type: DETAIL_TYPE,
    name: "Rezeptbox Rezept",
    description:
      "Zeigt ein importiertes Rezept mit Bild, Zutaten und Zubereitung.",
    preview: false,
  },
];
for (const card of CUSTOM_CARDS) {
  if (!window.customCards.some((known) => known.type === card.type)) {
    window.customCards.push(card);
  }
}

console.info(
  `%c REZEPTBOX-CARDS %c v${CARD_VERSION} `,
  "color:#fff;background:#2e7d32;font-weight:600",
  "color:#2e7d32;background:#e8f5e9"
);
