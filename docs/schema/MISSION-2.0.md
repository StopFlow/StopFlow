# Mission 2.0 — sous-ensemble profils et dépendances

17 octobre 2026. Branche feat/reservations-foundations, départ a16900d, arbre
propre. Quatre fichiers du ZIP lus ; références intactes et SHA256 conservés
sous references/mission-2.0. L'extraction distante est attribuée au pilote ;
aucune opération réseau/cloud ou tentative de téléchargement pendant cette mission.

## Éléments résolus et comparaison

Le prérequis ON CONFLICT n'est plus une hypothèse :
**profile_departments_pkey(profile_id,department)** est une PK non partielle.
L'index unique partiel **profile_departments_one_primary_idx(profile_id) WHERE
is_primary=true** impose séparément au plus un primaire. Le mode de test 2.0
utilise les vrais noms et définitions reçus, sans fixture_only_department_unique.

Les quatre tables apportent 25 colonnes, 15 contraintes, 14 index (dont quatre
issus des PK), sept policies PERMISSIVE, ACL, propriétaire et état RLS.
Les deux index actor_idx/actor_user_id_idx sont conservés, sans nettoyage.
RLS activée, non forcée, owner postgres ; aucun trigger applicatif sur ces
quatre tables n'est déclaré dans la lecture reçue.

| Helper | Comparaison au dépôt / références précédentes |
| --- | --- |
| current_role() | Corps identique après normalisation des espaces à la première migration reçue ; signature finale qualifiée/quotée et ACL désormais attestées par la source |
| is_admin() | Corps identique à la référence des huit fonctions ; ACL explicite sans PUBLIC |
| is_operational_department(text) | Corps identique à 20260805143900 ; IMMUTABLE, invoker, ACL explicite sans PUBLIC |
| sync_legacy_profile_permissions(uuid) | Corps identique à 20260809074647 ; SECURITY DEFINER, ACL NULL, effets de remplacement des permissions confirmés |
| user_has_department(uuid,text) | Corps identique à la référence antérieure ; ne teste pas seul l'activité du profil |

Les **cinq MD5 locaux de pg_get_functiondef correspondent exactement aux cinq
empreintes annoncées** sur PostgreSQL 16. Les hashes portent sur la définition
canonique PostgreSQL, pas sur le fichier/commentaires ni sur les ACL. Les ACL
sont donc reproduites/testées séparément. Toutes les comparaisons de corps sont
testées, pas déduites de l'égalité des noms.

Différence avec la fixture 1.9 : le CHECK final de profile_permissions autorise
temperatures.readings.use et temperatures.equipment.manage en cuisine, absents
du CREATE initial historique. Le nouveau mode remplace les contraintes anciennes
par les contraintes finales reçues dans le **conteneur seulement**, et vérifie
ces deux permissions via la RPC. Les versions de référence anciennes restent
intactes pour traçabilité.

## Ordre déterministe de création — sous-ensemble seulement

| Étape | Objets et prérequis |
| --- | --- |
| 0 | Supabase réel, rôles, auth.users/auth.uid, version/extensions ; jamais recréer ces objets plateforme dans une baseline métier |
| 1 | Schéma private ; profiles avec ses colonnes/PK/UNIQUE/FK Auth/checks |
| 2 | profile_departments puis profile_permissions puis deleted_user_identities puis user_admin_events, leurs contraintes/index exacts ; FK vers profils/Auth déjà disponibles |
| 3 | current_role, is_admin, is_operational_department ; puis sync_legacy_profile_permissions et user_has_department (tables requises disponibles) |
| 4 | Fonctions de triggers profils et deux RPC administratives ; audit exige le type ligne deleted_user_identities ; RPC exigent profils, permissions, départements, audit et helpers |
| 5 | RLS/policies/ACL des cinq tables, fonctions et schémas ; trois triggers profiles, handle_new_user et enfin trigger applicatif auth.users |
| 6 | Comptes fictifs via GoTrue, provisioning, tests JWT ; données après schéma/sécurité prêts |

Les ACL/default privileges doivent être appliquées de façon contrôlée, idéalement
dans une installation transactionnelle revue, sans fenêtre d'exposition de droits
temporaires. Cet ordre est local au sous-ensemble, **pas une baseline globale** :
les fonctions nécessaires aux defaults/checks d'autres tables imposeront leurs
propres dépendances. Orders exige au préalable profiles et sa PK, l'enum et sa
séquence. Son DDL final et les helpers de commandes ultérieurs ne sont pas
reconstruits en rejouant la première migration sur un état final.

## Tests exécutés et résultats

```sh
node tests/mission19-profile-security.cjs --mission20
node tests/mission19-profile-security.cjs
```

Le mode 2.0 réutilise les tests 1.9 sur le contrat enrichi : PK réelle,
index partiel, quinze contraintes, quatorze index, sept policies et cinq helpers.
Les CREATE de colonnes précédemment reçus sont complétés avec le catalogue
actuel ; rien n'est installé dans les migrations actives. Le helper de test
tests/helpers/mission20-profile-contract.cjs assemble ces fragments uniquement
dans le conteneur PostgreSQL jetable sans réseau.

Exécution effective locale réussie : mode `--mission20`, mode 1.9 historique,
`node tests/mission18-sources.cjs`, `node --check` sur les deux CJS modifiés/ajoutés
et `git diff --check` (ajouts inclus). Les conteneurs sont supprimés après les tests.
La suite 1.8 garde volontairement son contrat ancien partiel : son diagnostic de
fonctions de triggers absentes ne signifie pas que les références 1.9 ont été perdues.

Résultats :

- Comptages et définitions appliquées, hashes de preuves et cinq MD5 canoniques
  validés ; contrainte partielle refuse deux primaires en 23505.
- Changement de primaire sans violation temporaire ; répétition sans doublon,
  transitions employé/responsable/admin et état inactif caractérisés.
- Les RPC suivent les vraies contraintes de permissions, refusent les valeurs
  invalides et restaurent les données après erreur transactionnelle.
- Audit de suppression avec identité archivée, et absence d'audit sans identité
  caractérisés. L'index unique final sur former_user_id non NULL interdit les deux
  archives du même utilisateur qu'autorisait la fixture partielle 1.9 : le mode
  2.0 teste maintenant ce refus et utilise une seule archive valide.
- Les protections des deux comptes fictifs distincts et leurs limites de mission
  1.9 sont rejouées, y compris suppression privilégiée dans une transaction annulée.
- RLS : lecteur ordinaire ne lit pas les départements d'autrui ; INSERT client
  dans les identités supprimées refusé, même admin utilisateur.
- ACL : profile_permissions autorise SELECT mais pas DML direct à authenticated,
  même si sa policy ALL reconnaît l'admin ; la RPC SECURITY DEFINER reste distincte.
- Pas de récursion dans le chemin des triggers fournis vers ces quatre tables,
  conformément à l'absence de triggers annexes signalée ; pas de conclusion sur
  tout le schéma non reçu.

**Limite de version :** MAINTAIN (`m`) figure dans les ACL reçues, mais n'existe
pas sur le PostgreSQL 16 disponible. Les autres droits sont testés explicitement ;
aucun succès de réplication intégrale de ces ACL n'est annoncé. Vérifier la version
cible et reprendre ce droit sur la version compatible, sans le supprimer du modèle.

## Deux points de sécurité à examiner, sans correction silencieuse

1. **TRUNCATE n'est pas filtré par RLS.** Les ACL reçues accordent ce droit à
   authenticated sur les quatre tables. La sonde montre qu'un SET ROLE
   authenticated peut vider profile_departments malgré ses policies, puis annule
   la transaction. Cela ne prouve pas qu'un utilisateur du navigateur dispose
   d'un endpoint capable de lancer TRUNCATE : REST ne fournit pas automatiquement
   une commande SQL arbitraire. Revoir droits et surfaces exposées avant GO.
2. **sync_legacy_profile_permissions est SECURITY DEFINER, ACL NULL et sans garde
   de l'appelant.** Avec USAGE private du contrat historique, un utilisateur SQL
   authenticated, même inactif, peut resynchroniser les permissions d'un autre
   profil. Le test le confirme sur le responsable fictif. Il ne prouve pas que
   private soit exposé dans PostgREST ou accessible via une RPC publique arbitraire.
   Examiner l'exposition et les appelants avant de décider d'un durcissement.

Aucune révocation ou modification du corps reçu n'est faite. Une future correction
de sécurité nécessite une décision distincte du pilote et une revue des usages.
user_has_department retourne aussi true pour une affectation d'un profil inactif :
ce helper d'appartenance ne remplace pas une vérification d'activité.

## Couverture restante estimée du snapshot global

| Catégorie | Documenté par références finales reçues | Reste à couvrir |
| --- | --- | --- |
| Tables | profiles + les quatre tables actuelles, avec réserve ACL/version | 19 autres DDL finaux complets |
| Policies | 2 profils + 7 actuelles | Environ 54 sur les 63 annoncées |
| Triggers publics | 3 profils | Environ 13 sur les 16 annoncés, plus dépendances |
| Trigger Auth | Reçu, avec handle_new_user | Validation réelle du provisioning et ACL de plateforme |
| Fonctions | Environ 18 signatures finales documentées, nouvelles sources recoupées | Environ 38 sur les 56 annoncées, à confirmer par inventaire des signatures/overloads |
| Séquences/types/extensions | Noms et éléments partiels connus | Paramètres/OWNED BY/ACL, types et extensions complets/versionnés |

Les 19 tables restantes : activity_events, app_settings, article_categories,
articles, checklist_run_items, checklist_runs, checklist_suggestions,
checklist_template_items, checklist_templates, department_content, order_lines,
orders, profile_card_preferences, proposal_notifications, suppliers, team_banners,
temperature_equipment, temperature_readings, temperature_rounds.

Ce sont des estimations de **couverture documentaire**, pas un calcul de réussite
de reconstruction. Des migrations locales définissent certains objets mais ne
prouvent pas leur état final. Des ACL/default privileges/objets non comptés restent
à vérifier ; les totaux ne suffisent pas.

## Collecte restante non destructive

Ne pas redemander les quatre tables ou les cinq helpers en morceaux : ils sont
reçus. Priorité à **un snapshot final schema-only public/private complet et revu**,
avec inventaire par identités/signatures et propriétés/ACL, afin de comparer les
objets déjà documentés et compléter les 19 autres tables et objets non couverts.
Le trigger Auth reçu est un objet applicatif à conserver séparément des tables
Auth plateforme, sans exporter utilisateurs ni données.

La voie reste un export via outil autorisé en lecture seule, syntaxe vérifiée
dans `supabase db dump --help` quand la CLI sera disponible. Aucun nouveau retry
réseau ni db pull/fetch ici. Refuser toute proposition repair/push/historique.
Pas de token dans le chat. Faire relire fonctions/defaults/commentaires avant
partage/Git ; maintenir les identités de test distinctes sans approbation permanente.
Un fichier de requêtes ou des totaux ne remplacent pas les sorties DDL complètes.

## GO / NO-GO

**GO local :** contraintes réelles du sous-ensemble et helpers testés ; poursuivre
la collecte globale et la revue des deux points SQL de sécurité.

**NO-GO distant :** pas de baseline complète, pas de branche validée, pas de reset
Supabase réel ni de test GoTrue/PostgREST/JWT ici. Le schéma final complet, la
version cible et ces tests restent nécessaires. Aucune application, migration
active, production, branche Test, LUnion Connect ou Vapi modifiés. Aucun push,
déploiement, reset distant ou début d'éditeur graphique Réservations.
