# Comptage par produit — pilote du 22 novembre 2026

Cible unique : `mmrdpyhoawwoplbzqwag`. Migration additive `product_inventory_pilot_20261122`, source `supabase/pilot/product-inventory.sql`.

## Modèle et protections

- Une fiche produit indépendante, plusieurs offres fournisseurs. Reprise des anciens articles uniquement par identifiant, jamais par ressemblance du nom. Conditionnement et base HT/TTC inconnus restent à compléter.
- Comptage décimal : vide signifie non compté, zéro signifie stock nul. Le brouillon serveur ne nécessite aucune offre. Stock souhaité saisi pour ce comptage ; la cible habituelle reste dans la fiche produit.
- Choix habituel explicite ; comparaison de prix dans une unité compatible et une même base HT/TTC. Quantités de commande arrondies au conditionnement supérieur, besoin conservé séparément.
- Préparation atomique de bons `Brouillon`, regroupés par fournisseur et reliés au comptage. Les transitions réutilisent `submit_order`, `validate_order`, `mark_ordered` et `cancel_order`. Aucun e-mail n’est envoyé par cette API.
- Droits existants `inventory.use`, `articles.manage`, `suppliers.manage`, `orders.manage` par département ; profil actif et règles d’accès aux commandes existantes. Aucun droit attribué à un compte. Tables nouvelles sous RLS sans accès direct des clients ; API SECURITY DEFINER à `search_path` vide, EXECUTE réservé à authenticated.
- Révisions, verrous de ligne et reçus transactionnels par auteur/intention. Même reçu + même contenu : résultat initial ; autre contenu : refus. Une réponse perdue reste à réconcilier même après un refus ultérieur.
- Adresse de commande dans `suppliers.order_email`, repli sur l’adresse fournisseur historique lorsqu’elle existe. Un nom de fournisseur ambigu est refusé, car le circuit historique identifie le fournisseur par son nom.

## Validation

30 contrôles PostgreSQL 17 jetable passent, dont deux préparations concurrentes sans doublon, stock inconnu, droits inter-départements, comparaison/conditionnement, transitions existantes et interdiction d’accès direct/TRUNCATE. Auth simulée. Cluster arrêté et répertoire supprimé.

La fixture `tests/fixtures/operations-core-catalog.json` conserve uniquement les définitions de sept tables applicatives, contraintes et fonctions/triggers nécessaires, relevées en lecture seule sur le pilote. Aucun utilisateur, e-mail réel, mot de passe, donnée métier ni configuration Auth n’y est inclus. Le rôle installateur du test n’est pas superutilisateur.

Après installation réelle sur le pilote : produits/offres/comptages/documents nouveaux = 0 ; droits directs refusés, RLS et signature contrôlés. Réservations, plan, éléments, appartenances, profils, permissions, rôles et privilèges par défaut inchangés, vérifiés par empreintes avant/après. Articles/fournisseurs/commandes historiques toujours vides. Aucun exemple des maquettes importé.

## Retour arrière

Une erreur pendant la migration entraîne son rollback transactionnel. Après commit, revenir au frontend précédent conserve les anciennes fonctions et documents. Ne pas supprimer les nouvelles tables ou reçus si un comptage a été saisi : conserver les données et préparer une correction additive. Aucun rollback destructif automatique. Aucun schéma interne Auth, rôle, droit global ou objet Réservations n’a été modifié.
