# Intégration Service — copie de novembre

Branche vérifiée avant et après travail : `feat/reservations-service-integration`, HEAD 75c8948aaf932a6b56cf988d78591808c3851aab et changements locaux antérieurs conservés. Aucun commit, merge ou push.

Référence lue : `~/Downloads/StopFlow-Reservations-reference/LIRE-MOI-CODEX.md` et `maquette-reservations.html`. La référence est reconstituée et ses identifiants/coordonnées de démonstration ne sont pas des données à importer.

## Intégration dans le code

- L'entrée Réservations ouvre Service. Liste à gauche et un SVG commun à droite, avec toutes les zones actives nommées. Chaque zone garde son plan/version, ses identifiants, ses coordonnées locales et ses dimensions. La translation d'affichage ne modifie rien en base. Les numéros de table ne servent jamais de clé. Tables sans position accessibles dans une liste, sans position inventée.
- Date, Tous/Midi/Soir (comme la référence : Soir à partir de 17 h ; filtre d'affichage, pas une restriction de disponibilité). Arrivées de 08 h à 22 h 30 par demi-heure, durée initiale de 2 h ajustable, fin calculée au-delà de minuit. Modification et annulation. La saisie et l'identifiant d'intention sont conservés en cas de résultat incertain ; une relecture ou une reprise du même payload est proposée. Les conflits confirmés ne détruisent pas le formulaire.
- Fiches clients depuis Service : téléphone normalisé obligatoire, e-mail facultatif, coordonnées et historique liés par identifiant client. Aucun rapprochement par nom. Les réservations historiques sans téléphone ne sont pas inventées/rattachées automatiquement ; le téléphone est requis lors de leur prochaine sauvegarde par le nouveau formulaire.
- Jumelages configurés dans une même zone seulement, capacités additionnées, prévisualisation des liens sur le plan et sélection des tables concernées. Création/modification/désactivation réservées à layouts.manage ; pas de droit ajouté à l'équipe. Les membres sont figés dans chaque réservation et comparés à l'intention lors de l'enregistrement. Une modification ultérieure de la configuration n'altère pas les réservations existantes.
- Réglages du plan commun : sélection de la zone par table/repère ; brouillon des positions/dimensions/orientations ; murs, portes, fleurs, bar et cuisine non réservables. Cuisine utilise le type label existant, fleurs le type plant ; pas de nouveau type physique nécessaire. La sauvegarde réutilise la RPC/version du plan et une transaction pour ses repères. Les envois incertains de réglages ont un reçu distinct et bloquent une nouvelle intention jusqu'à relecture conforme. L'employé ne peut pas éditer le plan.

## Nouvelle migration proposée, non appliquée à une base existante

`tools/reservations-service/service.proposed.sql` ajoute clients, jumelages et allocations par table physique, avec RLS et droits explicites. Les réservations existantes à une table sont reprises dans les allocations avec leur même identifiant et créneau. Pas de suppression/recréation de plan ou table.

Chaque table d'une réservation confirmée possède une occupation [début, fin). Une exclusion GiST par table protège les membres partagés d'un jumelage, y compris en concurrence. La synchronisation se fait dans la transaction de réservation ; une erreur doit laisser intégralement l'ancienne réservation/occupation en place. L'annulation supprime toutes ses allocations. Les anciennes disponibilités à une table lisent aussi cette occupation commune. La protection de ressources en cours empêche une réduction de capacité/archivage invalidant une réservation future.

Le formulaire client est séparé : seules deux RPC anonymes sont exposées, aucune recherche de client ni accès aux historiques. Elles utilisent les mêmes choix/allocations et la même écriture atomique que Service. Un drapeau `online_test_enabled`, false par défaut, est activé UNIQUEMENT sur l'établissement fictif du nouveau cluster. Les anciens établissements restent fermés. Entre les deux onglets du test local, un signal de changement déclenche une relecture et invalide les anciens choix sans effacer la saisie. Ce signal navigateur n'est pas la protection de concurrence : l'exclusion PostgreSQL reste décisive. Le formulaire ne met pas à jour une fiche préexistante simplement parce qu'il connaît son téléphone. Les coordonnées d'une réservation sont aussi conservées comme instantané.

Aucun service ni configuration Supabase existante modifié. Aucune clé privilégiée dans les assets. Les fonctions internes ne sont pas directement exécutables par anon/authenticated. Les profils et appartenances restent nécessaires pour l'espace équipe.

## Correspondance de zones réellement manquante

Le snapshot conservé porte les noms **Salle fictive A** et **TEST-20261103-Salle**, avec 4 tables et leurs positions. Il ne démontre pas laquelle correspond à Salle arrière ou Premier étage. Le logiciel montre donc les vrais noms conservés et un avertissement précis. Aucun renommage ni nouvelle géométrie ne remplace cette correspondance. Les fixtures des tests unitaires/SQL utilisent explicitement les noms demandés, sans prétendre être le plan réel.

## Vérifications réellement effectuées

- `tests/reservations-service-ui.cjs` : PASS, 9 groupes DOM/RPC simulés : téléphone normalisé, fin calculée, même étage, coordonnées immuables, plan commun/deux numéros identiques/tables non placées, confirmation jumelée, conflit conservant la saisie, réponse perdue puis refus/reprise même identifiant, accès fiches clients.
- `tests/reservations-service-trial.py` : PASS, 5 tests isolés du lanceur : loopback, absence de JWT dans les assets, arguments/cible, rôle équipe côté serveur, liste publique limitée et erreur filtrée.
- `tests/reservations-ux.cjs` : PASS, 44 assertions simulées.
- `tests/workspace-reservations-bridge.cjs` : PASS, 13 assertions d'intégration simulées.
- Syntaxes JavaScript/Python vérifiées.
- `tests/reservations-service-pg17.py` : BLOQUÉ à INITDB, operation not permitted / shared memory. Aucun SQL de cette nouvelle migration exécuté. Nettoyage REPERTOIRES_CREES_SUPPRIMES, cluster NON_DEMARRE. Le test préparé utilise deux connexions PostgreSQL indépendantes (équipe contre anon), contrôle le partage d'une table, l'absence d'occupation partielle, les déplacements refusés, l'annulation, les droits et la conservation du plan. **Pas de PASS PostgreSQL annoncé.**
- `tests/reservations-navigation.cjs` : non exécuté en navigateur, module Playwright absent sur l'hôte. Aucun Chrome/Edge/Safari relancé. Docker : socket refusé ; pas de nouveau helper créé.

## Ouvrir l'essai local après la recette automatique

Une commande depuis le Terminal du Mac :

```sh
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3.13 -I -B -u /Users/quentinpollet/Documents/StopFlow-Dev/StopFlow-restauration-20261027-wez39tpl/StopFlow/tools/reservations-service/trial.py --start
```

Le lanceur vérifie les empreintes puis exécute d'abord la nouvelle recette PG17 native jetable. Si elle échoue ou si son nettoyage n'est pas confirmé, il n'ouvre pas la démo. Aucune ancienne campagne acquise n'est rejouée.

Après PASS seulement, il crée une nouvelle pile isolée avec les images locales qualifiées (aucun pull/build), un compte Auth équipe fictif réellement connecté, le clone conservant les tables/plans et deux jumelages de fixture s'il existe trois tables dans une même zone. Il vérifie aussi par HTTP anonyme que les fiches ne sont pas accessibles.

Il affiche `ESSAI_PRET` avec une URL neuve à usage unique sur **127.0.0.1:8097**, et `/online` pour le formulaire client fictif. Ouvrir le lien imprimé dans Safari sur le Mac, pas sur un iPhone (loopback). Aucun tunnel, publication ou modification de port existant. Le Terminal doit rester ouvert ; durée 30 minutes, arrêt par Ctrl+C, déconnexion et nettoyage limité aux ressources créées/identifiées par ce reçu. En cas d'erreur, le résultat de nettoyage et le reçu sont affichés séparément.

Cette recette n'a pas été lancée ici à cause des refus. Le rendu réel, la migration et la concurrence PostgreSQL restent donc à confirmer avant un essai équipe. Aucun lien d'une ancienne démo n'est présenté comme cette nouvelle version.
