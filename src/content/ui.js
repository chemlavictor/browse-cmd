/**
 * ui.js — Interface shell (shadow root + styles).
 *
 * Fenêtre flottante déplaçable et redimensionnable, sans voile noir.
 * Modes :
 *  - Float : fenêtre flottante par défaut (600×400, déplaçable, redimensionnable).
 *  - Sidebar : panneau collé au bord droit de la page (largeur 380px, pleine hauteur).
 *
 * Barre de titre en haut avec :
 *  - Logo cmd> à gauche.
 *  - Boutons à droite : [sidebar] [—] [×]
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
  let panelEl = null;
  let titleEl = null;
  let outputEl = null;
  let inputEl = null;
  let suggestEl = null;
  let inputIndex = -1;
  let draft = "";
  let suggestions = [];
  let suggestIndex = -1;

  /** Mode actuel : "float" ou "sidebar". */
  let mode = "float";

  /** Position et taille en mode float. */
  let floatX = 0, floatY = 0, floatW = 600, floatH = 400;

  /** État du drag. */
  let dragging = false, dragOffX = 0, dragOffY = 0;

  /** État du resize. */
  let resizing = false, resizeStartX = 0, resizeStartY = 0, resizeStartW = 0, resizeStartH = 0;

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

    // Fenêtre flottante.
    panelEl = document.createElement("div");
    panelEl.className = "bc-panel bc-float";

    // Barre de titre.
    titleEl = document.createElement("div");
    titleEl.className = "bc-titlebar";

    // Logo à gauche.
    const logo = document.createElement("span");
    logo.className = "bc-logo";
    logo.textContent = "cmd>";
    titleEl.appendChild(logo);

    // Boutons à droite.
    const btns = document.createElement("span");
    btns.className = "bc-btns";

    const btnSidebar = document.createElement("button");
    btnSidebar.className = "bc-btn bc-btn-sidebar";
    btnSidebar.title = "Mode sidebar";
    btnSidebar.textContent = "☰";
    btnSidebar.addEventListener("click", toggleSidebar);

    const btnMin = document.createElement("button");
    btnMin.className = "bc-btn bc-btn-min";
    btnMin.title = "Minimiser";
    btnMin.textContent = "—";
    btnMin.addEventListener("click", closePanel);

    const btnClose = document.createElement("button");
    btnClose.className = "bc-btn bc-btn-close";
    btnClose.title = "Fermer";
    btnClose.textContent = "×";
    btnClose.addEventListener("click", closePanel);

    btns.append(btnSidebar, btnMin, btnClose);
    titleEl.appendChild(btns);

    // Poignée de resize (coin bas-droite).
    const resizeHandle = document.createElement("div");
    resizeHandle.className = "bc-resize";

    panelEl.append(titleEl, resizeHandle);

    // Zone de scroll (historique des sorties).
    outputEl = document.createElement("div");
    outputEl.className = "bc-output";
    panelEl.appendChild(outputEl);

    // Menu d'autocomplétion.
    suggestEl = document.createElement("div");
    suggestEl.className = "bc-suggest";
    panelEl.appendChild(suggestEl);

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

    panelEl.appendChild(inputRow);
    shadow.appendChild(panelEl);
    document.body.appendChild(host);

    // Position initiale : centré.
    floatX = Math.max(0, (window.innerWidth - floatW) / 2);
    floatY = Math.max(0, (window.innerHeight - floatH) / 2);
    applyFloatStyle();

    // Événements clavier sur l'input.
    inputEl.addEventListener("keydown", onKeydown);
    inputEl.addEventListener("input", onInput);

    // Drag : mousedown sur la barre de titre.
    titleEl.addEventListener("mousedown", (e) => {
      // Pas de drag si clic sur un bouton.
      if (e.target.closest(".bc-btn")) return;
      if (mode !== "float") return;
      dragging = true;
      dragOffX = e.clientX - floatX;
      dragOffY = e.clientY - floatY;
      e.preventDefault();
    });

    // Resize : mousedown sur la poignée.
    resizeHandle.addEventListener("mousedown", (e) => {
      if (mode !== "float") return;
      resizing = true;
      resizeStartX = e.clientX;
      resizeStartY = e.clientY;
      resizeStartW = floatW;
      resizeStartH = floatH;
      e.preventDefault();
      e.stopPropagation();
    });

    // Mousemove / mouseup sur le document.
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  /**
   * Gère le déplacement de la fenêtre (drag).
   * @param {MouseEvent} e
   */
  function onMouseMove(e) {
    if (dragging) {
      floatX = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragOffX));
      floatY = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragOffY));
      applyFloatStyle();
    } else if (resizing) {
      floatW = Math.max(300, resizeStartW + (e.clientX - resizeStartX));
      floatH = Math.max(200, resizeStartH + (e.clientY - resizeStartY));
      applyFloatStyle();
    }
  }

  /**
   * Fin du drag ou du resize.
   */
  function onMouseUp() {
    dragging = false;
    resizing = false;
  }

  /**
   * Applique la position/taille en mode float.
   */
  function applyFloatStyle() {
    if (!panelEl) return;
    panelEl.style.left = floatX + "px";
    panelEl.style.top = floatY + "px";
    panelEl.style.width = floatW + "px";
    panelEl.style.height = floatH + "px";
  }

  /**
   * Applique le style en mode sidebar (collé au bord droit).
   */
  function applySidebarStyle() {
    if (!panelEl) return;
    panelEl.style.left = "auto";
    panelEl.style.top = "0";
    panelEl.style.width = "380px";
    panelEl.style.height = "100vh";
    panelEl.style.right = "0";
  }

  /**
   * Bascule entre mode float et sidebar.
   */
  function toggleSidebar() {
    if (!panelEl) return;
    if (mode === "float") {
      mode = "sidebar";
      panelEl.classList.add("bc-sidebar");
      panelEl.classList.remove("bc-float");
      applySidebarStyle();
    } else {
      mode = "float";
      panelEl.classList.remove("bc-sidebar");
      panelEl.classList.add("bc-float");
      applyFloatStyle();
    }
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
        if (suggestIndex > 0) suggestIndex--;
        renderSuggest();
      } else {
        navigateHistory(-1);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestions.length > 0 && suggestIndex >= 0) {
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
  const COMMANDS = ["h", "help", "c", "clear", "q", "quit", "u", "url", "t", "tab", "g", "get", "k", "click", "y", "copy", "e", "eval"];

  /**
   * Commandes qui prennent un sélecteur en argument.
   */
  const SELECTOR_CMDS = { g: "get", k: "click", y: "copy", get: "get", click: "click", copy: "copy" };

  /**
   * Scanne le DOM pour collecter des sélecteurs utiles.
   * Renvoie un tableau de sélecteurs (ids, classes, tags).
   * @returns {string[]}
   */
  function collectSelectors() {
    const selectors = new Set();
    // IDs (les plus courts et les plus utiles).
    document.querySelectorAll("[id]").forEach((el) => {
      selectors.add("#" + el.id);
    });
    // Classes (max 30 pour ne pas polluer).
    const classCount = {};
    document.querySelectorAll("[class]").forEach((el) => {
      for (const cls of el.classList) {
        classCount[cls] = (classCount[cls] || 0) + 1;
      }
    });
    // On ne garde que les classes fréquentes (apparues 1+ fois) et courtes.
    Object.keys(classCount)
      .filter((c) => c.length <= 30)
      .slice(0, 30)
      .forEach((c) => selectors.add("." + c));
    // Tags communs.
    ["input", "button", "a", "form", "select", "textarea", "img", "div", "span", "h1", "h2", "h3", "p"].forEach((t) => {
      if (document.querySelector(t)) selectors.add(t);
    });
    return [...selectors];
  }

  /**
   * Déclenché à chaque frappe : calcule les suggestions.
   * - Pas d'espace : autocomplete des noms de commandes.
   * - Avec espace et commande sélecteur (g, k, y) : autocomplete des sélecteurs DOM.
   */
  function onInput() {
    const val = inputEl.value;
    const spaceIdx = val.indexOf(" ");

    if (spaceIdx === -1) {
      // Pas d'espace : autocomplete des commandes.
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
      return;
    }

    // Avec espace : vérifie si c'est une commande sélecteur.
    const cmdPart = val.slice(0, spaceIdx).toLowerCase();
    const typePart = val.slice(spaceIdx + 1).toLowerCase();

    if (SELECTOR_CMDS[cmdPart] && typePart.length > 0) {
      // Autocomplétion des sélecteurs DOM.
      const allSelectors = collectSelectors();
      suggestions = allSelectors.filter((s) => s.startsWith(typePart) && s !== typePart);
      suggestIndex = suggestions.length > 0 ? 0 : -1;
      if (suggestions.length === 0) {
        hideSuggest();
      } else {
        renderSuggest();
      }
      return;
    }

    // Pas de contexte de sélecteur.
    hideSuggest();
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
      if (inputIndex === -1) {
        draft = inputEl.value;
        inputIndex = history.length - 1;
      } else if (inputIndex > 0) {
        inputIndex--;
      }
      inputEl.value = history[inputIndex];
    } else {
      if (inputIndex === -1) return;
      if (inputIndex < history.length - 1) {
        inputIndex++;
        inputEl.value = history[inputIndex];
      } else {
        inputIndex = -1;
        inputEl.value = draft;
      }
    }
    inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
  }

  /**
   * Ajoute une ligne dans la zone de scroll.
   * @param {{type: string, text: string}} entry
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
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  /**
   * Vide la zone de scroll (commande `clear`).
   */
  function clearOutput() {
    if (outputEl) outputEl.innerHTML = "";
  }

  let welcomed = false;

  /**
   * Rend le panneau visible et focus l'input.
   */
  function openPanel() {
    if (!panelEl) build();
    panelEl.style.display = "flex";
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
        "  Glisser la barre de titre pour déplacer",
        "  Bouton ☰ : mode sidebar",
      ].join("\n");
      outputEl.appendChild(line);
    }
  }

  /**
   * Rend le panneau invisible.
   */
  function closePanel() {
    if (panelEl) panelEl.style.display = "none";
  }

  // Branche les callbacks attendus par state.js / commands.js.
  window.__browseCmdOnOpen = openPanel;
  window.__browseCmdOnClose = closePanel;
  window.__browseCmdOnOutput = appendOutput;
  window.__browseCmdClear = clearOutput;

  // Échap global : ferme le shell même si le focus n'est pas dans l'input.
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
      pointer-events: none;
      font-family: ui-monospace, "Cascadia Code", "JetBrains Mono", Menlo, monospace;
      font-size: 14px;
    }
    .bc-panel {
      display: none;
      flex-direction: column;
      background: #1e1e2e;
      color: #cdd6f4;
      border-radius: 8px;
      border: 1px solid #45475a;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      pointer-events: auto;
    }
    .bc-panel.bc-float {
      position: fixed;
    }
    .bc-panel.bc-sidebar {
      position: fixed;
      border-radius: 8px 0 0 8px;
      border-right: none;
    }
    .bc-titlebar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      background: #181825;
      border-radius: 8px 8px 0 0;
      border-bottom: 1px solid #45475a;
      cursor: move;
      user-select: none;
      flex-shrink: 0;
    }
    .bc-logo {
      color: #a6e3a1;
      font-weight: bold;
      font-size: 13px;
    }
    .bc-btns {
      display: flex;
      gap: 4px;
    }
    .bc-btn {
      background: transparent;
      border: 1px solid #45475a;
      border-radius: 4px;
      color: #a6adc8;
      width: 28px;
      height: 24px;
      cursor: pointer;
      font-size: 13px;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }
    .bc-btn:hover {
      background: #313244;
      color: #cdd6f4;
    }
    .bc-btn-close:hover {
      background: #f38ba8;
      color: #1e1e2e;
      border-color: #f38ba8;
    }
    .bc-resize {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 16px;
      height: 16px;
      cursor: nwse-resize;
      background: linear-gradient(135deg, transparent 50%, #45475a 50%);
      border-radius: 0 0 8px 0;
    }
    .bc-sidebar .bc-resize {
      display: none;
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
      flex-shrink: 0;
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
      flex-shrink: 0;
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
