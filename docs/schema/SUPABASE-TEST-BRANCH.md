# Préparer stopflow-reservations-test — 17 octobre 2026

Branche Git locale feat/reservations-foundations, départ 794c0e4. Le passage Pro
est rapporté par l'utilisateur ; aucune vérification du compte/plan ni opération
distante n'est réalisée ici. Le nom Supabase prévu est
**stopflow-reservations-test** ; il est distinct du nom de branche Git et ne
constitue pas une identité de connexion. Aucun fichier Supabase de liaison à
Production, workflow automatique ou seed n'est ajouté.

## Ce qui est prêt / limites

La migration 20261017120000_stopflow_reservations_foundation.sql est additive,
transactionnelle, sans seeds. Sept tables, huit fonctions, quatre RPC publiques,
permissions explicites par établissement ; aucun administrateur global ne gagne
un accès implicite. Elle réutilise profiles et Auth sans changer leurs permissions.
Elle n'est pas idempotente : ne pas la rejouer si ses objets existent déjà.

Compatibilité **conditionnelle** avec les références réelles fournies : profiles.id
est uuid, actif boolean, role text. Les FK exigent en outre une PK/UNIQUE valide
sur profiles.id, dont le DDL final n'est pas fourni. Il faut le schéma private,
auth.uid(), les rôles de plateforme, leurs permissions et un propriétaire de
migration disposant des droits nécessaires. Le provisioning réel profiles/Auth,
les ACL par défaut et les fonctions de protection de comptes restent à valider.
La réussite PostgreSQL sur un contrat simulé n'est pas une validation cloud.

La baseline reste BLOQUÉE selon baseline/STATUS.json : le plan Pro ne complète
pas les migrations absentes. Supabase peut reconstruire sa branche à partir de
l'historique distant, du dépôt ou d'une méthode spécifique proposée dans son UI :
**ChatGPT doit relever la méthode effective, ses logs et le résultat**, sans
supposer un clonage complet, des données, des comptes Auth ou des réglages.
La complétude du dossier local et celle de la branche obtenue sont deux questions
distinctes. Une branche réellement reconstruite peut lever le blocage de test
cloud après inspection ; elle ne rend pas automatiquement notre baseline locale complète.

## Procédure après création par ChatGPT (autorisation distincte)

1. **Identité et isolation.** Noter nom, ID de branche, parent, référence enfant,
   URL API, statut et mode de reconstruction. Vérifier dans le Dashboard/outils
   autorisés que la référence enfant et ses endpoints sont distincts de
   gjwvquhoecfikjorapud et de LUnion Connect. Arrêter si la connexion reste celle
   du parent, si l'état est en erreur ou si la cible est ambiguë. Ne partager que
   les paramètres publics. Confirmer aussi coût, durée de vie et absence de
   synchronisation/merge/deploy automatique vers Production. Ne pas modifier
   l'intégration du projet parent pour contourner un blocage.
2. **Photographie avant application.** En lecture seule sur l'enfant vérifié,
   exécuter BRANCH-PREFLIGHT.sql : 24 tables attendues présentes (relkind r/p), RLS
   activée, profils et contraintes, plateforme/Auth et trigger applicatif. Puis
   contrôler 10-check-base.sql et obtenir le catalogue 40. Le contrôle 10 seul
   ne vérifie pas toutes les tables (notamment activity_events) ni toutes les ACL.
   Comparer fonctions par signatures, policies/ACL/triggers aux preuves : 56
   fonctions, 63 politiques, 16 triggers publics et cinq séquences sont des
   repères, pas une preuve suffisante par comptage. Examiner les différences
   intentionnelles. Vérifier séparément settings Auth/PostgREST/Edge Functions,
   emails, intégrations et éventuelles données copiées, sans exposer de données.
3. **Décider sur le résultat.** Si schéma complet, conserver son export revu et
   ses SHA256 pour terminer aussi la baseline locale. Si vide/partiel, arrêter
   avant toute migration Réservations et suivre le diagnostic ci-dessous. Ne pas
   installer les 19 références de colonnes comme solution de remplacement.
4. **Installation enfant seulement, après autorisation.** Si aucun objet
   Réservations n'existe, appliquer une fois la migration dédiée, avec arrêt sur
   erreur, puis le contrôle 30. Si des objets existent, vérifier l'empreinte et le
   DDL complet ; ne pas supprimer/rejouer ni réparer l'historique automatiquement.
   Une présence partielle exige un diagnostic avant toute nouvelle écriture.
5. **Auth fictif.** Créer par Auth/GoTrue enfant les comptes fictifs, contrôler
   trigger handle_new_user et profils actifs. Vérifier la politique d'inscription
   avant d'ouvrir un frontend. Ne pas copier comptes/JWT/mots de passe du parent.
   Isoler les envois d'emails et intégrations. Provisionner explicitement les
   memberships de deux établissements fictifs avec un mécanisme administratif
   autorisé sur l'enfant ; ce provisioning n'est pas un test RLS utilisateur.
6. **Tests réels.** Exécuter la matrice ci-dessous avec de vrais JWT utilisateur
   et REST/RPC de l'enfant, puis recharger/reconnecter. Conserver résultats,
   statuts HTTP/SQLSTATE et identifiants fictifs, sans tokens dans les rapports.
7. **Frontend, plus tard.** Utiliser exclusivement la référence/clé publique de
   l'enfant dans STOPFLOW_ENVIRONMENT=development, origines exactes et futur
   projet Vercel distinct, conformément à docs/environments. Les contrôles locaux
   refusent Production et l'absence de configuration. Aucune Preview n'est créée
   ici ; toute publication/déploiement exige une autorisation distincte.

## Matrice d'acceptation réelle

| Domaine | Test et résultat attendu |
| --- | --- |
| Structure | 24 tables de base puis 7 Réservations ; contraintes/FK/index, fonctions, RLS, ACL, trigger Auth vérifiés par définitions |
| Auth | Connexion, reconnexion et refresh via Auth enfant ; profil généré ; JWT parent jamais utilisé comme secours |
| Anon / inactif | RPC et données protégées refusées ; aucune création par accès direct |
| Sans membership | Aucun établissement accessible, même pour un admin global |
| Lecteur A | Lecture A autorisée, mutations refusées ; rien de B |
| Gestionnaire salles A | CRUD/archivage salles A autorisé selon contrat ; création de tables refusée sans permission dédiée |
| Gestionnaire tables A | Tables A autorisées selon contrat ; gestion salles refusée sans permission dédiée |
| A / B | IDs étrangers forcés en RPC/REST refusés, FK inter-établissements effectives ; aucun audit étranger lisible |
| Validation | Noms vides, doublons actifs, capacités/formes invalides refusés sans mutation partielle |
| Concurrence | Deux clients avec même version : un succès, un conflit ; aucune écriture perdue |
| Audit / persistance | Une mutation donne l'audit attendu, données conservées après rechargement/reconnexion |
| Tables graphiques | Structures/layouts et permissions existantes vérifiées, sans développer l'éditeur partie 2 |
| Réseau / interface | Échec RPC sans faux succès ; navigation Réservations clic/Entrée/Espace/toucher, desktop puis iPhone réel |
| Historique existant | Smoke tests nécessaires profils/commandes/catalogue sur données fictives enfant, aucune donnée Production |

Ce module est une fondation salles/tables/layouts : ne pas inventer un parcours
de réservation client/calendrier qui ne fait pas partie de la partie 1.

## Diagnostic si reconstruction impossible

1. Capturer statut enfant, source de migrations, première erreur exacte,
   timestamp/version/fichier, SQLSTATE et objets présents. Retirer tokens/DSN et
   littéraux privés des logs avant partage. Inspecter sans relancer en boucle.
2. Distinguer échec de plateforme/provisioning, de connexion/rôle, de dépendance
   SQL et de migrations. 3F000/42P01/42883 indiquent notamment schéma/table/fonction
   absents ; 42501 peut signaler droits ou refus métier ; 42710/42P07 objet déjà
   créé ; 23503/23505 incohérence de données/FK/unique. Le message et le contexte
   priment sur cette liste. Ne pas désactiver RLS ou une protection pour avancer.
3. Comparer l'historique **de l'enfant** à la liste des 45 entrées et à
   baseline/STATUS.json : 18 candidats de même nom, 13 versions différentes,
   27 noms distants sans nom local exact. Pas de preuve d'équivalence du contenu.
   Ne jamais lancer db push/reset ou migration repair sur le parent ; ne pas
   marquer une migration appliquée simplement pour ignorer une erreur.
4. Si les migrations locales seules sont la source, le rejeu déjà testé échoue
   dès les helpers historiques manquants. Si l'historique distant est la source,
   son succès doit être constaté, pas déduit du plan Pro. Demander le DDL final
   manquant selon baseline/README.md si le schéma reste incomplet.
5. Sur enfant vide/jetable uniquement, après nouvelle décision explicite, choisir
   reconstruction historique complète démontrée **ou** baseline finale revue puis
   seule migration Réservations. Ne jamais combiner snapshot final et rejeu des
   migrations historiques, ni changer Production pour faire réussir l'enfant.

## Résultats locaux de cette préparation

Les résultats effectifs et SHA de livraison sont communiqués dans le rapport.
Le 17 octobre 2026, exécutions réussies :

- tests/reservations-postgres.cjs : 62 contrôles, migration réelle et contrats
  Auth/profils simulés, CRUD/RLS/concurrence/persistance.
- tests/schema-dossier.cjs : provenance, rapprochement et 13 SELECT du dossier
  sur PostgreSQL synthétique ; baseline toujours déclarée bloquée.
- tests/environment-isolation.cjs : 78 contrôles, refus Production et absence
  de repli, artefacts publics seulement.
- BRANCH-PREFLIGHT.sql exécuté sur un PostgreSQL vide isolé : les 24 lignes
  attendues signalent les relations absentes, plateforme absente signalée,
  aucune erreur de syntaxe ni écriture.
- git diff --check : réussi, y compris fichiers ajoutés.

Les tests utilisent PostgreSQL 16 isolé et backend/Auth simulés, pas Supabase
cloud. Aucun bug applicatif établi par cette revue, donc aucun correctif métier,
migration ou configuration de déploiement n'est modifié.
