# Mission 2.3 — rapport unique de reconstruction

17 octobre 2026. Branche feat/reservations-foundations ; départ af4e6d3.
Les six fichiers de l'archive sont lus ; les cinq empreintes de SHA256SUMS
correspondent. Source SQL :
`c9aa165a6fb575b5a6fecb8c215ae321417b6da87c07cf4c3aa9b9facbf89de9`.
Le dossier et les copies assemblées restent **hors dépôt**, sous /tmp dans cet
environnement, avec sorties privées. Aucun dump, brut ou anonymisé, n'est committé.

## Résultat principal

Le snapshot global est enfin reçu : il ne manque plus l'export des 24 tables
ou les fonctions de profils. **Ne pas les redemander.** Sa reconstruction et
les corrections sont vérifiées sur PostgreSQL 16 en diagnostic, mais le reset
Supabase/PostgreSQL 17 et l'authentification réelle restent **non réalisés**.
La baseline n'est donc pas déclarée finalisée ou déployable.

## Assemblage reproductible préparé

scripts/prepare-snapshot23-local.cjs ne connecte ni n'exécute rien. Il exige
le fichier externe avec SHA256 exact et un dossier externe neuf :

```sh
node scripts/prepare-snapshot23-local.cjs --source /CHEMIN_PRIVE/STOPFLOW_SCHEMA_PUBLIC_PRIVATE_TEST.sql --out /CHEMIN_PRIVE/paquet-local-neuf
```

Il produit un manifeste SHA256 et cinq SQL séparés : baseline PG17, trigger
Auth, proposition de moindre privilège 2.1, proposition auteur NULL et migration
Réservations. Pas d'empilement des 45 migrations historiques. Aucun ajout aux
migrations actives, aucune adoption définitive des identités fictives.

Adaptations justifiées :

- CREATE SCHEMA public devient IF NOT EXISTS, car Supabase fournit déjà public.
  Une garde refuse les objets métier préexistants/private existant ; aucun DROP.
- Version PG17 obligatoire dans le paquet. Propriétaires, rôles, MAINTAIN et ACL
  sont conservés ; pas de mapping de propriétaires inventé.
- Le dump utilise check_function_bodies=false pour ses références anticipées.
  Cette convention pg_dump est conservée puis **les 56 définitions sont recréées
  à validation activée** après l'ensemble du DDL. Cela valide la compilation,
  pas toutes les branches PL/pgSQL à l'exécution.
- Trigger Auth qualifié public.handle_new_user, ajouté après la baseline ; un
  trigger préexistant provoque une erreur, il n'est pas écrasé.
- Correctifs conservés séparés, avec provenance source et empreintes ; pas de
  modification des protections réelles de Production par les identités fictives.

Les gardes de schéma/version ne prouvent pas à elles seules l'identité d'un
serveur : l'exécution future doit être vérifiée comme strictement locale.

## Inventaire et reconstruction observés

24 tables, 56 fonctions, 63 policies, 16 triggers publics, 24 RLS activées,
135 contraintes dont 40 FK, 44 index explicites **plus** les index de contraintes,
cinq séquences (quatre identités et une explicite), 167 instructions ACL/defaults.
Les index effectifs sont comparés au nombre d'index explicites + contraintes
indexées ; les objets ne sont pas déduits seulement d'un comptage textuel.

La suite tests/snapshot23-reconstruction.cjs assemble le vrai source reçu :

```sh
STOPFLOW_SNAPSHOT23_SOURCE=/CHEMIN_PRIVE/STOPFLOW_SCHEMA_PUBLIC_PRIVATE_TEST.sql node tests/snapshot23-reconstruction.cjs
```

**Ce test est explicitement un diagnostic PG16, pas Supabase :** il vérifie
d'abord le refus de la baseline PG17 sur PG16, puis omet en mémoire seulement
la garde de version, le GUC transaction_timeout et MAINTAIN explicite. GRANT ALL
en PG16 n'inclut pas non plus MAINTAIN : l'ACL PG17 intégrale n'est pas validée.
Auth.users et auth.uid sont simulés, avec rôles de plateforme minimaux fictifs.
Ni cette variante ni ce faux schéma Auth ne sont écrits dans le paquet PG17.

Deux bases indépendantes vides reçoivent le DDL complet et le trigger Auth,
avec revalidation des fonctions. Cela démontre le rejeu **PG16 diagnostique**,
pas un reset Supabase. Aucune donnée réelle et aucune extension plateforme
Vault/GoTrue/PostgREST ne sont importées dans cette sonde.

## Sécurité réellement testée sur le snapshot

| Test | Résultat |
| --- | --- |
| Onze RPC demandées | Les onze existent, owner postgres, SECURITY DEFINER, search_path vide ; authenticated EXECUTE, anon sans EXECUTE vérifiés |
| Profils | Provisioning via trigger avec Auth simulé, lecture propre RLS, affectations et permissions via vraies RPC reçues |
| Deux identités du snapshot | Distinctes ; désactivation refusée ; aucune correspondance définitive en Production |
| Auteur NULL avant correctif | La **vraie RPC du snapshot** laisse l'employé inventory.use modifier le brouillon sans auteur : reproduit |
| Proposition auteur NULL | Un seul prédicat de la définition reçue passe de <> à IS DISTINCT FROM ; le même appel et le wrapper v054 sont refusés en 42501 |
| Non-régression auteur | Auteur légitime accepté, responsable autorisé accepté, autre employé refusé ; révision conservée après refus |
| Proposition 2.1 | TRUNCATE effectif authenticated : 23 tables avant, zéro après ; defaults tables public clients retirés pour les créateurs postgres et supabase_admin |
| Helper interne | Appel direct refusé après correctif ; RPC admin indirecte reste autorisée, responsable/employé refusés sur l'administration |

Le correctif auteur NULL est généré depuis **cette empreinte de source** et
conservé hors dépôt avec le paquet, sans édition manuelle d'un ancien corps.
Il préserve owner/ACL lors du CREATE OR REPLACE. Aucune application distante.

Le contrôle des attributs/ACL des onze RPC ne constitue pas une validation de
tous leurs contrats métier. Les chemins commandes/auteur et administration
sont testés ici ; tous les scénarios température/checklist/logging via vrais
JWT et l'exposition REST restent à valider. Les réserves de journal client non
certifiant et des protections UPDATE vs DELETE restent celles de mission 2.1.

## Réservations après baseline et propositions

Sept tables créées après le socle complet diagnostique et le durcissement.
Sur ce socle : deux établissements fictifs, création de salles/tables par leurs
gestionnaires, refus lecteur, refus inter-établissements (RPC et RLS), mutation
avec version, conflit de version périmée, relecture persistante et audit testés.
Un admin global sans membership explicite voit d'abord zéro établissement.
La suite historique tests/reservations-postgres.cjs (62 contrôles avec son
propre contrat PostgreSQL simulé) est également rejouée ; son contexte est
distinct de la reconstruction complète du snapshot.

## Blocage précis : véritable Supabase PG17 absent

Outils vérifiés : seul postgres:16-alpine disponible dans Docker, aucune CLI
Supabase ni binaire pg_dump hôte. Aucune image GoTrue/PostgREST/Supabase PG17
présente, aucun service de ce type lancé. Le précédent EAI_AGAIN GitHub n'est
pas retenté ; pas de téléchargement ni d'opération distante dans cette mission.

Les cinq extensions indiquées dans le complément sont à comparer sur la vraie
plateforme : pg_stat_statements 1.11, pgcrypto 1.3, plpgsql 1.0, supabase_vault
0.3.1, uuid-ossp 1.1, avec leurs schémas fournis. Le source public/private
référence auth.uid/users ; aucun appel qualifié extensions/vault n'y a été
trouvé. Cela ne dispense pas de vérifier la plateforme et ses versions.

**Intervention suivante unique :** mettre à disposition un Supabase **local
PG17 opérationnel**, avec CLI/images de confiance et GoTrue/PostgREST, sur un
poste autorisé disposant de ces outils. Pas de nouvel export Production requis.
Le paquet externe assemblé devra y être reconstruit depuis zéro, puis testé :

1. Projet de test local neuf sans liaison cloud ; vérifier versions et extensions,
   rôles/ACL et absence d'objets métier. Vérifier les options CLI locales avec
   --help, puis reset **local uniquement** dans un atelier distinct du dépôt
   historique. Aucune commande CLI de reset n'a été exécutée ou validée ici.
2. Charger baseline puis trigger Auth, comparer catalogues/ACL/owners ; créer
   les comptes fictifs via GoTrue (pas INSERT dans auth.users), vérifier sessions,
   profils, absence d'auto-promotion et JWT/PostgREST réels.
3. Tester les onze RPC avec admin/responsable/employé/inactif/anon, droits directs
   et indirects ; appliquer les deux propositions localement et rejouer les refus
   et chemins autorisés. Tester les limites de suppression séparément.
4. Ajouter Réservations, tester tous les rôles, tenant isolation, concurrence,
   audit et persistance avec vrais JWT. Rapporter logs sans tokens ni mots de passe.
5. Décision du pilote sur recréation de la branche cloud seulement après succès.

## Résultats / décision finale

Tests effectivement réussis : snapshot23-reconstruction.cjs (diagnostic complet
PG16 ci-dessus), suite Réservations 62 contrôles, syntaxe des deux nouveaux CJS
et contrôle du diff. Intégrité des cinq SHA256 vérifiée. Les conteneurs et bases
de tests sont supprimés ; sources et paquet privés restent hors Git.

**GO local :** source désormais disponible, assemblage reproductible préparé,
propositions de sécurité et compatibilité Réservations vérifiées dans le cadre
diagnostique décrit. **NO-GO recréation de la branche Supabase Test :** aucun
reset Supabase PG17, Auth/GoTrue/PostgREST ou JWT réel réussi. La baseline reste
une préparation locale non approuvée pour déploiement.

Aucun push, déploiement, connexion ou mutation Supabase distante, création de
branche, changement Production/LUnion Connect/Vapi ; éditeur graphique non commencé.
Seuls assembleur, test et ce rapport sont ajoutés au dépôt avec un lien README.
