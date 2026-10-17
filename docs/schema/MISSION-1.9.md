# Mission 1.9 — profils, comptes protégés et dépendances

17 octobre 2026. Départ 0a0a6d6, branche feat/reservations-foundations propre.
Les quatre fichiers du ZIP ont été lus. Copies intactes et empreintes SHA256
dans references/mission-1.9/PROVENANCE.json. Références retranscrites et sanitisation
déclarées par le pilote, **pas un export machine bit-à-bit ni une validation
distante par Codex**. Aucune opération distante pendant cette mission, y compris
aucun nouveau téléchargement de CLI. Le blocage CLI de mission 1.8 n'est pas
résolu/vérifié à nouveau ; GoTrue/PostgREST restent non testés.

## Ce qui est désormais résolu

Les trois fonctions des triggers profiles sont disponibles : audit_profile_delete,
sync_primary_assignment et protect_core_accounts. protect_main_admin et les deux
RPC administratives sont aussi reçues. **Ne pas les redemander individuellement**,
ni profiles, handle_new_user ou la première migration déjà reçus.

Les six signatures sont compilées localement ; owner postgres, SECURITY DEFINER
et search_path vide contrôlés sur les objets de test. Les privilèges documentés
dans README sont distingués des CREATE FUNCTION, qui ne les reproduisent pas
seuls. ACL NULL pour trois fonctions signifie les privilèges par défaut (EXECUTE
PUBLIC pour ces fonctions dans le test), pas absence de droits. Le droit d'appeler
une fonction trigger n'est pas pour autant une RPC ordinaire exploitable.
protect_core_accounts est limité au propriétaire ; RPC administratives accordées
à authenticated/service_role conformément à la référence, avec is_admin interne.

| Fonction | Dépendances / statut |
| --- | --- |
| stopflow_060_audit_profile_delete() | Type ligne deleted_user_identities, champs former_user_id/deleted_at/deleted_by/id ; user_admin_events et ses contraintes/ACL finaux restent à fournir |
| stopflow_060_sync_primary_assignment() | profile_departments, cible unique ON CONFLICT(profile_id,department), is_operational_department(text) ; contrainte finale exacte à exporter |
| protect_core_accounts() | OLD/NEW.email/role/actif, deux emails fictifs distincts ; associé au BEFORE UPDATE profiles reçu |
| protect_main_admin() | Ancien contrôle du seul admin ; aucun des trois triggers reçus ne l'appelle, ne pas l'attacher automatiquement |
| admin_set_user_access(uuid,text,text,text,boolean,text,text[]) | profiles, auth.users.invited_at/auth.uid, profile_departments, user_admin_events, is_admin, is_operational_department, sync_legacy_profile_permissions ; version finale de ce dernier helper à comparer à la version locale utilisée |
| admin_set_user_profile_permissions_070(uuid,text,text,text,boolean,jsonb,text) | profiles, profile_permissions avec contraintes clés/scopes/UNIQUE, profile_departments, user_admin_events, is_admin/auth.uid ; retour jsonb, tableau JSON validé |

RETURNS profiles non qualifié dans la première RPC impose le bon search_path de
création ou une qualification revue dans la baseline finale, comme le trigger
Auth reçu auparavant. Le search_path vide d'exécution est une propriété distincte.
Les propriétaires et ACL effectivement créés dans le test ne constituent pas une
nouvelle vérification du catalogue Production.

## Résultats de sécurité — portée exacte

| Cas local | Résultat observé |
| --- | --- |
| Deux identités fictives | admin-test@example.invalid et responsable-test@example.invalid distinctes et cohérentes dans les quatre fonctions concernées |
| UPDATE direct protégé : rôle/actif/email | Refus P0001 pour les deux comptes, même via un autre admin |
| RPC demandant employe/inactif sur compte protégé | Appel réussi mais rôle/actif forcés aux valeurs protégées ; pas un refus RPC |
| Prénom et nom des comptes protégés | Modification autorisée ; le mot « renommé » du message concerne l'email, pas ces champs |
| Permissions du responsable protégé | La RPC moderne accepte une liste vide ; la protection du rôle/actif ne fige pas ses permissions granulaires |
| RPC par responsable, employé, admin inactif | Refus 42501 ; anon refusé par ACL |
| Opérations administratives ordinaires | Modifications/désactivation/renommage email autorisés pour l'admin ; contraintes valides respectées |
| Permissions JSON invalides | Erreur et rollback des suppressions de permissions ; JSON non-tableau refusé |
| lunchs.manage | lunchs.view ajouté automatiquement par la RPC moderne |
| Exécution privilégiée DELETE sur compte protégé | Le trigger BEFORE UPDATE ne l'empêche pas ; test en transaction annulée |

L'ancienne protect_main_admin est aussi exercée sur une table de sonde distincte,
jamais attachée à profiles : elle bloque l'admin mais laisse modifier le
responsable, conformément à son corps. Elle ne remplace pas protect_core_accounts.

**Décision métier à confirmer :** la référence ne garantit pas l'impossibilité
de supprimer un compte protégé avec des privilèges serveur. Le DELETE utilisateur
peut être bloqué par RLS et le parcours de suppression peut avoir une garde
supplémentaire (non vérifiée ici). Ne pas annoncer une faille exploitable en
Production, mais ne pas annoncer une protection SQL contre DELETE non plus.
Si l'exigence vise aussi suppression/prénom/nom, elle dépasse ce que les corps
reçus mettent en œuvre : faire décider le pilote, sans inventer de nouvelle garde.

## Départements, audit et absence de récursion observée

- Sans contrainte unique sur (profile_id,department), mise à jour employé échoue
  en **42P10** ; la modification du profil est annulée. Le test ajoute une
  contrainte nommée fixture_only_department_unique **dans le conteneur seulement**,
  comme prérequis de la sonde. Cela ne remplace pas son DDL final de Production.
- Deux mises à jour identiques ne créent pas de doublon ; changement salle vers
  cuisine bascule le primaire ; passage responsable/admin retire les primaires.
- Désactiver un employé conserve ses lignes et son flag is_primary ; ce trigger
  ne nettoie pas ces affectations. Les contrôles d'accès doivent vérifier actif
  indépendamment. Pas de modification du comportement livré.
- La fonction de synchronisation écrit profile_departments, pas profiles : pas
  de boucle sur les trois triggers fournis. Succès avec statement_timeout=3s.
  D'autres triggers éventuels de profile_departments ne sont pas fournis : pas
  de preuve d'absence globale de récursion dans tout le schéma réel.
- Audit DELETE : dernière identité archivée choisie par deleted_at, acteur repris,
  target_user_id NULL et action delete vérifiés. **Sans identité archivée, aucun
  événement n'est créé par cette fonction.** Ce n'est pas un journal universel
  de toutes suppressions ; vérifier le parcours serveur qui archive l'identité.
  Les contraintes/ACL finaux des deux tables d'audit restent à connaître.

## Tests locaux effectivement exécutés

`node tests/mission19-profile-security.cjs` : sources et hashes, six fonctions,
protections, droits/RPC, synchronisation, audit et limites ci-dessus. PostgreSQL
16 isolé sans réseau, Auth simulé ; les comptes .invalid sont temporaires.
Le test utilise le CREATE profiles reçu, les colonnes reçues des tables annexes,
le CREATE profile_permissions historique et les deux helpers locaux explicitement
sélectionnés. Aucun script historique complet ni identifiant privé n'est recopié
dans une nouvelle baseline. Tables annexes protégées par RLS sans policies
positives inventées ; sous-ensemble de grants profiles pour tester ses policies
reçues. Aucun GRANT global ou USING(true) ajouté pour contourner un refus.

Le test ne crée pas une baseline installable ; il reste hors migrations. La
correspondance fictive est autorisée **uniquement pour cette simulation**, pas
adoptée définitivement. Les références sont conservées hors paquet de déploiement.
Les suites mission18-sources et schema-dossier sont rejouées pour vérifier les
preuves antérieures ; contrôle syntaxe et diff également exécutés.

Exécution effective le 17 octobre 2026 :

| Contrôle | Résultat |
| --- | --- |
| node tests/mission19-profile-security.cjs | PASS, y compris les limites documentées et l'ancienne garde sur sonde séparée |
| node tests/mission18-sources.cjs | PASS, diagnostic antérieur sur contrat partiel conservé |
| node tests/schema-dossier.cjs | PASS, intégrité et requêtes locales |
| node --check tests/mission19-profile-security.cjs | PASS |
| git diff --check, y compris ajouts | PASS |
| Scan des nouvelles pièces | Seulement les deux emails fictifs attendus ; aucun motif JWT/token serveur/clé privée détecté |

Les conteneurs de test sont supprimés après exécution. Aucune suite frontend
n'est rejouée, car aucun code applicatif n'est changé. Les succès de tests
caractérisent les sources reçues ; ils ne signifient pas que toutes les
protections métier envisagées sont assurées.

## Dernier lot nécessaire — en une collecte revue

1. **Snapshot final schema-only public/private complet**, avec contraintes,
   index, RLS, ACL/default privileges, propriétaires, types, séquences/ownership,
   extensions et versions. Les références partielles des 23 autres tables ne
   permettent toujours pas de reconstruire l'état final exact.
2. En particulier : contrainte UNIQUE/PK profile_departments utilisée par
   ON CONFLICT ; autres contraintes/FK/index/policies de cette table et de
   profile_permissions, deleted_user_identities, user_admin_events. Triggers
   éventuels supplémentaires, ACL de schémas/colonnes/séquences et dépendances.
3. **Fonctions finales restantes et helpers transitifs**, notamment
   sync_legacy_profile_permissions et is_operational_department à comparer aux
   versions locales, pas à réinventer. Les fonctions déjà fournies ne sont pas
   à redemander séparément ; confirmer leur inclusion/ACL dans le snapshot unique.
4. Approbation du propriétaire de la correspondance fictive distincte avant
   installation durable. Confirmer le contrat métier de suppression/renommage
   et le parcours qui archive deleted_user_identities avant suppression.
5. Outillage local Supabase opérationnel, puis reset complet avec Auth/GoTrue et
   PostgREST réels, comptes créés via Auth, tests JWT et RLS. PostgreSQL seul ne
   valide ni les sessions, ni les Edge Functions, ni le schéma final.

Collecte future par le lecteur autorisé seulement : privilégier un export
schema-only avec `supabase db dump` **après vérification de son --help** et de la
cible/mode lecture. Pas de commande distante exécutée ici ; pas d'option de
connexion supposée correcte sans CLI disponible. db pull peut proposer des
changements d'historique : ne pas accepter repair/push/confirmation de mutation.
Ne pas exporter données, utilisateurs, valeurs de séquences ou secrets. Revoir
corps/commentaires/defaults avant partage et avant Git, même après sanitisation.

## GO / NO-GO

**GO** : poursuivre la préparation à partir du snapshot final revu et des
décisions métier. Les six corps et les identités distinctes sont testables.

**NO-GO** : baseline complète, usage de la branche cloud, migration distante,
déploiement ou partie 2. Aucune nouvelle fonction de protection inventée ; aucune
correspondance définitive approuvée par ce test. Aucune écriture distante,
suppression/reset cloud, intervention Production/LUnion Connect/Vapi, push ou
déploiement. Branche Git dédiée uniquement ; SHA local communiqué à la livraison.
