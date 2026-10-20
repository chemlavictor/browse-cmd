/**
 * state.js — Gestion de l'état du shell (toggle, historique, panel unique).
 *
 * Fichiers chargés avant les autres (voir manifest content_scripts.js).
 * Expose la namespace `BrowseCmd` globale (IIFE) pour que state.js,
 * commands.js, ui.js et content-script.js partagent un même contexte.
 *
 * État :
 *  - history: string[] — commandes récentes, partagé entre onglets
 *              via chrome.storage.session (§2 SPEC, décision #7).
 *  - panelOpen: boolean — est le shell ouvert dans cet onglet ?
 *  - inputIndex: number — index de navigation dans l'historique (↑/↓).
 */

/**
 * Namespace global partagée par tous les fichiers du content script.
 * @typedef {Object} BrowseCmd
 * @property {string[]} history
 * @property {boolean} panelOpen
 * @property {number} inputIndex
 * @property {boolean} ready
 * @property {(cmd: string) => string} exec
 * @property {() => void} openPanel
 * @property {() => void} closePanel
 * @property {() => void} toggle
 * @property {(cmd: string) => void} runCommand
 * @property {() => void} loadHistory
 * @property {() => Promise<void>} persistHistory
 * @property {(cmd: string) => void} pushHistory
 */

(function () {
  "use strict";

  const STORAGE_KEY = "browseCmdHistory";
  const MACRO_KEY_PREFIX = "browseCmdMacro_";
  const MAX_HISTORY = 100;

  const state = {
    history: [],
    panelOpen: false,
    inputIndex: -1,
    ready: false,
    recording: false,
    macro: [],
    macroName: "",
    macros: {}, // { [host]: { [name]: string[] } }
  };

  function macroStorageKey() {
    return MACRO_KEY_PREFIX + window.location.host;
  }

  /** Charge les macros du site courant depuis chrome.storage.local. */
  function loadMacros() {
    if (!chrome.storage?.local) return;
    chrome.storage.local.get(macroStorageKey(), (data) => {
      const raw = data[macroStorageKey()];
      state.macros = raw && typeof raw === "object" ? raw : {};
    });
  }

  /** Sauvegarde les macros du site courant dans chrome.storage.local. */
  function saveMacros() {
    if (!chrome.storage?.local) return;
    chrome.storage.local.set({ [macroStorageKey()]: state.macros });
  }

  /**
   * Charge l'historique depuis chrome.storage.session.
   * Appelée une fois au démarrage du content script.
   */
  function loadHistory() {
    if (!chrome.storage?.session) return;
    chrome.storage.session.get(STORAGE_KEY, (data) => {
      if (data && Array.isArray(data[STORAGE_KEY])) {
        state.history = data[STORAGE_KEY];
      }
    });
  }

  /**
   * Persiste l'historique dans chrome.storage.session.
   * Asynchrone mais fire-and-forget : on attend pas la confirmation.
   */
  function persistHistory() {
    if (!chrome.storage?.session) return;
    chrome.storage.session.set({ [STORAGE_KEY]: state.history });
  }

  /**
   * Ajoute une commande à l'historique (dé-dup si dernière identique).
   * @param {string} cmd - commande saisie (sans le prompt).
   */
  function pushHistory(cmd) {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    if (state.history[state.history.length - 1] !== trimmed) {
      state.history.push(trimmed);
      if (state.history.length > MAX_HISTORY) {
        state.history = state.history.slice(-MAX_HISTORY);
      }
      persistHistory();
    }
  }

  /**
   * Ouvre le panneau shell (si pas déjà ouvert).
   * Un seul panneau ouvert à la fois (§2 SPEC, décision #8).
   */
  function openPanel() {
    if (state.panelOpen) return;
    state.panelOpen = true;
    if (typeof window.__browseCmdOnOpen === "function") {
      window.__browseCmdOnOpen();
    }
  }

  /**
   * Ferme le panneau shell.
   */
  function closePanel() {
    if (!state.panelOpen) return;
    state.panelOpen = false;
    if (typeof window.__browseCmdOnClose === "function") {
      window.__browseCmdOnClose();
    }
  }

  /**
   * Bascule l'ouverture du panneau (toggle).
   */
  function toggle() {
    if (state.panelOpen) {
      closePanel();
    } else {
      openPanel();
    }
  }

  /**
   * Exécute une commande saisie par l'utilisateur.
   * - Push dans l'historique
   * - Appel de state.exec (défini par commands.js)
   * - Rendu de la sortie (callback __browseCmdOnOutput)
   *
   * @param {string} cmd - commande brute saisie.
   */
  function runCommand(cmd) {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    // Affiche la commande dans le shell (avant la sortie).
    if (typeof window.__browseCmdOnOutput === "function") {
      window.__browseCmdOnOutput({ type: "cmd", text: trimmed });
    }
    // start/end : toujours exécutés, jamais enregistrés.
    const cmdName = trimmed.split(/\s+/)[0].toLowerCase();
    if (cmdName === "start" || cmdName === "end") {
      pushHistory(trimmed);
      try {
        const result = state.exec(trimmed);
        if (typeof window.__browseCmdOnOutput === "function") {
          window.__browseCmdOnOutput({ type: "out", text: result ?? "" });
        }
      } catch (err) {
        if (typeof window.__browseCmdOnOutput === "function") {
          window.__browseCmdOnOutput({ type: "err", text: err instanceof Error ? err.message : String(err) });
        }
      }
      return;
    }

    // Si on enregistre, on ajoute à la macro (pas dans l'historique).
    if (state.recording) {
      state.macro.push(trimmed);
      if (typeof window.__browseCmdOnOutput === "function") {
        window.__browseCmdOnOutput({ type: "out", text: `● enregistré [${state.macro.length}]` });
      }
      return;
    }

    pushHistory(trimmed);

    try {
      const result = state.exec(trimmed);
      // replay renvoie une Promise (async avec delays).
      const show = (text) => {
        if (typeof window.__browseCmdOnOutput === "function") {
          window.__browseCmdOnOutput({ type: "out", text: text ?? "" });
        }
      };
      if (result && typeof result.then === "function") {
        result.then(show).catch((err) => {
          if (typeof window.__browseCmdOnOutput === "function") {
            window.__browseCmdOnOutput({ type: "err", text: err instanceof Error ? err.message : String(err) });
          }
        });
      } else {
        show(result ?? "");
      }
    } catch (err) {
      if (typeof window.__browseCmdOnOutput === "function") {
        window.__browseCmdOnOutput({
          type: "err",
          text: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /**
   * Sauvegarde la macro en cours sous un nom pour le site courant.
   * @param {string} name - nom de la macro.
   */
  function saveMacro(name) {
    const trimmed = name.trim();
    if (!trimmed || state.macro.length === 0) return false;
    state.macros[trimmed] = [...state.macro];
    saveMacros();
    return true;
  }

  /**
   * Charge une macro sauvegardée.
   * @param {string} name - nom de la macro.
   * @returns {string[]|null}
   */
  function loadMacro(name) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    return state.macros[trimmed] || null;
  }

  /**
   * Namespace globale : les autres fichiers (commands.js, ui.js,
   * content-script.js) lisent/écrivent leurs fonctions ici.
   */
  window.BrowseCmd = state;
  state.toggle = toggle;
  state.openPanel = openPanel;
  state.closePanel = closePanel;
  state.runCommand = runCommand;
  state.pushHistory = pushHistory;
  state.loadHistory = loadHistory;
  state.persistHistory = persistHistory;
  state.saveMacro = saveMacro;
  state.loadMacro = loadMacro;

  loadHistory();
  loadMacros();
})();
