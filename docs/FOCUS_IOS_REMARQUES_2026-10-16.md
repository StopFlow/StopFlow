# Remarques iOS — reconstruction locale du 17 octobre 2026

## Provenance et périmètre

Le commit local initial `33f057147d085c46af80d5ef6b02923cc2bc64a4` n'est pas
récupérable dans les objets, reflogs ou worktrees accessibles à cet environnement.
Le working tree était propre avant `git fetch origin stopflow-dev`.
Le fetch explicite de la référence distante a ensuite confirmé
`origin/stopflow-dev` à `6b43f1e5e792ec25f4748a7876eef2e4cf08c3fb`.
La branche locale `stopflow-dev` a été créée exactement depuis cette base.
Sauvegarde : `backup/stopflow-dev-before-ios-note-rebuild-20261017-6b43f1e`.

Les deux fichiers applicatifs reproduisent strictement le diff conservé :

| Fichier | Blob reconstruit | Identifiant du diff archivé |
| --- | --- | --- |
| `stopflow-070-temperature-v3.js` | `1ea661d1941dd5ceb1b6aace02de25ba6058a156` | `1ea661d` |
| `stopflow-073-inventory-mobile-ux.js` | `1522a42a3026d0896fd15f90130da4bff75aed98` | `1522a42` |

L'absence de newline finale du second fichier est conservée. Le diff applicatif
compte 36 lignes ajoutées, sans suppression ni autre changement fonctionnel.

`tests/ios-note-focus.cjs` est recréé depuis le texte conservé de la suite
initiale : mêmes 28 scénarios et mêmes assertions. L'objet d'origine étant
absent, son identité binaire avec l'ancien fichier n'est pas certifiée.
Le présent rapport est recréé et actualisé pour documenter cette récupération.

Deux adaptations de synchronisation sont également faites dans le test existant
`tests/mobile-note-input.cjs`, sans changement applicatif :

- attendre les cartes du résumé après l'affichage de la page, avant de vérifier
  leur nombre ; l'assertion échouait avec 0 carte alors que la capture suivante
  montrait bien les 26 cartes ;
- utiliser `locator.tap()` après le défilement préparatoire, pour attendre une
  cible stable. Le tap aux coordonnées calculées manuellement avait aussi donné
  un échec de focus intermittent. Aucun focus n'est forcé dans ce helper et
  aucune assertion métier n'est retirée.

## Diagnostic conservé et limites

Le retour iPhone réel invalide la clôture des deux bugs après `6b43f1e`.
L'audit précédent et les gestes simulés ne désignent pas de listener global
bloquant Safari avec certitude. Les sélecteurs des couches historiques sont :

| Couche | Cibles et constat dans le DOM testé |
| --- | --- |
| `stopflow-073-inventory-mobile-ux.js` | Les propriétaires pointer ciblent les contrôles du parcours, pas le textarea. |
| `stopflow-073-final-validation-touch-fix.js` | `controlFrom()` sélectionne Retour et Confirmer, pas les remarques. |
| `stopflow-073-mobile-responsive-standard.js` | Les actions génériques sont boutons, liens et `role=button` ; les champs testés n'ont pas d'ancêtre correspondant. |
| `stopflow-070-mobile-subpage-touch-fix.js` | Les actions Températures portent `data-tv3-action`, absent du champ remarque. |
| `stopflow-070-back-navigation.js` | Les captures du parcours ciblent Continuer ou Retour, pas ces champs texte. |
| `stopflow-052-mobile.js` | Le départ du swipe ignore explicitement `input` et `textarea`. |
| `stopflow-070-temperature-v3-mobile-keypad.js` | La capture et l'API ne prennent que `.sf70-tv3-value`. |

Avant reconstruction, la suite tactile relève 0 appel à `focus()` pendant
`touchend` sur les deux remarques et 0 appel à `preventDefault()` pour leurs
gestes. Elle échoue sur l'absence d'activation explicite, sans s'appuyer sur le
focus natif de Chromium. C'est une différence de mécanisme avec l'éditeur
d'équipement dans `stopflow-080-runtime-bridge.js`, pas une preuve de la cause
du refus du clavier sur le téléphone.

`6b43f1e` stabilisait les nœuds DOM et protégeait le champ actif contre le
reparentage ; il n'ajoutait pas cette activation explicite pendant le geste.
Ses protections restent conservées.

## Correctif reconstruit

- Sur `#sf73ValidationNote`, les écouteurs sont attachés au textarea créé.
- Pour `.sf70-tv3-note`, ils sont délégués sur la page Températures existante et
  sélectionnent uniquement `input.sf70-tv3-note`.
- Un tap unique appelle `focus({preventScroll:true})` synchroniquement dans
  `touchend`, avec repli synchrone sur `focus()` pour les anciennes signatures.
- Le focus est aussi appelé sur un champ déjà actif, pour une reprise de saisie
  après fermeture du clavier. La sélection et la valeur ne sont pas modifiées.
- Les écouteurs sont passifs et n'appellent ni `preventDefault()`, ni
  `stopPropagation()`, ni `stopImmediatePropagation()`.
- Un déplacement supérieur à 10 pixels, même suivi d'un retour au point initial,
  un geste annulé, plusieurs doigts ou un champ désactivé/readonly empêchent
  cette activation supplémentaire.

Aucun nouveau gestionnaire tactile global, timer de focus ou changement du
pavé numérique, des boutons `+`/`−`, de la validation, de l'historique, des
calculs, des checklists, des droits ou de Supabase.

## Contrôles effectués lors de cette reconstruction

- `node tests/ios-note-focus.cjs` : échec attendu avant modification, puis
  réussite après. Deux champs, sept scénarios chacun, avec `window.PointerEvent`
  disponible puis masqué : 28 cas. Tap, champ déjà actif, sélection, scroll
  aller-retour, annulation, multitouch, readonly, disabled et touchend dupliqué.
  Un seul focus synchrone par tap, aucun focus forcé sur scroll, aucune
  annulation ni rupture de propagation du geste. Écouteurs locaux et passifs.
- `node tests/mobile-note-input.cjs` : réussite complète après les adaptations
  de synchronisation du test décrites ci-dessus. Saisie multiligne au focus
  courant, maintien du nœud et de la valeur, resize, blur/reprise de saisie,
  retour Résumé/Validation, validation et sauvegarde locale uniques, historique
  et vrai PDF du bouton de fin d'inventaire, analysé avec `pdftotext`.
- Températures : premier tap sur remarque, alternance pavé/remarque, décimales,
  négatifs, suivant et fermeture ; un seul RPC simulé contenant trois relevés,
  avec la note présente dans le payload et les données simulées rechargées.
- Checkbox Checklist inchangée testée isolément par clic.
- 87 contrôles de syntaxe réussis : 86 fichiers JavaScript et un script inline.
  Le fichier de test adapté a aussi été revérifié après sa dernière édition.
- `git diff --check` sans erreur.

Les requêtes externes du navigateur sont bloquées. L'inventaire est enregistré
uniquement en local et les RPC température utilisent une fixture en mémoire.
Aucune écriture dans le véritable Supabase n'a été effectuée.

Les gestes tactiles du test synchrone sont synthétiques ; les taps du parcours
utilisent Chromium avec émulation iPhone. Aucun de ces tests ne prouve
l'ouverture du clavier logiciel sur un véritable iPhone. Les boutons `+`/`−`
sont vérifiés par clic direct et les contrôles de changement de panneau via
leurs propriétaires Pointer Events. Le double incrément tactile connu reste
hors périmètre et n'est pas déclaré corrigé.

## Revue et validation iPhone encore nécessaires

Confirmer l'URL, le commit effectivement chargé, la version iOS et le mode
Safari ou application installée. Vérifier le clavier dans Validation, plusieurs
lignes, fermeture/reprise, conservation de la note, validation unique,
enregistrement effectif, historique et PDF. Dans Températures, alterner pavé
numérique et clavier texte, conserver la remarque et vérifier le relevé
réellement enregistré. Contrôler le défilement, la navigation et les doubles
actions sans intervenir sur le problème `+` connu.

Si le clavier reste absent, relever via Web Inspector la cible du toucher,
`document.activeElement`, `isConnected`, `elementFromPoint()` et les piles de
`preventDefault()`/`stopImmediatePropagation()`. La cause exacte du blocage
iPhone et la résolution des deux bugs restent non confirmées.

Travail local uniquement : aucun push GitHub, aucun déploiement Vercel,
aucune modification de `main` ni de Supabase. Attente de la revue avant toute
publication.
