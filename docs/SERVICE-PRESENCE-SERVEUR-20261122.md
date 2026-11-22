# Occupation et présence — pilote, 22 novembre 2026

Périmètre exclusif : `mmrdpyhoawwoplbzqwag`, branche
`pilot/stopflow-v1-20261117`, parent `0155dc9b5b59bd9cea9511f79a91fb446cc44d21`.

## Modèle

Un départ inconnu est NULL pour les nouvelles réservations. Aucune durée ni
fin de service n'est calculée. Un départ explicitement communiqué reste une
information : il ne libère pas la table. L'occupation concerne la date locale
de l'arrivée et le service (Midi avant 16:30, Soir dès 16:30), jusqu'à
l'annulation ou l'action volontaire « Parti ».

Les anciennes valeurs starts_at/ends_at restent inchangées, même si ends_at
provenait de l'ancienne règle technique. departure_explicit=false empêche de
présenter cette ancienne valeur comme une information communiquée. Les
anciennes plages des allocations sont conservées comme traces ; les nouvelles
allocations n'en fabriquent aucune. Tous les chemins de disponibilité utilisent
désormais la catégorie date/service, y compris les RPC compatibles.

`presence_state` (expected/arrived/departed) est distinct du statut commercial
et du placement. Arrivée et départ enregistrent horodatage et auteur. La RPC
`reservations_service_presence` exige le droit existant de gestion des
réservations, la bonne appartenance, la version et un identifiant d'intention.
Le même reçu restitue le même résultat. Une réservation partie conserve son
attribution historique ; une modification de note ne recrée pas d'allocation.

Le placement manuel remplace le tableau complet des identifiants. Il relit
la version et les preuves des réservations concernées avant de valider.
Un partage ou une capacité insuffisante exige une décision explicite conservée
avec son auteur. Les confirmations automatiques restent sérialisées par
établissement et protégées par un index unique de revendication date/service.
Une réservation partagée n'est libérée que pour son propre identifiant.

Les fermetures, protections des ressources, droits RLS et contrôles de version
restent actifs. Aucun rôle ni membre n'est modifié. Aucun plan ni réservation
n'est créé ou supprimé par cette migration.

## Installation et preuves

`supabase/pilot/service-presence.sql` est une migration unique et transactionnelle,
avec délais de verrouillage/exécution. Elle refuse toute divergence des treize
fonctions antérieures contrôlées par empreinte. Ne pas rejouer les migrations
antérieures. La migration a été appliquée au seul pilote après qualification.

`tests/service-presence-pg17.py` : PASS, 27 groupes, PostgreSQL 17 jetable et
contrat Auth simulé, cluster arrêté et répertoire supprimé. Les contrôles portent
sur les départs inconnus, les horaires historiques, la présence, les allocations
partagées, le remplacement 1+2+3 vers 1+3+5, les versions périmées, deux
transactions concurrentes, les droits, fermetures et anciennes RPC.

Le contrôle réel avant/après sur le pilote confirme les mêmes empreintes pour
les douze réservations historiques (hors nouvelles colonnes), tables, éléments,
plans et appartenances. La nouvelle RPC est accordée à authenticated et refusée
à anon ; UPDATE direct des réservations reste refusé à authenticated. Il ne
s'agit pas d'un essai positif avec une session utilisateur réelle.

## Retour arrière

En cas de problème, corriger en avant. Ne pas réinstaller les anciennes fonctions
à durée automatique et ne pas inventer ends_at pour les réservations devenues
sans départ. Un retour d'interface doit conserver la compatibilité avec ce
modèle. Recharger les anciens onglets après livraison de la nouvelle interface.
Les données et autorisations antérieures restent conservées.

## Départ communiqué : conservation du placement

Le contrôle complémentaire a reproduit un refus 23P01 lorsqu'un départ prévu
était renseigné sur une attribution automatique déjà partagée manuellement.
Le correctif `service-departure-information.sql` conserve les deux fonctions
et leurs droits ; il retire uniquement la fin informative des comparaisons
qui lient une décision de placement. Salle, identifiants, arrivée et couverts
restent contrôlés. Les preuves historiques de partage ne sont pas réécrites.
Les demandes et leur résultat restent liés à leur payload complet et leur
version : cette évolution ne permet pas de réutiliser un reçu avec une autre fin.

`tests/service-departure-information-pg17.py` : ancien refus reproduit, puis
PASS de 7 contrôles sur un nouveau PG17 jetable. Départ informatif automatique
et manuel sans réattribution, preuve inchangée, reprise identique, changement
de capacité toujours refusé sans confirmation, absence de réoccupation après
« Parti » et maintien de l'autre partage. Les deux clusters ont été arrêtés
et supprimés. Les 27 contrôles antérieurs n'ont pas été rejoués.

Ce second correctif a été appliqué uniquement au pilote après cette validation,
avec préconditions sur les empreintes des deux fonctions. Les empreintes des
données métier, du plan et des appartenances sont encore identiques après lui.
