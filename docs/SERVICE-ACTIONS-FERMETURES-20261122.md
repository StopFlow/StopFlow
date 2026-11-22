# Service — actions, fermetures et Aujourd’hui — 22/11/2026

Base : `26fd4188b4473032f728644b1c7d7afcbb4154a3`, branche `pilot/stopflow-v1-20261117`. Cible unique : `mmrdpyhoawwoplbzqwag`. Référence R3 inchangée : `e160453537460c5b05e501d68d2376724b030317`.

## Présentation et utilisation

La fiche place les cinq actions autorisées en colonne, pleine largeur, texte centré et contenu, hauteur minimale 48 px et espacement 10 px. Les règles existantes retirent les actions devenues indisponibles : Arrivé remplace les deux commandes de présence par Parti, et une réservation partie ne propose plus de placement. Seule l’annulation est destructive dans cette fiche. L’ancienne règle rouge globale de placement est désormais limitée au bouton d’alerte À placer de la liste.

Midi et Soir ont deux cibles distinctes : sélection du service et fermeture/réouverture. L’état ouvert est bleu, fermé rouge ; l’état sélectionné a un contour séparé et aria-pressed. La croix rouge ferme après confirmation StopFlow ; la flèche au même endroit rouvre uniquement ce jour et ce service. Les contrôles de gestion ne sont visibles qu’avec rooms.manage, comme auparavant.

Nouvelle réservation est rouge et désactivée pour le service fermé, ou pour Tous si les deux services sont fermés. Dans Tous partiellement fermé, seuls les horaires du service ouvert sont proposés. Si une date différente est choisie dans le formulaire, les fermetures de cette date sont lues séparément sans remplacer celles de l’agenda ; une arrivée devenue fermée reste visible pour correction et la confirmation est bloquée. Une lecture impossible ne vaut pas disponibilité. Le serveur conserve son contrôle lors de la confirmation.

Le plan garde son filigrane FERMÉ ; en vue Tous partielle, il précise MIDI FERMÉ ou SOIR FERMÉ et indique que l’autre service reste ouvert. Les réservations existantes et leurs commandes Arrivé/Parti sont préservées.

Le bouton principal Fermetures a disparu. Les périodes se gèrent dans ⋯ → Fermetures par période. Les champs date ont un conteneur minmax, une largeur bornée et une apparence WebKit maîtrisée. Le panneau n’expose plus de réouverture globale implicite ; il renvoie aux commandes de jour/service de l’agenda.

Aujourd’hui choisit la date Europe/Brussels et Tous, sans changer le plan. Les brouillons demandent confirmation d’abandon ; un envoi incertain bloque le départ tant qu’il n’est pas réconcilié.

## Serveur

Seule migration nouvelle : `supabase/pilot/service-day-controls.sql`, appliquée comme `service_day_controls_20261122`. Aucun rejeu des migrations acquises sur le pilote. Elle remplace la seule fonction `reservations_service_close(uuid,uuid,jsonb)` après vérification de son empreinte antérieure. Signature, propriétaire, droits existants et search_path vide sont conservés.

Le mode day utilise le verrou d’établissement et le reçu idempotent existants. Il compare exactement les identifiants/versions des fermetures actives concernées. Pour rouvrir, il conserve la période d’origine inactive comme historique et recrée les portions encore fermées avant/après la date ; si la période couvrait toute la journée, l’autre service de la date choisie reste fermé. Aucun DELETE et aucune réservation modifiée. Une reprise du même reçu ne crée pas de portions supplémentaires.

L’ancien mode période reste compatible lorsque les bornes et le service transmis correspondent exactement à la période enregistrée. Une demande limitée à un jour envoyée avec l’identifiant d’une longue période est refusée au lieu d’être élargie silencieusement.

Les confirmations automatiques, manuelles et sans table sont refusées pendant une fermeture par les gardes existants. Le verrou partagé avec les confirmations empêche qu’une confirmation en attente ignore une fermeture qui vient de se valider.

Empreinte prosrc installée : `251df01da4935820f1e75b9c1ff45fa3`. Contrôle avant/après : réservations, tables, plans, éléments, appartenances et fermetures inchangés. Sur le pilote réel, transaction READ ONLY : anon et authenticated sans identité refusés avec SQLSTATE 42501. Aucun compte créé, aucun droit attribué, aucune fermeture d’exploitation enregistrée pour les essais.

## Vérifications et limites

- PostgreSQL 17 jetable : 22 groupes PASS, Auth simulée, arrêt et nettoyage confirmés. Dont fermeture concurrente/confirmation, partage manuel et absence de table, réouverture limitée dans une période, chevauchements de périodes, refus de portée ambiguë, reprises sans doublon et accès refusés.
- DOM/RPC simulés : 37 groupes PASS ; paquet de livraison : 4 groupes PASS.
- Chromium 156 et WebKit 27.2 : page complète avec SDK réel, transport Auth/RPC simulé, sept phases par navigateur. Cinq actions visibles en colonne, dimensions et boîtes des textes mesurées, annulation seule destructive, cibles non imbriquées, Tous partiel et complet, date future du formulaire vérifiée, champs date aux hauteurs 768 et 480, Aujourd’hui et brouillon protégé.
- Régressions liées : placement tactile huit phases par navigateur ; Service propriétaire dix-huit phases et employé quatre phases par navigateur. Le plan existant et les restrictions du personnel restent présents.
- Captures 1024 × 768 dans les artefacts locaux et la qualification de l’aperçu. Le contrôle WebKit n’est pas un essai physique iPad et la hauteur réduite ne simule pas l’intégralité du clavier iPadOS.

Aucune fusion main, aucun changement en production, aucune intervention sur Zenchef.
