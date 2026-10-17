/**
 * service-worker.js — Background service worker (Manifest V3).
 *
 * Rôle : recevoir le raccourci clavier et ouvrir/fermer le side panel.
 *
 * Le side panel est géré par chrome.sidePanel (pas par un message au
 * content script). Le raccourci toggle l'ouverture du panneau.
 */

chrome.commands.onCommand.addListener((command) => {
  if (command !== "toggle-shell") return;

  // Ouvre ou ferme le side panel de l'onglet actif.
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    const tabId = tabs[0].id;

    // Tente d'ouvrir le side panel. Si déjà ouvert, ça ferme.
    chrome.sidePanel
      .setOptions({ tabId, path: "sidepanel/sidepanel.html" })
      .then(() => {
        // setOptions ne toggle pas — il faut utiliser open() pour ouvrir.
        // Pour toggle, on ne peut pas savoir si c'est ouvert ou fermé.
        // Solution : toujours ouvrir (le side panel reste ouvert).
        // Pour fermer, l'utilisateur utilise le bouton × ou Esc.
        return chrome.sidePanel.open({ tabId });
      })
      .catch(() => {
        // Si le side panel est déjà ouvert, open() échoue — on l'ignore.
        void chrome.runtime.lastError;
      });
  });
});
