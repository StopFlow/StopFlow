# Mission 2.4.1 — Contrôle des destinations Kong

## Cause établie dans le code

Mission 2.4 ne reconnaissait les destinations que par la forme du nom
`supabase_*_stopflow-test-local`. Cela refuse forcément `realtime` et
`realtime-dev`, même si Docker les résout vers notre conteneur Realtime local.
L'échec observé est cohérent avec ce défaut ; les inspections réelles du Mac
ne sont pas disponibles ici et ne sont pas prétendues validées.

## Modifications

- `safety.cjs` : URLs littérales strictes ; inspection de tous les endpoints du
  réseau bridge local nommé pour le projet ; cohérence des IDs conteneurs,
  réseau et endpoints ; résolution par nom/Aliases/DNSNames sans DNS externe ;
  rejet des correspondances multiples, étrangers, non démarrés/non healthy et
  destinations attachées à un autre réseau. Les deux alias observés doivent
  appartenir précisément à `supabase_realtime_StopFlow-test-local`, avec le
  label projet exact. Auth/REST restent liés à leurs IDs déjà vérifiés.
- `safety.cjs` : contrôle de toutes les publications Kong, actives et déclarées.
  API IPv4 loopback obligatoire ; seule publication explicite 127.0.0.1/::1
  autorisée ; wildcard ou LAN = NO-GO. Aucun port ni pare-feu modifié.
- `runner.cjs` : lectures Docker `network inspect` puis `inspect` de TOUS les
  membres du réseau (pas de filtre label masquant un conteneur étranger).
  Seulement des compteurs routes/destinations ajoutés au rapport. Version 2.4.1.
- `gateway-self-test.cjs`, `self-test.cjs` : fixtures synthétiques de 17 routes
  avec les deux alias réels communiqués ; tests d'acceptation et contournements.
  Les autres 15 routes sont représentatives, pas des routes réellement extraites.
- Générateur, documentation et assertions du test d'archive adaptés à la version
  2.4.1 et au nouveau fichier d'autotests. Le test d'archive n'est pas exécuté
  pendant cette mission. Aucun changement aux cinq SQL ni à la suite métier.

## Contrôles exécutés, sans base

88 autotests au total, dont 44 pour Kong/Docker simulé : alias présents/absents,
label étranger/manquant, alias usurpé par un autre service, collisions dont
un endpoint étranger, membre manquant/dupliqué, IDs incohérents, autre réseau,
driver/scope étrangers, arrêt/unhealthy, mauvais service Auth/REST, URLs externes,
IP/IPv6, credentials, suffixes DNS, encodage, paramètres, ports invalides,
bindings wildcard/LAN/admin, et IPv4/IPv6 loopback.

Les autres autotests de sécurité restent actifs (HTTP loopback éphémère et
redirection externe refusée notamment). Aucune commande Docker, connexion
Supabase, suite PostgreSQL ou suite métier n'est lancée. Contrôles syntaxiques
et vérification statique SHA256/CRC/contenu du nouveau ZIP seulement.

## Livraison / décision

Nouveau ZIP `StopFlow-mission24.1-macos.zip`, manifeste 2.4.1 et SHA256.
Les cinq SQL sont identiques octet pour octet à ceux du ZIP 2.4 original.
Original conservé, empreinte connue inchangée :
`857502324174f550490ec094b16ff45027f3fcb22d1d4c2206d4f0ea66b816f0`.

**GO pour revue ; NO-GO pour exécution avant validation du pilote.**
Le nouveau contrôle peut révéler une publication actuelle sur wildcard ou une
topologie différente ; ce serait un refus de sécurité à diagnostiquer, pas
une raison de désactiver les protections. Pas de validation du Mac à distance,
pas de reset, push, déploiement ou changement de base. `--preflight-only` reste
sans écriture en base, avec rapport local uniquement. Les protections de version,
base vierge, empreintes, Auth/hooks, clés et socket local restent en place.
