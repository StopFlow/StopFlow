# StopFlow — feuille de route produit 2026

## Principe général
StopFlow reste une seule application, une seule base de données et un seul système de permissions. Les adaptations desktop et mobile peuvent avoir des présentations différentes sans dupliquer les données ni la logique métier.

## Décision produit — gel du périmètre jusqu’à la 1.0
À partir de la 0.7.3, le périmètre fonctionnel est gelé jusqu’à la version 1.0.0.

Objectif : arrêter d’ajouter de nouveaux gros modules, terminer correctement ce qui existe déjà, améliorer l’expérience utilisateur, fiabiliser l’application et atteindre une version finale réellement utilisable au quotidien.

Jusqu’à la 1.0 :
- priorité aux fonctions déjà présentes dans StopFlow ;
- correction des bugs et incohérences ;
- amélioration tactile et responsive ;
- amélioration de la lisibilité et de la navigation ;
- amélioration des parcours métier existants ;
- sécurité, permissions, intégrité des données et performances ;
- tests réels smartphone et desktop ;
- nettoyage progressif des anciennes couches techniques.

Sont explicitement reportés après la 1.0 :
- prise de photos d’articles ;
- scan de codes-barres ;
- catalogue achats comparatif multi-fournisseurs ;
- historique et comparaison avancée des prix ;
- nouveaux gros modules métier non déjà présents dans l’application ;
- automatisation complète de l’envoi des bons de commande par e-mail ;
- nouveau module complet de réception / contrôle de livraison.

Ces idées restent conservées comme backlog futur, mais elles ne doivent plus ralentir l’aboutissement de la 1.0.

## Situation actuelle — 0.7.3 en développement
Objectif : terminer une version terrain fiable à partir de ce qui existe déjà.

Comprend notamment :
- permissions fines et socle Supabase/RLS ;
- navigation par zones et cartes ;
- Températures V3 ;
- Checklists et fonctions terrain existantes ;
- parcours Inventaire fournisseur mobile ;
- Résumé et Validation adaptés au smartphone ;
- génération du PDF du bon de commande ;
- historique des bons ;
- intitulés métier lisibles dans l’Historique, par exemple « Commande — Colruyt » ;
- standard tactile iPhone commun ;
- standard responsive commun selon la taille réelle de l’écran ;
- fenêtres, tableaux et modales adaptés au viewport mobile ;
- retours et navigation cohérents ;
- corrections indispensables au fonctionnement quotidien.

Avant publication 0.7.3 :
- audit technique final de la branche de développement ;
- contrôle desktop ;
- contrôle smartphone réel ;
- vérification Inventaire → Résumé → Validation → PDF → Historique ;
- vérification navigation et boutons principaux ;
- vérification des autres écrans existants sans refonte fonctionnelle ;
- sauvegarde et validation explicite avant production.

## 0.8.0 — Expérience utilisateur des fonctions existantes
Objectif : améliorer fortement le confort d’utilisation sans ouvrir de nouveau gros périmètre métier.

Comprend :
- refonte mobile-first des écrans déjà existants ;
- navigation plus naturelle sur smartphone ;
- formulaires, listes, tableaux, modales et panneaux mieux adaptés ;
- hiérarchie de l’information plus claire ;
- clavier virtuel, champs numériques et scroll mieux gérés ;
- amélioration de l’Accueil et des cartes existantes ;
- grille personnalisable et préférences utilisateur si elles améliorent réellement l’usage ;
- amélioration de l’Historique ;
- amélioration de la page Suggestions déjà présente ;
- amélioration des écrans Articles et Fournisseurs existants ;
- amélioration des parcours Checklists et Températures existants ;
- évaluation du bouton `+` existant sans construire un nouveau module autour de lui ;
- conservation et optimisation de l’expérience desktop.

Règle : la 0.8.0 améliore ce qui existe. Elle n’ouvre pas le catalogue comparatif, la photo, le scan code-barres ou un nouveau moteur d’achat.

## 0.8.x — Validation terrain et corrections
Objectif : utiliser réellement l’application et corriger point par point ce qui gêne avant la phase de durcissement.

Méthode :
- tests smartphone et desktop ;
- noter l’écran précis, l’action, le résultat attendu et le résultat observé ;
- distinguer bug bloquant, gêne UX et idée future ;
- corriger les problèmes bloquants avant tout ajout secondaire ;
- vérifier Inventaires, Historique, Articles, Fournisseurs, Suggestions, Checklists, Températures, Gestion et profils utilisateurs ;
- stabiliser les permissions, les données, le tactile et le responsive.

## 0.9.0 — Durcissement et préversion finale
Objectif : arrêter les changements produit et rendre StopFlow fiable de bout en bout avant la 1.0.0.

Comprend :
- audit complet des parcours métier existants ;
- suppression progressive des anciens correctifs devenus inutiles ;
- nettoyage technique des couches 0.5/0.6 ;
- réduction des conflits entre anciennes couches tactiles ;
- vérification erreurs, états vides, chargements et messages utilisateur ;
- contrôle des performances desktop/mobile ;
- contrôle complet RLS Supabase, permissions et historiques ;
- audit ciblé des fonctions SECURITY DEFINER et de leurs droits ;
- vérification des sauvegardes et du rollback ;
- tests par plusieurs profils ;
- validation des parcours principaux déjà présents ;
- bêta terrain avant ouverture plus large au personnel.

La 0.9.x doit principalement corriger et fiabiliser. Aucun nouveau gros chantier fonctionnel.

## 1.0.0 — Version finale pour le personnel
Objectif : première version officielle de StopFlow considérée comme complète, stable et prête pour l’exploitation quotidienne par le personnel.

Comprend :
- validation finale smartphone et desktop ;
- validation finale des profils Employé / Responsable / Administrateur ;
- contrôle final Supabase et intégrité des données ;
- test des principaux parcours par des utilisateurs réels ;
- sauvegarde complète avant publication ;
- branche/tag stable 1.0.0 ;
- procédure de rollback documentée ;
- documentation d’utilisation et d’administration ;
- publication finale après validation explicite.

## Backlog après 1.0
Les idées suivantes sont conservées pour de futures versions 1.1, 1.2, etc., mais ne font plus partie du chemin critique vers la 1.0 :
- photos d’articles depuis le smartphone ;
- scan de codes-barres / EAN ;
- recherche avancée de produits ;
- catalogue achats intelligent ;
- produit comparable relié à plusieurs offres fournisseurs ;
- prix par fournisseur et historique des prix ;
- comparaison €/kg, €/L, €/pièce ;
- ajout rapide d’un prix en magasin ;
- envoi automatisé des bons de commande par e-mail ;
- journal détaillé des envois ;
- réception et contrôle détaillé des commandes ;
- autres idées issues de l’usage réel.

## Règle de publication
Pour chaque grande étape :
1. développement sur la branche de développement ;
2. sauvegarde de l’état précédent ;
3. validation fonctionnelle desktop et smartphone ;
4. validation explicite avant production ;
5. création d’une branche stable de la version publiée ;
6. utilisation réelle et collecte des retours ;
7. rollback possible vers la précédente branche stable en cas de problème important.

## Règle d’architecture
Les permissions déterminent CE QUE l’utilisateur est autorisé à faire. Les préférences, la taille d’écran et l’interface déterminent COMMENT ces fonctions sont affichées. Aucun réglage visuel, mobile ou de tableau de bord ne doit pouvoir accorder un droit métier.

Les évolutions jusqu’à la 1.0 doivent réutiliser les données et la logique métier communes et éviter toute nouvelle duplication fonctionnelle.