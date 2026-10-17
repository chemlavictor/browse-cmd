/**
 * service-worker.js — Background service worker (Manifest V3).
 *
 * Rôle unique : recevoir le raccourci clavier (chrome.commands) et
 * relayer un message "toggle" vers l'onglet actif.
 */

chrome.commands.onCommand.addListener((command) => {
  if (command !== "toggle-shell") return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: "toggle" }, () => {
      void chrome.runtime.lastError;
    });
  });
});
