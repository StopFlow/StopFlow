# Pilote — éditeur du plan L’Union, 21 novembre 2026

Branche exclusivement `pilot/stopflow-v1-20261117`. Base vérifiée :
`6f06e0d987cc80da89169735f488b92df5d89c85`, avec la référence R3
`e160453537460c5b05e501d68d2376724b030317` conservée. Le SDK Supabase
servi localement, son contrôle d’intégrité, le démarrage Auth et le bouton
œil restent inchangés.

## Usage

Service → engrenage : l’éditeur occupe toute la fenêtre, indépendamment
de l’API Fullscreen. Il montre un seul plan, nommé en permanence. Le
sélecteur choisit aussi la cible des ajouts, même si le plan est vide.
Le panneau Propriétés se replie. Le menu + présente Plan / Table / Décor.
Le fond déplace la vue ; un objet se déplace avec un seul doigt. Deux
contacts déplacent/zooment la vue sans déplacer accidentellement l’objet.
Les coordonnées sont calculées dans le repère figé au début du geste.

- **Annuler / Rétablir** : historique du brouillon (40 actions), un glisser
  constitue une action. Le zoom et le déplacement de la vue n’en font pas partie.
- **Abandonner** : retour au dernier état confirmé, en restant dans l’éditeur.
- **Quitter** : conserve le brouillon local après confirmation, sans l’envoyer.
- **Enregistrer** : utilise les RPC existantes, leur contrôle de version et
  une relecture après chaque écriture. L’historique repart de l’état confirmé.
  Un envoi incertain bloque les nouvelles écritures, l’abandon et la sortie
  tant qu’il n’est pas réconcilié ; aucune répétition automatique.
- **Archiver / Restaurer** : archive réversible du plan via la salle
  existante ; aucun identifiant ni historique supprimé. Le garde serveur
  contre l’archivage d’une salle ayant des réservations futures reste actif.

## Disposition préparée, pas importée

`tools/pilot/plan-reference.json` est la copie exacte de la référence reçue,
SHA-256 `2c4acbc7daf34cc10cb909e79567618dfd82169f9d3ba4c08135425625e4efd7`.
Le module `stopflow-095-plan-reference.js` prépare **en brouillon** un nouveau
plan Restaurant & Taverne : 25 nouvelles tables, coordonnées exactes de la
référence, et trois repères Emp à emporter, sans `table_id` et non réservables.
Les capacités totalisent 112 places proposées, à valider : aucune certification
ni échelle métrique n’est déduite de la capture. Aucun client ni occupation importé.

Le brouillon existant de l’utilisateur est prioritaire. Aucun appariement
avec les anciens numéros, renommage des huit tables fictives ou remplacement
de leurs réservations. Même après renommage du plan enregistré, sa provenance
permet de le retrouver sans préparer une deuxième copie de la référence.
Les comptes sans les droits existants rooms/tables/layouts n’obtiennent rien de plus.

La référence occupe 1100 × 660 ; les anciens plans faisaient 1000 × 700.
La migration `supabase/pilot/plan-canvas-defaults.sql` ne change que les deux
**valeurs par défaut des futurs plans**, avec précondition, verrou bref et
empreinte des lignes avant/après. Appliquée au seul projet pilote
`mmrdpyhoawwoplbzqwag`. Aucun plan existant redimensionné ; aucun droit,
fonction, rôle, objet Auth ou réservation modifié par cette migration.

## Vérifications

- `pilot-plan-model.cjs` : 21 groupes, modèle et RPC simulés, notamment les
  coordonnées 25 + 3, création d’un plan vide, contexte d’ajout, historique,
  archivage réversible, conservation des anciens objets, perte de réponse,
  refus de stockage du reçu et conflit avant écriture.
- Régressions directement liées : 15 groupes ancien modèle tactile,
  19 groupes Service, 7 groupes équipe, 4 groupes paquet/installation iPad.
- Vrais navigateurs dans une VM jetable, données et RPC **simulées** :
  Chromium 156.0.8078.4, 16 étapes ; WebKit 27.2, 15 étapes. Tablette
  1024 × 768, rotation 834 × 1194 et ordinateur 1440 × 900. Aucun appel
  externe ni erreur JavaScript. Surface du canevas tablette : Chromium
  1008 × 574,8 px (73,7 % de la fenêtre), WebKit 1008 × 569,8 px (73,0 %).
  Le conteneur éditeur remplit les 1024 × 768 px ; les 25 tables et 3 Emp
  sont présents ensemble. Propriétés ouvertes et fermées, focus clavier,
  glisser, zoom, ajout au plan vide, sauvegarde/relecture, rechargement,
  renommage, archivage/restauration et conflit contrôlés.
- Chromium : gestes tactiles CDP, dont pincement à deux contacts.
  WebKit : toucher natif Playwright, glisser au pointeur. **Pas un essai
  physique iPad** ; le pincement physique WebKit n’est pas revendiqué.
- `tests/pilot-plan-rpc-rollback.sql` a passé sur le vrai serveur pilote,
  rôle `authenticated` et identité propriétaire simulée par claims SQL :
  création de 25 tables et 3 repères purement synthétiques, sauvegarde et
  relecture exacte, conflit refusé, archive/restauration, anciennes tables
  inchangées. **Transaction entièrement ROLLBACK**, fixtures absentes après.
  Cela ne constitue pas une nouvelle connexion Auth/HTTP depuis l’iPad.
- Le test natif des defaults n’a pas pu initialiser son cluster dans cette
  session (mémoire partagée refusée). Aucun PASS natif inventé ; la migration
  protège ses lignes existantes et les RPC ont été vérifiées sur le pilote.

Le contrôle de build conserve la qualification Chromium et le test de
vrai SDK Auth (chargement normal, retardé, échec et reprise), sans identifiants.
Les captures de test ne contiennent que la disposition et des données fictives.

## Suite et retour

Ouvrir le pilote habituel puis Service → engrenage. La disposition proposée
reste un brouillon jusqu’à Enregistrer. Valider les capacités et l’implantation
réelle avant utilisation en service. Un enregistrement multi-RPC peut être
partiel : les écritures confirmées restent acquises et le reste reste en
brouillon. Ne pas annoncer une transaction globale pour tout le lot.

Retour frontend : redéployer la révision pilote précédente 6f06e0d, sans
promotion production. Les éventuels plans enregistrés ne sont pas supprimés.
Les defaults ne redimensionnent rien, même si le frontend est rétabli.
La copie de travail a été recréée dans un dossier temporaire vérifié : l’ancien
chemin Documents/StopFlow-Dev n’était plus présent dans cette session.
