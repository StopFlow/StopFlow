# Mission 1.8 — preuves authentiques, tests et limites

17 octobre 2026. Branche feat/reservations-foundations ; départ 223e874.
Archive utilisateur conservée sous references/mission-1.8 avec provenance
SHA256/MD5. Aucune inspection distante par Codex. Les cinq fichiers ont été lus
et les consignes sont appliquées uniquement dans le périmètre local autorisé.

## Nouvelles preuves vérifiées

| Source | Vérification / effet |
| --- | --- |
| Première migration intégrale | MD5 **39e0dab3f768e2fb6a9f3a68261710e5**, 11 033 caractères / 11 075 octets ; correspondance exacte à l'empreinte annoncée par le pilote |
| profiles actuel | 9 colonnes, PK id uuid, UNIQUE(email), FK auth.users(id) ON DELETE CASCADE, checks rôle et deux checks département, RLS et deux policies, trois triggers et ACL documentées |
| handle_new_user | Corps connu : copie id/email/prenom/nom depuis Auth, impose role employe et actif true ; SECURITY DEFINER et search_path vide, owner postgres/ACL service_role documentés |
| Trigger Auth | AFTER INSERT sur auth.users, appelle handle_new_user ; référence de création non qualifiée, nécessite public dans le search_path de création ou qualification revue |

La PK/FK de profiles et le corps du provisioning ne sont donc plus des exports
à redemander. La référence profiles reste documentaire, pas une migration
historique : policies et triggers dépendent d'autres fonctions, ACL indiquées
en commentaires plutôt que sous forme de GRANT. La présence du droit MAINTAIN
dans l'ACL rapportée exige aussi de vérifier la version PostgreSQL cible ; les
probes PostgreSQL 16 ne prétendent pas reproduire ce droit.

## Cause historique reproduite avec le SQL exact

Dans un PostgreSQL isolé avec schéma Auth **simulé**, le vrai fichier historique
échoue en 42P01 sur public.profiles lors de la création de orders. Le test
enveloppe ce fichier dans une transaction pour vérifier le rollback ; il ne
prétend pas connaître le mode transactionnel de l'exécuteur distant.

Après création de la table profiles **extraite de la référence réelle**, la
même migration passe. Les deux policies profiles échoueraient sans is_admin ;
elles passent une fois le helper reçu ajouté. Cela démontre l'ordre de ces
dépendances, pas la reconstruction finale des 45 migrations.

Le SQL historique crée notamment des policies de commandes larges pour tous les
utilisateurs actifs. Les RPC y sont SECURITY DEFINER, alors que les références
finales submit_order/validate_order sont des wrappers invoker vers les helpers
privés ultérieurs. **Le SQL ancien ne remplace pas le schéma final** et n'est pas
copié sous supabase/migrations ni destiné à une connexion de test frontend.

## Baseline finale proposée — indépendante de l'historique

Préparer, quand les pièces sont complètes, un répertoire dédié contenant :

```text
manifest.json                 provenance, versions, SHA256, adaptations approuvées
00-platform-contract.sql     contrôle lecture seule de Supabase/rôles/Auth
10-final-schema.sql          export final revu public/private, ordre validé
20-final-auth-trigger.sql    seul trigger applicatif Auth et dépendances revues
30-final-contract.sql        contrôle de l'état final exact, ACL incluses
40-reservations.sql          seule migration Réservations existante
50-test-fixtures             provisioning GoTrue fictif et memberships explicites
```

Ces noms décrivent une structure cible : **les fichiers SQL manquants ne sont
pas créés avec des stubs**. Une seule migration Réservations suit la baseline.
Les contraintes/defaults appelant des fonctions imposent leur propre ordre
dans 10 ; une fonction nécessaire à un DEFAULT doit être créée avant celui-ci.
Ne pas trier arbitrairement les fonctions et ne pas désactiver leur validation.
Le trigger Auth applicatif doit être installé après profiles, ses helpers,
policies et fonctions de triggers effectives. Les ACL/default privileges
finaux font partie du résultat à vérifier. Aucun replay des anciennes migrations
après cette baseline, aucune modification ou réparation de l'historique Production.

## Tentative de véritable Supabase local — blocage d'outillage

CLI absente ; Docker dispose de l'image PostgreSQL 16, sans pile Supabase.
Tentative hors dépôt, CLI épinglée 2.54.11 :

```sh
npm exec --yes --foreground-scripts --cache /tmp/stopflow-npm-cache --package supabase@2.54.11 -- supabase --version
```

Le téléchargement npm réussit, mais le postinstall échoue en téléchargeant
les checksums depuis github.com/supabase/cli/releases :
**getaddrinfo EAI_AGAIN github.com**, code de sortie 1.
La tentative avec permission réseau étendue échoue de la même manière.
La CLI n'est pas installée ; aucune commande start/db reset n'a pu être exécutée.
Aucun téléchargement de pile Supabase ni accès API aux projets n'a eu lieu.
Il n'y a donc **aucun test GoTrue/PostgREST ni reset Supabase complet réussi**.
Le poste suivant devra disposer d'un accès aux distributions CLI/images de
confiance ; ne pas contourner ce blocage par un binaire non vérifié.

## Tests locaux effectivement réalisés

`node tests/mission18-sources.cjs`, avec PostgreSQL 16 en conteneur sans réseau :

- Intégrité des cinq fichiers et MD5 attendu de la migration.
- Échec 42P01 du SQL historique exact sans profiles, réussite après le CREATE
  TABLE reçu ; échec des policies sans is_admin, réussite après le helper reçu.
- Les trois triggers profiles échouent sur leurs fonctions absentes du contrat
  testé. **Aucun no-op n'est ajouté pour les faire passer.**
- Test du vrai corps handle_new_user et du trigger sur une table auth.users
  **simulée**. Même si les métadonnées demandent admin/inactif, le profil créé
  est employe/actif ; accents conservés. ACL de la fonction reproduite pour
  interdire son exécution à authenticated et PUBLIC.
- Contraintes rôle/département, email unique et FK Auth, lecture propre via RLS,
  current_role, soumission/validation historiques autorisées/refusées, numéro
  BC-000001, persistance, utilisateur inactif, cascade Auth/profiles et SET NULL
  de l'auteur de commande. Les grants profils du test sont un sous-ensemble
  explicite pour PostgreSQL 16, pas l'ACL finale complète.
- Migration Réservations réelle sur ce **socle partiel** avec table profiles
  réelle : ses sept tables sont créées. Cela ne valide pas les triggers profiles
  manquants, les quatre protections ou toute la baseline.

Les données Auth sont insérées dans une table simulée uniquement pour ces tests
PostgreSQL ; cette méthode est interdite comme substitut de GoTrue dans le
futur test Supabase réel. Le test est hors migrations actives, aucun script
d'installation partielle n'est livré. Aucun schéma synthétique ne quitte le
conteneur. Les suites antérieures pertinentes et les contrôles de syntaxe sont
consignés dans la livraison. Aucun code applicatif n'est modifié.

Résultats effectifs complémentaires :

| Contrôle | Résultat |
| --- | --- |
| node tests/mission18-sources.cjs | PASS, sources réelles sur socle partiel Auth simulé |
| node tests/schema-reconstruction.cjs | PASS, blocages attendus confirmés |
| node tests/schema-dossier.cjs | PASS, intégrité et extraction locale |
| node tests/reservations-postgres.cjs | PASS, 62 contrôles |
| node --check tests/mission18-sources.cjs | PASS |
| git diff --check, y compris ajouts | PASS |
| Installation CLI / Supabase local réel | BLOQUÉ, EAI_AGAIN github.com |

Les conteneurs PostgreSQL de ces tests ont été supprimés après exécution.

## Derniers exports strictement nécessaires

**P0 : un export final schema-only public/private complet et revu**, avec
propriétaires, ACL/default privileges, colonnes/contraintes/index, types/enums,
séquences/ownership sans valeurs courantes, fonctions, RLS et triggers, versions
PostgreSQL/extensions. Il manque l'état final complet des 23 autres tables ;
profiles est beaucoup mieux documentée mais ses fonctions de triggers ne sont
pas toutes disponibles dans leur version finale. L'export complet permet de
résoudre ces dépendances en un lot, sans nouveau cycle d'extractions par colonne.

Priorités dans cet export :

- private.protect_core_accounts() : corps retenu pour confidentialité.
- private.stopflow_060_sync_primary_assignment() : aucune définition locale.
- private.stopflow_060_audit_profile_delete() : version locale disponible dans
  20260809071500 mais finale à vérifier ; dépend de deleted_user_identities et
  user_admin_events, dont seuls les champs sont fournis.
- Les autres fonctions finales et leurs ACL. Dix corps finaux sont maintenant
  documentés (les neuf précédents + handle_new_user), pas les 56 ; les fonctions
  historiques supplémentaires ne prouvent pas leur état final.
- Les quatre fonctions protégées : protect_core_accounts, protect_main_admin,
  admin_set_user_access, admin_set_user_profile_permissions_070, avec revue privée.

Le trigger Auth et le corps handle_new_user sont déjà reçus : demander seulement
leur confirmation d'appartenance au snapshot et leurs dépendances/ACL, pas une
nouvelle extraction identique. Ne pas redemander la première migration ou les
45 noms déjà connus. La récupération de tout l'historique n'est pas nécessaire
à la stratégie finale ; aucune commande migration fetch distante exécutée.

## Stratégie des identités protégées — proposition à approuver

Le propriétaire conserve les vraies identités hors Git. Il prépare une version
structurellement complète des quatre fonctions avec symboles **distincts** par
identité, y compris les comparaisons indirectes. Après revue des branches :
créer via GoTrue local des comptes fictifs distincts, affecter leur email/UUID
aux symboles selon les comparaisons réelles, vérifier les invariants de refus.
Les paramètres administratifs restent côté serveur test, pas dans le navigateur.
Un remplacement de littéraux approuvé peut suffire ; ne pas inventer une nouvelle
table de configuration ni une politique métier sans les corps.

Matrice à approuver : pour chaque identité protégée tester auto-modification,
modification par autre admin, suppression, désactivation, changement de rôle/email,
et les opérations ordinaires autorisées sur un compte fictif non protégé. Les
résultats attendus doivent être dérivés des branches reçues, pas supposés.
Ajouter un test garantissant que deux symboles distincts ne se résolvent pas vers
le même compte. **Aucune substitution, désactivation ou protection inventée ici.**

## GO / NO-GO

**GO :** obtenir le snapshot revu et les décisions sur les identités, rendre
l'outillage local disponible, assembler puis tester une baseline finale.

**NO-GO :** annoncer une baseline complète, utiliser la branche Test ou y
appliquer du SQL avant reset local complet et tests Auth/RLS réels réussis.
La branche distante échouée n'est pas modifiée. Son éventuel coût et sa
conservation/suppression relèvent du pilote et d'une décision distincte.

Aucune écriture distante, aucun push/déploiement, aucune intervention sur
Production, LUnion Connect ou Vapi. Partie 2 non commencée.
