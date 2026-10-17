# SPEC — browse-cmd

> Source de vérité du projet. Toute décision y est consignée avant implémentation.
> Statut des sections : `[PROPOSÉ]` = en attente de validation, `[VALIDÉ]` = à implémenter, `[REJETÉ]` = écarté avec justification.

## 1. Vision

[VALIDÉ]
Extension Chrome activable par raccourci clavier (`Ctrl+/`). Elle superpose une interface shell **plein écran, voilée** (fond noir semi-transparent sur toute la page), permettant de saisir des commandes simples exécutées **du côté front** (sur la page courante).

## 2. Cas d'usage
[VALIDÉ]
1. Dev/Front sur une page : ouvre le shell (Ctrl+/), tape une commande, lit le résultat, ferme le shell.
2. Commandes utiles typiques : `eval "..."`, `click <sélecteur>`, `get <sélecteur>`, `url`, `tab`, `clear`, `help`.
3. Historique des commandes récentes (↑/↓).

## 3. Commandes

| Commande | Description |
|---|---|
| `help` | liste les commandes |
| `clear` | efface le shell |
| `url` | affiche l'URL courante |
| `tab <url>` | ouvre l'URL dans un nouvel onglet |
| `get <sélecteur>` | renvoie le HTML du premier élément matching (ou "not found") |
| `click <sélecteur>` | clique sur le premier élément matching |
| `eval <js>` | exécute du JS arbitraire dans le contexte de la page, affiche le résultat |

Commandes additionnelles (`type`, `scroll`, `set`) : écartées pour l'instant, à réévaluer plus tard.

## 4. Architecture

[VALIDÉ]
Manifest V3. Deux parties :

```
background (service worker)
  └─ reçoit le raccourci (chrome.commands) → envoie message "toggle"
content script (injecté dans toutes les pages)
  └─ gère l'UI shell (DOM shadow root) + exécute les commandes page-side
```

- Permissions : `activeTab` + `scripting` uniquement.
- Le shell vit dans une **shadow root** isolée (styles + scripts de la page ne peuvent pas le casser).
- Toute commande s'exécute **directement dans le content script** (même monde DOM que la page). Pas de backend, pas de réseau.

## 5. UI

[VALIDÉ]
- **Plein écran** : un voile noir semi-transparent recouvre toute la page, le shell est centré devant.
- Zone de scroll (historique des sorties) + ligne de saisie avec prompt `❯`.
- Clavier : `Enter` exécute, `↑`/`↓` historique, `Esc` ou le raccourci referme.
- Styles : police mono, fond sombre, texte clair.

## 6. Sécurité

[VALIDÉ]
- `eval` exécute du JS arbitraire **dans la page** : le raccourci clavier est la seule "authentification". Usage local/dev uniquement.
- Documenté comme tel dans le README.

## 7. Non-goals (pour l'instant)

- [ ] Commandes multi-lignes / pipelines
- [ ] Persistance de l'historique entre sessions
- [ ] Configuration des raccourcis à l'intérieur du shell
- [ ] Support Firefox

## 8. Décisions

[TOUTES VALIDÉES]

| # | Décision | Choix |
|---|---|---|
| 1 | Raccourci clavier | `Ctrl+/` |
| 2 | `eval` | conservé (arbitraire, contexte page) |
| 3 | Commandes additionnelles | aucune pour l'instant (`type`/`scroll`/`set` écartés) |
| 4 | Position du shell | plein écran, voile noir sur la page, shell centré |
