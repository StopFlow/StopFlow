# Mission 2.1 — proposition SQL et export unique

17 octobre 2026. Départ b75fdf8, branche feat/reservations-foundations propre.
Les nouveaux constats Production sont fournis par le pilote : 23/24 tables avec
TRUNCATE authenticated, defaults trop larges, USAGE private et EXECUTE du helper,
11 alertes Advisor. Aucun nouveau catalogue ni liste nominative Advisor n'est
joint. Aucune opération distante ou tentative réseau pendant cette mission.

## Correctif proposé, jamais appliqué à Supabase

`supabase/proposals/20261017_least_privilege_REVIEW_ONLY.sql` est **hors migrations
actives**, distinct de la baseline et de Réservations. Il ne contient aucune URL
ou connexion. Il est transactionnel et testé dans un conteneur jetable seulement.

1. Retire TRUNCATE à PUBLIC/anon/authenticated sur toutes les tables publiques
   ordinaires/partitionnées, sans toucher SELECT/DML existants, service_role et owners.
2. Retire les grants client par défaut **par schéma public**, pour les créateurs
   identifiés par propriétaires de tables/default ACL. Les futures tables auront
   des grants client explicites, avec RLS/policies à définir dans leurs migrations.
3. Retire EXECUTE à PUBLIC/anon/authenticated sur le seul helper d'écriture
   sync_legacy_profile_permissions(uuid), conserve service_role et owner. Ne
   révoque ni USAGE private ni les helpers de lecture nécessaires à RLS/CHECK.
4. Vérifie les droits effectifs ; un grant hérité restant provoque rollback,
   pas une modification automatique des appartenances de rôles.

**Garde indispensable :** si des default ACL de tables **globaux** accordent des
droits à ces rôles, le script s'arrête avant toute mutation. Un REVOKE IN SCHEMA
ne les annule pas ; une révocation globale affecterait aussi les autres schémas.
Les lignes exactes de pg_default_acl et leurs créateurs doivent donc être revues.
Les grants par défaut transitant par un rôle hérité sont aussi détectés :
globaux ou public indirects provoquent un arrêt, sans révoquer le rôle parent.
Cette proposition n'est pas annoncée applicable à Production en l'état. Il faut
vérifier les créateurs futurs hors inventaire et toute future migration s'appuyant
sur des grants implicites. Aucun durcissement global des defaults de fonctions
n'est tenté : cela affecterait aussi les futures RPC publiques.

Les appels indirects restent autorisés dans les RPC administratives reçues,
SECURITY DEFINER owner postgres : le caller SQL ne doit pas avoir EXECUTE sur le
helper pour que son propriétaire l'appelle. D'autres propriétaires/appelants
effectifs doivent être vérifiés dans le snapshot, pas supposés équivalents.

## Audit des 11 RPC : sources et limites explicites

La liste nominative des onze alertes n'est pas fournie. Les onze fonctions ci-dessous
sont les **candidates de la migration locale de durcissement 20260829065738**.
Ne pas prétendre que leurs signatures coïncident avec Advisor sans la liste.
Les deux RPC administratives reçues et log_stopflow_event sont des références
finales ; les autres corps sont les dernières versions locales disponibles,
pas une preuve de leur état final distant.

| Candidate | Contrôle dans le corps disponible | Conclusion limitée |
| --- | --- | --- |
| admin_set_profile_permissions(uuid,jsonb) | is_admin actif, cible existante, contraintes clés/scopes, admin cible traité séparément | Garde adaptée à une administration globale ; corps final à confirmer |
| admin_set_user_access(uuid,text,text,text,boolean,text,text[]) | is_admin, cible, rôles/départements validés, protections des identités | Garde suffisante pour ce contrat administratif reçu ; tests admin/responsable/employé/inactif avant et après durcissement |
| admin_set_user_profile_permissions_070(uuid,text,text,text,boolean,jsonb,text) | is_admin, JSON/role, contraintes, protections | Même conclusion sur le contrat reçu ; les limites de protection de mission 1.9 subsistent |
| load_temperature_dashboard_070() | auth.uid + permissions readings/equipment cuisine, données bornées à cuisine | Garde de portée présente ; dépend de has_permission et du corps final. search_path corrigé par la migration ultérieure |
| log_stopflow_event(text,text,text,text,jsonb) | Profil actif, acteur fixé à auth.uid, longueurs bornées | Suffisant pour un journal client non certifiant ; label/details/entity fournis par l'utilisateur ne prouvent pas une action métier réelle |
| mark_order_delivered(uuid,text) | Commande au bon état + orders.manage sur son département via helper | Garde départementale présente ; helper actif/permissions à confirmer dans le final |
| mark_order_sent(uuid,text,numeric) | Même contrôle orders.manage et état | Même réserve ; pas de validation distante annoncée |
| resolve_checklist_anomaly(uuid,text) | Anomalie liée au run, checklists.review sur département lu en base | Garde de portée présente ; dernier ALTER local met search_path vide |
| save_order_draft_atomic(uuid,text,text,text,jsonb,jsonb,timestamptz,timestamptz,bigint,jsonb) | Profil actif, fournisseur actif, inventory.use, auteur/manager, révision, articles même fournisseur/département | **Réserve NULL auteur ci-dessous**, pas de conclusion « suffisante » globale |
| save_order_draft_atomic_v054(uuid,text,text,text,text,jsonb,jsonb,timestamptz,timestamptz,bigint,jsonb) | Département fournisseur vérifié, délégation à la précédente | Hérite de sa réserve ; pas une garde indépendante complète |
| save_temperature_round_070(jsonb) | readings.use cuisine, tous équipements actifs une fois, payload contrôlé | Garde présente ; final et helpers/contraintes à confirmer |

**Réserve locale établie par lecture :** save_order_draft_atomic utilise
`v_order.author_id <> auth.uid() AND NOT private.has_permission(...)` dans un IF.
Si author_id est NULL (colonne nullable, FK historique ON DELETE SET NULL), la
condition peut être NULL et le refus ne s'exécute pas. Cela peut permettre, dans
ce corps local, l'édition d'un brouillon sans auteur à un autre utilisateur ayant
inventory.use du même département, sans orders.manage. Revoir la règle voulue et
le corps final ; un comparateur IS DISTINCT FROM est une piste, **aucun corps
historique ou production n'est modifié ici**. Le probe SQL vérifie la logique
ternaire, pas l'exécution complète de cette RPC sur le vrai schéma.

Les alertes SECURITY DEFINER ne sont pas des preuves d'exploitation. Il reste à
rapprocher les onze signatures Advisor avec le snapshot final, owners/ACL/defaults,
has_permission et les surfaces exposées. Aucun succès de tests métier sur les
onze RPC n'est annoncé : seuls les chemins administratifs du contrat reçu et
les accès indirects après révocation sont exécutés dans la suite actuelle.

## Tests de la proposition

`node tests/mission19-profile-security.cjs --mission21` rejoue la fixture 2.0 et
ses preuves de risques, puis applique le fichier proposé **localement** :

- TRUNCATE et appel direct du helper refusés (admin, responsable, employé SQL).
- RPC admin via SECURITY DEFINER continue d'appeler son helper ; responsable,
  employé et inactif restent refusés sur l'administration.
- Helpers de lecture/RLS continuent de fonctionner ; permissions JSON/rollback
  et protections des comptes sont conservés.
- Default ACL public nouvelles tables : aucun accès client implicite ; un grant
  explicite fonctionne. L'ajout d'un default global fait refuser le correctif
  avec rollback complet ; répétition du correctif réussie après levée de ce cas.
- Migration Réservations réelle appliquée **après** ces nouveaux defaults : ses
  grants SELECT explicites et reservations_context fonctionnent, TRUNCATE absent.

La suite conserve Auth simulé et PostgreSQL 16, sans MAINTAIN. Pas de preuve
globale de non-régression pour les 24 tables et onze RPC sans leur schéma final,
ni de validation Auth/GoTrue/PostgREST. Le mode 2.0 avant correction reste intact.

Résultats effectifs locaux :

| Commande | Résultat |
| --- | --- |
| node tests/mission19-profile-security.cjs --mission21 | PASS : avant/après, appels indirects, defaults globaux/hérités, Réservations après durcissement |
| node tests/schema-export-companion.cjs | PASS : pg_dump local schema-only, complément Auth/catalogues et probe auteur NULL |
| node tests/reviewed-schema-copy.cjs | PASS : mappings distincts/collisions, refus données/secrets/emails non mappés, transformation limitée |
| node --check sur les quatre CJS concernés | PASS |
| git diff --check, ajouts inclus | PASS |

Les exports des tests sont fictifs ; aucune copie anonymisée du véritable schéma
n'a été produite, faute d'export brut reçu. Conteneurs et fichiers temporaires
créés par les tests sont supprimés. Le partage de snapshot entre les deux
sessions de la procédure future n'a pas été testé contre Production.

## Une seule méthode réaliste : pg_dump + complément, même snapshot

**Disponibilité vérifiée ici :** aucune CLI Supabase ni pg_dump hôte ; Docker
possède postgres:16-alpine et `pg_dump --version` retourne **16.15**. Son --help
confirme --schema-only, --schema, --snapshot et --file. La version du serveur
Production n'est pas fournie ; le droit MAINTAIN suggère une version plus récente.
Ne pas prétendre qu'un pg_dump 16 pourra exporter un serveur 17+. EAI_AGAIN GitHub
non retenté ; aucun export réel n'a été obtenu dans cet environnement.

**Lieu d'exécution futur : poste du propriétaire déjà équipé d'un pg_dump/psql
de même majeure que le serveur**, avec accès autorisé lecture seule et connexion
directe/session persistante (pas pooler transaction pour garder le snapshot).
Ce choix ne dépend pas du téléchargement de CLI dans Codex. Pas de seconde
méthode db pull ou migration fetch, pas de repair. Si ce poste/outillage manque,
la collecte reste bloquée jusqu'à sa disponibilité.

1. Le propriétaire vérifie versions `psql --version`, `pg_dump --version` et
   `show server_version` dans une session autorisée, l'identité de connexion et
   ses droits de lecture complets. Service libpq `stopflow_catalog_readonly`
   configuré **localement hors Git** ; identifiants via fichier protégé/système
   de secrets, jamais URL avec mot de passe, chat ou ligne de commande.
2. Créer un répertoire privé hors dépôt, permissions 0700 et umask 077.
   Dans la session psql :

```sql
begin isolation level repeatable read read only;
select pg_export_snapshot();
```

Garder cette session ouverte. Le snapshot ID est une référence transactionnelle,
pas un mot de passe. Rediriger ensuite la sortie vers un fichier privé avec
`\o /CHEMIN_PRIVE/snapshot-companion.txt`, puis `\i` du fichier
docs/schema/SNAPSHOT-COMPANION.sql, puis `\o`. Ne pas fermer/commit avant le dump.
Le compagnon capture extensions/versions, dépendances, default ACL **globaux**,
rôles/appartenances sans mots de passe, event triggers et trigger applicatif
auth.users avec son état enabled. Pas de lignes métier ni auth.users.
3. Dans un second terminal du même poste, après vérification de son --help :

```sh
pg_dump --dbname='service=stopflow_catalog_readonly' --schema-only --schema=public --schema=private --snapshot=ID_RELEVE --lock-wait-timeout=10s --file=/CHEMIN_PRIVE/public-private.raw.sql
```

Ne pas passer --no-owner/--no-privileges : owners et ACL doivent être conservés.
Pas de --clean/--create, pas de restauration. Le dump lit le schéma et prend des
verrous de lecture ; le délai le fait échouer plutôt que bloquer indéfiniment.
Après succès, terminer la transaction gardienne par rollback et vérifier que le
dump est complet/code 0. Conserver versions, source et SHA256 des deux fichiers.
Un échec doit être traité comme export incomplet, jamais poursuivi comme succès.
4. Le filtre de schémas ne capture pas automatiquement toutes les extensions et
dépendances hors public/private ; rapprocher le compagnon, classer plateforme
Supabase vs objets applicatifs externes. Tout objet applicatif externe non
couvert exige son DDL dans **le même lot revu**, sinon le lot reste incomplet.
Ne pas exporter/recréer les tables Auth plateforme. Le trigger Auth est un
fichier séparé revu ; sa fonction public.handle_new_user figure dans le dump.
5. Les raw restent privés hors Git. Préparer une copie de test avec mappings
distincts explicitement approuvés dans un JSON privé :

```sh
node scripts/prepare-reviewed-schema-copy.cjs --raw /CHEMIN_PRIVE/public-private.raw.sql --mapping /CHEMIN_PRIVE/mapping.json --out /CHEMIN_PRIVE/public-private.test-review.sql
```

L'outil refuse fichiers source/mapping dans le dépôt, sortie existante/interne,
emails non mappés, fusion d'identités, données top-level et motifs de secrets.
Il conserve DML **dans les corps SQL**, transforme les seules adresses mappées et
émet hashes/registre sans anciennes adresses. **Ce n'est pas un anonymiseur
complet ni une preuve schema-only** : noms, URLs privées, commentaires, paramètres
et secrets non reconnus exigent une revue humaine. Appliquer la même revue au
compagnon et à l'extraction séparée du trigger. Aucun brut n'est committé.
6. Faire approuver diff/identités/propriétaires/ACL et copie de test complète,
   puis versionner la copie revue et ses preuves seulement. Rejouer depuis zéro
   sur Supabase local compatible/Auth réels, comparer les catalogues et exécuter
   les tests JWT, ensuite le correctif séparé et Réservations. Aucun GO distant
   avant ces preuves et autorisation distincte.

## Décision

**GO local :** proposition limitée, tests et aide à la revue offline prêts.
**NO-GO application distante / baseline complète :** global defaults exacts,
catalogue complet et onze signatures Advisor non rapprochés, nouveau point NULL
auteur à confirmer dans le final, version/outillage d'export à fournir par le
poste autorisé, reset et Auth réels absents. Aucun droit distant modifié, aucun
push/déploiement, aucune intervention LUnion Connect/Vapi ou éditeur graphique.
