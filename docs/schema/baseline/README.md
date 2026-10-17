# Baseline d'état final — préparation BLOQUÉE, pas d'installateur

Le dossier transmis ne contient pas le DDL final nécessaire. Aucun fichier
`baseline.sql` installable n'est fabriqué à partir de suppositions.
`STATUS.json` est le manifeste des preuves, du rapprochement et des blocages.
Il ne change pas les migrations actives et ne contient aucune connexion.

```sh
node scripts/analyze-schema-dossier.cjs
node scripts/analyze-schema-dossier.cjs --check-ready
node tests/schema-dossier.cjs
```

Le premier produit l'analyse déterministe ; le deuxième sort volontairement
avec le code **2** tant que le dossier est incomplet. Ce contrôle concerne ce
dossier, pas une éventuelle baseline externe : ne pas le contourner en changeant
un statut JSON. Les hashes prouvent l'intégrité des sources reçues, pas leur
exhaustivité ou leur authenticité distante.

## Prochaine demande unique à ChatGPT / propriétaire autorisé

Les comptes et noms de migrations sont maintenant connus : inutile de les
redemander seuls. Récupérer en une opération de lecture autorisée les **sorties**
suivantes, pas seulement les requêtes ou des totaux :

1. Export schema-only final complet public/private, compatible avec la version
   PostgreSQL source, sans données ni valeurs de séquences, rôles globaux,
   utilisateurs Auth, vault ou secrets. Préserver contraintes, index, types,
   fonctions, politiques, triggers, propriétaires, ACL/default privileges.
   Revoir chaque corps/constante avant partage ; mapper explicitement les
   propriétaires sur le test sans supprimer leur effet sur SECURITY DEFINER.
2. Résultat de `../EXTRACT-FINAL-STATE.sql` comme manifeste comparatif lisible
   (ses propriétés résumées ne remplacent pas l'export). Il extrait notamment
   ACL de colonnes et privilèges par défaut, absents du lot 10 du ZIP.
3. Résultat de la requête **08** du fichier reçu
   `../references/dossier-2026-10-17/EXTRACTION_CATALOGUES_READONLY.sql`, pour
   OWNED BY et dépendances des cinq séquences. Ne pas lire last_value/setval.
4. DDL exact de `public.handle_new_user()` et de
   `auth.users.on_auth_user_created` (moment, événements, condition, état enabled,
   fonction appelée). Le script comparatif extrait le trigger, l'export
   public/private la fonction ; vérifier les éventuelles dépendances à d'autres
   schémas avant de qualifier le lot de complet. Ne pas importer les objets
   internes Auth. Fournir versions PostgreSQL/extensions et contrats de rôles,
   exposition PostgREST, provisioning/Auth et redirections nécessaires sans secrets.
5. Pour les quatre fonctions retenues : fournir pour revue privée leurs
   signatures exactes, corps structurellement complets, propriétaires, ACL,
   attributs, dépendances/triggers et une table de correspondance symbolique des
   identités protégées. Les vraies identités restent chez le propriétaire.
   Conserver distincts les comptes distincts ; ne pas remplacer toutes les
   adresses par le même marqueur. Toute autre constante privée suit la même revue.

Les requêtes du ZIP sont 12 **rubriques**, mais 13 SELECT (deux dans la rubrique
10). Elles passent en transaction READ ONLY sur le catalogue synthétique local.
La rubrique 06 renvoie `proconfig` et des corps : pas un export partageable sans
revue. La substitution regexp de quatre noms est heuristique, peut laisser
d'autres données privées et ne préserve pas la distinction de comptes. Son
marqueur REDACTED_EMAIL_FOR_TEST_REPLACE n'est **jamais** une protection prête
à installer. Si une extension ajoute un agrégat public/private,
pg_get_functiondef peut échouer sans filtre prokind ; préférer pour les fonctions
la requête du script comparatif, filtrée sur f/p.

## Décision nécessaire sur les protections de comptes

Les fonctions concernées sont protect_core_accounts(), protect_main_admin(),
admin_set_user_access(...) et admin_set_user_profile_permissions_070(...).
Ne pas les désactiver, les remplacer par des no-op ou réutiliser automatiquement
une version locale potentiellement ancienne contenant des identités réelles.

Après réception et revue des branches exactes, préparer une adaptation **test
seulement** : identifiants fictifs distincts, issus des comptes créés par GoTrue
dans l'instance isolée, correspondance privée explicitement approuvée. Conserver
les branches de refus, permissions, rôles et invariants tels que documentés.
Une adresse fictive peut remplacer un littéral email seulement si la comparaison
réelle est par email ; un test par UUID requiert l'UUID Auth créé, pas une invention.
Tester les refus de suppression/désactivation/changement de rôle des comptes
protégés et les opérations autorisées sur les autres. Aucun code de protection
n'est inventé ici : ces tests métier attendent les corps et la décision du
propriétaire. Sans eux l'installation demeure bloquée.

## Procédure reproductible dès réception d'un lot complet revu

1. Versionner séparément export original privé et export de test revu ; conserver
   provenance, versions, SHA256 et registre de chaque adaptation. L'original
   sensible ne va pas dans Git. Vérifier le diff des constantes et politiques.
2. Démarrer un Supabase local neuf, sans liaison à un projet cloud, avec les
   véritables Auth/GoTrue et PostgREST. Vérifier les versions/extensions/roles
   fournis par la plateforme. Ne pas recréer auth.uid()/auth.users à la main.
3. Installer l'export de test selon son ordre de dépendances vérifié, avec arrêt
   sur erreur : schémas/types/séquences/tables, fonctions nécessaires aux defaults
   et contraintes, dépendances circulaires explicitement résolues, contraintes,
   index, triggers, RLS, grants/revokes/default privileges et trigger Auth
   applicatif. L'ordre du dump fait foi après revue, pas un simple tri de fichiers.
   Ne pas désactiver check_function_bodies pour masquer des objets manquants.
4. Comparer les définitions et attributs, pas seulement 24/56/63/16/5 : noms,
   signatures, colonnes, contraintes, RLS/force, policies, grants, séquences OWNED
   BY, SECURITY DEFINER/search_path et triggers Auth. Expliquer toute adaptation.
5. Exécuter le contrôle 10, puis **seulement** la migration Réservations et le
   contrôle 30. Ne rejouer aucune des 45 migrations historiques après le snapshot
   final. Ne pas fabriquer d'entrées historiques appliquées pour le nouveau projet.
6. Créer les comptes fictifs via GoTrue, vérifier profils/trigger et protections,
   puis appartenances explicites sur deux établissements. Tester vrai JWT via
   REST/RPC, lecteurs/gestionnaires/inactifs/anon/sans appartenance, isolation,
   conflits de versions, persistance, audit et frontend. Une service_role ne
   démontre pas la RLS. Tester aussi les contrats historiques réellement requis.
7. Quand cette reconstruction réussit, préparer le paquet hors ligne avec
   prepare-development-sql.cjs + hash revu. Après **nouvelle autorisation** de
   coût/création/application, répéter sur un projet Supabase entièrement distinct
   et un projet Vercel distinct. Refuser explicitement les projets existants.

Les 19 déclarations de tables du ZIP ne sont jamais appliquées directement :
231 colonnes sont documentées mais sans sécurité/contraintes finales ; les cinq
autres tables n'ont pas leur état final fourni. Le défaut app_settings.manager
a été remplacé par « Responsable Test » par l'émetteur : adaptation déjà connue,
à conserver au registre. L'absence de RLS et de PK rendrait ces seules déclarations
inappropriées même pour un environnement de test connecté.
