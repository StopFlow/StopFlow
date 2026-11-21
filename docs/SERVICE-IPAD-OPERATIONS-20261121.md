# Service pilote : retours iPad, 21 novembre 2026

Base `5deac524511f6ec1a5291ef71b350cb2d116b93b`, branche
`pilot/stopflow-v1-20261117`. Cible unique : `mmrdpyhoawwoplbzqwag`.

## Présentation et formulaire

Les deux bandeaux, le grand plan et l’éditeur sont conservés. Le shell réserve
les safe areas et au moins 24 px en application installée. L’éditeur garde ses
coordonnées et son propre cadre plein écran. Le formulaire s’adapte à la hauteur
du viewport visuel, sans débordement horizontal ; les champs date et les contrôles
ont une largeur bornée. Les astérisques rouges restent accolés aux libellés.
Les Emp sont affichés sur plusieurs lignes sans modifier les repères.

Téléphone, nom, date, arrivée et couverts sont requis. E-mail, départ et note ne
le sont pas. La recherche par téléphone est réutilisée. Les arrivées sont filtrées
par le service : Midi [08:00,16:30[, Soir [16:30,22:30]. Tous les propose ensemble.
Un départ plus tôt dans l’horloge signifie le lendemain ; une heure identique est
refusée. Sans départ communiqué, la disponibilité utilise deux heures techniques.
Aucune heure calculée n’est présentée comme un départ communiqué par le client.

La migration ne prétend pas connaître la provenance des fins historiques :
`departure_explicit=false` par défaut, sans changer un seul timestamp. Une édition
sans changement d’heure conserve exactement les heures et secondes enregistrées.
La note (2 000 caractères maximum) est écrite et relue avec la réservation.

## Attribution et partage

À la confirmation, le serveur cherche dans le plan choisi : table adaptée puis
jumelage enregistré explicitement. Il ne réemploie pas une table déjà attribuée
dans ce service, même pour deux créneaux successifs. Aucun regroupement graphique.
Une absence de choix crée une réservation confirmée, `placement_state=unplaced`,
sans table, visible dans l’agenda et comptée une seule fois dans les totaux.

Le placement manuel utilise une sélection tactile et une vérification serveur.
Les réservations concernées sont distinguées : successives ou chevauchantes.
Leur version et les capacités font partie d’une empreinte de confirmation recalculée
sous verrou. Un changement concurrent invalide cette preuve. En présence d’une
autre réservation ou d’une capacité insuffisante, une confirmation explicite est
obligatoire. Le droit requis est le droit existant `can_manage_bookings` : aucun
nouveau droit accordé. La décision, son auteur, la sélection et les avertissements
sont enregistrés dans `private.reservation_manual_decisions`.

Les exclusions physiques restent actives pour les placements automatiques. Les
exceptions manuelles doivent correspondre exactement à une décision durable ;
changer ensuite le créneau ou les couverts ne réutilise pas cette exception.
Les verrous d’établissement et de tables sérialisent aussi les anciennes RPC.
Une annulation libère uniquement les allocations de cette réservation.

Les requêtes nouvelles ont un UUID distinct, un acteur et un payload immuable,
enregistrés dans `private.reservation_service_requests`. Une reprise identique ne
crée pas de doublon ; un autre payload est refusé. Un reçu incertain reste présent
même après un refus ultérieur. Une saisie plus récente pendant l’envoi est conservée
pour une confirmation séparée. Aucune nouvelle intention ne remplace un reçu en attente.

## Fermetures et anciens plans

Le droit existant `rooms.manage` permet de fermer/rouvrir une journée, un service
ou une période. Les nouvelles réservations et déplacements vers le créneau fermé
sont bloqués dans le trigger commun, y compris via les anciennes RPC anonymes.
Les réservations présentes restent consultables, sans annulation automatique.
Un filigrane FERMÉ et le nom du service fermé rendent cet état visible.
Les éditions de contenu sans changement d’arrivée restent possibles.

Premier étage, Salle arrière et Test sont retirés des choix courants et de toutes
les recherches automatiques. Ce retrait réversible est stocké séparément dans
`private.reservation_hidden_plans`. **Ce n’est pas un archivage forcé** : la protection
de la réservation future de Premier étage reste active. Le détail et le plan
d’origine restent consultables. La gestion des fermetures donne aussi accès au
rétablissement/retrait des anciens choix. Aucun plan fictif n’est recréé.

## Validation et limites

- 39 contrôles sur PostgreSQL 17 jetable avec les vraies migrations Réservations,
  et un contrat Auth simulé. Deux transactions indépendantes se disputent des
  jumelages partageant une table, avec maintien du verrou avant commit.
- 25 groupes DOM/RPC simulés ; conservation du reçu après réponse perdue et refus,
  conservation d’une saisie récente ; régressions du modèle de plan et de navigation.
- Page complète, vrai SDK épinglé, HTTP Auth/RPC interceptés : Chromium et WebKit,
  profils propriétaire et employé. Formulaire, tactile, limites des services,
  attribution, À placer, partage explicite, fermeture/réouverture, éditeur et brouillon.
- Vue 1024 × 768, vue ordinateur et hauteur réduite simulant l’espace du clavier.
  Les captures sont fictives et reprennent la géométrie enregistrée avec UUID de test.
- Le sandbox macOS refuse `initdb` à `shmget` ; la qualification SQL est effectuée
  dans une VM jetable. Aucun service ni permission du Mac n’est changé.
- L’essai physique iPad installé, avec sa barre système et son clavier natif,
  reste distinct de ces émulations. Aucun nouveau test Auth/JWT réel n’est revendiqué.

## Livraison

Migration ciblée : `supabase/pilot/service-operations.sql`, transaction bornée,
sans rejeu du socle et sans toucher Auth ou les appartenances. Vérification préalable
des définitions en place et comparaison des empreintes des tables, layouts,
éléments, réservations et habilitations après installation. Les colonnes nouvelles
sont exclues de la comparaison historique des réservations, pas leurs valeurs anciennes.
L’édition frontend est `20261121-service2` ; modèle et styles sont versionnés.
La référence R3 `e160453` reste conservée dans le manifeste de livraison.

Après installation sur le pilote : empreintes des tables, layouts, éléments,
appartenances et des champs historiques des réservations identiques avant/après.
Les 12 réservations restent présentes, dont celle future de Premier étage.
Aucune fermeture et aucun reçu d’écriture d’essai ne sont ajoutés au pilote.
Trois refus sont aussi exercés sur ce serveur en transaction READ ONLY : confirmation
anonyme, fermeture anonyme et confirmation authentifiée sans identité. Les écritures
fonctionnelles sont qualifiées dans la base PostgreSQL jetable ; aucune nouvelle
connexion Auth/JWT réelle n’est revendiquée pour ce lot.
Les données physiques et comptes sont inchangés. Aucune fermeture réelle, notamment
celle du 24 décembre, n’est préchargée. Aucune intervention sur Zenchef, main ou production.
