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
 *   show_import: true            # optional, shows the import field
 *   show_delete: true            # optional, shows the delete buttons
 */

const CARD_VERSION = "2.1.0";
const DETAIL_TYPE = "recipe-box-card";
const LIST_TYPE = "recipe-box-list";
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

const isRecipeState = (state) => {
  const attributes = (state && state.attributes) || {};
  if (attributes.integration === INTEGRATION) return true;
  return Boolean(attributes.source_url) && Array.isArray(attributes.ingredients);
};

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

const chipsHtml = (attributes) => {
  const chips = [];
  const time = formatMinutes(attributes.total_time_minutes);
  if (time) chips.push(time);
  const servings = formatServings(attributes.servings);
  if (servings) chips.push(servings);
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

const ingredientRow = (item, checked) => {
  const text = String(item);
  const isChecked = checked.has(text) ? " checked" : "";
  return `<li>
    <label>
      <input type="checkbox" data-ingredient="${escapeHtml(text)}"${isChecked}>
      <span>${escapeHtml(text)}</span>
    </label>
  </li>`;
};

const ingredientsHtml = (attributes, checked) => {
  const groups = (Array.isArray(attributes.ingredient_groups)
    ? attributes.ingredient_groups
    : []
  ).filter((group) => group && Array.isArray(group.items) && group.items.length);
  const flat = Array.isArray(attributes.ingredients)
    ? attributes.ingredients.filter(Boolean)
    : [];

  if (!flat.length && !groups.length) return "";

  if (groups.length > 1) {
    return groups
      .map(
        (group) => `
          <h4>${escapeHtml(group.name || "Zutaten")}</h4>
          <ul class="ingredients">${group.items
            .map((item) => ingredientRow(item, checked))
            .join("")}</ul>`
      )
      .join("");
  }

  const items = flat.length ? flat : groups[0].items;
  return `<ul class="ingredients">${items
    .map((item) => ingredientRow(item, checked))
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

const detailHtml = (state, options, checked) => {
  const attributes = state.attributes || {};
  const image =
    options.show_image && attributes.image_url
      ? `<img class="recipe-image" src="${escapeHtml(attributes.image_url)}" alt="${escapeHtml(recipeTitle(state))}" loading="lazy">`
      : "";
  const description = attributes.description
    ? `<p class="description">${escapeHtml(attributes.description)}</p>`
    : "";
  const ingredients = ingredientsHtml(attributes, checked);
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
      ${chipsHtml(attributes)}
      ${description}
      ${tagsHtml(attributes)}
      ${ingredients ? `<div class="section"><h3>Zutaten</h3>${ingredients}</div>` : ""}
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

const bindDetail = (root, hass, entityId, checked, dispatcher) => {
  root.querySelectorAll("input[data-ingredient]").forEach((input) => {
    input.addEventListener("change", () => {
      const value = input.getAttribute("data-ingredient") || "";
      if (input.checked) checked.add(value);
      else checked.delete(value);
    });
  });

  const button = root.querySelector("button.shopping");
  if (!button || !hass) return;

  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await hass.callService("recipe_box", "add_to_shopping_list", {
        entity_id: entityId,
      });
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
  .empty { margin: 0; padding: 8px 0; color: var(--secondary-text-color); font-size: 0.9rem; }
  .list-header { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .count { color: var(--secondary-text-color); font-size: 0.85rem; }
  .import-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  input.import-input { flex: 1 1 180px; min-width: 0; padding: 9px 10px; border-radius: 6px; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); background: var(--card-background-color, transparent); color: var(--primary-text-color); font-size: 0.9rem; }
  input.import-input:focus { outline: 2px solid var(--primary-color); outline-offset: 1px; }
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

    this.shadowRoot.innerHTML = `${STYLES}
      <ha-card>${detailHtml(this._state, this._config, this._checked)}</ha-card>`;
    bindDetail(
      this.shadowRoot,
      this._hass,
      this._config.entity,
      this._checked,
      this
    );
  }
}

class RecipeBoxListCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._checked = new Set();
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
    const url = (this._importUrl || "").trim();
    if (!url) {
      notify(this, "Bitte eine Rezept-URL einfügen.");
      return;
    }
    if (this._importing || !this._hass) return;

    this._importing = true;
    this._render();
    try {
      const response = await this._hass.callService(
        "recipe_box",
        "import_recipe",
        { url },
        undefined,
        false,
        true
      );
      this._importUrl = "";
      const title = response && response.title;
      notify(this, title ? `Rezept importiert: ${title}` : "Rezept importiert.");
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
          : `<span class="thumb placeholder"><ha-icon icon="mdi:silverware-fork-knife"></ha-icon></span>`;

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
          <input class="import-input" type="url" placeholder="Rezept-URL einfügen" value="${escapeHtml(this._importUrl)}"${this._importing ? " disabled" : ""}>
          <button class="import-button" type="button"${this._importing ? " disabled" : ""}>${this._importing ? "Importiere…" : "Importieren"}</button>
        </div>`
      : "";

    const body = entries.length
      ? `<ul class="recipe-list">${items.join("")}</ul>`
      : `<p class="empty">Noch keine Rezepte. Füge oben die URL eines Rezepts ein – zum Beispiel von Chefkoch.</p>`;

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

    const input = this.shadowRoot.querySelector("input.import-input");
    if (input) {
      input.addEventListener("input", () => {
        this._importUrl = input.value;
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
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
    this.shadowRoot.innerHTML = `${STYLES}
      <ha-card>
        <div class="list-bar">
          <button class="back" type="button">← ${escapeHtml(this._config.title || "Rezepte")}</button>
          <span class="list-bar-title">${escapeHtml(recipeTitle(entry.state))}</span>
          ${this._config.show_delete ? deleteButtonHtml(entry.entityId, this._pendingDelete === entry.entityId) : ""}
        </div>
        ${detailHtml(entry.state, this._config, this._checked)}
      </ha-card>`;

    bindDetail(
      this.shadowRoot,
      this._hass,
      entry.entityId,
      this._checked,
      this
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

if (!customElements.get(DETAIL_TYPE)) {
  customElements.define(DETAIL_TYPE, RecipeBoxCard);
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
