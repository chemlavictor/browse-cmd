# browse-cmd

Extension Chrome qui ouvre une interface shell dans la page active, pilotable par raccourci clavier.

## Quick start

```bash
# 1. Installer les dépendances
npm install

# 2. Charger l'extension en mode développeur
#    Chrome → chrome://extensions → Activer le mode développeur
#    → "Charger l'extension décompilée" → sélectionner ce dossier

# 3. Utiliser
#    Raccourci par défaut : Ctrl+Shift+` (configurable dans chrome://extensions/shortcuts)
#    L'interface shell s'ouvre dans l'onglet actif
```

## Développement

```bash
npm run dev      # build watcher
npm run build    # build production
npm run lint     # vérification du code
npm test         # tests
```

## Structure

```
browse-cmd/
├── SPEC.md          # spécifications (source de vérité)
├── README.md
├── package.json
├── manifest.json    # manifest V3 de l'extension
├── src/
│   ├── background/  # service worker
│   ├── content/     # script content (injection de l'UI shell)
│   └── ui/          # interface shell
└── tests/
```

## État

🚧 En cours — voir [SPEC.md](./SPEC.md) pour les spécifications.
