# Service R3 — liste compacte, style et plan R2 conservés

Branche : feat/reservations-service-integration. Capture R2 examinée : REVUE-UI-DOCKER-wzhyxng7/service-tablette.png. Elle montre les boutons répétés qui agrandissent les lignes, le jumelage répétant le nom de zone et « 12 h 30 » tronqué. Aucun moteur, schéma SQL, profil ou droit modifié pendant cette passe.

Modifications :
- Liste centrée sur heure d'arrivée, nom et attribution (« Tables 2 + 3 · Salle arrière »), zone une fois par groupe, numéros triés naturellement sans toucher aux identifiants. Couverts et statut compacts dans la même zone tactile principale ; seul le bouton Note reste séparé et seulement si une note existe.
- Toucher une réservation sélectionne toutes ses tables et ouvre son détail à gauche ; le plan R2 reste visible à droite. Modifier et Annuler sont dans le détail, conditionnés aux droits et au statut existants. Retour liste conserve la sélection et le filtre. Les cinq détails restent accessibles ; aucune écriture n'est faite par l'ouverture.
- Tri par instant d'arrivée dans chaque service, puis nom/identifiant à égalité. Recherche locale « Nom ou table », insensible aux accents/casse, sans modifier le jeu reçu ni déclencher d'écriture.
- Date visible jj/mm/aaaa indépendamment du format de la plateforme ; le calendrier natif reste accessible à côté. Validation stricte du texte belge, flèches inchangées.
- Sélecteur d'heure du plan élargi à 130 px ; plan, couleurs, légende, coordonnées et bandeau R2 conservés. Styles r3 limités à liste/détail/date/largeur de l'heure.
- Versions des trois assets et empreintes des lanceurs actualisées.

Vérifications exécutées :
- tests/reservations-service-ui.cjs : PASS, 19 groupes DOM/RPC simulés, dont ordre d'arrivée, recherche par nom/accent/table, attribution groupée compacte, cinq entrées et ouverture des cinq détails, date belge/invalidité/leap day, détails en lecture seule sans commandes d'écriture, conservation des données reçues, sélection/occupation et régressions de reçus.
- tests/reservations-service-design-r2.py : PASS, 3 tests isolés du lanceur.
- Régressions de navigation/éditeur ciblées déjà exécutées durant cette passe : reservations-ux.cjs 44 assertions PASS, workspace-reservations-bridge.cjs 13 assertions PASS.
- Syntaxes vérifiées. Les fixtures design-r2/fixtures.json restent exactement identiques à la R2. Les 22 contrôles PostgreSQL acquis ne sont pas rejoués.

Limite : socket Docker encore refusé dans cette session. Aucune nouvelle capture R3 ni mesure réelle des cinq lignes n'a pu être obtenue ici. Une simulation ne prouve pas l'absence de défilement ou la largeur du texte dans Chromium.

Commande unique pour refaire SEULEMENT la capture tablette (aucun rendu MacBook ou référence, aucun SQL, aucune installation, aucune création de compte) :

```sh
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3.13 -I -B -u /Users/quentinpollet/Documents/StopFlow-Dev/StopFlow-restauration-20261027-wez39tpl/StopFlow/tools/reservations-service/review-design-r2.py --execute --tablet-list
```

Le lanceur conserve l'image Chromium locale qualifiée, les protections et le nettoyage ciblé. Il charge le vrai module sur les mêmes réponses RPC fictives. Il mesure à 1024×768 : les cinq lignes du midi intégralement dans la liste et le viewport, le tri, la recherche, l'ouverture/retour de chaque détail, l'absence d'actions dans la liste et leur présence autorisée dans le détail, le format belge et l'espace disponible pour « 12 h 30 ». Puis vérifie les débordements/chevauchements. Le screenshot final revient à la liste des cinq réservations du midi, jumelage sélectionné et heure du plan à 12 h 30.

Sortie : service-tablette-r3.png dans un nouveau REVUE-UI-DOCKER-*, plus rapport des mesures et nettoyage séparé. Si l'une des cinq lignes n'est pas visible ou si l'heure est tronquée, le test refuse le PASS et conserve service-echec.png et les mesures filtrées. Ce rendu porte sur le composant réel avec moteur RPC simulé, pas sur la base active ni sur l'instance 8097.

Aucun serveur existant actualisé ou redémarré. Aucune nouvelle URL proposée avant obtention et examen de la capture. Aucun accès à Zenchef, aucune fusion ni publication.
