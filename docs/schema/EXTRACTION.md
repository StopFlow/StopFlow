# Récupération future autorisée — sans lignes métier

Cette mission n'exécute aucune de ces opérations distantes. ChatGPT disposant
d'un accès autorisé en lecture seule pourra procéder en deux étapes.

## 1. Inventaire sans corps ni constantes

Exécuter `supabase/development/40-inspect-schema-metadata.sql` en transaction
READ ONLY sur le projet explicitement identifié. Il lit uniquement les catalogues,
pas les tables applicatives ni auth.users. Il fournit relations/colonnes/types,
RLS, ACL, signatures, extensions et empreintes de définitions. Aucun corps de
fonction, argument par défaut, expression RLS, valeur métier ou définition de
trigger/index/contrainte n'est renvoyé. Les identifiants et ACL restent des
métadonnées à revoir avant partage. Les empreintes MD5 servent à comparer des
objets, pas à certifier une sécurité cryptographique ou à anonymiser des secrets.
Ne jamais extraire pg_authid, vault, clés API, secrets JWT, jobs ou logs.

Compléter séparément avec **versions et noms seulement** de l'historique des
migrations (après vérification de ses colonnes). Ne pas sélectionner la colonne
statements : elle peut inclure seeds/identités. Relever versions PostgreSQL,
Supabase et schémas exposés PostgREST sans mots de passe ni paramètres secrets.
Ce premier fichier n'est volontairement pas une baseline.

## 2. DDL complet nécessaire, revue avant transmission

Faire produire par le propriétaire autorisé un export **schema-only** de public
et private, sans données et sans exports de rôles/mots de passe. Conserver ACL,
politiques, propriétaires documentés/mappés, privilèges de schémas, colonnes et
séquences, default privileges. Un outil pg_dump compatible convient avec une
connexion autorisée en lecture seule ; ne pas passer de mot de passe dans la
commande ou le chat. Ne pas exporter les objets internes Auth pour les réinstaller.

Revoir localement **avant partage** tous les corps de fonctions, defaults,
contraintes, expressions d'index/politiques, commentaires et vues : schema-only
peut contenir emails, URLs privées, tokens ou constantes personnelles. Isoler les
définitions concernées pour revue du propriétaire ; ne pas masquer/supprimer une
condition métier silencieusement. Toute adaptation de test devra être explicite,
versionnée et validée, sans prétendre reproduire à l'identique la Production.

Contrôler exhaustivement les 19 relations listées dans README, les helpers et
RPC manquants, **tous leurs overloads**, ainsi que les autres fonctions du snapshot.
Récupérer en particulier les triggers sur auth.users qui créent/synchronisent
profiles et leurs fonctions, sans aucune ligne utilisateur. Vérifier contrats
FK vers auth.users et rôles/permissions/provisioning, dépendances aux extensions,
types/enums/domaines/séquences, fonctions SECURITY DEFINER et search_path.
Récupérer aussi les éventuels wrappers RPC de commandes appelés indirectement
par les adaptateurs frontend : un index lexical ne prouve pas leur absence.

Comparer cet export aux hashes et définitions du dépôt, identifier les migrations
déjà incluses, éliminer les seeds réels du processus d'installation par une revue
documentée, puis faire approuver la baseline et son SHA256. Les seeds fictifs
seront séparés du schéma. Rejouer sur une base vierge et tester les contrats
avant de qualifier la baseline de complète. Ne pas utiliser le contrat profils
minimal des tests comme substitut de schéma StopFlow.
