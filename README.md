# browse-cmd

Extension Chrome qui ouvre une interface shell dans la page active, pilotable par raccourci clavier.

## Quick start

```
1. Charger l'extension en mode développeur
   Chrome → chrome://extensions → Activer le mode développeur
   → "Charger l'extension décompilée" → sélectionner le dossier src/

2. Utiliser
   Raccourci par défaut : Ctrl+Shift+K (configurable dans chrome://extensions/shortcuts)
   L'interface shell s'ouvre sur l'onglet actif (fenêtre flottante ou sidebar)
```

## Commandes

| Commande | Description |
|---|---|
| `h` / `help` | liste les commandes |
| `c` / `clear` | efface le shell |
| `q` / `quit` | ferme le shell |
| `u` / `url` | affiche l'URL courante |
| `t <url>` / `tab` | ouvre l'URL dans un nouvel onglet |
| `g <sel> [i]` / `get` | HTML d'un élément (i = inner) |
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

## Autocomplétion

- **Sans espace** : autocomplétion des noms de commandes
- **Avec espace + commande sélecteur** (`k`, `g`, `f`, `y`) : autocomplétion des sélecteurs DOM
  - TreeWalker sur tous les nœuds text visibles (comme Ctrl+F)
  - Texte CSS `::before`/`::after` (menus Ant Design, Material, etc.)
  - Sélecteurs CSS uniques garantis (id, class unique, ou chemin nth-of-type)
- **Mode navigation** (⌕ vert) : menu de suggestions ouvert — Enter/Tab complète, ↑↓ navigue
- **Mode terminal** (❯ bleu) : menu fermé — Enter exécute
- **Pré-scan** du DOM à l'ouverture (lazy), cache invalidé après chaque action

## Macros

Enregistrement de séries de commandes pour les rejouer :

```
> start login           # démarre l'enregistrement
> k #username           # ● enregistré [1]
> f #password "abc123"  # ● enregistré [2]
> k #submit             # ● enregistré [3]
> end                   # ■ "login" sauvegardée : 3 commande(s)
> replay login          # rejoue les 3 commandes (2s entre chaque)
```

- **Persistantes** : sauvegardées dans `chrome.storage.local`, clé par site (`host`)
- **Export/Import** : boutons ⬇/⬆ dans la barre de titre → fichier JSON
  - Export : `browse-cmd-macros-<host>.json`
  - Import : fusion avec les macros existantes (nouvelles + mises à jour)
- **`replay ls`** : liste les macros du site courant (nom, nb cmds, date)
- **`replay ls -a`** : liste les macros de tous les sites (mode dossier)
- **`replay rm <nom>`** : supprime une macro

## Marqueur rouge

- Point rouge sur l'élément cible de la commande
- Animation sweep : cercle qui rétrécit vers le point (500ms de délai)
- `unset` : efface le marqueur et stoppe l'animation
- Le marqueur se réactive à la navigation des suggestions (↑↓)

## Interface

- **Float** : fenêtre flottante 600×400, déplaçable, redimensionnable
- **Sidebar** : panneau collé au bord droit (380px, pleine hauteur) — bouton ☰
- Barre de titre : `cmd>` | ⬇ ⬆ | ☰ — ×
- Indicateur de chargement pendant le scan DOM

## Sécurité

`eval` exécute du JS arbitraire **dans la page**. Le raccourci clavier est la seule
"authentification". Usage local/dev uniquement.

## Structure

```
browse-cmd/
├── SPEC.md                  # spécifications (source de vérité)
├── README.md
├── package.json
└── src/
    ├── manifest.json        # manifest V3 (permissions: activeTab, scripting, storage)
    ├── background/
    │   └── service-worker.js # reçoit le raccourci, envoie "toggle"
    └── content/
        ├── state.js          # toggle, historique persistant, macros persistantes
        ├── commands.js       # table de commandes (y compris macros)
        ├── ui.js             # shell UI (shadow root, autocomplétion, marqueur)
        └── content-script.js # écoute les messages du background
```

## État

✅ Fonctionnel — voir [SPEC.md](./SPEC.md) pour les spécifications.
