# StopFlow — feuille de route produit 2026

## Principe général
StopFlow reste une seule application, une seule base de données et un seul système de permissions. Les adaptations desktop et mobile peuvent avoir des présentations différentes sans dupliquer les données ni la logique métier.

## Version de production actuelle
- Production stable : StopFlow 0.5.4.
- Les travaux 0.6.0 et 0.7.0 restent en développement/preview tant qu'ils ne sont pas explicitement validés et publiés.

## Ordre de travail recommandé

### 0.7.0 — Fondation fonctionnelle et navigation
Objectif : stabiliser la structure métier avant la grande refonte mobile.

Blocs déjà réalisés ou en cours :
- permissions fines par fonction ;
- navigation par grandes zones et cartes ;
- menu compact et réactif ;
- personnalisation simple de l'ordre/visibilité des cartes ;
- refonte Températures avec relevé complet et registre des équipements frigorifiques.

À terminer dans 0.7.0 :
- validation fonctionnelle de la refonte Températures ;
- grille personnalisable 3 × 4 ;
- tailles de cartes 1×1, 2×1 et 2×2 ;
- adaptation des anciennes pages qui utilisent encore des contrôles de rôle au lieu des permissions exactes ;
- tests fonctionnels des profils Employé / Responsable / Admin ;
- validation générale 0.7.0.

### 0.7.x — Personnalisation avancée du tableau de bord
Objectif : enrichir le tableau de bord sans modifier la sécurité.

Prévu :
- couleurs personnelles ;
- formes/styles de cartes ;
- pictogrammes configurables lorsqu'ils apportent une valeur ;
- tailles enrichies ;
- widgets affichant davantage d'informations quand une carte est agrandie ;
- réglages stockés par utilisateur et totalement séparés des permissions.

### 0.8.0 — Refonte mobile-first majeure
Priorité produit : l'utilisation quotidienne de StopFlow sera principalement sur smartphone.

Objectif : conserver UNE application et UNE base de code, mais proposer deux expériences adaptées :
- desktop optimisé PC ;
- mobile spécifiquement pensé smartphone.

La détection doit être principalement basée sur la largeur et les capacités de l'écran (responsive/adaptive design), avec composants et dispositions adaptés selon le contexte, plutôt qu'une simple réduction visuelle du desktop.

Travail prévu :
- audit de chaque écran sur smartphone ;
- navigation mobile dédiée ;
- tailles de zones tactiles adaptées ;
- formulaires mobile-first ;
- listes et tableaux transformés en présentations adaptées au petit écran ;
- ordre de l'information différent si nécessaire entre desktop et mobile ;
- réduction du nombre d'actions visibles simultanément ;
- panneaux, modales et écrans plein écran adaptés au tactile ;
- gestion correcte du clavier virtuel et des champs numériques ;
- conservation d'une bonne expérience desktop existante.

### Banc de test mobile sur PC — inclus dans 0.8.0
Objectif : éviter d'utiliser le smartphone réel après chaque petite modification.

Prévu :
- utilisation systématique du mode responsive des outils développeur du navigateur ;
- tailles de référence smartphone enregistrées ;
- contrôle portrait/paysage ;
- tests des zones tactiles et formulaires ;
- possibilité d'ajouter dans StopFlow Dev un mode de prévisualisation mobile encadré sur PC si cela améliore le workflow ;
- smartphone réel réservé aux validations importantes et finales.

## Règle d'architecture
Les permissions déterminent CE QUE l'utilisateur est autorisé à faire. Les préférences et l'interface déterminent COMMENT ces fonctions sont affichées. Aucun réglage visuel, mobile ou de tableau de bord ne doit pouvoir accorder un droit métier.
