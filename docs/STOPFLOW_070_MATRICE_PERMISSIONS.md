# StopFlow 0.7.0 — Matrice finale des permissions

Date de référence : 2026-08-09
Statut : architecture fonctionnelle figée avant migration Supabase.

## 1. Principes

- L’application ouvre toujours sur **Accueil**.
- Il n’existe plus de **département principal** dans la logique cible 0.7.0.
- La barre latérale cible contient uniquement : **Accueil · Cuisine · Salle · Entretien & hygiène · Général**.
- Cuisine, Salle ou Entretien & hygiène n’apparaissent que si le profil possède au moins une permission dans la zone concernée.
- Général regroupe les fonctions communes et les fonctions de gestion. Il n’existe plus de zone Bureau séparée.
- Le rôle n’accorde plus automatiquement tous les droits métier, sauf **Administrateur**, qui conserve un accès complet et protégé.
- Employé et Responsable utilisent la même matrice de permissions explicites. Le rôle reste un libellé/preset et ne remplace pas les permissions.
- Une permission est une vraie autorisation Supabase, pas seulement un bouton masqué dans l’interface.
- Les préférences du futur tableau de bord (position, taille, couleur, carte cachée ou visible) sont indépendantes des permissions.

## 2. Règle visuelle du formulaire utilisateur

Toutes les permissions sont présentées sous forme d’**interrupteurs placés à gauche** :

- gris / position gauche = désactivé ;
- vert / position droite = autorisé ;
- toute la ligne est cliquable ;
- pas de checkbox en plus de l’interrupteur ;
- les sous-permissions apparaissent uniquement lorsqu’elles deviennent pertinentes.

Les titres Cuisine, Salle, Entretien & hygiène et Général sont des rubriques visuelles et ne sont pas eux-mêmes des permissions.

## 3. Permissions opérationnelles par zone

### Cuisine

| Libellé utilisateur | Permission technique | Portée | Fonction |
|---|---|---|---|
| Inventaires | `inventory.use` | `cuisine` | Démarrer, compléter, sauvegarder/reprendre ses brouillons et envoyer un inventaire pour validation. |
| Historique | `history.view` | `cuisine` | Consulter l’historique Cuisine, le détail et les documents/PDF autorisés. |
| Checklists | `checklists.run` | `cuisine` | Exécuter les checklists Cuisine, signaler une anomalie et proposer une amélioration de checklist. |
| Températures | `temperatures.use` | `cuisine` | Encoder et consulter les relevés de température Cuisine. |
| Lunchs hebdomadaires | `lunchs.view` | `cuisine` | Consulter les lunchs hebdomadaires. |
| ↳ Modifier les lunchs | `lunchs.manage` | `cuisine` | Créer, modifier et archiver les lunchs. Implique `lunchs.view`. |
| Suggestions du mois | `monthly_suggestions.view` | `cuisine` | Consulter les suggestions du mois Cuisine. |
| ↳ Modifier les suggestions | `monthly_suggestions.manage` | `cuisine` | Créer, modifier et archiver les suggestions du mois. Implique `monthly_suggestions.view`. |

### Salle

| Libellé utilisateur | Permission technique | Portée | Fonction |
|---|---|---|---|
| Inventaires | `inventory.use` | `salle` | Démarrer, compléter, sauvegarder/reprendre ses brouillons et envoyer un inventaire pour validation. |
| Historique | `history.view` | `salle` | Consulter l’historique Salle et les documents autorisés. |
| Checklists | `checklists.run` | `salle` | Exécuter les checklists Salle, signaler une anomalie et proposer une amélioration. |

### Entretien & hygiène

| Libellé utilisateur | Permission technique | Portée | Fonction |
|---|---|---|---|
| Inventaires | `inventory.use` | `nettoyage` | Démarrer, compléter, sauvegarder/reprendre ses brouillons et envoyer un inventaire pour validation. |
| Historique | `history.view` | `nettoyage` | Consulter l’historique Entretien & hygiène et les documents autorisés. |
| Checklists | `checklists.run` | `nettoyage` | Exécuter les checklists Entretien & hygiène, signaler une anomalie et proposer une amélioration. |

## 4. Permissions Général

### Commun

| Libellé utilisateur | Permission technique | Portée | Fonction |
|---|---|---|---|
| Partager une idée | `ideas.share` | `global` | Partager une idée, un problème ou une amélioration. Activé par défaut dans le starter pack. |

### Gestion des opérations

Ces permissions possèdent une portée par département. Lorsqu’une fonction est activée, les sous-interrupteurs **Cuisine · Salle · Entretien & hygiène** permettent de choisir où elle s’applique.

| Libellé utilisateur | Permission technique | Fonction |
|---|---|---|
| Gestion des commandes | `orders.manage` | Voir les éléments à valider, valider, marquer commandé et annuler les commandes dans les départements autorisés. |
| Contrôle des checklists | `checklists.review` | Contrôler une exécution, la valider ou demander un suivi dans les départements autorisés. |
| Gestion des modèles de checklists | `checklists.templates.manage` | Créer les modèles, ajouter des tâches et traiter les propositions dans les départements autorisés. |
| Anomalies & températures | `alerts.view` | Consulter la vue de suivi des anomalies, checklists à contrôler et températures hors limites dans les départements autorisés. |

### Communication

| Libellé utilisateur | Permission technique | Portée | Fonction |
|---|---|---|---|
| Publier des messages d’équipe | `banners.manage` | `global` | Créer, programmer et désactiver les messages/banderoles d’accueil. La simple lecture des messages applicables au profil ne nécessite pas cette permission. |

### Catalogue

Les deux fonctions suivantes utilisent également des sous-interrupteurs Cuisine · Salle · Entretien & hygiène.

| Libellé utilisateur | Permission technique | Fonction |
|---|---|---|
| Gérer les fournisseurs | `suppliers.manage` | Créer/modifier les fournisseurs uniquement dans les départements autorisés. |
| Gérer les articles | `articles.manage` | Créer/modifier les articles uniquement dans les départements autorisés. |

### Administration

| Libellé utilisateur | Permission technique | Portée | Fonction |
|---|---|---|---|
| Paramètres | `settings.manage` | `global` | Modifier les paramètres applicatifs autorisés. |
| Utilisateurs | accès Administrateur protégé | `global` | Créer, modifier, désactiver/supprimer les comptes et attribuer les permissions. Reste réservé au rôle Administrateur. |

**Installation de StopFlow** n’est pas une permission métier et ne figure pas dans la matrice.

## 5. Starter pack

### Nouveau profil Employé ou Responsable

Activé automatiquement :

- `ideas.share` — Partager une idée.

Tout le reste est désactivé jusqu’à ce que l’Administrateur attribue les droits correspondant au poste réel.

Cette stratégie est volontairement restrictive : un intitulé de rôle ne doit jamais donner par accident accès à une fonction métier.

### Administrateur

- accès complet ;
- compte protégé ;
- la matrice peut être affichée en lecture seule comme « Accès complet » plutôt que demander de maintenir manuellement chaque interrupteur.

## 6. Dépendances automatiques

- `lunchs.manage` implique `lunchs.view`.
- `monthly_suggestions.manage` implique `monthly_suggestions.view`.
- Une permission Général à portée départementale doit posséder au moins un département sélectionné.
- Désactiver une fonction parent désactive ses sous-permissions/sous-portées.
- Une rubrique Cuisine/Salle/Entretien disparaît de la navigation lorsque le profil ne possède plus aucune permission visible dans cette rubrique.
- Général affiche uniquement les cartes correspondant aux permissions du profil.
- Les vues globales/agrégées ne donnent jamais un droit supplémentaire : elles n’agrègent que les données déjà autorisées.

## 7. Comportement du menu 0.7.0

### Barre latérale

Toujours :

- Accueil

Conditionnel :

- Cuisine — si au moins une permission Cuisine existe ;
- Salle — si au moins une permission Salle existe ;
- Entretien & hygiène — si au moins une permission Entretien existe ;
- Général — si au moins une fonction Général est disponible (dans la pratique `ideas.share` est activé par défaut).

Il n’y a plus de sous-menu déroulant métier dans la barre latérale. Cliquer une rubrique ouvre directement sa vue par cartes.

## 8. Tableau de bord personnel — règle préparatoire

Le futur tableau de bord personnalisable ne modifie jamais les permissions.

- **Permission** = ce que le profil a le droit de faire, décidé par l’Administrateur.
- **Préférence d’accueil** = ce que la personne choisit d’afficher rapidement, décidé par l’utilisateur.

Une carte ne peut être ajoutée au tableau de bord que si la permission correspondante existe. Cacher une carte de l’Accueil ne retire jamais la permission.

## 9. Modèle de données cible

La structure recommandée est une table de permissions explicites :

`profile_permissions`

Champs conceptuels :

- `profile_id` UUID ;
- `permission_key` texte ;
- `scope` texte (`global`, `cuisine`, `salle`, `nettoyage`) ;
- date de création / acteur éventuel pour audit.

Clé logique unique : `(profile_id, permission_key, scope)`.

Le champ historique `profiles.departement` et la table `profile_departments` peuvent être conservés temporairement pendant la migration 0.6.0 → 0.7.0, mais ils ne doivent plus être la source finale de l’autorisation ni déterminer l’écran de départ.

## 10. Migration depuis la 0.6.0

La migration devra préserver les accès déjà validés avant toute réduction manuelle :

- Administrateur actuel → accès complet ;
- Responsable actuel → permissions équivalentes à ses accès 0.6.0 afin d’éviter une régression, puis droits affinables ;
- Employé multi-départements → permissions opérationnelles correspondant aux départements auxquels il a actuellement accès, avec les fonctions Cuisine actuellement accessibles conservées au niveau consultation/utilisation approprié ;
- `ideas.share` activé pour les profils existants.

Aucune permission nouvelle sensible ne doit être accordée par déduction au-delà des accès déjà présents dans la 0.6.0.

## 11. Étape suivante après validation de cette matrice

Construire la fondation Supabase 0.7.0 : table `profile_permissions`, fonctions de contrôle, migration des trois comptes existants, règles RLS par fonction et compatibilité temporaire avec la 0.6.0.

Aucune refonte du menu ou du tableau de bord ne doit précéder cette sécurité.