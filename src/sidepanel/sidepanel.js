/**
 * sidepanel.js — Logique du panneau latéral Chrome.
 *
 * Le side panel est une surface isolée de l'extension (pas dans la page).
 * Il communique avec le content script via chrome.runtime.sendMessage
 * pour exécuter les commandes sur le DOM de la page active.
 *
 * Flux :
 *  1. L'utilisateur tape une commande dans l'input.
 *  2. Le side panel envoie { type: "exec", cmd: "..." } au content script.
 *  3. Le content script exécute la commande et répond { type: "result", text: "..." }.
 *  4. Le side panel affiche le résultat.
 */

(function () {
  "use strict";

  const outputEl = document.getElementById("output");
  const inputEl = document.getElementById("input");
  const suggestEl = document.getElementById("suggest");

  /** Historique des commandes (partagé via chrome.storage.session). */
  let history = [];
  let inputIndex = -1;
  let draft = "";

  /** Suggestions d'autocomplétion. */
  const COMMANDS = ["help", "clear", "quit", "q", "url", "tab", "get", "click", "copy", "eval"];
  let suggestions = [];
  let suggestIndex = -1;

  /**
   * Charge l'historique depuis chrome.storage.session.
   */
  function loadHistory() {
    chrome.storage.session.get("browseCmdHistory", (data) => {
      if (data && Array.isArray(data.browseCmdHistory)) {
        history = data.browseCmdHistory;
      }
    });
  }

  /**
   * Persiste l'historique.
   */
  function persistHistory() {
    chrome.storage.session.set({ browseCmdHistory: history });
  }

  /**
   * Ajoute une commande à l'historique (dé-dup).
   * @param {string} cmd
   */
  function pushHistory(cmd) {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    if (history[history.length - 1] !== trimmed) {
      history.push(trimmed);
      if (history.length > 100) history = history.slice(-100);
      persistHistory();
    }
  }

  /**
   * Ajoute une ligne dans la zone de sortie.
   * @param {string} type - "cmd" | "out" | "err"
   * @param {string} text
   */
  function appendLine(type, text) {
    const line = document.createElement("div");
    line.className = `line ${type}`;
    line.textContent = type === "cmd" ? `❯ ${text}` : text;
    outputEl.appendChild(line);
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  /**
   * Exécute une commande : envoie au content script, affiche le résultat.
   * @param {string} cmd
   */
  function runCommand(cmd) {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    appendLine("cmd", trimmed);
    pushHistory(trimmed);

    // Commandes locales : gérées par le side panel.
    const parts = trimmed.split(/\s+/);
    const name = parts[0].toLowerCase();
    if (name === "clear") { outputEl.innerHTML = ""; return; }
    if (name === "quit" || name === "q") { appendLine("out", "Au revoir !"); window.close(); return; }

    // Envoie la commande au content script de l'onglet actif.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        appendLine("err", "Aucun onglet actif.");
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, { type: "exec", cmd: trimmed }, (response) => {
        if (chrome.runtime.lastError) {
          appendLine("err", chrome.runtime.lastError.message);
          return;
        }
        if (response && response.type === "result") {
          if (response.text) appendLine("out", response.text);
        } else if (response && response.type === "error") {
          appendLine("err", response.text);
        }
      });
    });
  }

  /**
   * Affiche le message de bienvenue.
   */
  function showWelcome() {
    appendLine("out", [
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
      "  Tab : autocomplétion · ↑/↓ : historique · Esc : fermer",
    ].join("\n"));
  }

  /**
   * Gère les touches sur l'input.
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
      runCommand(cmd);
    } else if (e.key === "Tab") {
      e.preventDefault();
      acceptSuggestion();
    } else if (e.key === "Escape") {
      e.preventDefault();
      hideSuggest();
      window.close();
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
   * Navigue dans l'historique.
   * @param {number} dir
   */
  function navigateHistory(dir) {
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
   * Calcul et affiche les suggestions.
   */
  function onInput() {
    const val = inputEl.value;
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
    suggestEl.innerHTML = "";
    suggestions.forEach((s, i) => {
      const item = document.createElement("div");
      item.className = "suggest-item" + (i === suggestIndex ? " suggest-active" : "");
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
    suggestEl.style.display = "none";
  }

  /**
   * Accepte la suggestion active.
   */
  function acceptSuggestion() {
    if (suggestions.length === 0) return;
    completeTo(suggestions[suggestIndex >= 0 ? suggestIndex : 0]);
  }

  /**
   * Remplit l'input avec la suggestion.
   * @param {string} s
   */
  function completeTo(s) {
    inputEl.value = s + " ";
    hideSuggest();
    inputEl.focus();
  }

  // Événements.
  inputEl.addEventListener("keydown", onKeydown);
  inputEl.addEventListener("input", onInput);

  // Échap global : ferme le side panel.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      window.close();
    }
  }, true);

  // Initialisation.
  loadHistory();
  showWelcome();
  inputEl.focus();
})();
