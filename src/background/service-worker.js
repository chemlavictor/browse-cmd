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

  // Récupère l'onglet actif de l'onglet actuel, puis lui envoie "toggle".
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: "toggle" }).catch(() => {
      // L'onglet n'a pas de content script (chrome:// pages, etc.) — silencieux.
    });
  });
});
