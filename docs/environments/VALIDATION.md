# Mission 1.5 — résultats et limites

Campagne locale du 17 octobre 2026, branche feat/reservations-foundations,
parent attendu 1bf16c4ad61bf27620d06d65962bff42d4ad39b0.
Les paramètres, l'audit complet et la procédure future sont dans README.md.

## TESTÉ ET RÉUSSI

| Contrôle | Résultat et preuve |
| --- | --- |
| node tests/environment-isolation.cjs | 78 vérifications : origines, références, clés, absence de repli, refus avant génération, projet Vercel lié, fetch et artefacts publics. |
| Configuration absente | Navigateur avec vrai SDK : client null, application cachée, connexion désactivée, aucune requête Supabase malgré une ancienne session stockée. |
| Profil Production sur Preview | Refus ; aucune requête Supabase. |
| Développement visant Production | Refus ; aucune requête Supabase. |
| Clé serveur | Refus ; aucune requête Supabase. JWT service_role/authenticated/admin et sb_secret/sbp également refusés par les tests de politique. |
| Développement valide ordinateur | Trois requêtes interceptées uniquement vers le projet fictif de test : RPC d'écriture simulée, Auth simulée, sonde de redirection refusée. Aucune requête vers Production. |
| Développement valide tactile | Même résultat avec émulation iPhone 13/Chromium. |
| Compatibilité Production | Empreinte de l'URL/clé/origine identique au commit parent ; vrai SDK initialisé avec les mêmes URL/clé, sans session et sans requête Supabase. Options Auth historiques conservées. |
| Artefact de développement généré | Chargement fonctionnel avec le vrai SDK ; trois requêtes interceptées uniquement vers le projet fictif de test. Aucun endpoint Supabase Production ni sa clé publique dans les fichiers de l'artefact. |
| Secrets administratifs de la machine | Canaris service_role et Vercel présents dans l'environnement du test de build, absents des assets émis. Aucune copie des fonctions serveur ou des .env. |
| node tests/development-schema.cjs | Paquet hors ligne vérifié par SHA256 ; référence Production et baseline altérée refusées ; migration Réservations copiée sans modification. |
| Contrôles SQL PostgreSQL 16 local | Baseline minimale refusée comme installation complète ; contrôle post-migration réussi, puis refus d'un grant INSERT indu et d'une RLS désactivée ; réussite après restauration des conditions. Aucun réseau du conteneur. |
| node tests/reservations-navigation.cjs | Ordinateur/clavier et tactile : rafraîchissements pendant activation, connexion simulée, rechargement, réponses retardées, changement d'identité et mémorisation. |
| node tests/reservations-browser.cjs | CRUD, persistance PostgreSQL réelle locale, contraintes, conflit, erreur réseau, droits et isolation ; ordinateur et tactile. |
| node tests/order-html-security.cjs | Commandes/Suggestions, XSS, métadonnées, historique, impression et PDF ; ordinateur/mobile. |
| node tests/article-html-security.cjs | Chemins historiques/surchargés, injections, édition et persistance simulée ; ordinateur/mobile. |
| node tests/mobile-note-input.cjs | Inventaire, résumé, validation unique, remarques, historique/PDF, températures, pavé numérique et checklist. |
| node tests/ios-note-focus.cjs | Pointer Events et repli Touch Events, tap, sélection, scroll, annulation et multitouch. |
| node tests/temperature-round-safety.cjs | Sauvegarde unique, erreurs réseau/RPC, champs conservés et remarques historiques. |
| Syntaxe | 100 contrôles node --check sur les fichiers frontend/API, scripts CJS, tests et script inline index.html. |
| Types existants | TypeScript 5.9.3 checkJs/noEmit réussi pour le module Réservations avec son contrat de globals. Pas un typage complet de l'application historique. |
| Diff | git diff --check réussi. Pas de modification des migrations existantes, de manage-users, de vercel.json, du correctif de navigation ou du module Réservations. |

Toutes les requêtes Supabase des huit scénarios navigateur sont interceptées
par Playwright, y compris celles visant l'identité Production dans les tests
de refus. Le SDK 2.57.4 est réel ; son backend est simulé. La réponse de RPC
d'écriture indique persisted:false. Aucune écriture distante n'a été effectuée.
La persistance réelle locale des Réservations reste testée séparément sur
PostgreSQL, avec les limites Auth/JWT du pont déjà documentées.

La tentative de redirection vers Production retourne une erreur au SDK ;
aucune requête de suivi n'est observée. Les paramètres d'URL et une ancienne
session Production dans le stockage ne changent pas la configuration de test.

## TESTÉ ET ÉCHOUÉ

Aucun échec restant dans les suites finales. Le premier essai d'installation
du SDK de test utilisait le cache npm par défaut indisponible ; l'installation
avec le cache autorisé /tmp/stopflow-npm-cache a réussi. Une attente de zéro
requête dans le scénario de compatibilité initial était incompatible avec sa
fixture de session Production périmée ; le scénario sans session vérifie
l'initialisation, tandis que les cas développement conservent la fixture de
session Production pour tester la séparation. Tout ce trafic était intercepté.

## NON TESTÉ / blocages

- Aucun projet Supabase/Vercel distant créé, consulté administrativement ou modifié.
- Aucune validation Auth/JWT/PostgREST/RLS/CRUD distante. Aucune migration distante.
- La baseline complète réelle StopFlow reste absente. Le contrôle de base
  complète n'a pas de cas positif sur un véritable schéma de référence ; il
  détecte ici l'incomplétude de la fixture. Les contrôles de présence ne valident
  ni toutes les signatures ni toutes les règles métier d'une baseline future.
- Le paquet SQL ne prouve pas la destination réelle d'une future connexion.
  Sa référence est déclarative ; l'identité du projet doit être vérifiée avant
  toute exécution autorisée. Le paquet n'exécute rien.
- Appartenance effective d'une clé publishable opaque à son projet : à vérifier
  dans le futur projet isolé. Les contrôles locaux ne prouvent pas son authenticité.
- Aucun déploiement Vercel Other/output directory : domaines système, cache,
  redirections Auth et fonctions d'icônes resteront à contrôler réellement.
- Aucun test Safari/iPhone physique pour cette préparation. L'émulation ne le remplace pas.
- Compatibilité vérifiée pour le domaine Production identifié dans le dépôt,
  pas pour d'éventuels alias externes non inventoriés ni des sessions cloud réelles.

## Production et suite

Le travail est exclusivement local. Aucun push, aucun déploiement, aucun
changement Supabase/Vercel existant, aucune modification de main ou stopflow-dev
distantes. La configuration publique de production connue conserve ses valeurs.
Le lien d'installation reste identique sur son domaine et suit celui de test ailleurs.

La suite exige une baseline revue, un projet Supabase distinct, un Vercel de test
distinct, leurs paramètres vérifiés et une autorisation pour les opérations
distantes. Ne pas annoncer une validation cloud à partir de cette préparation.
