# StopFlow Pilote — harmonisation du 22 novembre 2026

Branche `pilot/stopflow-v1-20261117`, référence R3 conservée : `e160453537460c5b05e501d68d2376724b030317`. Édition `20261122-harmony1`. Cible Supabase unique `mmrdpyhoawwoplbzqwag`.

## Présentation livrée

Les huit références de `StopFlow-maquettes-20261122` ont été lues, dont la fiche article corrigée et Général à onze fonctions. Aucune valeur illustrative n’a été importée.

- Accueil à cinq espaces selon les droits, raccourcis vers les actions existantes, établissement/date, Personnaliser. Pas de bouton Accueil sur l’accueil.
- En-tête commun, un titre et un retour contextuel. Les fonctions restent accessibles par cartes et menu. Correction des anciennes redirections vers l’accueil, du retour mobile superposé et du texte culinaire injecté dans les idées.
- Général : onze fonctions conservées, trois groupes, filtre de département sans attribution de droit, personnalisation conservée au sein des groupes.
- Réservations : liste 29 %, plan 71 %, heure et statuts à gauche, nom/table/couverts à droite ; huit lignes fictives visibles à 1024 × 768. Détail, gestes, fermeture, présence et éditeur conservés. Aucune modification du moteur ou du plan enregistré.
- Inventaire produit → offres → commandes, cible décimale, vide distinct de zéro, brouillon serveur indépendant des fournisseurs, secours local par utilisateur/département, reprise explicite après conflit ou résultat incertain.
- Fiche article et offres comparables, choix habituel explicite, fiche fournisseur et adresse de commande. Bons fournisseurs brouillons, conditionnements arrondis, PDF réel, préparation d’e-mail sans envoi ni pièce jointe prétendument automatique.
- Partager une idée : formulaire et historique dans deux onglets. Lecture réelle de `pilot_ideas` par les politiques existantes ; le libellé ne modifie pas la visibilité serveur, actuellement limitée aux propres idées autorisées. Suggestions culinaires restent dans Cuisine.
- Températures, checklists, lunchs, historique, paramètres, équipe, profil et installation gardent leurs actions. Composants/formulaires harmonisés ; seuils métier et données restent serveur.

## Vérifications exécutées

- **PostgreSQL 17 jetable : 30 contrôles PASS**, Auth simulée, rôle installateur non superutilisateur, arrêt et nettoyage confirmés. Voir `PRODUITS-INVENTAIRES-PILOTE-20261122.md`.
- **Node : 5 tests ciblés PASS**, nombres/conditionnements/bases de prix, reçus incertains et véritable fichier PDF ; paquet pilote/iPad : 4 groupes PASS.
- **Chromium 156.0.8078.4 et WebKit 27.2 réels**, application complète et SDK réel, transport Auth/RPC intercepté sur fixtures : propriétaire, responsable, Cuisine, Salle, Entretien. Dix scénarios, puis parcours propriétaires complémentaires : PASS. Dimensions 1024 × 768, 1180 × 820, 834 × 1194 et 390 × 844. Saisies contrôlées individuellement contre le débordement, pas seulement la largeur du document.
- Brouillon relu après rechargement, clavier → + → sauvegarde ; réponse perdue après commit simulé, refus ultérieur, même reçu et saisies récentes conservés ; regroupement/PDF sans envoi ; idées enregistrées puis relues dans le simulateur HTTP.
- Application complète Service : propriétaire/employé sur les deux moteurs, cinq actions, sélection/jumelage/placement, fermetures, présence, 25 tables +3 Emp et géométrie inchangée : PASS. Une scène de huit réservations fictives vérifie la densité et l’ouverture du détail.
- **Pilote réel** : migration additive installée, signature/ACL/RLS contrôlées ; appel sans identité refusé. Empreintes avant/après inchangées pour réservations, plans, tables, éléments, appartenances, profils, permissions, rôles et defaults. Catalogue et commandes existants vides ; aucun comptage ou produit fictif créé sur le pilote.

Ces contrôles navigateur utilisent des réponses HTTP simulées. Ils ne constituent pas un parcours Auth réel du nouvel inventaire sur le pilote. Les validations Auth précédentes restent acquises ; aucun mot de passe ou nouveau compte n’a été requis.

## Mise à jour et limites

Les assets modifiés possèdent une nouvelle version et des empreintes de livraison. Le service worker passe directement par le réseau, sans cache applicatif ni cache de données ; son numéro change pour l’activation. Aucun rechargement forcé supprimant un brouillon n’a été ajouté. Le paquet conserve manifest, icônes et chemins d’installation.

Le catalogue pilote est actuellement vide : un gestionnaire habilité peut ajouter les véritables fiches à utiliser, sans reprendre les exemples des maquettes. Les anciens articles et documents gardent leur historique. Aucun e-mail fournisseur n’a été envoyé. L’ouverture du logiciel de messagerie et la présence d’une pièce jointe restent sous le contrôle de l’utilisateur.

L’essai physique iPad/iPhone, le clavier iOS réel et le PDF Safari physique ne sont pas validés par cette campagne ; le problème PDF Safari historique ne peut pas être déclaré résolu par un PASS WebKit. Aucune production, base active ou intervention Zenchef. Aucun nouveau droit n’a été accordé.
