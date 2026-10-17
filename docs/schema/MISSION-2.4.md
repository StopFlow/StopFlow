# Mission 2.4 — Paquet autonome macOS / Supabase local PG17

## Livraison locale

Branche : `feat/reservations-foundations`, parent de préparation
`c95a383c325811c610e818dc7e30f001f500c636`.

Sources conservées hors Git. L'assembleur de mission 2.3 reste inchangé :
empreinte de référence
`c9aa165a6fb575b5a6fecb8c215ae321417b6da87c07cf4c3aa9b9facbf89de9`.
Le nouveau générateur `scripts/build-mission24-transfer.cjs` produit un seul ZIP
hors dépôt, avec baseline, trigger Auth et trois migrations/propositions
séparées, lanceur sans dépendance npm, documentation et manifeste SHA256.

Reconstruction du paquet, sans connexion ni exécution SQL :

```bash
node scripts/build-mission24-transfer.cjs /CHEMIN_EXTERNE/STOPFLOW_SCHEMA_PUBLIC_PRIVATE_TEST.sql /NOUVEAU_DOSSIER_EXTERNE
```

## Protections

Le lanceur impose macOS/Node22, projet local et dossier fixes, base vierge,
conteneurs exacts/labels/healthy, image et serveur PG17, socket Docker Unix,
volume local, cohérence DB/Auth/REST/Kong. Les extensions doivent correspondre
au snapshot. Un lien Supabase cloud ou un hook GoTrue activé est refusé.
Toutes les requêtes HTTP sont dirigées vers 127.0.0.1 ; les redirections sont
refusées. SQL via socket Unix dans l'ID du conteneur vérifié seulement.

Aucune commande Supabase CLI, installation, téléchargement, reset ou suppression
de volume. Les identifiants locaux sont découverts en mémoire ; mots de passe
aléatoires ; aucune réponse API ni erreur SQL brute dans les rapports.
Le verrou empêche deux exécutions et préserve le rapport d'une exécution active.

Les identités fictives restent dans le paquet local et le code de test ; elles
ne sont pas introduites dans une migration de Production. Les propositions
2.1 et auteur NULL ne sont pas approuvées pour Production par cette livraison.

## Contrôles réellement réalisés ici

- 46 assertions : URL, Docker, routes DB, identité des conteneurs, sélection des
  clés fictives, refus hooks/routes externes, masquage des erreurs SQL et serveur
  HTTP éphémère 127.0.0.1 avec redirection externe refusée.
- Assemblage réel du ZIP et vérification de chaque empreinte et de son contenu.
- Vérification des adresses du SQL : uniquement `example.invalid` ; aucune clé
  privée ou clé serveur distribuée. Source épinglée inchangée.
- Syntaxe Node des quatre scripts livrés et syntaxe Bash.
- Sous Linux : refus `MACOS_REQUIRED` avant toute étape DB ; altération d'un SQL
  refusée par `PACKAGE_HASH_MISMATCH`, `databaseModified=false` ; invocation
  concurrente refusée sans écraser le rapport existant.

## Vérifications à exécuter sur le Mac après revue

Le lanceur utilise GoTrue et PostgREST réels : création de six utilisateurs
fictifs, authentification/refresh/vérification JWT, provisioning, RLS profils,
protection des deux comptes fictifs, contrôle des ACL des onze RPC, appels admin
autorisés et refusés, reproduction/correction auteur NULL, retrait TRUNCATE et
défauts excessifs, helpers directs/indirects, cycle commande, températures et
checklists, sept tables Réservations, adhésions explicites, isolation A/B,
création/lecture/modification/désactivation, concurrence, audit et persistance.

Une inadéquation de configuration locale s'arrête en NO-GO plutôt que de
contourner les contrôles. Toute écriture partielle reste locale pour diagnostic.
La suite ne remplace pas un test exhaustif des permissions, de l'interface,
des PDF ou de l'iPhone ; aucune suppression physique Réservations n'est inventée.

**État : GO pour revue du paquet ; validation Supabase PG17 réelle EN ATTENTE.**
Les versions et l'état healthy fournis par le propriétaire ne constituent pas
une exécution de notre suite. Aucun test effectué sur son Mac depuis cet
environnement ; aucun résultat GoTrue/PostgREST réel annoncé ici.

Les rapports `reports/result.json` et `.md` seront créés après lancement local.
Leur GO éventuel concerne uniquement cette suite locale ; décision cloud séparée.
Aucun push, déploiement, écriture distante, modification Production,
L'Union Connect, Vapi ou début de l'éditeur graphique Réservations.
