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

## Retour de revue — renforcement local, en attente de validation

Deux lacunes ont d'abord été reproduites sur les inspections fictives de la
version précédente : membre étranger sans route Kong accepté ; collision de
l'alias PostgreSQL utilisé par Auth/REST acceptée.

Le contrôle porte maintenant sur CHAQUE membre inspecté : ID complet, nom de
composant Supabase reconnu, label exact du projet, état/health, réseau unique
et cohérence des endpoints. Un membre étranger, un membre non identifié ou un
service inconnu fait échouer le contrôle même sans aucune route Kong. La liste
explicite des composants reconnus se trouve dans `safety.cjs` ; elle n'autorise
pas automatiquement un composant nouveau sur la seule foi du label. Une
topologie légitime différente devra être examinée, sans désactiver le contrôle.
Ces inspections supposent un daemon Docker local de confiance ; ce n'est pas
une attestation contre un administrateur Docker capable de falsifier ses objets.

L'ID de la base déjà inspectée est transmis à `gateway()`. Les hôtes réellement
configurés dans GOTRUE_DB_DATABASE_URL et PGRST_DB_URI sont confrontés à la carte
exhaustive noms/Aliases/DNSNames/adresses des endpoints. Une destination doit
désigner uniquement cet ID, avec le nom exact de la base locale. Les collisions
sont refusées y compris par DNSNames, casse différente, nom complet ou adresse.
Les paramètres/fragment d'URI PostgreSQL non revus sont refusés pour éviter un
changement de cible dissimulé, par exemple `?host=...` ou `?hostaddr=...`.

Autotests exécutés : `node tools/mission24/gateway-self-test.cjs` : **82 PASS** ;
`node tools/mission24/self-test.cjs` : **126 PASS au total, dont ces 82**.
Les tests ajoutés couvrent notamment les membres étrangers supplémentaires sans
route, labels manquants/étrangers, composant inconnu malgré un label correct,
membre inutilisé arrêté/unhealthy/réseau étranger, inspections d'alias malformées,
collisions PostgreSQL Auth puis REST, mauvais ID de base, URI absente ou externe
et paramètres de substitution de cible. Les anciens refus restent testés.
Le second autotest utilise aussi un serveur HTTP fictif sur loopback ; aucune
commande Docker ni connexion Supabase/SQL n'est exécutée.

Syntaxe des trois JavaScript et `git diff --check` : OK. Comparaison binaire
du lanceur contre HEAD : seul l'argument `dbId:db.Id` est ajouté à l'appel de
contrôle. Le chemin preflight-only, son retour avant ouverture de la garde et
le traitement des écritures SQL sont inchangés. Le précontrôle Mac lui-même
n'est pas exécuté.

### Empreinte du patch d'origine — vérification locale seulement

Le ZIP existant n'est ni modifié ni reconstruit : **73 472 octets**, SHA256
`aa755a64ebd1ebc8bf6cb011e5b9150627344f6765a143b2135e008467bb6dbc`.
CRC de tous ses fichiers et les 14 entrées de son manifeste : OK. Ses cinq SQL
sont identiques octet pour octet à ceux du ZIP Mission 2.4 original.

Son REVIEW.patch contient **33 466 octets, 419 LF, aucun CRLF et un LF final**.
Son SHA256 correspond au manifeste :
`c44d24f76decbaf5afb08a921c1adda1dcab1ba0dec6d961897e0e535be14005`.
Il est identique octet pour octet à la sortie de :

```sh
git show --format=fuller --no-ext-diff --color=never 655f77a3660cfd36d13c2b9846aa56377a4ad229
```

Empreintes calculées sur des transformations précises du même original, pour
comparaison avec le fichier réassemblé du pilote :

| Transformation exacte | Octets | SHA256 |
| --- | ---: | --- |
| LF remplacés par CRLF | 33 885 | `90b6a1cecfb4d72813863cb3eadc5e4e7be183c31381f4bd91a2837bd359c985` |
| Suppression du LF final | 33 465 | `bf5123a37f6739c7c819353a065b1590f1389c55ba81e79f10e4df385ddb9c0e` |
| Diff seul, à partir du premier `diff --git` | 33 140 | `b2636290bd62f0eab1ea29425630d7ce31c54bc85deb94b9e8cbd5489a906482` |
| Espaces/tabulations supprimés en fin de chaque ligne | 33 460 | `8649af2239d1fab231ac88120b54ec39e97a966b4b07adc59ee9c017bef69d91` |

**La cause de l'écart de transfert n'est pas établie** : les octets et
l'empreinte du fichier réassemblé chez le pilote ne sont pas disponibles ici.
Ces variantes rendent une hypothèse vérifiable ; elles ne prouvent pas que
Markdown est effectivement la cause. Ne pas remplacer arbitrairement l'empreinte
attendue ni considérer le patch transmis comme validé sans comparaison.
La vérification indépendante du ZIP par le pilote reste également non réalisée.

Fichiers locaux modifiés : `tools/mission24/safety.cjs`,
`tools/mission24/runner.cjs`, `tools/mission24/gateway-self-test.cjs` et ce rapport.
Aucun commit supplémentaire, push, déploiement, reset, changement Docker ou de
base, ni exécution sur le Mac. Le ZIP conservé contient toujours l'ancien code :
il n'inclut PAS ce renforcement et ne doit pas être pris pour un nouveau paquet
corrigé. **GO pour revue locale seulement ; NO-GO pour exécution avant validation
explicite du pilote et livraison ultérieure d'un paquet revu.**

## Nouvelle préparation r2 pour revue privée — 18 octobre 2026

L'autorisation suivante porte sur la livraison d'un nouveau paquet intégrant le
renforcement local ci-dessus. Le ZIP original 73 472 octets reste conservé avec
son empreinte `aa755a64ebd1ebc8bf6cb011e5b9150627344f6765a143b2135e008467bb6dbc`.
Le nouveau dossier et ZIP sont nommés **StopFlow-mission24.1-r2-macos**, sans
écrasement ni remplacement du précédent. Aucun push ou partage public autorisé.

Les trois scripts renforcés sont inclus, ainsi que les instructions mises à jour.
Le générateur exige un checkout propre et enregistre le commit exact, son arbre
Git et la base de revue 655f77a3660cfd36d13c2b9846aa56377a4ad229. REVIEW.patch est
le diff exact BASE → SOURCE, sans en-tête d'auteur Git. Les listes d'empreintes
couvrent les 14 fichiers référencés, plus le manifeste lui-même comme 15e entrée
de l'archive. Le manifeste ne prétend pas se signer lui-même ; le SHA256 externe
du ZIP identifie l'ensemble livré. La sortie est neuve, hors Git et à accès
restreint ; les cinq SQL ne sont pas modifiés.

Contrôles relancés : autotest Kong **82 PASS**, autotest général **126 PASS au
total, incluant ces 82** ; pas de total artificiel de 208 contrôles distincts.
Syntaxe des trois scripts modifiés, du générateur et du test d'archive, syntaxe
shell et git diff --check : réussis. Les fixtures sont fictives ; l'autotest
général contacte uniquement son propre serveur HTTP éphémère sur loopback.

Le contrôle d'archive `tests/mission24-package.cjs` a réussi après le commit local
propre exigé par le générateur : provenance Git des sept fichiers, arbre/commit,
diff de revue, manifestes/CRC, anonymisation, syntaxe, refus de destination déjà
existante et garde Linux MACOS_REQUIRED avant Docker. Une corruption du paquet
est refusée (PACKAGE_HASH_MISMATCH), puis un verrou concurrent conserve le rapport
précédent. Le test relance les 126 contrôles synthétiques ; aucune base contactée.
La dernière mise à jour documentaire consigne ce résultat ; les scripts testés
ne changent plus. Le paquet final sera vérifié contre le commit retenu.

La validation finale du ZIP doit comparer les fichiers livrés aux blobs du
commit retenu, le diff à git diff BASE SOURCE, toutes les empreintes/CRC et les
cinq SQL à l'archive d'origine. Les valeurs de taille/SHA256 du nouveau ZIP sont
communiquées hors archive, après cette validation, pour éviter une référence
circulaire au commit ou au ZIP qui contient le rapport.

**GO pour revue privée seulement ; aucune exécution sur le Mac avant revue et
autorisation distincte.** Aucun test sur Supabase, Docker ou service métier réel,
aucun SQL, reset, déploiement ou début de partie 2. Les résultats synthétiques ne
prouvent pas la conformité de la topologie réelle du Mac. Un composant légitime
absent de la liste reconnue ou une configuration différente doit rester NO-GO
jusqu'à revue, sans désactivation du contrôle.
