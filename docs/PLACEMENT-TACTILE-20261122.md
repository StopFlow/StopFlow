# Placement tactile — pilote StopFlow — 22/11/2026

Périmètre : branche `pilot/stopflow-v1-20261117`, Supabase `mmrdpyhoawwoplbzqwag`. Référence R3 conservée : `e160453537460c5b05e501d68d2376724b030317`.

## Utilisation

L’attribution automatique reste le choix par défaut, sans nouvelle recherche obligatoire. Dès la création, « Choisir les tables sur le plan » permet une sélection explicite ; « Revenir à l’attribution automatique » la retire. Les champs saisis restent présents. La création manuelle est une seule transaction, avec la même preuve de placement et la même confirmation de partage que les modifications.

« Modifier le placement » reste l’accès direct à la sélection multiple. Les tables actuelles, la nouvelle sélection et les pastilles cochées sont distinctes. Les tables sélectionnées portent une coche ; le bouton principal confirme le placement. Après un conflit de version, « Relire en conservant la sélection » actualise l’attribution de référence sans effacer la proposition de l’utilisateur.

Un appui prolongé de 520 ms sur le nom/couverts d’une réservation dans une table active le glisser. La destination est surlignée en orange. Le relâchement prépare le panneau de placement, **sans écriture**. Il remplace seulement la table de départ : les autres tables du groupe sont conservées et toute la sélection est visible avant confirmation. Si la destination était déjà sélectionnée, elle reste unique et la table de départ est retirée dans la proposition visible.

Une table partagée ouvre un choix de réservation avant le geste suivant. Une réservation partie ou annulée n’est pas déplaçable. La destination est également contrôlée à nouveau au relâchement : une dernière coordonnée hors table invalide le geste, même si le dernier mouvement avait surligné une table. Un geste court, annulé, hors destination, un changement de contexte ou une relecture pendant le geste ne produit aucune écriture. Le glisser ne touche jamais aux coordonnées physiques ni aux commandes de l’éditeur.

Le défilement tactile natif pouvait interrompre le geste SVG dans Chromium (`pointercancel`). Un gestionnaire `touchmove` non passif le bloque **uniquement pendant le glisser activé d’une réservation**. Les gestes sur le fond du plan restent séparés. Le menu contextuel est neutralisé uniquement sur les libellés de réservation.

## Serveur et protection

`service-initial-placement.sql` étend seulement `reservations_service_preview(uuid,jsonb)` aux nouvelles intentions (identifiant nouveau, version nulle). Signature, propriétaire et grants existants sont conservés ; aucune attribution de droits. Le garde vérifie l’empreinte de la fonction précédente. L’API de confirmation, son verrou d’établissement, ses versions, ses preuves de partage et ses reçus idempotents restent inchangés. Une preuve absente/périmée, une table étrangère, un utilisateur sans habilitation ou un partage non confirmé sont refusés.

Migration appliquée au seul pilote sous le nom `service_initial_manual_placement_20261122`. Empreintes avant/après identiques pour les 13 réservations présentes au contrôle, tables, plans, éléments et appartenances. Le contrôle sécurité signale le caractère SECURITY DEFINER volontaire de cette RPC authentifiée existante ; son garde d’habilitation, son search_path vide et le refus anonyme sont conservés.

## Vérifications

- PostgreSQL 17 jetable : 14 groupes PASS ; Auth simulée, cluster arrêté et répertoire supprimé. Aucun test d’écriture sur les réservations du pilote.
- DOM/RPC simulés : 33 groupes PASS, dont sélection initiale, retour à l’automatique, réponse perdue puis refus, conservation d’une saisie plus récente et conservation des autres tables lors du remplacement.
- Paquet de livraison : 4 groupes PASS, empreintes et référence R3.
- Chromium et WebKit : page complète, SDK réel, transports Auth/RPC interceptés avec données fictives. Le résultat final et les captures sont conservés dans les artefacts de vérification.

Ces contrôles navigateur ne sont pas une connexion réelle au pilote. Le glisser Chromium utilise le protocole tactile natif CDP ; WebKit reçoit des PointerEvents tactiles dans son vrai DOM. Aucun essai physique sur iPad n’est déclaré. L’éditeur de géométrie n’est pas modifié.

## Défaut de démarrage rencontré pendant la livraison

Le contrôle Chromium de construction a refusé la livraison : le bouton de réessai après un SDK invalide était bien appelé, `sdkAttempt` passait à 2, mais une seule requête SDK était interceptée et le second chargement restait invalide. Le réessai réutilisait la même URL. Un contrôle minimal hors application n’a pas reproduit ce comportement ; le détail interne du cache navigateur n’est donc pas présenté comme établi. Le réessai explicite utilise désormais un paramètre de tentative distinct, uniquement à partir du deuxième chargement, afin de demander une ressource fraîche. Le SDK, sa version et son empreinte sont inchangés ; aucun identifiant n’est ajouté à cette URL. Le test de SDK invalide exige deux requêtes distinctes et le client réel prêt. Aucun contrôle de connexion n’a été retiré ou relâché.
