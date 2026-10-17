# StopFlow — environnements séparés (mission 1.5)

Préparation locale depuis `1bf16c4ad61bf27620d06d65962bff42d4ad39b0`, branche
`feat/reservations-foundations`. Aucun push, déploiement ou appel administratif
Supabase/Vercel. La partie 2 n'est pas commencée.

## Audit des références et frontières

| Emplacement | Constat / traitement |
| --- | --- |
| index.html, anciennement lignes 317–318/389 | Unique URL et clé publique du client navigateur ; retirées de l'amorçage et déplacées dans un profil explicite. Le client unique reste partagé par les modules. |
| stopflow-environment-config.js | Profil public de compatibilité, URL/clé identiques à 1bf16c4. Autorisé seulement sur https://stopflow-app.vercel.app ; remplacé intégralement dans l'artefact de test. |
| stopflow-environment.js | Identité Production connue, référence gjwvquhoecfikjorapud, et origine applicative connues servent de refus explicite en développement. Ce sont des identifiants publics, pas des secrets. |
| supabase-orders/catalog/users/user-delete/article-tools et modules stopflow-* | Utilisent le même supabaseClient, y compris REST, RPC et functions.invoke. Aucun second client ni endpoint Supabase direct trouvé dans le frontend actif. |
| supabase/functions/manage-users/index.ts | Client utilisateur et client administratif Deno ; clés lues dans l'environnement serveur du projet Supabase. Aucun changement et aucun fichier de cette fonction copié dans l'artefact navigateur. |
| api/pwa-icon.js et api/favicon.js | Aucun accès Supabase, aucune clé administrative. |
| stopflow-051-iphone-fix.js | Lien d'installation historiquement figé vers le site Production ; utilise désormais l'origine/page courante, pour ne pas envoyer les testeurs iPhone vers Production. Sur le domaine actuel, l'URL reste identique. |
| stopflow-pwa.js, stopflow-070-preview-label.js | Références au domaine applicatif pour l'installation et les libellés, pas des connexions de base. Inchangées. |
| migrations existantes | Quelques commentaires identifient le projet historique ; ils ne sélectionnent pas une connexion. Les migrations existantes restent inchangées. |
| future-online/ | Proposition séparée et non appliquée. Variables NEXT_PUBLIC_* documentées, aucun secret fourni. Son schéma profiles est incompatible avec le contrat actuel ; ne pas le prendre comme baseline. |
| service-worker.js | Passage réseau sans cache applicatif ; aucun cache Supabase ajouté. |

La politique reconnaît uniquement les URLs Supabase hébergées canoniques
`https://<référence-20-caractères>.supabase.co`. Pas de domaine personnalisé,
proxy ou Supabase auto-hébergé dans cette préparation. Leur prise en charge
demanderait une revue distincte, sans affaiblir le refus du projet Production.

## Configuration statique et sélection réelle

Deux scripts synchrones précèdent le SDK et l'amorçage historique :
`stopflow-environment-config.js`, puis `stopflow-environment.js`. Aucun fetch
asynchrone de configuration ni course avec bootstrapAuth.

- Sur le domaine Production connu, le profil de compatibilité conserve l'URL,
  la clé publique et les options Auth persistSession/autoRefreshToken/detectSessionInUrl.
  Aucun réglage du projet Production ni de son Vercel n'a été modifié.
- Sur une Preview inconnue, ce même profil est refusé. Il ne devient jamais
  implicitement une configuration de développement.
- Le futur build de développement produit un fichier propre, avec une URL/clé
  de test et les origines exactes de ce déploiement. La configuration est figée
  en mémoire après validation ; les paramètres d'URL et localStorage ne la choisissent pas.
- Sur localhost/127.0.0.1/::1 ou file: avec le profil de compatibilité valide,
  seul le mode historique hors ligne est disponible, sans URL/clé dans le
  résultat exploitable et sans création de client Supabase. Il ne remplace pas
  un environnement de développement connecté. Les tests historiques l'utilisent.
- Une configuration explicitement development invalide ne bascule pas vers
  ce mode local. Une configuration absente ou refusée bloque l'amorçage Auth,
  masque le secours local et désactive la connexion, même avec une ancienne session.

La production n'est jamais un repli. Les origines sont exactes, sans wildcard.
La configuration de développement refuse la référence Supabase Production,
son origine applicative, les URLs ambiguës/avec identifiants, chemins ou paramètres,
et les clés serveur. Seuls sb_publishable_* ou les anciens JWT de rôle anon et
de référence correspondante sont acceptés. Une clé publique opaque ne révèle
pas son projet : son rattachement devra être vérifié dans le projet de test.
Le contrôle local ne valide ni signature JWT ni validité serveur d'une clé.

Un fetch dédié au client de développement vérifie à nouveau sa configuration,
capture l'origine approuvée, refuse toute autre destination et impose
`redirect: error`. Auth, REST, Storage et Edge Functions du client passent par
ce transport. Les URLs WebSocket éventuelles sont dérivées de l'URL validée du
SDK ; aucun nouveau canal temps réel n'est créé ici. Ce garde-fou ne constitue
pas un pare-feu contre un script malveillant qui réécrirait toute l'application.

## Paramètres du futur projet de test

`.env.example` est un modèle de paramètres **publics**, pas un fichier chargé
automatiquement. Ne jamais y mettre service_role, sb_secret_*, token Supabase
Management, Vercel ou mot de passe. Le générateur ne sélectionne que les champs
publics prévus ; les variables administratives présentes dans la machine ne
sont ni sérialisées ni copiées.

| Variable | Règle |
| --- | --- |
| STOPFLOW_ENVIRONMENT | development, obligatoire pour le test, même si VERCEL_ENV vaut production sur le projet de test. Pas de déduction depuis la branche. |
| STOPFLOW_SUPABASE_URL | URL canonique du nouveau projet distinct. Projet Production refusé. |
| STOPFLOW_SUPABASE_PUBLIC_KEY | Clé publishable, ou JWT anon correspondant au projet de test. Clé publique Production connue refusée au build. |
| STOPFLOW_APP_ORIGINS | Tableau JSON des origines supplémentaires exactes (domaine test personnalisé ou localhost). Obligatoire hors Vercel si aucune origine système n'est fournie. |
| STOPFLOW_VERCEL_PROJECT_ID | Identifiant public du futur projet Vercel de test, devant correspondre à VERCEL_PROJECT_ID. |
| VERCEL_PROJECT_ID / VERCEL_URL / VERCEL_BRANCH_URL / VERCEL_ENV | Métadonnées système Vercel, à rendre disponibles au build. Les domaines système sont ajoutés seulement après vérification du projet. |

Sur un futur projet Vercel **séparé**, framework Other, prévoir :

```text
Build command: node scripts/build-environment.cjs
Output directory: .stopflow-dist
```

Le build valide avant toute copie et exige un répertoire neuf. Pour un essai
local, choisir `node scripts/build-environment.cjs --out /tmp/nom-neuf` avec les
variables publiques appropriées. Le dossier ne contient que les assets frontend
reconnus ; ni SQL, documentation, tests, scripts serveur, .env ou historique Git.
Le profil Production est remplacé, et le hash dans la référence du script change
avec sa configuration. Aucun fallback n'est émis en cas d'erreur.

Le fichier vercel.json actif est inchangé. Avant un futur déploiement autorisé,
prévoir Cache-Control: no-store pour le script de configuration et vérifier les
fonctions /api d'icônes existantes avec les réglages Other/output directory.
Cette intégration Vercel n'a pas été testée dans le cloud.

## Installation sur un futur Supabase distinct

**Blocage connu : le dépôt n'a pas la migration initiale complète de StopFlow.**
Ne pas exécuter aveuglément supabase db push sur une base vide et ne pas appliquer
le schéma proposé dans future-online. Les migrations incrémentales supposent
déjà profiles, articles, orders et les helpers privés ; certaines contiennent
également des seeds historiques. Elles ne sont pas un installateur autonome.

Procédure à exécuter seulement après une autorisation distante distincte :

1. Créer/vérifier le projet Supabase de test, sa référence distincte, sa région,
   ses sauvegardes et ses limites. Vérifier aussi le projet Vercel séparé. Aucun
   projet existant n'a été consulté ou modifié dans cette mission.
2. Obtenir une baseline **schema-only public/private**, versionnée et revue,
   reflétant StopFlow juste avant Réservations. Ne copier ni auth.users, données
   métier, secrets, webhooks, paramètres Production ni identités réelles.
   Préserver politiques, grants, triggers, fonctions et relations nécessaires.
   La baseline doit être fournie/validée indépendamment ; elle n'est pas inventée ici.
3. Préparer hors ligne un paquet à partir de cette baseline et de son SHA256
   vérifié indépendamment :

```sh
node scripts/prepare-development-sql.cjs --project-ref REF_TEST --baseline /chemin/baseline-revue.sql --sha256 SHA256_VERIFIE --out /tmp/paquet-sql-neuf
```

4. Le paquet produit 00-reviewed-baseline.sql, 10-check-base.sql,
   20-reservations.sql, 30-check-reservations.sql et leurs empreintes. Il ne
   contient aucune commande de connexion ni d'exécution. Une référence au projet
   Production dans la baseline provoque un refus ; ne pas la supprimer sans revue.
   Le projectRef du manifeste est une destination déclarée, **pas la preuve de
   l'identité d'une connexion PostgreSQL**. Vérifier cette identité côté Dashboard
   et connexion avant toute application future. Un hash ne prouve pas une revue sémantique.
5. Dans le projet isolé vérifié seulement : installer la baseline, exécuter le
   contrôle 10 en lecture seule et arrêter sur toute erreur, puis appliquer la
   migration Réservations transactionnelle 20, enfin le contrôle 30 en lecture
   seule. Ne pas rejouer les migrations anciennes sur un snapshot qui les inclut.
6. Le contrôle 10 vérifie les contrats/relations/RLS/RPC principaux, pas toutes
   les signatures ou toute la logique métier. Le contrôle 30 vérifie les sept
   relations, RLS, grants et quatre RPC Réservations, pas le comportement complet.
7. Créer uniquement des comptes de test, leurs profils actifs et appartenances
   explicites sur deux établissements. Voir docs/reservations/README.md pour
   le provisioning ; aucun administrateur global ne reçoit un accès universel.
8. Si nécessaire, installer manage-users dans le **nouveau projet**, avec ses
   variables serveur propres ; ne jamais exporter sa service_role vers Vercel
   frontend. Isoler emails/invitations et intégrations. Régler Site URL et les
   redirections Auth sur les seules origines de test.
9. Vérifier ensuite avec de vrais JWT utilisateur via REST/RPC : connexion,
   CRUD/rechargement, lecteur, gestionnaires, profil inactif, deux établissements,
   écritures directes refusées, concurrence, réseau en échec. Ne pas utiliser
   service_role pour démontrer les permissions utilisateur.
10. Après autorisation de push/déploiement, contrôler l'artefact et les requêtes
    réseau de la future Preview, puis tester sur iPhone physique. Aucune URL
    Preview ni validation cloud n'est fournie par cette préparation locale.

## Vérification locale reproductible

Prérequis existants : Node, Docker, Playwright, Chromium /usr/bin/chromium,
pdftotext pour les tests PDF. Pour le test avec le vrai SDK, installer uniquement
dans un dossier de test hors dépôt :

```sh
npm install --prefix /tmp/stopflow-environment-test-sdk --cache /tmp/stopflow-npm-cache --ignore-scripts --no-audit --no-fund @supabase/supabase-js@2.57.4
node tests/environment-isolation.cjs
node tests/environment-browser.cjs
node tests/development-schema.cjs
node tests/reservations-navigation.cjs
node tests/reservations-browser.cjs
```

STOPFLOW_SUPABASE_SDK_BUNDLE peut indiquer un autre chemin vers le même bundle
UMD épinglé. Le test navigateur intercepte toutes les requêtes : aucune requête
ne quitte le navigateur vers un vrai Supabase. Le SDK est réel, son backend est
simulé. Les tests de schéma utilisent PostgreSQL local avec réseau désactivé.
Le backend distant, sa baseline réelle, ses clés et Safari physique restent non validés.
Les résultats effectifs sont consignés dans VALIDATION.md.
