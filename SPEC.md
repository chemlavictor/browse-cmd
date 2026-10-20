# SPEC — browse-cmd

> Source de vérité du projet. Toute décision y est consignée avant implémentation.
> Statut des sections : `[PROPOSÉ]` = en attente de validation, `[VALIDÉ]` = à implémenter, `[REJETÉ]` = écarté avec justification.

## 1. Vision

[VALIDÉ]
Extension Chrome activable par raccourci clavier (`Ctrl+Shift+K`). Elle superpose une interface shell (fenêtre flottante ou sidebar) sur la page active, permettant de saisir des commandes exécutées directement dans la page.

## 2. Cas d'usage
[VALIDÉ]
1. Dev/Front sur une page : ouvre le shell (Ctrl+Shift+K), tape une commande, lit le résultat, ferme le shell.
2. Commandes utiles typiques : `eval "..."`, `click <sélecteur>`, `get <sélecteur>`, `copy <sélecteur>`, `url`, `tab`, `clear`, `help`.
3. Historique des commandes récentes (↑/↓) — **persistant par site** (`chrome.storage.local`).
4. **Toggle** : `Ctrl+Shift+K` ouvre et referme le shell. Un seul panneau ouvert à la fois.
5. **Macros** : enregistre une série de commandes (`start`/`end`), les rejoue (`replay`), les exporte/importe (JSON).

## 3. Commandes

| Commande | Description |
|---|---|
| `h` / `help` | liste les commandes |
| `c` / `clear` | efface le shell |
| `q` / `quit` | ferme le shell |
| `u` / `url` | affiche l'URL courante |
| `t <url>` / `tab` | ouvre l'URL dans un nouvel onglet |
| `g <sel> [i]` / `get` | HTML d'un élément (`i` = inner) |
| `k <sel>` / `click` | clique sur un élément |
| `f <sel> <texte>` / `fill` | remplit un input/textarea |
| `y <sel>` / `copy` | copie le texte d'un élément |
| `e <js>` / `eval` | exécute du JS dans la page |
| `unset` | efface le marqueur rouge et l'animation |
| `reload` | re-scanne le DOM (cache d'autocomplétion) |
| `start <nom>` | démarre l'enregistrement d'une macro |
| `end` | termine et sauvegarde la macro |
| `replay <nom>` | rejoue une macro (2s entre chaque cmd) |
| `replay ls` | liste les macros du site courant |
| `replay ls -a` | liste les macros de tous les sites |
| `replay rm <nom>` | supprime une macro |
| `list` | liste les macros sauvegardées |

Commandes additionnelles (`type`, `scroll`, `set`) : écartées.

## 4. Architecture

[VALIDÉ]
Manifest V3. Deux parties :

```
background (service worker)
  └─ reçoit le raccourci (chrome.commands) → envoie message "toggle" à l'onglet actif
content script (injecté automatiquement dans toutes les pages via manifest)
  └─ gère l'UI shell (DOM shadow root) + exécute les commandes page-side
```

- Permissions : `activeTab` + `scripting` + `storage`.
- Le shell vit dans une **shadow root** isolée (styles + scripts de la page ne peuvent pas le casser).
- Toute commande s'exécute **directement dans le content script** (même monde DOM que la page). Pas de backend, pas de réseau.
- Injection du content script : **automatique** via `content_scripts` dans le manifest.

## 5. UI

[VALIDÉ]
- **Float** : fenêtre flottante 600×400, déplaçable, redimensionnable.
- **Sidebar** : panneau collé au bord droit (380px, pleine hauteur) — bascule via bouton ☰.
- **Barre de titre** : `cmd>` | ⬇ ⬆ | ☰ — ×
  - ⬇ : exporter les macros (JSON)
  - ⬆ : importer des macros (JSON)
- **Layout** : zone de scroll (historique des sorties) + menu d'autocomplétion + ligne de saisie.
- **Mode navigation** (⌕ vert) : suggestions ouvertes — Enter/Tab complète, ↑↓ navigue.
- **Mode terminal** (❯ bleu) : suggestions fermées — Enter exécute.
- **Indicateur de chargement** : affiché pendant le scan DOM.
- Styles : police mono, fond sombre Catppuccin Mocha, texte clair.

## 6. Autocomplétion

[VALIDÉ]
- **Pré-scan** du DOM à l'ouverture (lazy, `setTimeout(0)`), cache des 3 types (click/fill/all).
- **TreeWalker** sur tous les nœuds text visibles (comme Ctrl+F) — pas de filtre `cursor:pointer`.
- **Texte CSS** `::before`/`::after` (menus Ant Design, Material, etc.).
- **Sélecteurs CSS uniques** : id > class unique > chemin `nth-of-type`. Vérifié avec `querySelector` avant ajout.
- **Cache invalidé** après chaque action qui modifie le DOM (click, fill, eval).
- **`reload`** : re-scan immédiat du cache (pas de debounce).

## 7. Macros

[VALIDÉ]
- **Enregistrement** : `start <nom>` → commandes capturées → `end` → sauvegardé.
- **Replay** : `replay <nom>` → exécute les commandes avec 2s de délai entre chaque.
- **Persistance** : `chrome.storage.local`, clé `browseCmdMacro_<host>` (par site).
- **Structure** : `{ [name]: { cmds: string[], date: string } }`.
- **Liste** : `replay ls` (site courant), `replay ls -a` (tous les sites, mode dossier).
- **Suppression** : `replay rm <nom>`.
- **Export/Import** : boutons ⬇/⬆ dans la barre de titre → fichier JSON.
  - Export : `browse-cmd-macros-<host>.json`
  - Import : fusion avec les macros existantes (nouvelles + mises à jour).

## 8. Marqueur rouge

[VALIDÉ]
- Point rouge sur l'élément cible de la commande (id/class/nth-of-type).
- **Animation sweep** : cercle qui rétrécit vers le point (1/4 de la window, 500ms de délai).
- **`unset`** : efface le marqueur + stoppe l'animation. Le marqueur reste off jusqu'à navigation des suggestions.
- **`scrollIntoView`** : l'élément cible est mis en vue (smooth).

## 9. Sécurité

[VALIDÉ]
- `eval` exécute du JS arbitraire **dans la page** : le raccourci clavier est la seule "authentification". Usage local/dev uniquement.
- `copy` utilise `navigator.clipboard.writeText()` — accessible via `activeTab`.
- Documenté comme tel dans le README.

## 10. Non-goals (pour l'instant)

- [ ] Commandes multi-lignes / pipelines
- [ ] Configuration des raccourcis à l'intérieur du shell
- [ ] Support Firefox
- [ ] Multi-sélecteurs (`get "a, b, c"` ne prend que le premier)
- [ ] Timeout sur `eval` (un `while(true){}` fige la page)
- [ ] Mode clair (le shell est toujours sombre)
- [x] ~~Persistance de l'historique entre sessions~~ → fait (`chrome.storage.local`)

## 11. Décisions

[TOUTES VALIDÉES]

| # | Décision | Choix |
|---|---|---|
| 1 | Raccourci clavier | `Ctrl+Shift+K` |
| 2 | `eval` | conservé (arbitraire, contexte page) |
| 3 | Commandes additionnelles | `copy`, `fill`, `unset`, `reload`, macros ajoutés ; `type`/`scroll`/`set` écartés |
| 4 | Shell | Float 600×400 (déplaçable, redimensionnable) + Sidebar 380px |
| 5 | `get` output | `outer` (défaut) / `inner` (option) |
| 6 | `eval` output | JSON formaté si objet, sinon String |
| 7 | Historique | persistant par site via `chrome.storage.local` |
| 8 | Toggle | `Ctrl+Shift+K` ouvre+referme, un seul panneau à la fois |
| 9 | Permissions | `activeTab` + `scripting` + `storage` |
| 10 | Injection | content script auto via manifest |
| 11 | Autocomplétion | TreeWalker sur tous les nœuds text (Ctrl+F), cache pré-scan |
| 12 | Macros | persistantes par site, export/import JSON, replay avec 2s de delay |
| 13 | Marqueur | point rouge + animation sweep, `unset` pour effacer |
| 14 | Mode nav/term | séparation visuelle (⌕ vert / ❯ bleu) entre autocomplétion et exécution |
