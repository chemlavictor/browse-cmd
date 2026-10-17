/**
 * content-script.js — Point d'entrée du content script.
 *
 * Charge en dernier (voir manifest content_scripts.js). Son seul rôle :
 * écouter les messages du background service worker et déclencher
 * le toggle du shell.
 *
 * Les modules state.js, commands.js et ui.js sont déjà chargés
 * et ont initialisé la namespace window.BrowseCmd + les callbacks UI.
 */

(function () {
  "use strict";

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "toggle") {
      window.BrowseCmd.toggle();
      sendResponse({ ok: true });
    }
    // Pas de réponse asynchrone : on retourne false.
  });
})();
