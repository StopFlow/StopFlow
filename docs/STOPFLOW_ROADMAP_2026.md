# StopFlow — feuille de route produit 2026

## Principe général
StopFlow reste une seule application, une seule base de données et un seul système de permissions. Les adaptations desktop et mobile peuvent avoir des présentations différentes sans dupliquer les données ni la logique métier.

## Version de production actuelle
- Production stable : StopFlow 0.5.4.
- Les travaux 0.6.0 et 0.7.x restent en développement/preview tant qu'ils ne sont pas explicitement validés et publiés.
- La version 1.0.0 correspondra à la première version finale, stable et officiellement prête pour l'usage quotidien complet.

## Chronologie retenue

### 0.7.0 — Stabilisation de la nouvelle architecture
Objectif : terminer et valider les fondations fonctionnelles déjà engagées.

Comprend :
- permissions fines par fonction ;
- navigation par grandes zones et cartes ;
- menu compact et réactif ;
- personnalisation simple de l'ordre/visibilité des cartes ;
- refonte Températures avec relevé complet et registre des équipements frigorifiques ;
- correction des régressions de navigation liées à ces nouveaux modules ;
- validation fonctionnelle du module Températures.

La 0.7.0 doit être stable avant d'ajouter de nouveaux chantiers importants.

### 0.7.1 — Droits fonctionnels complets des cartes
Objectif : terminer la migration des anciennes pages vers les permissions exactes 0.7.

Comprend :
- remplacement ciblé des anciens contrôles par rôle (Responsable/Employé) par les permissions fonctionnelles ;
- aucun élargissement global de isResponsible() ;
- test d'un Employé recevant une permission de gestion précise sans recevoir les autres ;
- cohérence entre carte visible, action réellement accessible et sécurité Supabase ;
- tests Employé / Responsable / Admin.

### 0.7.2 — Grille personnalisable 3 × 4
Objectif : transformer l'ordre simple des cartes en véritable tableau de bord personnalisable.

Comprend :
- grille logique de 12 emplacements ;
- emplacements visibles en mode Personnaliser ;
- déplacement tactile/souris clair et intuitif ;
- tailles de cartes 1×1, 2×1 et 2×2 ;
- sauvegarde par utilisateur ;
- cartes masquées/réaffichables ;
- réinitialisation fiable à la disposition par défaut ;
- aucune incidence sur les permissions.

### 0.8.0 — Refonte mobile-first majeure
Priorité produit : l'utilisation quotidienne de StopFlow sera principalement sur smartphone.

Objectif : conserver UNE application, UNE base de code et UNE base de données, mais proposer deux expériences réellement adaptées :
- desktop optimisé PC ;
- mobile spécifiquement pensé smartphone.

La détection doit être principalement basée sur la largeur du viewport, les media queries et les capacités d'interaction disponibles, plutôt que sur le nom de l'appareil. Une même fonction peut donc avoir une disposition desktop et une disposition mobile différentes sans dupliquer la logique métier.

Comprend :
- audit écran par écran sur smartphone ;
- navigation mobile dédiée ;
- hiérarchie de l'information adaptée au petit écran ;
- tailles de boutons et zones tactiles adaptées ;
- formulaires mobile-first ;
- listes et tableaux transformés en cartes/listes adaptées au smartphone lorsque nécessaire ;
- ordre de l'information différent entre desktop et mobile si cela améliore l'usage ;
- réduction du nombre d'actions visibles simultanément ;
- panneaux, modales et écrans plein écran adaptés au tactile ;
- gestion du clavier virtuel, champs numériques et scroll ;
- conservation de la bonne expérience desktop existante.

#### Banc de test mobile sur PC — inclus dans 0.8.0
Objectif : éviter d'utiliser le smartphone réel après chaque petite modification.

Comprend :
- mode responsive des outils développeur du navigateur comme référence principale ;
- tailles de référence smartphone enregistrées ;
- portrait/paysage ;
- tests de navigation, boutons, zones tactiles, formulaires, listes, menus et clavier ;
- possibilité d'ajouter à StopFlow Dev un sélecteur de prévisualisation mobile encadré sur PC si cela améliore le workflow ;
- smartphone réel réservé aux validations importantes et finales.

### 0.8.1 — Validation mobile/desktop
Objectif : tester la nouvelle expérience sur plusieurs tailles d'écran avant de poursuivre.

Comprend :
- tests réels sur smartphone ;
- contrôle desktop ;
- contrôle des permissions et données ;
- vérification des parcours quotidiens ;
- corrections de navigation, formulaires et tactile.

### 0.8.2 — Personnalisation visuelle et widgets enrichis
Objectif : ajouter les options esthétiques et les widgets seulement après stabilisation de l'expérience mobile.

Comprend progressivement :
- couleurs personnelles ;
- formes/styles de cartes ;
- pictogrammes configurables lorsqu'ils apportent une valeur ;
- options typographiques limitées et cohérentes ;
- cartes agrandies affichant davantage d'informations utiles ;
- exemples : Températures 2×1 ou 2×2 avec dernier relevé, nombre d'équipements et anomalies ;
- réglages stockés par utilisateur et totalement séparés des permissions.

### 0.9.0 — Durcissement avant version finale
Objectif : arrêter les gros changements d'architecture et rendre l'application fiable de bout en bout.

Comprend :
- audit complet des parcours métier ;
- suppression progressive des anciens correctifs et compatibilités 0.5/0.6 devenus inutiles ;
- vérification des erreurs, états vides, chargements et messages utilisateur ;
- contrôle des performances desktop et mobile ;
- contrôle des RLS Supabase, permissions et historiques ;
- vérification des sauvegardes et procédure de retour arrière ;
- nettoyage technique avant la version finale.

### 0.9.1 — Bêta terrain
Objectif : utiliser StopFlow dans les conditions réelles du restaurant avant de déclarer la version finale.

Comprend :
- utilisation quotidienne sur smartphone et PC ;
- tests par plusieurs profils et plusieurs utilisateurs ;
- collecte des problèmes réellement rencontrés ;
- correction des bugs et irritants ;
- aucun nouveau gros chantier fonctionnel sauf nécessité critique ;
- validation des parcours principaux : inventaires, commandes, checklists, températures, gestion et historique.

### 1.0.0 — Version finale stable
Objectif : première version officielle de StopFlow considérée comme complète et stable pour l'exploitation quotidienne.

Comprend :
- validation finale mobile et desktop ;
- validation finale des profils Employé / Responsable / Administrateur ;
- contrôle final Supabase et intégrité des données ;
- sauvegarde complète avant publication ;
- branche/tag stable 1.0.0 ;
- procédure de rollback documentée ;
- documentation d'utilisation et d'administration ;
- publication en production uniquement après validation explicite.

À partir de 1.0.0, les évolutions suivantes pourront être organisées en 1.1, 1.2, etc., sans remettre en cause le socle stable de la version finale.

## Règle d'architecture
Les permissions déterminent CE QUE l'utilisateur est autorisé à faire. Les préférences, la taille d'écran et l'interface déterminent COMMENT ces fonctions sont affichées. Aucun réglage visuel, mobile ou de tableau de bord ne doit pouvoir accorder un droit métier.
