# Mission 1.7 — premier échec de bootstrap

Branche Git feat/reservations-foundations, départ 8dbc4f5, travail entièrement
local. La branche Supabase stopflow-reservations-test, référence
ojqbzyrwuyjggbyphdqi, et son état MIGRATIONS_FAILED sont **rapportés par le pilote**,
sans nouvelle inspection distante par Codex. Parent Production :
gjwvquhoecfikjorapud. Aucun fichier de connexion ou de liaison n'est ajouté.

## Cause démontrée, portée et non-conclusions

Le journal fourni indique `relation "public.profiles" does not exist` pendant
CREATE TABLE orders avec FK vers profiles(id). La cible de la FK doit exister
avant sa création ; une clé PK/UNIQUE appropriée doit aussi être présente.
Supabase opérationnel ne fournit pas automatiquement notre table applicative
profiles : auth.users est plateforme, profiles et handle_new_user sont applicatifs.

Le dépôt ne contient aucune création initiale complète de profiles dans ses
migrations actives ; seules ses colonnes finales sont fournies comme référence.
La première migration distante nommée create_shared_orders_workflow ne figure
pas en SQL dans le dépôt. Sa définition exacte n'a pas été fournie. Le journal
établit une dépendance manquante à cet instant, **pas** que déplacer un fichier
existant suffit, ni qu'une transaction partielle ou une réparation d'historique
est nécessaire. Une création manuelle initiale non historisée est une hypothèse,
pas un fait établi. Aucun contenu absent n'est inféré du nom d'une migration.

Les deux chemins historiques ne doivent pas être confondus :

- Distant : premier échec rapporté sur orders -> profiles.
- Local : premier fichier disponible = fournisseurs, déjà dépendant d'Auth,
  private et is_active_user. Le rejeu local antérieur reste lui aussi bloqué,
  mais ne reproduit pas l'intégralité de l'historique distant.

## Dépendances initiales à respecter dans la correction

| Prérequis | Dépendants / contrôle nécessaire |
| --- | --- |
| Plateforme Supabase, rôles, auth.users/auth.uid | profils, identités d'audit, fonctions utilisateur ; ne pas réimplémenter Auth |
| Schéma private, USAGE et propriétaires revus | helpers privés, fonctions/policies qui les appellent |
| Types/enum et séquences exacts | defaults des tables, orders.status, numérotation des commandes |
| profiles complet, id uuid avec PK/UNIQUE et FK Auth **si confirmée par DDL** | FK orders, membership Réservations, helpers d'activité/rôle |
| current_role/is_active_user/is_admin et autres helpers, selon dépendances réelles | policies, RPC et permissions ; definitions connues ne suffisent pas sans ACL |
| orders et autres tables initiales exactes | lignes, types composites de retour, fonctions de commandes |
| profile_departments/profile_permissions et helpers correspondants | permissions métiers et isolation par département |
| handle_new_user + trigger applicatif auth.users | provisioning réel de chaque compte fictif |
| Fonctions, contraintes différées, index, RLS, grants/revokes finaux | sécurité effective, puis tests réels utilisateur |

Ce tableau est un ordre de dépendances à vérifier, pas un ordre SQL universel :
une fonction utilisée par un DEFAULT/CHECK peut devoir précéder sa table ; les
cycles doivent être résolus à partir des définitions exactes. Ne pas forcer
check_function_bodies=false, retirer les FK ou désactiver RLS pour passer.

## Correction reproductible préparée, application NO-GO

**Stratégie retenue : baseline finale revue avant Réservations**, sous une
nouvelle filière de bootstrap destinée au test uniquement. Conserver les
migrations historiques intactes pour provenance, ne pas modifier leur timestamp,
ne pas prétendre qu'une migration passée a été appliquée et ne pas les rejouer
après le snapshot final. Ne pas créer un faux 0000_initial.sql avec les seules
colonnes profiles : cela déplacerait l'échec et omettrait les protections.

La filière existe dans baseline/README.md et STATUS.json ; elle reste bloquée
tant que les pièces ci-dessous manquent. Aucune baseline exécutable complète ne
peut être préparée honnêtement aujourd'hui. L'échec distant ne résout pas les
manques du dossier : 19 tables ont leurs colonnes seulement, cinq autres n'ont
pas leur état final complet ; contraintes, ACL/RLS et plusieurs fonctions manquent.

### P0 — collecte groupée à faire par le pilote en lecture seule autorisée

1. **DDL final public/private complet** : export schema-only revu (sans lignes,
   valeurs courantes de séquences, identités privées ou secrets), ACL et
   dépendances comprises. À minima vérifier particulièrement profiles : colonnes,
   PK/UNIQUE, toutes FK dont Auth, checks rôle/département, index, defaults,
   propriétaires, RLS, grants et triggers. Les colonnes déjà reçues ne suffisent pas.
2. **handle_new_user() et on_auth_user_created** complets, leurs privilèges et
   dépendances. Distinguer les objets StopFlow des objets plateforme Auth.
3. **56 fonctions finales et protections revues** : les neuf références connues
   sont utiles, mais ACL/overloads et les autres corps finaux restent à obtenir.
   Quatre fonctions de comptes protégés exigent une correspondance fictive
   distincte explicitement approuvée ; ne pas copier des identités privées dans
   Git, ne pas les neutraliser et ne pas fusionner leurs identités en un marqueur.
4. **Contraintes/index/63 policies/16 triggers publics**, schémas/default
   privileges/ACL de colonnes, cinq séquences (paramètres + OWNED BY, sans valeurs
   Production), types/enum/extensions et versions, configuration Auth/PostgREST
   utile sans secrets. Requêtes précises dans baseline/README.md et
   EXTRACT-FINAL-STATE.sql ; demander les résultats complets, pas les totaux.
5. Pour expliquer l'historique, conserver la **première migration distante en
   SQL** et le log contextualisé avec version/étape, après revue des littéraux.
   Ce contenu est nécessaire à la reproduction exacte de cet échec historique,
   mais pas à inventer un préambule. Un export final complet est prioritaire
   pour la voie snapshot ; inutile de récupérer tous les scripts historiques si
   cette voie est approuvée. Aucune lecture de statements contenant données
   personnelles ne doit être publiée brute.

### P1 — vérification avant un futur GO

1. Réception/revue des sources, provenance + SHA256, registre d'adaptations
   fictives, analyse complète des dépendances et propriétaires.
2. Assemblage d'une baseline **test** avec ordre déterministe, puis installation
   depuis zéro sur Supabase local avec Auth/GoTrue et PostgREST réels. Le conteneur
   PostgreSQL actuel ne remplace pas cette étape. Ne rien lier au projet parent.
3. Vérifier structure finale, toutes ACL/policies/triggers et provisioning réel
   de comptes fictifs ; tester permissions avec vrais JWT, pas service_role.
4. Appliquer seulement Réservations, contrôles 10/30 et matrice de tests de
   SUPABASE-TEST-BRANCH.md : deux établissements, CRUD, refus, concurrence,
   audit/persistance et frontend. Aucune partie 2.
5. Présenter diff, empreintes, logs et résultats au pilote. **Autorisation
   distincte obligatoire** avant toute installation/recréation de branche Test.
   Aucun reset, db push, migration repair ou modification de Production.

## Tests locaux et limites

`tests/bootstrap-dependencies.cjs` utilise des **sondes synthétiques minimales**
hors migrations actives : reproduit 42P01 sur une FK orders -> profiles absent,
42830 si profiles.id n'est pas unique, vérifie la dépendance à Auth et ses FK,
la persistance locale et les échecs de schéma/helper privé absents. Ces tables ne
représentent pas les définitions de Production et ne sortent pas du conteneur
jetable sans réseau. Aucune référence SQL reçue n'est appliquée directement.

Les tests antérieurs de reconstruction et du dossier sont rejoués. Leurs
blocages attendus sont des diagnostics réussis, **pas une baseline reconstruite**.
La migration distante exacte n'est pas exécutée car son SQL manque ; aucun
test cloud, GoTrue/PostgREST ou permissions de la branche réelle n'est annoncé.

Résultats effectifs locaux du 17 octobre 2026 :

| Commande | Résultat |
| --- | --- |
| node tests/bootstrap-dependencies.cjs | PASS : erreurs de dépendance attendues et réussite du contrat synthétique ordonné |
| node tests/schema-reconstruction.cjs | PASS : diagnostic BLOCKED_AS_EXPECTED, module uniquement sur contrat simulé |
| node tests/schema-dossier.cjs | PASS : intégrité, rapprochement, readiness bloquée, requêtes locales |
| node --check tests/bootstrap-dependencies.cjs | PASS |
| git diff --check, y compris ajouts | PASS |

Aucun code applicatif ni migration historique/Réservations modifié. Le changement
livre le test de non-régression de dépendance et la procédure de correction
conditionnelle ; il ne prétend pas corriger l'historique distant à ce stade.

## Décision

**GO :** collecte autorisée en lecture seule des DDL finaux, revue des protections,
construction et tests locaux à partir des sources réellement reçues.

**NO-GO :** nouvelle tentative de reconstruction/install, réparation de l'historique,
application Réservations ou déploiement sur Test à partir des seuls fichiers actuels.
Production et Test ne sont pas touchés ; pas de Vapi, LUnion Connect ni partie 2.
