# Remarques mobiles — correction locale du 16 octobre 2026

Branche : `stopflow-dev`. Départ synchronisé par fetch/rebase sur
`9ca1764ee6f54bd9c9ea07ed32fa5354999eb7ae`.
Sauvegarde : `backup/stopflow-dev-before-mobile-notes-20261016-9ca1764`.
Aucun push, déploiement, changement de schéma/permission ou écriture Supabase.

## Inventaire : cause et correction

Le `MutationObserver` de `stopflow-073-inventory-mobile-ux.js` observe le DOM et
les attributs `class`/`style`. `syncSummaryPresentation()` rappelle
`renderValidationMode()`, qui réécrivait le stepper puis `root.innerHTML`, même
sans changement des données affichées. Le textarea était remplacé, son focus
perdu, et les mutations du rendu relançaient elles-mêmes les rafraîchissements.
Le verrou `renderingSummary` ne protège que l'appel synchrone, pas ces rappels.

La correction conserve le panneau lorsque son identité et ses données affichées
sont inchangées. La remarque est exclue de la clé de rendu. Pendant la saisie,
un champ actif est conservé même si les autres données changent ; leur rendu
sera actualisé lors d'un prochain rafraîchissement hors saisie. Le stepper est
actualisé seulement lorsqu'un nouveau rendu est nécessaire.

L'écouteur `input` existant continue de synchroniser `current.note` et
`#generalNote`. Un changement réel de données hors saisie reconstruit toujours
le panneau. Un retour au résumé puis à la validation conserve la remarque.
Le rendu Résumé, les actions `+`/`−` et la logique de validation restent inchangés.

## Températures : listener et cause exacte

Le responsable est le listener `document.pointerup` de
`stopflow-070-temperature-v3-visibility.js`. Il programme `decorate()` à
0, 60, 180 et 450 ms pour tout événement dans Températures.

Si les équipements arrivent après ces rappels de navigation, le premier toucher
de la remarque déclenche la première décoration des nouvelles lignes.
`decorateRow()` déplace alors les deux `.field` dans
`.sf70-tv3-reading-fields` avec `group.append(valueField,noteField)`.
Déplacer le champ actif provoque un `focusout`, même si le même objet input est
réinséré. La trace de focus donne directement cette pile d'appel.

Aucun `preventDefault()` du pavé numérique ni des propriétaires tactiles
génériques n'a été observé sur ce toucher de remarque. Leurs sélecteurs ne
ciblent pas `.sf70-tv3-note`.

La décoration est désormais appelée synchroniquement après `renderReadings()`.
Le décorateur ne déplace jamais les champs d'une ligne contenant le focus, ce
qui protège aussi une installation tardive du module visuel. Aucun listener
tactile global n'est ajouté ou remplacé.

Le pavé accepte uniquement `.sf70-tv3-value`, y compris via son API `open()`.
À son ouverture, le champ actuellement actif perd le focus : passer d'une
remarque au pavé libère ainsi le clavier texte. `saveRound()` et son payload
`note` restent inchangés.

## Reproduction comparée

Les mêmes sondes ont été exécutées sur une copie du commit de départ et sur le
correctif, avec des ressources locales et des requêtes externes bloquées :

| Contrôle | Avant | Après |
| --- | --- | --- |
| Objet textarea conservé après rafraîchissements | Non | Oui |
| Ancien textarea connecté / toujours actif | Non / non | Oui / oui |
| Premier toucher remarque Températures après chargement tardif | `focusin`, puis `focusout` depuis `decorateRow()` | `focusin` conservé |

## Validation et limites

`tests/mobile-note-input.cjs` utilise Chromium avec un profil iPhone 13 :

- saisie native des remarques par toucher puis frappe au clavier, sans
  `locator.fill()` pour masquer une perte de focus ;
- texte multiligne, rafraîchissements, variation des données pendant le focus,
  redimensionnement, blur/reprise du focus et aller-retour Résumé/Validation ;
- enregistrement local unique, lecture de l'historique et extraction du texte
  du PDF ouvert par le bouton de fin d'inventaire ;
- pavé numérique : décimales, négatifs, suivant, fermeture, retour à la remarque ;
- un seul appel RPC simulé pour trois équipements, avec la remarque dans le
  payload et dans les données simulées rechargées ;
- composant checkbox Checklist inchangé contrôlé isolément par clic.

Les contrôles Commandes/Suggestions et Articles restent dans les suites
`tests/order-html-security.cjs` et `tests/article-html-security.cjs`.

Résultat final : les trois suites réussissent. Les 86 contrôles de syntaxe
JavaScript réussissent également (85 fichiers et un script inline).

Limite distincte observée sur le commit de départ **et** après correction : un
tap natif Chromium sur `+` peut passer de 0 à 2, par clic de compatibilité après
reconstruction du contrôle. Les calculs `+`/`−` sont donc aussi vérifiés par clic
direct. Les boutons de changement de panneau et de validation sont exercés via
leurs propriétaires Pointer Events, avec clic de compatibilité sur le contrôle
initial : un tap Chromium peut sinon recibler le bouton nouvellement créé.
Cette suite ne valide donc pas l'absence de toute double action tactile sur
iOS. Ces gestionnaires restent strictement inchangés conformément au périmètre.

Le blur et le redimensionnement simulent la fermeture et la réouverture du
clavier ; sa visibilité réelle n'est pas accessible à cette émulation. WebKit
n'était pas installé et son téléchargement a été bloqué (HTTP 403).

Sur iPhone réel, vérifier les deux claviers, plusieurs lignes et reprise de
saisie, passage remarque/température/remarque, validation unique, notes de
l'historique/PDF et du relevé effectivement enregistré, `+`/`−`, navigation et
checklists. Aucun test n'a écrit dans la véritable base Supabase.
