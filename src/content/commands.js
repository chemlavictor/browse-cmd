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
    "  h / help              Liste les commandes",
    "  c / clear             Efface le shell",
    "  q / quit              Ferme le shell",
    "  u / url               Affiche l'URL courante",
    "  t <url> / tab         Ouvre l'URL dans un nouvel onglet",
    "  g <sel> [i] / get     HTML d'un élément (i = inner)",
    "  k <sel> / click       Clique sur un élément",
    "  f <sel> <texte> / fill  Remplit un input/textarea",
    "  y <sel> / copy        Copie le texte d'un élément",
    "  e <js> / eval         Exécute du JS dans la page",
    "─────────────────────────────────────",
    "  Tab : autocomplétion · ↑/↓ : historique · Esc : quitter",
  ].join("\n");

  const HELP_TEXT = WELCOME_TEXT;

  /**
   * Aliases courts → commandes complètes.
   */
  const ALIASES = {
    h: "help",
    c: "clear",
    q: "quit",
    u: "url",
    t: "tab",
    g: "get",
    k: "click",
    f: "fill",
    y: "copy",
    e: "eval",
  };

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
        if (args.length === 0) return "Usage: get <sélecteur> [i|o]";
        let mode = "o"; // outer par défaut
        const last = args[args.length - 1];
        if (last === "i" || last === "inner") {
          mode = "i";
          args.pop();
        } else if (last === "o" || last === "outer") {
          mode = "o";
          args.pop();
        }
        const selector = args.join(" ");
        const el = document.querySelector(selector);
        if (!el) return `not found: ${selector}`;
        return mode === "i" ? el.innerHTML : el.outerHTML;
      }

      case "click": {
        if (args.length === 0) return "Usage: click <sélecteur>";
        const selector = args.join(" ");
        const el = document.querySelector(selector);
        if (!el) return `not found: ${selector}`;
        el.click();
        if (typeof window.__browseCmdInvalidate === "function") window.__browseCmdInvalidate();
        return `click : ${selector}`;
      }

      case "fill": {
        if (args.length < 2) return "Usage: fill <sélecteur> <texte>";
        const selector = args[0];
        const text = args.slice(1).join(" ");
        const el = document.querySelector(selector);
        if (!el) return `not found: ${selector}`;
        if (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") {
          return `pas un input/textarea : ${selector}`;
        }
        el.value = text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        if (typeof window.__browseCmdInvalidate === "function") window.__browseCmdInvalidate();
        return `fill : ${selector} = "${text}"`;
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
        if (typeof window.__browseCmdInvalidate === "function") window.__browseCmdInvalidate();
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
    let name = parts[0].toLowerCase();
    // Résout l'alias court vers la commande complète.
    if (ALIASES[name]) name = ALIASES[name];
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
