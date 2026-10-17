# browse-cmd

Extension Chrome qui ouvre une interface shell dans la page active, pilotable par raccourci clavier.

## Quick start

Pas de build step — le code est vanilla JS, on charge le dossier `src/` tel quel.

```
1. Charger l'extension en mode développeur
   Chrome → chrome://extensions → Activer le mode développeur
   → "Charger l'extension décompilée" → sélectionner le dossier src/

2. Utiliser
   Raccourci par défaut : Ctrl+Shift+K (configurable dans chrome://extensions/shortcuts)
   L'interface shell s'ouvre en plein écran (voile noir) sur l'onglet actif
```

## Commandes

| Commande | Description |
|---|---|
| `help` | liste les commandes |
| `clear` | efface le shell |
| `url` | affiche l'URL courante |
| `tab <url>` | ouvre l'URL dans un nouvel onglet |
| `get <sel> [inner\|outer]` | renvoie le HTML d'un élément |
| `click <sel>` | clique sur un élément |
| `copy <sel>` | copie le texte d'un élément |
| `eval <js>` | exécute du JS dans la page |

Historique : `↑`/`↓` navigue dans les commandes récentes (partagé entre onglets).

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
    ├── manifest.json        # manifest V3 de l'extension
    ├── background/
    │   └── service-worker.js # reçoit le raccourci, envoie "toggle"
    └── content/
        ├── state.js          # toggle, historique, panel unique
        ├── commands.js       # table de commandes
        ├── ui.js             # shell UI (shadow root + styles)
        └── content-script.js # écoute les messages du background
```

## État

✅ Fonctionnel — voir [SPEC.md](./SPEC.md) pour les spécifications.
