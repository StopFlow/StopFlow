# Livraison brasserie — 22 novembre 2026

Branche `pilot/stopflow-v1-20261117`, Supabase `mmrdpyhoawwoplbzqwag`
exclusivement. Référence R3 conservée : `e160453537460c5b05e501d68d2376724b030317`.

- Aucun départ ni durée automatique. Le service reste occupé jusqu'à « Parti »
  ou annulation ; un départ communiqué est seulement informatif.
- Présence Attendu / Arrivé / Parti, distincte du statut et de À placer.
  Historique, couverts et totaux restent conservés après le départ.
- Placement initialisé avec les tables actuelles, sélection tactile basculante,
  comparaison avant/après et confirmation directe. La vérification serveur est
  bloquante en arrière-plan ; seul un partage/capacité à accepter ouvre une
  confirmation supplémentaire. Le remplacement est exact. Une relecture garde
  la sélection en cas de conflit. Les envois incertains conservent leur reçu.
- Numéro puis capacité, nom puis couverts : composition stable. Les petites
  tables sont agrandies uniquement dans Service autour de leur centre enregistré.
  Identifiants et géométrie de l'éditeur restent inchangés. Les noms longs sont
  abrégés sur le plan et lisibles en entier dans le détail au toucher.
- Confirmations StopFlow communes, appelants explicitement asynchrones.
  Aucun remplacement global de window.confirm. Annuler, Échap et fermeture
  n'effectuent aucune écriture. Actions centrées, zones tactiles conservées.
- Fermetures limitées aux fermetures/réouvertures, anciens plans retirés des
  choix opérationnels. Les réservations historiques d'un autre plan restent
  consultables sans réaffectation. Le filigrane FERMÉ et le garde serveur restent.

## Vérifications

Rapport détaillé : `VERIFICATION-BRASSERIE-20261122.json`.

| Niveau | Résultat |
|---|---|
| PostgreSQL 17 jetable, Auth simulée | PASS, 27 groupes ; deux transactions indépendantes, présence, partage, remplacement exact, droits, fermetures, reprise et anciens chemins |
| Modèles / DOM / RPC simulés | PASS : Service 27 groupes, éditeur 21, équipe 7, livraison 4 |
| Page complète Chromium 156.0.8078.4 | PASS : 17 étapes gestionnaire + 4 employé ; tactile émulé, HTTP Auth/RPC interceptés |
| Page complète WebKit 27.2 | PASS : mêmes 17 + 4 étapes, toucher navigateur ; HTTP Auth/RPC interceptés |
| Régression éditeur | PASS Chromium 17 étapes / WebKit 16, sauvegarde/relecture simulées, gestes, brouillon et conflits |
| Serveur pilote réel | Migration confirmée, index et droits contrôlés ; empreintes des 12 réservations historiques, tables, éléments, plans et appartenances inchangées |

À 1024 × 768 : 25 tables et trois Emp dans le cadre, aucun chevauchement entre
objets, aucune superposition des quatre lignes de texte, pas de débordement
horizontal. Formulaire également contrôlé avec une hauteur réduite simulant
l'espace pris par le clavier. Contrôle ordinateur à 1440 × 900.

Les contrôles navigateur vérifient l'enveloppe réelle et le SDK réel avec des
réponses HTTP fictives : ce n'est pas une nouvelle connexion réelle d'employé.
Aucune réservation d'essai n'a été écrite dans le pilote pendant cette mission.
Les sessions navigateur et le cluster jetable sont arrêtés et nettoyés ; la
sandbox dédiée a été arrêtée, supprimée et son absence confirmée (404).

Captures tablette WebKit conservées localement dans
`.pilot-private/verification-brasserie-20261122/` : `service-webkit-1024x768.png`,
`placement-webkit-1024x768.png`, `fermetures-webkit-1024x768.png`.
Le build de l'aperçu republie ses captures Chromium fictives dans
`/pilot-touch/service/captures.json`, avec leurs empreintes.

## Utilisation et limites

Recharger l'aperçu pilote après livraison afin de quitter les anciens scripts
ouverts en mémoire. L'essai physique iPad (zone système en mode installé, clavier
réel, précision et lisibilité au doigt) reste à faire : les émulations ne le
remplacent pas. Aucun contrôle ici ne prétend valider cet appareil physique.

Aucune fusion main, production, base active locale ni intervention Zenchef.
Les droits existants sont conservés ; aucun droit temporaire n'est ajouté.
