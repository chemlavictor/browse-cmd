/**
 * ui.js — Interface shell (shadow root + styles).
 *
 * Crée un <div id="browse-cmd-root"> avec une shadow root isolée.
 * À l'intérieur : un voile noir plein écran + un panneau shell centré.
 *
 * Layout (§5 SPEC) :
 *  - Voile : rgba(0,0,0,0.85), recouvre toute la page.
 *  - Shell : 80vw × 60vh, centré.
 *  - Zone de scroll fixe en haut (historique des sorties défile).
 *  - Ligne de saisie fixe en bas avec prompt `❯`.
 *
 * Chargé après state.js et commands.js (voir manifest content_scripts.js).
 *
 * Callbacks globaux (rappelés par state.js / commands.js) :
 *  - window.__browseCmdOnOpen()   → rend visible le panneau.
 *  - window.__browseCmdOnClose()  → rend invisible le panneau.
 *  - window.__browseCmdOnOutput({type, text}) → ajoute une ligne à la zone de scroll.
 *  - window.__browseCmdClear()    → vide la zone de scroll.
 */

(function () {
  "use strict";

  const ROOT_ID = "browse-cmd-root";

  /** Éléments DOM (remplis dans build()). */
  let overlayEl = null;
  let outputEl = null;
  let inputEl = null;
  let suggestEl = null;
  let inputIndex = -1;
  let draft = "";
  let suggestions = [];
  let suggestIndex = -1;

  /**
   * Construit le DOM du shell dans une shadow root.
   * Idempotent : ne recrée pas si déjà présent.
   */
  function build() {
    if (document.getElementById(ROOT_ID)) return;

    const host = document.createElement("div");
    host.id = ROOT_ID;
    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = CSS;
    shadow.appendChild(style);

    // Voile noir plein écran.
    overlayEl = document.createElement("div");
    overlayEl.className = "bc-overlay";
    shadow.appendChild(overlayEl);

    // Panneau shell centré.
    const panel = document.createElement("div");
    panel.className = "bc-panel";

    // Zone de scroll (historique des sorties).
    outputEl = document.createElement("div");
    outputEl.className = "bc-output";
    panel.appendChild(outputEl);

    // Ligne de saisie.
    const inputRow = document.createElement("div");
    inputRow.className = "bc-input-row";

    const prompt = document.createElement("span");
    prompt.className = "bc-prompt";
    prompt.textContent = "❯";
    inputRow.appendChild(prompt);

    inputEl = document.createElement("input");
    inputEl.className = "bc-input";
    inputEl.type = "text";
    inputEl.autocomplete = "off";
    inputEl.spellcheck = false;
    inputRow.appendChild(inputEl);

    // Menu d'autocomplétion (au-dessus de la ligne de saisie).
    suggestEl = document.createElement("div");
    suggestEl.className = "bc-suggest";
    panel.appendChild(suggestEl);

    panel.appendChild(inputRow);
    shadow.appendChild(panel);

    document.body.appendChild(host);

    // Événements clavier sur l'input.
    inputEl.addEventListener("keydown", onKeydown);
    inputEl.addEventListener("input", onInput);
    // Focus auto à l'ouverture.
    inputEl.addEventListener("focus", () => {
      /* no-op — le focus est géré par openPanel */
    });
  }

  /**
   * Gère les touches sur la ligne de saisie.
   * - Enter : exécute la commande.
   * - Tab : complète la commande.
   * - ↑ / ↓ : navigue dans l'historique (ou les suggestions).
   * - Esc : ferme le shell.
   * @param {KeyboardEvent} e
   */
  function onKeydown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      hideSuggest();
      const cmd = inputEl.value;
      inputEl.value = "";
      draft = "";
      inputIndex = -1;
      window.BrowseCmd.runCommand(cmd);
    } else if (e.key === "Tab") {
      e.preventDefault();
      acceptSuggestion();
    } else if (e.key === "Escape") {
      e.preventDefault();
      hideSuggest();
      window.BrowseCmd.toggle();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (suggestions.length > 0 && suggestIndex >= 0) {
        // Navigation dans les suggestions.
        if (suggestIndex > 0) suggestIndex--;
        renderSuggest();
      } else {
        navigateHistory(-1);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestions.length > 0 && suggestIndex >= 0) {
        // Navigation dans les suggestions.
        if (suggestIndex < suggestions.length - 1) suggestIndex++;
        renderSuggest();
      } else {
        navigateHistory(1);
      }
    }
  }

  /**
   * Liste des commandes pour l'autocomplétion.
   */
  const COMMANDS = ["help", "clear", "quit", "q", "url", "tab", "get", "click", "copy", "eval"];

  /**
   * Déclenché à chaque frappe : calcule les suggestions.
   */
  function onInput() {
    const val = inputEl.value;
    // On autocomplete seulement si la ligne ne contient pas d'espace
    // (donc qu'un seul token en cours de saisie).
    if (val.includes(" ")) {
      hideSuggest();
      return;
    }
    const lower = val.toLowerCase();
    if (lower.length === 0) {
      hideSuggest();
      return;
    }
    suggestions = COMMANDS.filter((c) => c.startsWith(lower) && c !== lower);
    suggestIndex = suggestions.length > 0 ? 0 : -1;
    if (suggestions.length === 0) {
      hideSuggest();
    } else {
      renderSuggest();
    }
  }

  /**
   * Rend le menu de suggestions.
   */
  function renderSuggest() {
    if (!suggestEl) return;
    suggestEl.innerHTML = "";
    suggestions.forEach((s, i) => {
      const item = document.createElement("div");
      item.className = "bc-suggest-item" + (i === suggestIndex ? " bc-suggest-active" : "");
      item.textContent = s;
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        completeTo(s);
      });
      suggestEl.appendChild(item);
    });
    suggestEl.style.display = "block";
  }

  /**
   * Cache le menu de suggestions.
   */
  function hideSuggest() {
    suggestions = [];
    suggestIndex = -1;
    if (suggestEl) suggestEl.style.display = "none";
  }

  /**
   * Accepte la suggestion active (ou la seule suggestion).
   */
  function acceptSuggestion() {
    if (suggestions.length === 0) return;
    const s = suggestions[suggestIndex >= 0 ? suggestIndex : 0];
    completeTo(s);
  }

  /**
   * Remplit l'input avec la suggestion + un espace.
   * @param {string} s
   */
  function completeTo(s) {
    inputEl.value = s + " ";
    hideSuggest();
    inputEl.focus();
  }

  /**
   * Navigue dans l'historique des commandes.
   * @param {number} dir - -1 pour ↑ (anciennes), +1 pour ↓ (récentes).
   */
  function navigateHistory(dir) {
    const history = window.BrowseCmd.history;
    if (history.length === 0) return;

    if (dir === -1) {
      // ↑ : va vers une commande plus ancienne.
      if (inputIndex === -1) {
        draft = inputEl.value;
        inputIndex = history.length - 1;
      } else if (inputIndex > 0) {
        inputIndex--;
      }
      inputEl.value = history[inputIndex];
    } else {
      // ↓ : va vers une commande plus récente.
      if (inputIndex === -1) return;
      if (inputIndex < history.length - 1) {
        inputIndex++;
        inputEl.value = history[inputIndex];
      } else {
        inputIndex = -1;
        inputEl.value = draft;
      }
    }
    // Curseur à la fin.
    inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
  }

  /**
   * Ajoute une ligne dans la zone de scroll.
   * @param {{type: string, text: string}} entry
   *   type: "cmd" (commande saisie), "out" (sortie), "err" (erreur).
   */
  function appendOutput({ type, text }) {
    if (!outputEl) return;
    const line = document.createElement("div");
    line.className = `bc-line bc-${type}`;

    if (type === "cmd") {
      line.textContent = `❯ ${text}`;
    } else {
      line.textContent = text;
      line.style.whiteSpace = "pre-wrap";
    }
    outputEl.appendChild(line);

    // Défile en bas.
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  /**
   * Vide la zone de scroll (commande `clear`).
   */
  function clearOutput() {
    if (outputEl) outputEl.innerHTML = "";
  }

  /**
   * Rend le panneau visible et focus l'input.
   */
  let welcomed = false;

  function openPanel() {
    if (!overlayEl) build();
    overlayEl.style.display = "flex";
    if (inputEl) {
      inputEl.focus();
      inputEl.select();
    }
    // Affiche le message de bienvenue à la première ouverture.
    if (!welcomed && outputEl) {
      welcomed = true;
      const line = document.createElement("div");
      line.className = "bc-line bc-out";
      line.style.whiteSpace = "pre-wrap";
      line.textContent = [
        "browse-cmd — shell navigateur",
        "─────────────────────────────────────",
        "  help                    Liste les commandes",
        "  clear                   Efface le shell",
        "  quit / q                Ferme le shell",
        "  url                     Affiche l'URL courante",
        "  tab <url>               Ouvre l'URL dans un nouvel onglet",
        "  get <sel> [inner|outer] HTML d'un élément",
        "  click <sel>             Clique sur un élément",
        "  copy <sel>              Copie le texte d'un élément",
        "  eval <js>               Exécute du JS dans la page",
        "─────────────────────────────────────",
        "  Tab : autocomplétion · ↑/↓ : historique · Esc : quitter",
      ].join("\n");
      outputEl.appendChild(line);
    }
  }

  /**
   * Rend le panneau invisible (ne le détruit pas — réouverture rapide).
   */
  function closePanel() {
    if (overlayEl) overlayEl.style.display = "none";
  }

  // Branche les callbacks attendus par state.js / commands.js.
  window.__browseCmdOnOpen = openPanel;
  window.__browseCmdOnClose = closePanel;
  window.__browseCmdOnOutput = appendOutput;

  // Échap global : ferme le shell même si le focus n'est pas dans l'input.
  // capture: true pour intercepter avant la page.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && window.BrowseCmd.panelOpen) {
      e.preventDefault();
      e.stopPropagation();
      window.BrowseCmd.toggle();
    }
  }, true);
  /**
   * CSS du shell (scope shadow root — aucune fuite vers la page).
   */
  const CSS = `
    :host {
      all: initial;
      position: fixed;
      inset: 0;
      z-index: 2147483647;
    }
    .bc-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      display: none;
      align-items: center;
      justify-content: center;
      font-family: ui-monospace, "Cascadia Code", "JetBrains Mono", Menlo, monospace;
      font-size: 14px;
    }
    .bc-panel {
      width: 80vw;
      max-width: 900px;
      height: 60vh;
      max-height: 600px;
      background: #1e1e2e;
      color: #cdd6f4;
      border-radius: 8px;
      border: 1px solid #45475a;
      display: flex;
      flex-direction: column;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    }
    .bc-output {
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px;
      line-height: 1.5;
    }
    .bc-line {
      margin: 0;
    }
    .bc-cmd {
      color: #89b4fa;
    }
    .bc-out {
      color: #cdd6f4;
    }
    .bc-err {
      color: #f38ba8;
    }
    .bc-input-row {
      display: flex;
      align-items: center;
      border-top: 1px solid #45475a;
      padding: 8px 16px;
      gap: 8px;
    }
    .bc-prompt {
      color: #a6e3a1;
      flex-shrink: 0;
    }
    .bc-input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: #cdd6f4;
      font-family: inherit;
      font-size: inherit;
      caret-color: #a6e3a1;
    }
    .bc-suggest {
      display: none;
      border-top: 1px solid #45475a;
      background: #181825;
      max-height: 120px;
      overflow-y: auto;
    }
    .bc-suggest-item {
      padding: 4px 16px;
      cursor: pointer;
      color: #a6adc8;
    }
    .bc-suggest-item:hover,
    .bc-suggest-active {
      background: #313244;
      color: #cdd6f4;
    }
  `;
})();
