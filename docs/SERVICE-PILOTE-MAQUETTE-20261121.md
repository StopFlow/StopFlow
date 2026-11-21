# Réservations — Service : présentation pilote, 21 novembre 2026

Base vérifiée : `713a9ae6376ae5684bfc19d74e3a2429f170f6bd`, branche
`pilot/stopflow-v1-20261117`, copie propre au début de cette intervention.
Aucune migration, aucun droit modifié, aucune réservation ni donnée de plan écrite
sur le pilote. Projet Supabase exclusivement `mmrdpyhoawwoplbzqwag`.

## Présentation

Deux bandeaux : navigation commune (Accueil, StopFlow / Réservations, cloche,
menu ⋯) puis date, Tous / Midi / Soir et Nouvelle réservation. Profil,
Équipe pour le propriétaire seulement, installation et déconnexion restent
accessibles dans ⋯. Fiches clients, gestion des salles/tables et choix de
l’établissement y restent également accessibles selon les droits existants.
La vraie cloche est déplacée, avec ses gestionnaires et compteurs ; une
observation limitée à son ancien conteneur gère sa création tardive.
Les anciens titres, filtres et bandeaux sont masqués seulement dans Service.

À 1024 × 768, les deux bandeaux mesurent 56 et 66 px. La liste occupe
235,5 × 646 px (19,35 % de la fenêtre), le panneau plan 788,5 × 646 px
(64,77 %). Le viewport SVG mesure 788,5 × 528 px ; les proportions du plan
sont conservées, sans étirement des coordonnées pour copier l’image.
Les 25 tables et trois Emp restent entièrement dans le dessin, sans débordement.

La liste conserve heure, nom, couverts de la réservation, table(s), statut
et note lorsqu’elle existe. Les actions restent dans le détail. Le nom du
plan n’est pas répété sur chaque réservation du plan principal. Les capacités
des tables restent distinctes des couverts réservés. Occupations, sélection
et légende découlent des réservations et de l’heure choisie, jamais des couleurs
ou des noms présents dans la maquette.

## Plan enregistré et anciens plans

Restaurant & Taverne a été vérifié en lecture seule avant les modifications :
25 tables et trois Emp, canevas 1100 × 660. Les positions, dimensions, formes,
capacités, repères et identifiants sont lus par les RPC existantes, sans import
ni copie de la maquette. La fixture de test reprend cette géométrie en remappant
uniquement ses identifiants dans le test ; aucune fiche client réelle n’est copiée.

Un seul plan est dessiné. Restaurant & Taverne est choisi par défaut lorsqu’il
est enregistré avec un layout actif. Les anciens plans figurent dans le groupe
secondaire « Autres plans conservés ». Rien n’est archivé ni supprimé. L’agenda
reste celui de l’établissement entier : sélectionner une réservation d’un autre
plan affiche son détail et ses tables sur son plan d’origine. Le lien de la
réservation future de Premier étage est préservé ; aucune réattribution implicite.

L’engrenage ouvre l’éditeur pleine page existant. Un brouillon local prioritaire
est conservé, de même que son reçu éventuel. Aucun provisioning, aucune création
supplémentaire de Restaurant & Taverne. Le contrôle de version et les RPC ne sont
pas remplacés.

## Corrections du parcours directement vérifiées

- Une réponse de journée devenue périmée ne remplace plus la dernière journée
  demandée. Pendant la lecture, l’ancienne liste n’est pas présentée sous la nouvelle date.
- Après confirmation et relecture d’une réservation, l’ancien filtre de recherche
  est effacé et la ligne confirmée est révélée dans la liste. La saisie reste
  conservée lors d’un refus ou d’un résultat indéterminé.
- Nouvelle réservation ou ouverture d’un détail depuis le plan agrandi réaffiche
  la colonne nécessaire : aucun formulaire n’est caché par le mode plan agrandi.
- La cloche créée après la navigation reste accessible ; aucun remplacement de
  ses gestionnaires ou faux compteur.

## Vérifications et limites

`tests/reservations-service-ui.cjs` : 21 groupes simulés, dont recherche,
anciens plans, conflit, réponse perdue, filtre après création et réponse de date tardive.
`tests/pilot-team-ui.cjs` : 7 groupes simulés ; `tests/pilot-plan-model.cjs` :
21 groupes ; paquet pilote : 4 groupes. Aucun test serveur acquis n’est rejoué.

`tests/pilot-service-shell-browser.cjs` charge **l’index complet généré, tous les
modules de l’application et le vrai SDK vérifié**. Les réponses Auth/HTTP/RPC
sont simulées, toutes les requêtes interceptées et les WebSockets bloqués.
Deux profils fictifs distincts par contexte : propriétaire et employé.
Chromium 156.0.8078.4 et WebKit 27.2, avec tactile émulé 1024 × 768 ; contrôle
ordinateur 1440 × 900. Pas de validation sur iPad physique ni nouvelle connexion
réelle d’un membre de l’équipe. Aucun mot de passe, JWT ou clé dans les rapports.

Le scénario vérifie l’entrée par la carte Accueil, les deux bandeaux, les 25 tables
et 3 Emp, les proportions, les cinq lignes du midi, recherche, services, date,
sélection du jumelage et détail, l’ancienne réservation sur l’autre plan, une
création fictive et sa relecture, les menus/cloche, le brouillon de l’éditeur et
le retour Accueil. L’employé ne reçoit ni engrenage ni gestion de l’équipe.
Les données physiques restent strictement identiques dans ces scénarios.

Deux défauts du scénario ont été distingués des défauts applicatifs : le premier
sélecteur visait un bouton de navigation historique caché ; une horloge complètement
figée empêchait la fin du démarrage complet de l’application. Le test utilise la
vraie carte visible, une horloge qui avance et attend la fin explicite du démarrage.
Aucune modification de la connexion ou du lissage de démarrage pour ces cas.

Le build conserve les contrôles du plan tactile et les six cas du vrai SDK,
et ajoute le scénario Service complet Chromium (propriétaire + employé). Les
captures servies sont exclusivement fictives. Aucun appel Zenchef ni modification
Google/site/production, aucune fusion main.
