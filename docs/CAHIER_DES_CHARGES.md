# Cahier des charges — StopFlow

## 1. Contexte

StopFlow est l’application interne d’inventaire et de préparation des commandes
de la brasserie L’Union à Nivelles.

## 2. Objectifs

- simplifier le comptage des stocks ;
- calculer les besoins de commande ;
- enregistrer des brouillons ;
- soumettre les inventaires à validation ;
- réserver la validation au Responsable ;
- produire un bon de commande ;
- conserver un historique local ;
- rester utilisable par une équipe non technique.

## 3. Architecture actuelle

Application autonome dans un seul fichier `index.html`.

Le fichier contient :
- la structure HTML ;
- le style CSS ;
- le JavaScript métier ;
- les logos encodés ;
- le stockage local ;
- le générateur PDF ;
- le module d’impression.

Aucun serveur et aucune base distante ne sont utilisés dans cette version.

## 4. Fournisseurs

### Colruyt
Catalogue d’articles, stocks cibles, saisie du stock et calcul des commandes.

### Vinicole Leloup
- Domaine Veneto Blanc — fût 20 L ;
- Domaine Veneto Rouge — fût 20 L ;
- Domaine Veneto Rosé — fût 20 L ;
- Bouteille d’azote.

## 5. Rôles

### Employé
- créer et compléter un inventaire ;
- sauvegarder un brouillon ;
- envoyer pour validation ;
- consulter l’historique autorisé.

### Responsable
- tous les droits Employé ;
- valider ;
- annuler ;
- marquer commandé ;
- ouvrir, télécharger et imprimer le bon.

Compte Responsable de référence :
`quentin@lunion.be`.

## 6. Statuts

- Brouillon ;
- À valider ;
- Validé ;
- Commandé ;
- Annulé.

## 7. Écrans présents

- Connexion ;
- Accueil ;
- Inventaire ;
- Historique ;
- Articles ;
- Suggestions ;
- Paramètres ;
- Détail d’un document ;
- Prévisualisation/impression du bon.

## 8. Stockage

Les données sont enregistrées dans `localStorage`. Elles sont propres au
navigateur et à l’appareil utilisé.

## 9. PDF et impression

Le PDF est produit directement dans le navigateur par le code existant.
L’impression s’effectue dans une fenêtre indépendante.

Ces mécanismes avaient été validés et ne doivent pas être remplacés sans raison.

## 10. Limites actuelles

- aucune synchronisation entre appareils ;
- aucune authentification serveur ;
- aucune sauvegarde centralisée ;
- absence de journal d’audit distant ;
- données perdues si le stockage du navigateur est effacé.

## 11. Feuille de route

### V0.2.3
Correctifs locaux sans changement d’interface.

### V0.3
Mise en ligne et synchronisation via Vercel et Supabase, en conservant
l’apparence et le parcours actuels.

### Étapes ultérieures
- comptes réels ;
- administration des utilisateurs ;
- fournisseurs et articles administrables ;
- audit ;
- statistiques ;
- multi-établissements éventuel.
