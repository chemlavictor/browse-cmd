/**
 * content-script.js — Point d'entrée du content script.
 *
 * Écoute les messages du side panel (chrome.runtime.sendMessage)
 * et exécute les commandes sur le DOM de la page.
 *
 * Flux :
 *  - Reçoit { type: "exec", cmd: "..." } du side panel.
 *  - Exécute la commande via BrowseCmd.exec (défini par commands.js).
 *  - Répond { type: "result", text: "..." } ou { type: "error", text: "..." }.
 *
 * Les modules state.js, commands.js sont déjà chargés
 * (voir manifest content_scripts.js). ui.js n'est plus nécessaire
 * (le side panel gère l'UI), mais il reste chargé pour compatibilité.
 */

(function () {
  "use strict";

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Message du side panel : exécuter une commande.
    if (message?.type === "exec") {
      try {
        const result = window.BrowseCmd.exec(message.cmd);
        sendResponse({ type: "result", text: result ?? "" });
      } catch (err) {
        sendResponse({
          type: "error",
          text: err instanceof Error ? err.message : String(err),
        });
      }
      return; // Réponse synchron via sendResponse.
    }
  });
})();
