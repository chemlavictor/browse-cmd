/**
 * commands.js — Table de commandes du shell.
 *
 * Chaque commande reçoit les arguments (tableau de tokens) et un
 * contexte (`ctx`) exposant quelques helpers. Renvoie une string
 * (affichée dans le shell) ou undefined (pas de sortie).
 *
 * Chargé après state.js, avant ui.js (voir manifest content_scripts.js).
 *
 * Commandes (§3 SPEC) :
 *  - help
 *  - clear
 *  - url
 *  - tab <url>
 *  - get <sélecteur> [inner|outer]
 *  - click <sélecteur>
 *  - copy <sélecteur>
 *  - eval <js>
 */

(function () {
  "use strict";

  const WELCOME_TEXT = [
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
    "  Raccourcis : ↑/↓ historique · Esc quitte",
  ].join("\n");

  const HELP_TEXT = WELCOME_TEXT;

  /**
   * Formate le résultat d'une commande `eval` (§3 SPEC, décision #6) :
   * JSON formaté si objet, sinon String.
   * @param {unknown} result
   * @returns {string}
   */
  function formatEvalResult(result) {
    if (result === undefined) return "undefined";
    if (result === null) return "null";
    if (typeof result === "string") return result;
    if (typeof result === "number" || typeof result === "boolean") {
      return String(result);
    }
    try {
      return JSON.stringify(result, null, 2);
    } catch {
      return String(result);
    }
  }

  /**
   * Implémentation de chaque commande.
   * @param {string} name - nom de la commande.
   * @param {string[]} args - arguments (tokens séparés par espaces).
   * @param {{ clearOutput: () => void }} ctx - contexte (helpers UI).
   * @returns {string|undefined}
   */
  function dispatch(name, args, ctx) {
    switch (name) {
      case "help":
        return HELP_TEXT;

      case "clear":
        ctx.clearOutput();
        return undefined;

      case "quit":
      case "q":
        ctx.close();
        return "Au revoir !";
      case "url":
        return window.location.href;

      case "tab": {
        const url = args.join(" ");
        if (!url) return "Usage: tab <url>";
        window.open(url, "_blank");
        return `Ouvrent : ${url}`;
      }

      case "get": {
        if (args.length === 0) return "Usage: get <sélecteur> [inner|outer]";
        const mode = args[args.length - 1];
        const isInner = mode === "inner" || mode === "outer";
        const selector = isInner ? args.slice(0, -1).join(" ") : args.join(" ");
        const el = document.querySelector(selector);
        if (!el) return `not found: ${selector}`;
        return isInner ? el.innerHTML : el.outerHTML;
      }

      case "click": {
        if (args.length === 0) return "Usage: click <sélecteur>";
        const selector = args.join(" ");
        const el = document.querySelector(selector);
        if (!el) return `not found: ${selector}`;
        el.click();
        return `click : ${selector}`;
      }

      case "copy": {
        if (args.length === 0) return "Usage: copy <sélecteur>";
        const selector = args.join(" ");
        const el = document.querySelector(selector);
        if (!el) return `not found: ${selector}`;
        const text = el.textContent ?? "";
        navigator.clipboard.writeText(text);
        return `copié : ${text.length > 80 ? text.slice(0, 80) + "…" : text}`;
      }

      case "eval": {
        if (args.length === 0) return "Usage: eval <js>";
        const js = args.join(" ");
        // eslint-disable-next-line no-eval
        const result = eval(js);
        return formatEvalResult(result);
      }

      default:
        return `Commande inconnue : ${name}. Tapez 'help' pour la liste.`;
    }
  }

  /**
   * Parse la saisie en (nom, args) et appelle dispatch.
   *
   * Parsing : split sur espaces, mais respecte les guillemets simples
   * et doubles pour que `eval "document.title"` garde la phrase intacte.
   *
   * @param {string} raw - commande brute saisie.
   * @param {{ clearOutput: () => void }} ctx
   * @returns {string|undefined}
   */
  function exec(raw, ctx) {
    const parts = tokenize(raw);
    if (parts.length === 0) return undefined;
    const name = parts[0].toLowerCase();
    const args = parts.slice(1);
    return dispatch(name, args, ctx);
  }

  /**
   * Tokenise une ligne en respectant les guillemets.
   * Ex. : `eval "document.title + ' !'"` → ["eval", "document.title + ' !'"]
   * @param {string} input
   * @returns {string[]}
   */
  function tokenize(input) {
    const tokens = [];
    let current = "";
    let inSingle = false;
    let inDouble = false;
    let hasToken = false;

    for (const ch of input) {
      if (ch === "'" && !inDouble) {
        inSingle = !inSingle;
        hasToken = true;
      } else if (ch === '"' && !inSingle) {
        inDouble = !inDouble;
        hasToken = true;
      } else if (ch === " " && !inSingle && !inDouble) {
        if (hasToken || current.length > 0) {
          tokens.push(current);
          current = "";
          hasToken = false;
        }
        continue;
      } else {
        current += ch;
        hasToken = true;
      }
    }
    if (hasToken || current.length > 0) tokens.push(current);
    return tokens;
  }

  // Enregistre exec dans la namespace BrowseCmd (state.js l'a créée).
  window.BrowseCmd.exec = (cmd) => exec(cmd, { clearOutput: clearOutput, close: closeShell });

  /**
   * Efface la zone de sortie du shell.
   * Implémentée par ui.js ; on définit un fallback ici pour que
   * `clear` fonctionne même si ui.js n'a pas encore branché son callback.
   */
  function clearOutput() {
    if (typeof window.__browseCmdClear === "function") {
      window.__browseCmdClear();
    }
  }

  /**
   * Ferme le shell (commande quit/q).
   * Utilise le callback global __browseCmdOnClose branché par ui.js.
   */
  function closeShell() {
    if (typeof window.BrowseCmd.closePanel === "function") {
      window.BrowseCmd.closePanel();
    }
  }
})();
