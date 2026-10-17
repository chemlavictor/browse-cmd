/**
 * service-worker.js — Background service worker (Manifest V3).
 *
 * Rôle unique : recevoir le raccourci clavier (chrome.commands) et
 * relayer un message "toggle" vers l'onglet actif.
 *
 * Aucune logique d'exécution ici : toutes les commandes tournent
 * dans le content script (§4 SPEC).
 */

chrome.commands.onCommand.addListener((command) => {
  if (command !== "toggle-shell") return;

  // Récupère l'onglet actif de la fenêtre courante, puis lui envoie "toggle".
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    // sendMessage en MV3 est callback-based (pas Promise).
    // Le callback reçoit une erreur si l'onglet n'a pas de content script.
    chrome.tabs.sendMessage(tabs[0].id, { type: "toggle" }, () => {
      // chrome.runtime.lastError peut être set si l'onglet n'a pas
      // de content script (chrome:// pages, Web Store, etc.) — silencieux.
      void chrome.runtime.lastError;
    });
  });
});
