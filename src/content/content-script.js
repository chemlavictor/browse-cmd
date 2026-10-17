/**
 * content-script.js — Point d'entrée du content script.
 *
 * Écoute les messages du background service worker et déclenche
 * le toggle du shell (fenêtre flottante dans la page).
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
  });
})();
