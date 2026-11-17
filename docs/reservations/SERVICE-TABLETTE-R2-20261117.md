# Service — passe interface r2

Branche vérifiée : feat/reservations-service-integration. Référence relue : ~/Downloads/StopFlow-Reservations-reference/maquette-reservations.html, en particulier la vue Service, ses filtres, la liste groupée Midi/Soir, l'occupation à une heure et les légendes. Aucune donnée de la référence importée en base.

## Changements visibles dans le vrai composant

- Barre tactile : flèches précédent/suivant et date à gauche, segments Tous/Midi/Soir, Fiches clients, Nouvelle réservation prioritaire. Contrôles de 44–46 px minimum, espacements renforcés. Styles entièrement limités à #sf93Service.
- Liste : regroupement Midi/Soir avec nombre de réservations et couverts ; heure compacte, nom et tables dominants ; statut/couverts secondaires ; note uniquement si le champ note reçu est non vide. La passe n'ajoute pas de stockage de notes au schéma. Les horaires deviennent 12:00–13:00 ; un changement de jour est indiqué séparément, sans date brute tassée devant le nom.
- Plan commun : deux zones nommées simultanément. Le cadrage utilise les limites des tables et repères, rotations et chaises comprises, plutôt que les canevas complets. Aucun identifiant ni coordonnée enregistré modifié. Libre/réservée est calculé à l'instant « Occupation à » affiché, bornes [début, fin), en ignorant les annulations. Ce code n'est pas une nouvelle vérification de disponibilité métier.
- Toucher une réservation sélectionne tous ses membres et règle l'heure de lecture du plan sur son arrivée. Jumelages et repères restent visibles. Les tables non placées gardent une liste accessible, sans position inventée.
- Fiches clients et éditeur sont des vues séparées du Service, avec retour. L'engrenage est dans le pied droit du plan, absent si layouts.manage n'est pas déjà accordé.
- Chaîne d'assets source versionnée 20261117-service-r2, marqueur CSS --sf93-skin vérifiable. Le moteur RPC, la migration, les appartenances et les droits restent inchangés.

## Constats sur 8097 — limites réelles

Depuis cette session, GET http://127.0.0.1:8097/ n'aboutit pas (curl code 7 / HTTP 000). Cela ne démontre pas que l'essai du Mac est arrêté : la visibilité réseau de la session est limitée. Docker refuse son socket local (permission denied). Aucun navigateur pilotable disponible via les outils ; aucun essai Chrome/Edge/Safari hôte relancé.

La source du lanceur de 8097 référence bien /stopflow-093-service.css et sert les octets de ce fichier lors du prochain chargement de ses assets. Test isolé PASS sur cette liaison. Le chargement CSS de l'onglet actuellement ouvert n'est PAS confirmé. Un processus déjà lancé garde les anciens assets en mémoire : cette passe n'a ni redémarré ni actualisé 8097.

## Vérifications effectuées ici

- tests/reservations-service-ui.cjs : PASS, 14 groupes DOM/RPC simulés. Date et filtres, format compact, occupation à heure affichée, annulation ignorée dans l'occupation, note conditionnelle, sélection de deux membres, pages Clients/éditeur et droit d'édition, cadrage et géométrie immuable, parcours/intentions déjà couverts.
- tests/reservations-service-trial.py : PASS, 6 tests isolés, dont référence CSS et octets fournis par le lanceur.
- tests/reservations-service-design-r2.py : PASS, 3 contrôles hors connexion du nouveau lanceur : annonce et refus, lecture loopback bornée/filtrée, impossibilité de lecture non convertie en succès.
- Régressions liées : reservations-ux.cjs PASS (44 assertions), workspace-reservations-bridge.cjs PASS (13 assertions).
- Syntaxes et empreintes vérifiées. Les 22 contrôles PostgreSQL sont acquis selon le résultat utilisateur et n'ont pas été rejoués. Aucun changement SQL et aucune écriture métier.

**Rendu 1024×768 et 1440×900 : NON VÉRIFIÉ ici. Les captures côte à côte ne sont pas encore produites.** Aucun résultat de simulation n'est présenté comme preuve visuelle ou comme validation d'un appareil physique.

## Comparaison automatique, sans nouveau lien ni test serveur

Une commande extérieure :

```sh
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3.13 -I -B -u /Users/quentinpollet/Documents/StopFlow-Dev/StopFlow-restauration-20261027-wez39tpl/StopFlow/tools/reservations-service/review-design-r2.py --execute
```

Le lanceur annonce immédiatement son démarrage et le dossier de rapport. Il tente une lecture anonyme bornée de la page et du CSS public de 8097, sans cookie, connexion ou modification ; compare l'empreinte servie au fichier corrigé, sans conclure que le CSS est chargé dans un onglet si la page est refusée.

Il emploie seulement l'image locale Chromium déjà qualifiée, par son identifiant exact. Aucun téléchargement/build/inventaire, réseau externe, port exposé ou montage du Mac. Un helper jetable avec les protections existantes reçoit neuf fichiers par stdin, empreintes vérifiées. Nettoyage ciblé avec identité et résultat séparé.

La comparaison charge le **vrai code du module corrigé et sa CSS**, avec des réponses RPC fictives : ce n'est pas la capture de l'instance 8097 ni une revalidation du backend. Le jeu de présentation contient huit tables et dix réservations, au midi et au soir, une note et un jumelage. Ses zones sont nommées Salle arrière et Premier étage pour juger l'interface ; cela ne résout pas la correspondance manquante des anciens snapshots réels. Leurs identifiants/coordonnées ne sont jamais réécrits.

Chromium contrôle : CSS réellement appliquée via style calculé ; date et filtres ; occupation et sélection ; note ; bouton Nouvelle réservation ; pages Clients et éditeur ; engrenage refusé au profil sans droit ; absence de débordement horizontal et de chevauchement des commandes. Aucun appel d'écriture n'est autorisé par les fixtures.

À chaque taille, il produit service-*.png et reference-*.png puis comparaison-tablette.png (2048×808) / comparaison-macbook.png (2880×940), deux écrans à leur taille réelle avec légendes, sans agrandissement ou retouche. Les vues individuelles font respectivement 1024×768 et 1440×900. En cas d'échec, étape et éventuelle capture service-echec.png sont conservées. Les chemins sont imprimés dans un nouveau REVUE-UI-DOCKER-* privé. Le bilan ne vaut PASS que si les mesures et les deux comparaisons sont obtenues ; le nettoyage est confirmé séparément.

Après seulement, examiner les captures avant de proposer une actualisation du frontend d'essai. Ne pas utiliser l'ancien trial.py --start pour cette revue : il contient une recette SQL que cette passe ne doit pas rejouer.
