# StopFlow — Dossier unique de transfert vers Codex

**Extraction et vérifications : 17/10/2026. Lecture seule.**

## Ce qui a été effectivement récupéré/vérifié

- Métadonnées du projet StopFlow Production seulement, **pas de L'Union Connect**.
- Présence de 24 tables, 5 séquences, 56 fonctions (18 publiques / 38 privées),
  63 politiques RLS, 16 triggers public, 1 trigger applicatif dans `auth.users`.
- Historique de 45 migrations distantes contre 20 fichiers sous `migrationOrder`
  et 4 scripts complémentaires indexés dans `INVENTORY.json`.
- Identité des 19 tables dont la création initiale n'apparaît pas dans l'inventaire local.
- Définitions réelles de huit fonctions historiques et de `private.current_role()`.
- Un enum métier, la présence de RLS sur les 24 tables.
- Les corps de 4 fonctions de protection de comptes sont **retenus** :
  ils référencent des adresses protégées ; ne pas les recopier sans les paramétrer.

## Contenu

- `INVENTORY_LOCAL_CODEX.json` : inventaire fourni par l'utilisateur (source Codex).
- `CATALOGUE_VERIFIE.json` : faits consolidés du catalogue distant.
- `RAPPORT_COMPARAISON.md` : constat antérieur détaillé.
- `RAPPORT_CATALOGUE_DISTANT.md` : migrations, schémas, protections et points de vigilance.
- `FONCTIONS_SQL_REFERENCE.sql` : les 8 fonctions vérifiées (**ne pas exécuter telles quelles**).
- `CURRENT_ROLE_REFERENCE.sql` : la 9e fonction vérifiée (**ne pas exécuter isolément**).
- `19_TABLES_COLONNES_REFERENCE.sql` : les 19 déclarations `CREATE TABLE` reconstruites
  fidèlement depuis le catalogue pour leurs **colonnes, types, défauts, identité et NOT NULL**.
  Attention : il faut encore ajouter les contraintes PK/FK/CHECK, index, RLS,
  grants et triggers pour obtenir une baseline complète. Le nom du responsable
  présent en valeur par défaut a été remplacé par un nom fictif.
- `EXTRACTION_CATALOGUES_READONLY.sql` : 12 requêtes **SELECT uniquement** afin
  de reproduire l'extraction finale exacte : colonnes, contraintes, index, RLS,
  triggers, fonctions, séquences, enums, privilèges, extensions et migrations.
- `INSTRUCTIONS_CODEX.md` : mission précise à réaliser avec ce dossier.

## Limite déterminante

Ce ZIP **n'est pas une baseline finale installable**. Les requêtes de catalogue ont été
testées par inspection sur Supabase Production et les principaux nombres/identités
ont été vérifiés ; **l'intégralité du DDL final des 24 tables et des 56 fonctions,
63 politiques, index et ACL n'est pas incluse comme migration prête à jouer**.

Toute extraction restante doit être faite en lecture seule par l'accès autorisé,
avec examen préalable des adresses e-mail protégées et autres littéraux sensibles.
Ne jamais présenter des références partielles comme une reconstruction complète.

Ne pas rejouer les migrations historiques après une baseline d'état final ;
les 7 tables du nouveau module Réservations seront ajoutées uniquement sur une
base de test propre, une fois l'état initial validé.

## Statut des opérations

Aucun changement de Supabase, Vercel, GitHub, de `main` ou de L'Union Connect.
Aucun push, aucune migration distante, aucune création de projet, aucune Preview.
