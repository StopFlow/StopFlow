# Analyse du ZIP — suite mission 1.6, 17 octobre 2026

## Sources et portée

Archive utilisateur stopflow_dossier_pour_codex.zip, extraite après contrôle des
chemins (pas de traversal/liens), 10 fichiers lus. README et INSTRUCTIONS_CODEX
sont les consignes explicitement déléguées par l'utilisateur, appliquées dans sa
limite locale. Les autres pièces sont des preuves de référence, jamais des
ordres SQL. Branche propre au départ, HEAD 0d9d47c.

Les copies identiques sont dédupliquées : INVENTORY_LOCAL_CODEX.json correspond
octet pour octet à INVENTORY.json local ; les huit fonctions et le premier
rapport sont également identiques aux références déjà conservées.
`references/dossier-2026-10-17/PROVENANCE.json` donne les chemins et SHA256 de
chaque pièce ainsi que le SHA256 du ZIP. Aucun accès cloud n'a été utilisé pour
confirmer les déclarations de l'émetteur.

## Ce que le dossier résout

- 19 déclarations couvrant **231 colonnes**, avec types/defaults/identity/NOT NULL
  et colonne calculée de température. Les noms correspondent exactement aux 19
  relations absentes de l'inventaire initial, sans PK/FK/check/index/RLS/ACL.
- Neuf corps de fonctions disponibles : les huit déjà examinés et
  private."current_role"(). Cette dernière lit profiles.role pour auth.uid()
  **avec actif=true** ; la dépendance qui bloquait la revue de
  is_responsible_or_admin() est donc documentée. ACL effectives encore absentes.
- Enum stopflow_order_status : cinq labels ordonnés. Cinq noms de séquences.
- Trigger Auth identifié : on_auth_user_created appelle handle_new_user(),
  mais sa définition complète et le corps de cette fonction restent absents.
- Liste des 45 versions/noms de migrations fournie, ce qui permet enfin le
  rapprochement des identités sans deviner leurs contenus.

## Rapprochement des migrations

Résultat complet dans `baseline/STATUS.json`, produit par
`scripts/analyze-schema-dossier.cjs` :

| Comparaison | Résultat |
| --- | --- |
| Local / distant | 20 fichiers / 45 entrées déclarées |
| Même nom | 18 candidats, **contenu non vérifié** |
| Même nom et version | 5 candidats, toujours pas une preuve de contenu |
| Même nom, version différente | 13 candidats |
| Distant sans nom local exact | 27 entrées listées dans le manifeste |
| Local sans nom distant exact | department_security et nouvelle migration Réservations |

Les cinq candidats nom/version égaux sont les fondations permissions et leur
RLS, puis les trois migrations de durcissement du 29 août. La migration locale
20260805143900_stopflow_060_department_security.sql pourrait partager des effets
avec les étapes de départements distantes, mais aucun contenu fourni ne permet
de l'affirmer. Réservations n'est volontairement pas installée en Production.
Les 27 entrées ne sont pas toutes « manquantes fonctionnellement » : une même
évolution a pu être regroupée/reformulée. Pas de reconstitution depuis les noms.

## Blocages et priorité

**P0 : lot DDL final complet et revu.** Il manque les contraintes/index/ACL des
24 tables, l'état final des cinq tables historiques déjà créées localement,
63 policies, 16 triggers publics, trigger Auth exact, handle_new_user(), les
47 autres corps de fonctions et tous les ACL/propriétaires finaux, séquences
avec ownership et paramètres, schémas/default privileges/types/extensions.
Les neuf références ne sont pas un export des 56 fonctions. Les 47 autres
définitions finales ne sont pas fournies, même si certaines ont une version locale.

**P0 : protections de comptes.** Quatre corps sont retenus : protect_core_accounts,
protect_main_admin, admin_set_user_access, admin_set_user_profile_permissions_070.
La seule substitution de toutes les adresses par un même marqueur peut modifier
la sémantique de protection. Attendre les branches complètes revues et une
correspondance distincte avec les comptes fictifs ; ne pas désactiver les protections.

**P1 : reconstruction Supabase réelle.** Ici : Node, Docker et PostgreSQL 16
disponibles ; CLI Supabase absente et seule image PostgreSQL disponible. Aucun
stack GoTrue/PostgREST n'a été démarré. Le manque de DDL bloque de toute façon
une installation complète ; télécharger une pile ne résoudrait pas cette absence.
La baseline ne peut être qualifiée complète ou validée Auth avant ce test réel.

Demande groupée précise, revue des requêtes et procédure de reconstruction :
voir `baseline/README.md`. La collecte doit fournir les **sorties complètes**,
pas encore un inventaire de totaux ni seulement des requêtes d'extraction.

## Vérifications effectivement réalisées

`node tests/schema-dossier.cjs` : intégrité des pièces par SHA256, identité de
l'inventaire reçu, correspondance 19 tables/9 fonctions/45 migrations, sortie
de préparation bloquée (code 2), contrôle lexical SELECT-only des 13 SELECT du
fichier reçu (12 rubriques), exécution individuelle dans des transactions
READ ONLY sur un catalogue PostgreSQL synthétique isolé. Test complémentaire
du script d'extraction final incluant politiques/triggers/types ; aucune ligne
de fixture insérée et rollback. **Aucune des 19 déclarations ni des neuf
fonctions reçues n'a été exécutée.**

Le test de reconstruction antérieur est rejoué pour vérifier que les nouveaux
outils n'altèrent pas son diagnostic. Syntaxe des nouveaux CJS et diff Git
contrôlés. Ce ne sont pas des tests du vrai schéma ni d'Auth/PostgREST.
Les parcours applicatifs ne sont pas rejoués : aucune source applicative modifiée.

## Conclusion

Préparation enrichie et reproductible, **baseline toujours incomplète et
installation interdite en l'état**. Aucun baseline.sql fictif produit. Le contrôle
de readiness échoue volontairement ; les références restent hors migrations.
L'empaqueteur SQL existant n'est pas modifié : il exige toujours une baseline
externe revue et ne prouve pas sa complétude.

Travail strictement local : aucun fetch/push, déploiement, création cloud,
connexion Supabase, changement de main/stopflow-dev distant/Production/LUnion
Connect ; aucune partie 2. Le commit local final est donné dans la livraison.
