# StopFlow — Mission 2.4.1 — Supabase local PG17, macOS

**À soumettre à ChatGPT pilote pour revue de sécurité AVANT exécution.**
Ce paquet n'a pas encore été exécuté sur votre Mac. Un ZIP préparé ou des tests
de garde réussis ne prouvent pas une reconstruction Supabase réussie.

## Préconditions

- macOS, Node.js 22 ou plus déjà installé ; aucune installation automatique.
- Docker Desktop démarré, Supabase local déjà healthy, PostgreSQL 17.
- Projet local exactement `StopFlow-test-local`, dossier réel sans lien symbolique :
  `~/Library/Application Support/StopFlow-test-local`.
- Aucun lien cloud `supabase/.temp/project-ref` ; **base locale vierge** :
  aucun utilisateur Auth, aucune table/vue métier publique ni schéma `private`.
- Extensions du snapshot présentes avec leurs versions/schémas exacts :
  pg_stat_statements 1.11/extensions, pgcrypto 1.3/extensions,
  plpgsql 1.0/pg_catalog, supabase_vault 0.3.1/vault, uuid-ossp 1.1/extensions.

Le lanceur REFUSE une base déjà peuplée. Il ne contient aucun reset, suppression
de volume, démarrage de service, téléchargement, migration cloud ou commande Git.
En cas d'échec après écritures, conserver le rapport et faire revoir la cause
avant toute remise à zéro **locale** séparée et explicitement autorisée.

## Exécution après revue et autorisation

Décompresser le ZIP dans Téléchargements puis :

```bash
bash "$HOME/Downloads/StopFlow-mission24.1-macos/run-macos.sh"
```

Si le dossier est ailleurs, adapter seulement ce chemin. Le dossier du projet
Supabase cible reste fixe. Vérification préalable sans écriture en base :

```bash
bash "$HOME/Downloads/StopFlow-mission24.1-macos/run-macos.sh" --preflight-only
```

Ce mode produit volontairement `NO-GO / PREFLIGHT_ONLY_NO_TEST_EXECUTION` :
des préconditions réussies ne remplacent pas la suite complète.
Autotests du paquet sans base (seulement un serveur HTTP éphémère 127.0.0.1) :
`node self-test.cjs` depuis le dossier décompressé.

## Contrôles avant toute écriture

Empreintes SHA256 de tous les fichiers du manifeste ; macOS/Node ; contexte
Docker avec socket Unix uniquement, sans variables de connexion distante ;
noms exacts et labels `com.supabase.cli.project` des conteneurs DB/Auth/REST/Kong ;
état running/healthy ; image Supabase PostgreSQL 17 ; réseau commun ; volume
DB nommé `supabase_db_StopFlow-test-local`, driver local sans options distantes.
Les routes DB de GoTrue et PostgREST doivent désigner ce conteneur.
Les URL de services Kong doivent résoudre vers un unique conteneur réellement
inspecté du projet, via son nom ou ses alias/DNSNames sur le réseau Docker
`supabase_network_StopFlow-test-local` (bridge local). Tous ses endpoints sont
inspectés, y compris ceux sans le label du projet, pour détecter les collisions.
Les alias `realtime` / `realtime-dev` ne sont autorisés que pour le conteneur
`supabase_realtime_StopFlow-test-local`. Un label seul ou un nom ressemblant à
Supabase ne suffit pas. Un réseau supplémentaire pour Kong ou une destination
est refusé ; l'ID réseau et les IDs d'endpoints doivent correspondre entre les
inspections réseau et conteneur. Auth et REST doivent être les conteneurs déjà
vérifiés, sur les ports attendus.

**Tous** les ports publiés de Kong sont contrôlés (API, TLS et administration).
Seules les liaisons explicites `127.0.0.1` / `::1` sont acceptées, avec l'API
8000 accessible via 127.0.0.1. Une liaison wildcard (`0.0.0.0`, `::`, vide) ou
LAN entraîne `GATEWAY_NETWORK_EXPOSURE_REFUSED`. Le programme ne modifie aucune
liaison réseau : si le Mac utilise ces valeurs, soumettre le diagnostic au
pilote avant toute modification locale. Il ne faut pas supprimer cette garde.
Ce contrôle concerne les publications Kong, pas un audit du pare-feu macOS ou
de tous les ports des autres conteneurs. Les hooks GoTrue activés sont refusés.

Les requêtes HTTP vont exclusivement à **127.0.0.1**, sur le port publié de ce
Kong. Aucune résolution DNS distante ni suivi de redirection. L'accès SQL passe
par `docker exec` sur l'ID vérifié et le socket Unix PostgreSQL. Les clés locales
anon/service_role sont lues en mémoire depuis la configuration locale de Kong ;
aucune clé réelle n'est distribuée dans ce ZIP. Les JWT/mots de passe générés
restent en mémoire. Les erreurs ne reproduisent ni réponses API ni stderr SQL.
La CLI Supabase n'est pas exécutée (donc pas de vérification de mise à jour).

Une variante de noms, de routage, d'extensions ou une configuration sans les
deux clés JWT locales legacy entraîne un NO-GO explicite. Ne pas enlever les
garde-fous pour forcer le passage ; transmettre le code d'erreur au pilote.

## SQL séparés, appliqués dans cet ordre local uniquement

1. `sql/01-final-pg17-local.sql` : schémas public/private anonymisés, 24 tables,
   56 fonctions, 63 policies, ACL/propriétaires préservés ; validation des corps
   après résolution des dépendances. Source épinglée par SHA256.
2. `sql/02-auth-local.sql` : trigger personnalisé sur `auth.users` existante.
3. Tests Auth réels puis reproduction du défaut auteur NULL.
4. `sql/03-least-privilege-review.sql` : proposition 2.1 séparée, test local,
   jamais autorisée pour Production par ce paquet.
5. `sql/04-null-author-review.sql` : proposition séparée, comparaison NULL-safe.
6. `sql/05-reservations.sql` : migration existante, sept tables.

Le manifeste SQL de préparation indique `execution: NONE` : il décrit
l'assemblage, pas le résultat de l'exécution ultérieure. Le résultat courant
est exclusivement dans `reports/`.

Les deux adresses `stopflow-identite-001@example.invalid` et
`stopflow-identite-002@example.invalid` sont les références fictives protégées
du snapshot anonymisé. Le lanceur crée six utilisateurs fictifs via GoTrue,
sans email de confirmation, et attribue les rôles de test localement. Ces
identités ne doivent JAMAIS être injectées dans une migration de Production.

## Tests exécutés sur le Mac par le lanceur

- Reconstruction et comptages ; provisioning GoTrue résistant aux métadonnées
  d'élévation de rôle ; connexion mot de passe, vrais JWT, refresh et `/user`.
- Profils : RLS propre profil, refus anonyme, administration réservée à l'admin,
  désactivation refusée pour chacun des deux comptes fictifs protégés.
- Reproduction auteur NULL avant correctif ; refus après correctif, y compris
  wrapper v054 ; auteur légitime et responsable autorisés ; autre employé refusé.
- TRUNCATE : 23 tables exposées avant proposition, zéro après ; helper interne
  inaccessible directement, appel admin indirect toujours fonctionnel.
- Commande : soumission, validation, envoi, réception ; événement d'audit.
- Températures : refus sans permission, relevé et relecture de la remarque
  via RPC autorisée ; checklist : refus employé et résolution responsable.
- Réservations : sept RLS, adhésion explicite même pour admin, création/lecture
  salle et table, lecteur sans écriture, compte inactif, isolation A/B, audit,
  deux mises à jour concurrentes dont une seule acceptée, persistance relue.

Les données SQL auxiliaires servent uniquement à fabriquer des fixtures et à
contrôler la persistance. Elles ne remplacent pas les opérations sous JWT réels.
La suppression physique Réservations n'est pas une API prévue ; aucune n'est
inventée ici. Ce paquet ne valide ni tous les parcours UI, ni le rendu PDF,
ni le clavier iPhone, ni toutes les combinaisons possibles de permissions.

## Rapport et décision

`reports/result.md` et `reports/result.json` contiennent uniquement noms de tests,
résultats, version PG et codes d'erreur statiques, sans identités/clé/JWT/mot de
passe ni réponses brutes. Envoyer ces deux fichiers au pilote.

`GO` signifie seulement que cette exécution locale de la suite a réussi.
Tout arrêt est `NO-GO`, avec les étapes réellement terminées. Aucun résultat
n'autorise une recréation cloud ou un déploiement : décision distincte du pilote.
Les fixtures restent dans la base locale pour inspection ; le paquet ne lance
aucun reset automatique et n'est donc pas relançable sur cette base peuplée.

L'intégrité du ZIP doit être revue avant lancement. Le manifeste détecte une
altération accidentelle ; ce n'est pas une signature indépendante d'un attaquant
capable de remplacer aussi le manifeste et le programme.

## Mission 2.4.1 : état de vérification

Le diagnostic propriétaire indique 17 routes dont `realtime` et `realtime-dev`.
Nos fixtures reproduisent cette structure avec ces deux destinations exactes ;
les 15 autres URL sont représentatives, pas une copie du fichier réel inconnu.
Les autotests utilisent des inspections Docker fictives et aucun service réel.
La suite Supabase, le précontrôle Mac et les SQL ne sont pas exécutés pour cette
livraison. Le ZIP Mission 2.4 original reste inchangé.
Le fichier `REVIEW.patch` contient le diff intégral du commit de préparation
mentionné dans le manifeste, pour faciliter la revue avant exécution.
