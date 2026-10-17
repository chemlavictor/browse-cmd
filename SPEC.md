# SPEC — browse-cmd

> Source de vérité du projet. Toute décision y est consignée avant implémentation.
> Statut des sections : `[PROPOSÉ]` = en attente de validation, `[VALIDÉ]` = à implémenter, `[REJETÉ]` = écarté avec justification.

## 1. Vision

`[PROPOSÉ]`
Extension Chrome activable par raccourci clavier. Elle superpose une interface shell dans l'onglet actif, permettant de saisir des commandes simples exécutées **du côté front** (sur la page courante).

## 2. Cas d'usage

`[PROPOSÉ]`
1. Dev/Front sur une page : ouvre le shell (Ctrl+Shift+`), tape une commande, lit le résultat dans l'UI, ferme le shell.
2. Commandes utiles typiques : `eval "..."`, `click <sélecteur>`, `get <sélecteur>`, `url`, `tab`, `clear`, `help`.
3. Historique des commandes récentes (↑/↓).

## 3. Commandes

`[PROPOSÉ]`
| Commande | Description |
|---|---|
| `help` | liste les commandes |
| `clear` | efface le shell |
| `url` | affiche l'URL courante |
| `tab` | ouvre l'URL saisie dans un nouvel onglet : `tab <url>` |
| `get <sélecteur>` | renvoie le HTML du premier élément matching (ou "not found") |
| `click <sélecteur>` | clique sur le premier élément matching |
| `eval <js>` | exécute du JS arbitraire dans le contexte de la page, affiche le résultat |

## 4. Architecture

`[PROPOSÉ]`
Manifest V3. Trois parties :

```
background (service worker)
  └─ reçoit le raccourci (chrome.commands) → envoie message "open"
content script (injecté dans toutes les pages)
  └─ gère l'UI shell (DOM shadow root) + exécute les commandes page-side
```

- Pas de permissions inutiles : `activeTab` + `scripting` suffisent.
- Le shell vit dans une **shadow root** isolée (styles + scripts de la page ne peuvent pas le casser).
- Toute commande s'exécute **directement dans le content script** (même monde DOM que la page). Pas de backend, pas de réseau.

## 5. UI

`[PROPOSÉ]`
- Panneau terminal style, ancré en bas de la page, largeur ~80vw, hauteur ~40vh.
- Zone de scroll (historique des sorties) + ligne de saisie avec prompt `❯`.
- Clavier : `Enter` exécute, `↑`/`↓` historique, `Esc` ou le raccourci referme.
- Styles : police mono, fond sombre, texte clair.

## 6. Sécurité

`[PROPOSÉ]`
- `eval` exécute du JS arbitraire **dans la page** : le raccourci clavier est la seule "authentification". Usage local/dev uniquement.
- Documenté comme tel dans le README.

## 7. Non-goals (pour l'instant)

- [ ] Commandes multi-lignes / pipelines
- [ ] Persistance de l'historique entre sessions
- [ ] Configuration des raccourcis à l'intérieur du shell
- [ ] Support Firefox

## 8. Décisions ouvertes

> À trancher par ordre de priorité avant implémentation.

1. **Nom du raccourci** : `Ctrl+Shift+`` est-il ok, ou un autre ?
2. **`eval`** : on le garde tel quel (arbitraire) ?
3. **Commandes manquant** : y'a-t-il des commandes que tu veux absolument ? (`type <sélecteur> <texte>` ? `scroll <y>` ?)
4. **Position du shell** : bas de page, ou ailleurs ?
