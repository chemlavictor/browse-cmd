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
  let loadingEl = null;
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

    // Indicateur de chargement (affiché pendant le scan DOM).
    loadingEl = document.createElement("div");
    loadingEl.className = "bc-loading";
    loadingEl.textContent = "⏳ Scan du DOM…";
    panelEl.appendChild(loadingEl);

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

    // Empêche le focus automatique sur l'input quand on clique
    // ailleurs dans le panneau (output, titlebar, etc.).
    panelEl.addEventListener("mousedown", (e) => {
      if (e.target === inputEl || e.target.closest(".bc-suggest-item")) return;
      e.preventDefault();
    });

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

  /** Élément marqueur rouge (créé une fois, réutilisé). */
  let markerEl = null;
  let markerSweepEl = null;

  /**
   * Place un point rouge sur l'élément cible de la commande.
   * @param {string} cmd - commande brute (ex: "k #submit")
   */
  function markTarget(cmd) {
    clearMarker();
    const parts = cmd.trim().split(/\s+/);
    if (parts.length < 2) return;
    const name = parts[0].toLowerCase();
    // Seuls les commandes avec sélecteur ont un marqueur.
    const selectorCmds = { k: 1, click: 1, f: 1, fill: 1, g: 1, get: 1, y: 1, copy: 1 };
    if (!selectorCmds[name]) return;

    // Le sélecteur est le 2e token (sauf pour get avec mode i/o).
    let selector = parts[1];
    // Pour get, le mode i/o est le dernier token — on le retire si présent.
    if ((name === "g" || name === "get") && parts.length > 2) {
      const last = parts[parts.length - 1];
      if (last === "i" || last === "inner" || last === "o" || last === "outer") {
        selector = parts.slice(1, -1).join(" ");
      }
    }
    // Pour fill, le texte est après le sélecteur — on prend juste le 2e token.

    let target;
    try { target = document.querySelector(selector); } catch { return; }
    if (!target) return;

    // Crée le marqueur s'il n'existe pas.
    if (!markerEl) {
      markerEl = document.createElement("div");
      markerEl.className = "bc-marker";
      document.body.appendChild(markerEl);
    }

    // Positionne le marqueur au centre de l'élément.
    const rect = target.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    markerEl.style.position = "fixed";
    markerEl.style.left = (rect.left + rect.width / 2 - 8) + "px";
    markerEl.style.top = (rect.top + rect.height / 2 - 8) + "px";
    markerEl.style.display = "block";
    // Fait défiler l'élément en vue.
    target.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  /**
   * Efface le marqueur rouge.
   */
  function clearMarker() {
    if (markerEl) markerEl.style.display = "none";
  }

  /**
   * Place le marqueur rouge directement sur un sélecteur CSS
   * (version live pour l'autocomplétion, sans parser la commande).
   * @param {string} selector - sélecteur CSS
   */
  function liveMarkTarget(selector) {
    clearMarker();
    if (!selector) return;
    let target;
    try { target = document.querySelector(selector); } catch { return; }
    if (!target) return;

    if (!markerEl) {
      markerEl = document.createElement("div");
      markerEl.className = "bc-marker";
      document.body.appendChild(markerEl);
    }

    const rect = target.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    markerEl.style.position = "fixed";
    markerEl.style.left = (cx - 8) + "px";
    markerEl.style.top = (cy - 8) + "px";
    markerEl.style.display = "block";

    // Animation : cercle qui rétrécit vers le point rouge (ciblage).
    // Attend 500ms avant de lancer pour laisser l'œil se positionner.
    try {
      if (!markerSweepEl) {
        markerSweepEl = document.createElement("div");
        markerSweepEl.className = "bc-marker-sweep";
        document.body.appendChild(markerSweepEl);
      }
      setTimeout(() => {
        try {
          // Recalculer la position (scroll peut avoir bougé)
          const rect = target.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          markerEl.style.left = (cx - 8) + "px";
          markerEl.style.top = (cy - 8) + "px";
          const sweepSize = Math.max(window.innerWidth, window.innerHeight) / 2;
          markerSweepEl.style.left = cx + "px";
          markerSweepEl.style.top = cy + "px";
          markerSweepEl.style.setProperty("--sweep-size", sweepSize + "px");
          markerSweepEl.style.display = "none";
          void markerSweepEl.offsetWidth;
          markerSweepEl.style.display = "block";
          markerSweepEl.style.animation = "none";
          void markerSweepEl.offsetWidth;
          markerSweepEl.style.animation = "bc-sweep 0.8s ease-out forwards";
        } catch {}
      }, 500);
    } catch {}

    target.scrollIntoView({ block: "center", behavior: "smooth" });
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
      markTarget(cmd);
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
        liveMarkTarget(suggestions[suggestIndex].value);
      } else {
        navigateHistory(-1);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestions.length > 0 && suggestIndex >= 0) {
        if (suggestIndex < suggestions.length - 1) suggestIndex++;
        renderSuggest();
        liveMarkTarget(suggestions[suggestIndex].value);
      } else {
        navigateHistory(1);
      }
    }
  }

  /**
   * Liste des commandes pour l'autocomplétion.
   */
  const COMMANDS = ["h", "help", "c", "clear", "q", "quit", "u", "url", "t", "tab", "g", "get", "k", "click", "f", "fill", "y", "copy", "e", "eval"];

  /**
   * Commandes qui prennent un sélecteur en argument, et leur priorité.
   * click → boutons + liens
   * fill  → inputs + textareas
   * get/copy → tous
   */
  const SELECTOR_CMDS = {
    g: "all", get: "all",
    k: "click", click: "click",
    f: "fill", fill: "fill",
    y: "all", copy: "all",
  };

  /**
   * Scanne le DOM pour collecter des sélecteurs selon le type de commande.
   * Renvoie des objets { value, label } où value = sélecteur CSS,
   * label = texte affiché dans les suggestions (ex: 'a "Learn more"').
   * @param {string} type - "all" | "click" | "fill"
   * @returns {{value: string, label: string}[]}
   */
  function collectSelectors(type) {
    const selectors = [];
    const seen = new Set();

    function add(value, label) {
      if (value && !seen.has(value)) {
        seen.add(value);
        selectors.push({ value, label: label || value });
      }
    }

    if (type === "click") {
      // Passe 1 : éléments cliquables standards (boutons, liens avec href).
      const clickable = document.querySelectorAll(
        "button, [role='button'], input[type='submit'], input[type='button'], a[href], [onclick]"
      );
      clickable.forEach((el) => {
        const txt = (el.textContent || "").trim().slice(0, 30);
        if (!txt) return;
        if (el.id) add("#" + el.id, `#${el.id} "${txt}"`);
        el.classList.forEach((c) => add("." + c, `.${c} "${txt}"`));
        if (!el.id && el.classList.length === 0) {
          add(el.tagName.toLowerCase(), `${el.tagName.toLowerCase()} "${txt}"`);
        }
      });

      // Passe 2 : TreeWalker sur TOUS les nœuds text (comme Ctrl+F).
      // Chaque nœud text visible → construire un sélecteur CSS unique garanti.
      try {
        const SKIP = new Set(["SCRIPT","STYLE","NOSCRIPT","TEMPLATE","HEAD","META","LINK","TITLE"]);
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            const t = (node.textContent || "").trim();
            if (!t || t.length > 60) return NodeFilter.FILTER_REJECT;
            const p = node.parentElement;
            if (!p || SKIP.has(p.tagName)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
        });

        // Construit un sélecteur CSS unique pour un élément donné.
        // Monte vers le haut jusqu'à trouver un id ou une class unique.
        function uniqueSelector(el) {
          // Si l'élément a un id → c'est unique
          if (el.id) return "#" + el.id;
          // Si l'élément a une class unique → ok
          for (const c of el.classList) {
            try {
              if (document.querySelectorAll("." + c).length === 1) return "." + c;
            } catch {}
          }
          // Sinon : monter vers le haut pour trouver un ancêtre unique
          let cur = el;
          let parts = [];
          while (cur && cur !== document.body && cur !== document.documentElement) {
            const tag = cur.tagName.toLowerCase();
            // Ajouter le tag + nth-of-type si nécessaire
            if (cur.id) {
              parts.unshift("#" + cur.id);
              break;
            }
            // Class unique ?
            let found = false;
            for (const c of cur.classList) {
              try {
                if (document.querySelectorAll("." + c).length === 1) {
                  parts.unshift("." + c);
                  found = true;
                  break;
                }
              } catch {}
            }
            if (found) break;
            // Ajouter le tag
            const parent = cur.parentElement;
            if (parent) {
              const sibs = Array.from(parent.children).filter(x => x.tagName === cur.tagName);
              const idx = sibs.indexOf(cur) + 1;
              parts.unshift(sibs.length > 1 ? `${tag}:nth-of-type(${idx})` : tag);
            } else {
              parts.unshift(tag);
            }
            cur = parent;
          }
          // Joindre avec descendant
          return parts.length > 0 ? parts.join(" ") : el.tagName.toLowerCase();
        }

        const seenTexts = new Set();
        let tn = walker.nextNode();
        while (tn) {
          const text = (tn.textContent || "").trim();
          const parent = tn.parentElement;
          if (!parent) { tn = walker.nextNode(); continue; }
          if (seenTexts.has(text)) { tn = walker.nextNode(); continue; }
          seenTexts.add(text);
          try {
            const st = window.getComputedStyle(parent);
            if (st.display === "none" || st.visibility === "hidden") { tn = walker.nextNode(); continue; }
          } catch {}
          const short = text.slice(0, 30);
          const tag = parent.tagName.toLowerCase();
          try {
            const sel = uniqueSelector(parent);
            // Vérifier que le sélecteur résout bien
            if (sel && document.querySelector(sel)) {
              add(sel, `${tag} "${short}"`);
            }
          } catch {}
          tn = walker.nextNode();
        }
      } catch (err) {
        console.warn("[browse-cmd] TreeWalker pass error:", err);
      }

      // Passe 3 : texte CSS (::before/::after) — menus Ant Design, Material, etc.
      try {
        const cssEls = document.querySelectorAll("a, button, [role='button'], [role='menuitem'], [role='tab'], li, span, div, p, td, th, label");
        for (let i = 0; i < cssEls.length; i++) {
          const el = cssEls[i];
          const tag = el.tagName.toLowerCase();
          if (el.id && seen.has("#" + el.id)) continue;
          let cssText = "";
          try {
            const before = window.getComputedStyle(el, "::before").content;
            if (before && before !== "none" && before !== '""' && before !== "''") {
              cssText += before.replace(/^["']|["']$/g, "").trim() + " ";
            }
            const after = window.getComputedStyle(el, "::after").content;
            if (after && after !== "none" && after !== '""' && after !== "''") {
              cssText += after.replace(/^["']|["']$/g, "").trim() + " ";
            }
          } catch {}
          cssText = cssText.trim();
          if (!cssText || cssText.length > 40) continue;
          const alreadySeen = selectors.some(s => s.label.endsWith('"' + cssText.slice(0, 30) + '"'));
          if (alreadySeen) continue;
          const short = cssText.slice(0, 30);
          if (el.id) add("#" + el.id, `${tag} "${short}"`);
          else if (el.classList.length > 0) add("." + el.classList[0], `${tag} "${short}"`);
          else {
            const parent = el.parentNode;
            if (!parent) continue;
            const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
            const idx = siblings.indexOf(el) + 1;
            add(`${tag}:nth-of-type(${idx})`, `${tag} "${short}"`);
          }
        }
      } catch (err) {
        console.warn("[browse-cmd] ::before pass error:", err);
      }
    } else if (type === "fill") {
      // Priorité : inputs, textareas, selects.
      document.querySelectorAll("input, textarea, select").forEach((el) => {
        const placeholder = el.placeholder || "";
        const label = el.name || el.id || el.type || el.tagName.toLowerCase();
        if (el.id) add("#" + el.id, `#${el.id} (${label})`);
        if (el.name) add(`[name="${el.name}"]`, `[name="${el.name}"]`);
        el.classList.forEach((c) => add("." + c, `.${c} (${el.tagName.toLowerCase()})`));
      });
      if (document.querySelector("input")) add("input", "input");
      if (document.querySelector("textarea")) add("textarea", "textarea");
    } else {
      // "all" : IDs, classes, tags.
      document.querySelectorAll("[id]").forEach((el) => {
        const txt = (el.textContent || "").trim().slice(0, 20);
        add("#" + el.id, txt ? `#${el.id} "${txt}"` : "#" + el.id);
      });
      const classCount = {};
      document.querySelectorAll("[class]").forEach((el) => {
        el.classList.forEach((c) => { classCount[c] = (classCount[c] || 0) + 1; });
      });
      Object.keys(classCount).filter((c) => c.length <= 30).slice(0, 30).forEach((c) => {
        const el = document.querySelector("." + c);
        const txt = el ? (el.textContent || "").trim().slice(0, 20) : "";
        add("." + c, txt ? `.${c} "${txt}"` : "." + c);
      });
      ["input", "button", "a", "form", "select", "textarea", "img", "div", "span", "h1", "h2", "h3", "p"].forEach((t) => {
        if (document.querySelector(t)) add(t, t);
      });
    }

    return selectors;
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
      suggestions = COMMANDS
        .filter((c) => c.startsWith(lower) && c !== lower)
        .map((c) => ({ value: c, label: c }));
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

    if (SELECTOR_CMDS[cmdPart]) {
      // Autocomplétion des sélecteurs DOM.
      // Afficher l'indicateur, laisser peindre, puis scanner.
      if (loadingEl) loadingEl.style.display = "block";
      const doScan = () => {
        let allSelectors;
        try {
          allSelectors = collectSelectors(SELECTOR_CMDS[cmdPart]);
        } catch (err) {
          console.warn("[browse-cmd] collectSelectors error:", err);
          allSelectors = [];
        }
        if (loadingEl) loadingEl.style.display = "none";
        const filtered = typePart.length > 0
          ? allSelectors.filter((s) => s.value.toLowerCase().includes(typePart) || s.label.toLowerCase().includes(typePart))
          : allSelectors.slice(0, 20);
        suggestions = filtered;
        suggestIndex = suggestions.length > 0 ? 0 : -1;
        if (suggestions.length === 0) {
          hideSuggest();
          clearMarker();
        } else {
          renderSuggest();
          const active = suggestions[suggestIndex >= 0 ? suggestIndex : 0];
          liveMarkTarget(active.value);
        }
      };
      setTimeout(doScan, 0);
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
      item.textContent = s.label;
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        completeTo(s.value);
      });
      item.addEventListener("mouseenter", () => {
        liveMarkTarget(s.value);
      });
      suggestEl.appendChild(item);
      // S'assure que l'élément actif est visible dans le menu.
      if (i === suggestIndex) {
        item.scrollIntoView({ block: "nearest" });
      }
    });
    suggestEl.style.display = "block";

    // Quand on scroll la liste avec la molette, le marqueur rouge
    // suit l'élément le plus proche du centre du menu.
    if (!suggestEl._scrollHandler) {
      suggestEl._scrollHandler = true;
      suggestEl.addEventListener("scroll", () => {
        const items = suggestEl.querySelectorAll(".bc-suggest-item");
        if (items.length === 0) return;
        const mid = suggestEl.scrollTop + suggestEl.clientHeight / 2;
        let closest = null, closestDist = Infinity;
        items.forEach((item) => {
          const itemMid = item.offsetTop + item.offsetHeight / 2;
          const dist = Math.abs(itemMid - mid);
          if (dist < closestDist) { closestDist = dist; closest = item; }
        });
        if (closest) {
          const idx = Array.from(items).indexOf(closest);
          if (idx >= 0 && idx < suggestions.length) {
            liveMarkTarget(suggestions[idx].value);
          }
        }
      });
    }
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
    completeTo(s.value);
  }

  /**
   * Remplace le token en cours de saisie par la suggestion.
   * Si l'input est "k #sub" et la suggestion est "#submit",
   * le résultat est "k #submit " (le #sub est remplacé par #submit).
   * Si l'input est "k " (juste la commande), le résultat est "k #submit ".
   * @param {string} s
   */
  function completeTo(s) {
    const val = inputEl.value;
    const lastSpace = val.lastIndexOf(" ");
    if (lastSpace === -1) {
      // Pas d'espace : on remplace tout (complétion de commande).
      inputEl.value = s + " ";
    } else {
      // On garde la partie avant le dernier espace + la suggestion.
      inputEl.value = val.slice(0, lastSpace + 1) + s + " ";
    }
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
   * Échappe le HTML pour éviter l'injection.
   * @param {string} s
   * @returns {string}
   */
  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /**
   * Colorise une ligne de commande : nom=vert, args=bleu.
   * @param {string} text
   * @returns {string} HTML
   */
  function colorizeCmd(text) {
    const spaceIdx = text.indexOf(" ");
    if (spaceIdx === -1) {
      return `<span class="bc-cmd-color">${esc(text)}</span>`;
    }
    const name = text.slice(0, spaceIdx);
    const args = text.slice(spaceIdx);
    return `<span class="bc-cmd-color">${esc(name)}</span><span class="bc-args-color">${esc(args)}</span>`;
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
      line.innerHTML = `❯ ${colorizeCmd(text)}`;
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
        "  h / help              Liste les commandes",
        "  c / clear             Efface le shell",
        "  q / quit              Ferme le shell",
        "  u / url               Affiche l'URL courante",
        "  t <url> / tab         Ouvre l'URL dans un nouvel onglet",
        "  g <sel> [i] / get     HTML d'un élément (i = inner)",
        "  k <sel> / click       Clique sur un élément",
        "  f <sel> <texte> / fill  Remplit un input/textarea",
        "  y <sel> / copy        Copie le texte d'un élément",
        "  e <js> / eval         Exécute du JS dans la page",
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
    clearMarker();
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
      background: rgba(30, 30, 46, 0.92);
      backdrop-filter: blur(8px);
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
    .bc-loading {
      display: none;
      padding: 6px 16px;
      font-size: 12px;
      color: #a6e3a1;
      background: #1e1e2e;
      border-top: 1px solid #45475a;
      flex-shrink: 0;
    }
    /* Coloration syntaxique : nom de commande = vert, args = bleu. */
    .bc-cmd-color {
      color: #a6e3a1;
      font-weight: bold;
    }
    .bc-args-color {
      color: #89b4fa;
    }
  `;

  /* CSS du marqueur rouge (hors shadow root, dans le DOM de la page). */
  const MARKER_CSS = `
    .bc-marker {
      position: fixed;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: rgba(243, 139, 168, 0.9);
      border: 2px solid #fff;
      box-shadow: 0 0 8px rgba(243, 139, 168, 0.6);
      pointer-events: none;
      z-index: 2147483647;
      display: none;
      transition: left 0.25s ease-out, top 0.25s ease-out;
    }
    .bc-marker-sweep {
      position: fixed;
      width: var(--sweep-size, 2000px);
      height: var(--sweep-size, 2000px);
      border-radius: 50%;
      border: 12px solid rgba(243, 139, 168, 0.85);
      box-shadow:
        0 0 40px rgba(243, 139, 168, 0.5),
        inset 0 0 40px rgba(243, 139, 168, 0.15);
      transform: translate(-50%, -50%) scale(1);
      pointer-events: none;
      z-index: 2147483646;
    }
    @keyframes bc-sweep {
      0%   { transform: translate(-50%, -50%) scale(1);   opacity: 0.9; }
      80%  { opacity: 0.9; }
      100% { transform: translate(-50%, -50%) scale(0);   opacity: 0; }
    }
  `;

  // Injecte le CSS du marqueur dans la page (hors shadow root).
  (function injectMarkerCSS() {
    const style = document.createElement("style");
    style.textContent = MARKER_CSS;
    document.head.appendChild(style);
  })();
})();
