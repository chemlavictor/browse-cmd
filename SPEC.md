# SPEC — browse-cmd

> Source de vérité du projet. Toute décision y est consignée avant implémentation.
> Statut des sections : `[PROPOSÉ]` = en attente de validation, `[VALIDÉ]` = à implémenter, `[REJETÉ]` = écarté avec justification.

## 1. Vision

[VALIDÉ]
Extension Chrome activable par raccourci clavier (`Ctrl+Shift+K`). Elle superpose une interface shell plein écran (voile noir) sur la page active, permettant de saisir des commandes exécutées directement dans la page.

## 2. Cas d'usage
[VALIDÉ]
1. Dev/Front sur une page : ouvre le shell (Ctrl+Shift+K), tape une commande, lit le résultat, ferme le shell.
2. Commandes utiles typiques : `eval "..."`, `click <sélecteur>`, `get <sélecteur>`, `copy <sélecteur>`, `url`, `tab`, `clear`, `help`.
3. Historique des commandes récentes (↑/↓) — **partagé entre onglets** (`chrome.storage.session`).
4. **Toggle** : `Ctrl+Shift+K` ouvre et referme le shell. Un seul panneau ouvert à la fois (un nouvel onglet fermant le précédent). Le texte en cours n'est pas partagé entre onglets (limite technique).

## 3. Commandes

| Commande | Description |
|---|---|
| `help` | liste les commandes |
| `clear` | efface le shell |
| `url` | affiche l'URL courante |
| `tab <url>` | ouvre l'URL dans un nouvel onglet |
| `get <sélecteur> [inner\|outer]` | renvoie le HTML du premier élément matching. `outer` (défaut) = élément complet, `inner` = contenu. Ou "not found" |
| `click <sélecteur>` | clique sur le premier élément matching |
| `copy <sélecteur>` | copie le texte de l'élément dans le presse-papiers |
| `eval <js>` | exécute du JS arbitraire dans la page, affiche le résultat (JSON formaté si objet, sinon String) |

Commandes additionnelles (`type`, `scroll`, `set`) : écartées pour l'instant, à réévaluer plus tard.

## 4. Architecture

[VALIDÉ]
Manifest V3. Deux parties :

```
background (service worker)
  └─ reçoit le raccourci (chrome.commands) → envoie message "toggle" à l'onglet actif
content script (injecté automatiquement dans toutes les pages via manifest)
  └─ gère l'UI shell (DOM shadow root) + exécute les commandes page-side
```

- Permissions : `activeTab` + `scripting` uniquement. `chrome.storage.session` est accessible sans permission extra.
- Le shell vit dans une **shadow root** isolée (styles + scripts de la page ne peuvent pas le casser).
- Toute commande s'exécute **directement dans le content script** (même monde DOM que la page). Pas de backend, pas de réseau.
- Injection du content script : **automatique** via `content_scripts` dans le manifest (toujours prêt quand le raccourci est pressé).

## 5. UI

[VALIDÉ]
- **Voile noir** `rgba(0,0,0,0.85)` recouvre toute la page.
- **Shell** : `80vw × 60vh`, centré.
- **Layout** : zone de scroll fixe en haut (historique des sorties défile) + ligne de saisie fixe en bas avec prompt `❯`.
- Clavier : `Enter` exécute, `↑`/`↓` historique, `Esc` ou le raccourci referme.
- Styles : police mono, fond sombre, texte clair.

## 6. Sécurité

[VALIDÉ]
- `eval` exécute du JS arbitraire **dans la page** : le raccourci clavier est la seule "authentification". Usage local/dev uniquement.
- `copy` utilise `navigator.clipboard.writeText()` — accessible via `activeTab` sans permission extra (l'onglet est déjà "activé" par le raccourci).
- Documenté comme tel dans le README.

## 7. Non-goals (pour l'instant)

- [ ] Commandes multi-lignes / pipelines
- [ ] Persistance de l'historique entre sessions
- [ ] Configuration des raccourcis à l'intérieur du shell
- [ ] Support Firefox
- [ ] Multi-sélecteurs (`get "a, b, c"` ne prend que le premier)
- [ ] Timeout sur `eval` (un `while(true){}` fige la page)
- [ ] Mode clair (le shell est toujours sombre)

## 8. Décisions

[TOUTES VALIDÉES]

| # | Décision | Choix |
|---|---|---|
| 1 | Raccourci clavier | `Ctrl+Shift+K` (`Ctrl+/` non autorisé par Chrome) |
| 2 | `eval` | conservé (arbitraire, contexte page) |
| 3 | Commandes additionnelles | `copy` ajouté ; `type`/`scroll`/`set` écartés |
| 4 | Shell | `80vw × 60vh`, centré, voile noir `rgba(0,0,0,0.85)` |
| 5 | `get` output | `outer` (défaut) / `inner` (option) |
| 6 | `eval` output | JSON formaté si objet, sinon String |
| 7 | Historique | partagé entre onglets via `chrome.storage.session` |
| 8 | Toggle | `Ctrl+Shift+K` ouvre+referme, un seul panneau à la fois |
| 9 | Permissions | `activeTab` + `scripting` uniquement |
| 10 | Injection | content script auto via manifest |
