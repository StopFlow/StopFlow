# StopFlow 0.7.0 — Interface permissions des profils

Statut : interface de développement, non publiée en production.

## Principes

- Plus de département principal dans le formulaire 0.7.0.
- Les permissions sont affichées avec un interrupteur à gauche.
- Gris = désactivé ; petite boule verte à droite = autorisé.
- Les rubriques sont Cuisine, Salle, Entretien & hygiène et Général.
- Le starter pack d’un nouveau profil active uniquement `ideas.share`.
- Administrateur conserve un accès complet automatique.
- Les permissions sont enregistrées dans `profile_permissions` via `admin_set_user_profile_permissions_070`.
- `profile_departments` et `profiles.departement` ne sont maintenus que comme compatibilité transitoire 0.6.0.

## Interface

Cuisine : Inventaires, Checklists, Températures, Historique, Lunchs hebdomadaires + Modifier, Suggestions du mois + Modifier.

Salle : Inventaires, Checklists, Historique.

Entretien & hygiène : Inventaires, Checklists, Historique.

Général : Partager une idée, messages d’équipe, paramètres, ainsi que les permissions de gestion par portée Cuisine / Salle / Entretien : commandes, contrôle et modèles de checklists, anomalies, fournisseurs et articles.

## Sécurité

L’interface ne constitue jamais la sécurité. Les autorisations réelles restent vérifiées par les fonctions et politiques RLS Supabase 0.7.0.
