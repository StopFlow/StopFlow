# STOPFLOW — MISSION 2.0 : COLLECTE DES DÉPENDANCES ET COUVERTURE

Branche locale : `feat/reservations-foundations`.
Dernier SHA annoncé par Codex : `a16900ded6de74f9f95593e7b607c522e7998784`.

ChatGPT a interrogé **en lecture seule** le catalogue de la production StopFlow, et a confirmé les contraintes/indices, RLS, ACL et colonnes finales de quatre tables de gestion des utilisateurs. Les cinq fonctions transitives figurent dans `HELPERS_TRANSITIFS_REFERENCE.sql` avec leurs empreintes.

## Travaux à faire

1. Lire les deux fichiers de référence et vérifier les définitions versus les sources des missions 1.8 et 1.9 et les migrations du dépôt. Ne pas recopier ni supprimer aveuglément : observer les éventuelles différences et produire un tableau des dépendances ordonnées.
2. Lever le blocage `ON CONFLICT (profile_id,department)` via la **PK réelle**. Conserver la distinction avec le second index unique partiel `profile_departments_one_primary_idx` (au plus un principal).
3. Comparer les cinq helpers réels avec leurs versions locales, y compris `private.sync_legacy_profile_permissions(uuid)` et `private.is_operational_department(text)`. Tester les droits et la stabilité des appels depuis des comptes fictifs. Ne pas supposer que la présence du DDL suffit à prouver les ACL effectives.
4. Vérifier les dépendances de création entre `profiles`, `profile_departments`, `profile_permissions`, `deleted_user_identities`, `user_admin_events`, triggers, helpers, Auth et commandes ; remettre un graphe/ordre de migration local déterministe.
5. Tester les règles métier signalées : intégrité de l'affectation principale, refus de permissions invalides, audit sur suppression, interdiction de rétrograder/désactiver les deux comptes protégés, tentatives de suppression privilégiée. Les identités fictives existantes **sont autorisées uniquement comme simulations de référence**, mais ne pas les figer comme nouvelle règle métier ou migration réelle sans approbation explicite.
6. Chercher uniquement une voie **non destructive** pour produire le snapshot `schema-only` restant, et documenter les fichiers/objets absents. La CLI Supabase était indisponible (EAI_AGAIN). Ne pas redemander les références déjà livrées ; ne pas répéter indéfiniment les tentatives réseau.
7. Tous les tests se font uniquement localement et dans des bases fictives isolées. N'annoncer aucun test GoTrue/PostgREST/JWT non effectué. N'annoncer ni baseline finale ni GO distant sans récupération du snapshot complet + reset Supabase local + tests Auth réels.

## Protéger la Production

Aucune écriture sur StopFlow Production, aucune création de nouvelle branche Supabase, aucune modification de L'Union Connect/Vapi. Aucun push GitHub, aucun déploiement Vercel, aucun reset/migration distante, aucun changement de branche Production, aucune partie 2 Éditeur.

## Livrables

Commit local et arbre propre, tests exécutés, nouveaux blocages **exacts** sans redemander ce qui est transmis, tableau GO/NO-GO local, estimation des éléments du snapshot final encore manquants. Le snapshot joint ici est **partiel** et ne contient aucune donnée métier.
