# Validation — Réservations, partie 1

Exécution du 17 octobre 2026, base Git `c225b020604e73b7bbe4d6fbbcf11bb457301eb6`.
Les commandes reproductibles et les limites du banc de test sont dans `README.md`.

## TESTÉ ET RÉUSSI

| Contrôle | Résultat et portée |
| --- | --- |
| Migration | Migration intégrale appliquée à PostgreSQL 16 local, dans un conteneur sans réseau, port publié ou volume existant. Contrat Auth/profiles minimal de test. |
| Base de données | 62 contrôles : CRUD, UUID conservés, relecture, ordre, archivage, unicité par salle, capacités, formes, métadonnées, audit, versions et configurations. |
| Autorisations | Lecteur, gestionnaire de salles, gestionnaire de tables, profil inactif, appartenance désactivée ; refus des opérations non autorisées. Aucun privilège universel du rôle Admin. |
| Isolation | Deux établissements fictifs de test ; lectures inter-établissements filtrées sur les sept relations, RPC interdites, relations composites contrôlées. Aucun DML direct pour authenticated. |
| Concurrence | Deux transactions PostgreSQL réellement simultanées avec la même version : une réussite, un refus 40001. Conflit également testé depuis un formulaire navigateur devenu obsolète. |
| Intégrité graphique | Configuration active unique, éléments non positionnés, types non réservables, propriétés JSON limitées, dimensions/rotation invalides refusées et références entre salles interdites. |
| Suppression d'un profil | La remise à NULL des références auteur conserve les ressources ; l'identité d'une salle reste immuable. |
| Navigateur ordinateur | Navigation au clavier, entrée Réservations, état vide, création/modification de salles et tables, trois formes, propriétés, capacité totale, archivage/réactivation disponible, rechargement réel de la page et relecture PostgreSQL. |
| Navigateur tactile | Même parcours CRUD avec émulation iPhone 13/Chromium, carte d'accueil autorisée, contrôles tactiles, retour à l'accueil, absence de débordement horizontal. |
| Erreurs | Doublon, capacité invalide, conflit et coupure réseau : refus explicite, saisie conservée ; nouvelle tentative possible. Pas de faux succès lors du scénario d'échec réseau testé. |
| Sécurité du rendu | Nom de salle malveillant rendu comme texte ; aucun script exécuté. Textes et attributs dynamiques échappés par la fonction commune existante. |
| Régressions Commandes/Suggestions | `tests/order-html-security.cjs` : ordinateur et mobile, injections, textes français, impression, PDF et historique. |
| Régressions Articles | `tests/article-html-security.cjs` : fonctions historiques et surcharges, édition, persistance simulée, attributs et injections, ordinateur et tactile. |
| Régressions Inventaire/Températures | `tests/mobile-note-input.cjs` : remarques, résumé, validation unique, historique/PDF, pavé numérique ; checklist inchangée. Données métier simulées pour ces anciens modules. |
| Régressions gestes des remarques | `tests/ios-note-focus.cjs` : Pointer Events et repli Touch Events, tap, sélection, défilement, annulation, multitouch, readonly/disabled, propagation non annulée. |
| Régressions sauvegarde Températures | `tests/temperature-round-safety.cjs` : un RPC malgré appuis rapides, reprise après erreur, champs conservés, remarques historiques échappées. |
| Syntaxe | 92 contrôles `node --check` réussis : scripts racine, API, tests CJS et script inline d'index.html. |
| Types du nouveau module | TypeScript 5.9.3, checkJs/noEmit, ES2022 + DOM : réussi. Frontière des globals historiques déclarée ; JSON RPC dynamique, pas de typage intégral de StopFlow. |
| Diff | `git diff --check` réussi. Aucun changement au bouton + d'inventaire. |

Les parcours navigateur Réservations font appel aux vraies RPC de PostgreSQL
par un pont local de test. L'identité est fixée par scénario : ce test couvre
les droits SQL et la persistance, mais pas la chaîne JWT/Auth/PostgREST distante.
Il n'y a aucune donnée de démonstration ou persistance localStorage dans le module livré.

## TESTÉ ET ÉCHOUÉ — anomalies corrigées avant livraison

- Le premier banc PostgreSQL observait le serveur temporaire d'initialisation
  Docker. Le contrôle de disponibilité attend maintenant le serveur TCP final.
- Des sélecteurs de tests comptaient les scripts de toute la page et une
  interaction clavier était sensible à une reconstruction du menu ; les tests
  utilisent maintenant une portée explicite et une activation clavier directe.
- Sur mobile, un clic natif de compatibilité suivait le clic synthétique du
  propriétaire tactile historique et refermait « Gérer ». Une déduplication
  limitée aux boutons du nouveau module corrige le scénario reproduit.

Les suites finales ont toutes réussi. Aucun échec restant dans les contrôles exécutés.

## NON TESTÉ / non applicable

- **Persistance Supabase distante : NON VALIDÉE.** Aucune base de développement
  correctement isolée n'a été établie. Le frontend historique emploie une URL
  Supabase commune au développement et à la production. Aucune migration,
  écriture, attribution de droits ou modification distante n'a été effectuée.
- Installation sur le schéma Supabase réellement déployé, JWT/Auth/PostgREST,
  cache de schéma et rôles effectifs : à vérifier sur un projet isolé autorisé.
- Provisioning réel des établissements et appartenances : documenté mais non
  réalisé. Sans migration et appartenance, le module ne fournit pas de CRUD cloud.
- Véritable Safari/iPhone : non testé pour cette nouvelle page. L'émulation
  Chromium ne prouve ni le clavier iOS ni tous les gestes sur appareil physique.
- Preview : aucune créée ; isolation des données non démontrée.
- Build frontal : non applicable, aucun outil de build n'existe dans cette
  application statique. Les contrôles syntaxiques et checkJs ont été exécutés.
- Régression exhaustive de toutes les pages et de tous les profils en cloud :
  non testée. Les cinq suites historiques disponibles ont été exécutées.
- Éditeur graphique, instantanés complets et moteur de réservation : hors mission.

## Conclusion et suite

Les fondations sont fonctionnelles avec persistance PostgreSQL locale et
contrôles serveur testés. L'acceptation de la persistance cloud reste bloquée
par l'absence d'environnement Supabase isolé vérifié ; aucun contournement par
la production n'a été utilisé. Après revue : prévoir cet environnement, examiner
le contrat de schéma déployé, autoriser explicitement la migration et le
provisioning, puis refaire les tests d'acceptation et un parcours iPhone réel.

La production et L'Union Connect n'ont pas été modifiés. Aucun push ni déploiement.
La partie 2 attend une instruction distincte après validation de cette fondation.
