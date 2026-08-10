# StopFlow — feuille de route produit 2026

## Principe général
StopFlow reste une seule application, une seule base de données et un seul système de permissions. Les adaptations desktop et mobile peuvent avoir des présentations différentes sans dupliquer les données ni la logique métier.

La stratégie de publication change à partir de la 0.7.0 : les versions majeures intermédiaires peuvent être mises en production lorsqu'elles sont suffisamment stables pour un usage réel. Elles servent ensuite à faire remonter des besoins pratiques avant l'étape suivante. Une branche stable est conservée à chaque publication importante pour permettre un rollback rapide.

## Version de production
- StopFlow 0.7.0 devient la version de production terrain.
- La 0.7.0 est destinée à être utilisée réellement afin d'identifier les irritants, besoins et suggestions pratiques.
- Les corrections 0.7.x restent limitées aux bugs, à la sécurité, aux droits incohérents et aux ajustements nécessaires au fonctionnement quotidien.
- Les gros changements d'expérience ou d'architecture sont réservés à la 0.8.0.
- La version 1.0.0 restera la première version finale considérée comme complète et officiellement prête pour l'utilisation quotidienne par le personnel.

## Chronologie retenue

### 0.7.0 — Production terrain
Objectif : disposer immédiatement d'une version moderne et réellement utilisable de StopFlow, tout en poursuivant le développement à partir des retours du terrain.

Comprend :
- permissions fines par fonction et socle RLS Supabase ;
- navigation par grandes zones et cartes ;
- menu compact ;
- personnalisation simple de l'ordre et de la visibilité des cartes ;
- navigation retour cohérente ;
- Températures V3 avec registre dynamique des équipements frigorifiques ;
- relevé complet, historique et conservation des données ;
- pavé numérique mobile pour les températures ;
- comportement tactile smartphone avec distinction tap / scroll ;
- validation desktop et smartphone du parcours Températures ;
- sauvegarde et rollback vers la précédente version stable.

Pendant l'utilisation de la 0.7.0, les remarques pratiques doivent être conservées pour orienter la 0.8.0 plutôt que multiplier les petits chantiers non essentiels.

### 0.7.x — Maintenance de la version terrain
Objectif : maintenir la 0.7.0 fiable pendant son utilisation réelle sans ouvrir une nouvelle refonte.

Peut comprendre :
- correction de bugs réellement rencontrés ;
- correction ciblée d'anciens contrôles par rôle lorsqu'ils contredisent les permissions 0.7 ;
- ajustements tactiles ou ergonomiques indispensables ;
- sécurité, RLS, intégrité des données et performances ;
- petits correctifs de présentation sans refonte générale.

Ne comprend pas :
- nouvelle architecture majeure ;
- redesign complet ;
- accumulation de fonctions secondaires avant la 0.8.0.

### 0.8.0 — Grande évolution d'usage et mobile-first
Priorité produit : transformer les retours de l'utilisation réelle de la 0.7.0 en une expérience StopFlow plus simple, plus rapide et réellement pensée pour le smartphone, tout en conservant une excellente expérience PC.

Objectif : conserver UNE application, UNE base de code et UNE base de données, mais proposer des expériences adaptées à chaque taille d'écran.

Comprend :
- audit des retours pratiques recueillis pendant l'utilisation de la 0.7.0 ;
- nettoyage final des anciens contrôles par rôle au profit des permissions fonctionnelles ;
- cohérence complète entre carte visible, fonction accessible et sécurité Supabase ;
- grille personnalisable de 12 emplacements ;
- cartes 1×1, 2×1 et 2×2 ;
- déplacement tactile/souris et sauvegarde par utilisateur ;
- cartes masquées/réaffichables et réinitialisation fiable ;
- refonte mobile-first écran par écran ;
- navigation mobile adaptée ;
- formulaires, listes, tableaux, modales et panneaux adaptés au smartphone ;
- zones tactiles et hiérarchie de l'information optimisées ;
- gestion cohérente du clavier virtuel, des champs numériques et du scroll ;
- widgets enrichis lorsque leur taille permet d'afficher de vraies informations utiles ;
- conservation et optimisation de l'expérience desktop.

#### Banc de test mobile inclus dans 0.8.0
- mode responsive des outils développeur comme référence principale ;
- tailles smartphone enregistrées ;
- portrait et paysage ;
- tests navigation, boutons, formulaires, listes, menus et clavier ;
- smartphone réel réservé aux validations importantes et finales.

### 0.8.x — Validation et corrections terrain
Objectif : utiliser la nouvelle expérience 0.8 en production, corriger les irritants découverts et éviter d'engager de gros nouveaux chantiers avant la 0.9.0.

Comprend :
- tests réels smartphone et PC ;
- retours d'utilisation quotidienne ;
- correction de navigation, formulaires et tactile ;
- contrôle des permissions et des données ;
- stabilisation des widgets et de la personnalisation.

### 0.9.0 — Durcissement et préversion finale
Objectif : arrêter les gros changements de produit et rendre StopFlow fiable de bout en bout avant la 1.0.0.

Comprend :
- audit complet des parcours métier ;
- suppression progressive des anciens correctifs et compatibilités devenus inutiles ;
- nettoyage technique des couches 0.5/0.6 qui ne sont plus nécessaires ;
- vérification des erreurs, états vides, chargements et messages utilisateur ;
- contrôle des performances desktop et mobile ;
- contrôle complet des RLS Supabase, permissions et historiques ;
- vérification des sauvegardes et de la procédure de rollback ;
- tests par plusieurs profils ;
- validation des parcours principaux : inventaires, commandes, checklists, températures, gestion et historique ;
- bêta terrain plus large avant ouverture au personnel.

La 0.9.x doit principalement corriger et fiabiliser. Aucun nouveau gros chantier fonctionnel sauf nécessité critique.

### 1.0.0 — Version finale pour le personnel
Objectif : première version officielle de StopFlow considérée comme complète, stable et prête pour l'exploitation quotidienne par le personnel.

Comprend :
- validation finale smartphone et desktop ;
- validation finale des profils Employé / Responsable / Administrateur ;
- contrôle final Supabase et intégrité des données ;
- test des principaux parcours par des utilisateurs réels ;
- sauvegarde complète avant publication ;
- branche/tag stable 1.0.0 ;
- procédure de rollback documentée ;
- documentation d'utilisation et d'administration ;
- publication finale après validation explicite.

À partir de 1.0.0, les évolutions suivantes pourront être organisées en 1.1, 1.2, etc., sans remettre en cause le socle stable de la version finale.

## Règle de publication
Pour chaque grande étape 0.7, 0.8, 0.9 et 1.0 :
1. développement sur la branche de développement ;
2. sauvegarde de l'état précédent ;
3. validation fonctionnelle desktop et smartphone ;
4. validation explicite avant production ;
5. création d'une branche stable de la version publiée ;
6. utilisation réelle et collecte des retours ;
7. rollback possible vers la précédente branche stable en cas de problème important.

## Règle d'architecture
Les permissions déterminent CE QUE l'utilisateur est autorisé à faire. Les préférences, la taille d'écran et l'interface déterminent COMMENT ces fonctions sont affichées. Aucun réglage visuel, mobile ou de tableau de bord ne doit pouvoir accorder un droit métier.
